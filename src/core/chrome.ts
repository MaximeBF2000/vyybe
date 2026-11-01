import { spawn, execFile, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { lib, ensureDir } from "./paths.js";
import { VyybeError } from "./util.js";

const execFileP = promisify(execFile);

function candidates(): string[] {
  const home = os.homedir();
  const list: string[] = [];
  if (process.env.VYYBE_CHROME) list.push(process.env.VYYBE_CHROME);
  const runtime = lib.runtime();
  if (fs.existsSync(runtime)) {
    for (const d of fs.readdirSync(runtime)) {
      list.push(path.join(runtime, d, "chrome-headless-shell"), path.join(runtime, d, "chrome-headless-shell.exe"));
    }
  }
  if (process.platform === "darwin") {
    for (const base of ["/Applications", path.join(home, "Applications")]) {
      list.push(
        `${base}/Google Chrome.app/Contents/MacOS/Google Chrome`,
        `${base}/Chromium.app/Contents/MacOS/Chromium`,
        `${base}/Microsoft Edge.app/Contents/MacOS/Microsoft Edge`,
        `${base}/Brave Browser.app/Contents/MacOS/Brave Browser`,
        `${base}/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary`,
        `${base}/Vivaldi.app/Contents/MacOS/Vivaldi`,
      );
    }
    const pw = path.join(home, "Library/Caches/ms-playwright");
    if (fs.existsSync(pw)) {
      for (const d of fs.readdirSync(pw).sort().reverse()) {
        if (d.startsWith("chromium_headless_shell-")) {
          list.push(path.join(pw, d, "chrome-mac-arm64/headless_shell"), path.join(pw, d, "chrome-mac/headless_shell"), path.join(pw, d, "chrome-headless-shell-mac-arm64/chrome-headless-shell"), path.join(pw, d, "chrome-headless-shell-mac-x64/chrome-headless-shell"));
        }
      }
    }
  } else if (process.platform === "win32") {
    const roots = [process.env["PROGRAMFILES"], process.env["PROGRAMFILES(X86)"], process.env.LOCALAPPDATA].filter(Boolean) as string[];
    for (const r of roots) {
      list.push(
        path.join(r, "Google/Chrome/Application/chrome.exe"),
        path.join(r, "Microsoft/Edge/Application/msedge.exe"),
        path.join(r, "BraveSoftware/Brave-Browser/Application/brave.exe"),
        path.join(r, "Chromium/Application/chrome.exe"),
      );
    }
  } else {
    for (const bin of ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser", "microsoft-edge", "brave-browser"]) {
      for (const dir of (process.env.PATH ?? "").split(":")) list.push(path.join(dir, bin));
    }
  }
  return list;
}

export function findChrome(): string | null {
  for (const c of candidates()) {
    try {
      if (fs.statSync(c).isFile()) return c;
    } catch {}
  }
  return null;
}

/** Download Google's official chrome-headless-shell (~90 MB) into the Vyybe runtime folder. */
export async function installHeadlessShell(): Promise<string> {
  const platform =
    process.platform === "darwin" ? (process.arch === "arm64" ? "mac-arm64" : "mac-x64") : process.platform === "win32" ? (process.arch === "x64" ? "win64" : "win32") : "linux64";
  const meta = await (await fetch("https://googlechromelabs.github.io/chrome-for-testing/last-known-good-versions-with-downloads.json")).json();
  const dl = meta?.channels?.Stable?.downloads?.["chrome-headless-shell"]?.find((d: any) => d.platform === platform);
  if (!dl) throw new VyybeError("RENDERER_UNAVAILABLE", `No headless Chrome build for ${platform}.`);
  const dir = ensureDir(lib.runtime());
  const zip = path.join(dir, "chrome-headless-shell.zip");
  const res = await fetch(dl.url);
  if (!res.ok) throw new VyybeError("RENDERER_UNAVAILABLE", `Download failed (HTTP ${res.status}).`);
  fs.writeFileSync(zip, Buffer.from(await res.arrayBuffer()));
  if (process.platform === "win32") await execFileP("tar", ["-xf", zip, "-C", dir]);
  else await execFileP("unzip", ["-q", "-o", zip, "-d", dir]);
  fs.rmSync(zip, { force: true });
  const found = findChrome();
  if (!found) throw new VyybeError("RENDERER_UNAVAILABLE", "Headless Chrome was downloaded but could not be found.");
  if (process.platform === "darwin") await execFileP("xattr", ["-dr", "com.apple.quarantine", dir]).catch(() => {});
  return found;
}

type Pending = { resolve: (v: any) => void; reject: (e: Error) => void };

class Cdp {
  private id = 0;
  private pending = new Map<number, Pending>();
  constructor(private ws: WebSocket) {
    ws.onmessage = (ev) => {
      const msg = JSON.parse(String(ev.data));
      if (msg.id && this.pending.has(msg.id)) {
        const p = this.pending.get(msg.id)!;
        this.pending.delete(msg.id);
        if (msg.error) p.reject(new Error(msg.error.message));
        else p.resolve(msg.result);
      }
    };
    ws.onclose = () => {
      for (const p of this.pending.values()) p.reject(new Error("Chrome connection closed"));
      this.pending.clear();
    };
  }
  send<T = any>(method: string, params: Record<string, unknown> = {}, sessionId?: string, timeoutMs = 30000): Promise<T> {
    const id = ++this.id;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Chrome timed out on ${method}`));
      }, timeoutMs);
      this.pending.set(id, {
        resolve: (v) => {
          clearTimeout(timer);
          resolve(v);
        },
        reject: (e) => {
          clearTimeout(timer);
          reject(e);
        },
      });
      this.ws.send(JSON.stringify({ id, method, params, sessionId }));
    });
  }
}

let browser: { proc: ChildProcess; cdp: Cdp; ws: WebSocket; profile: string } | null = null;
let launching: Promise<typeof browser> | null = null;
let idleTimer: NodeJS.Timeout | null = null;
let active = 0;

async function launch(): Promise<NonNullable<typeof browser>> {
  const exe = findChrome();
  if (!exe) {
    throw new VyybeError(
      "RENDERER_UNAVAILABLE",
      "No Chrome-based browser found to render images.",
      "Install Google Chrome, or call vyybe_setup with installRenderer: true to download a private headless Chrome (~90 MB).",
    );
  }
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "vyybe-chrome-"));
  const args = [
    "--headless=new",
    "--remote-debugging-port=0",
    `--user-data-dir=${profile}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-extensions",
    "--disable-background-networking",
    "--disable-sync",
    "--disable-component-update",
    "--disable-default-apps",
    "--hide-scrollbars",
    "--mute-audio",
    "--force-color-profile=srgb",
    "--font-render-hinting=none",
    "about:blank",
  ];
  if (exe.includes("headless_shell") || exe.includes("chrome-headless-shell")) args.shift();
  reapOrphans();
  const proc = spawn(exe, args, { stdio: ["ignore", "ignore", "pipe"] });
  trackPid(proc.pid);
  const wsUrl = await new Promise<string>((resolve, reject) => {
    let buf = "";
    const timer = setTimeout(() => reject(new VyybeError("RENDERER_UNAVAILABLE", `Chrome didn't start: ${buf.slice(-300)}`)), 20000);
    proc.stderr!.on("data", (d) => {
      buf += d;
      const m = buf.match(/DevTools listening on (ws:\/\/\S+)/);
      if (m) {
        clearTimeout(timer);
        resolve(m[1]);
      }
    });
    proc.on("exit", (code) => {
      clearTimeout(timer);
      reject(new VyybeError("RENDERER_UNAVAILABLE", `Chrome exited (${code}): ${buf.slice(-300)}`));
    });
  });
  const ws = new WebSocket(wsUrl);
  await new Promise<void>((resolve, reject) => {
    ws.onopen = () => resolve();
    ws.onerror = () => reject(new VyybeError("RENDERER_UNAVAILABLE", "Couldn't connect to Chrome."));
  });
  const b = { proc, cdp: new Cdp(ws), ws, profile };
  proc.on("exit", () => {
    if (browser === b) browser = null;
    fs.rm(profile, { recursive: true, force: true }, () => {});
  });
  return b;
}

// If a previous Vyybe server was killed hard, its headless Chrome may linger: track and reap them.
const pidDir = () => path.join(lib.internal(), "chrome-pids");
function trackPid(pid?: number) {
  if (!pid) return;
  try {
    ensureDir(pidDir());
    fs.writeFileSync(path.join(pidDir(), String(pid)), String(process.pid));
  } catch {}
}
function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
function reapOrphans() {
  try {
    for (const f of fs.readdirSync(pidDir())) {
      const chromePid = Number(f);
      const owner = Number(fs.readFileSync(path.join(pidDir(), f), "utf8"));
      if (owner === process.pid) continue;
      if (!alive(owner)) {
        if (alive(chromePid)) {
          try {
            process.kill(chromePid);
          } catch {}
        }
        fs.rmSync(path.join(pidDir(), f), { force: true });
      }
    }
  } catch {}
}

async function getBrowser() {
  if (browser) return browser;
  if (!launching) launching = launch().finally(() => (launching = null)) as any;
  browser = (await launching)!;
  return browser!;
}

function scheduleIdle() {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    if (active === 0) shutdownChrome();
  }, 90_000);
  idleTimer.unref?.();
}

export function shutdownChrome() {
  if (browser) {
    try {
      browser.ws.close();
    } catch {}
    const pid = browser.proc.pid;
    browser.proc.kill();
    if (pid) fs.rmSync(path.join(pidDir(), String(pid)), { force: true });
    browser = null;
  }
}

export interface PageHandle {
  send<T = any>(method: string, params?: Record<string, unknown>, timeoutMs?: number): Promise<T>;
  evaluate<T = any>(expression: string, timeoutMs?: number): Promise<T>;
}

/** Open an offline, script-free page sized to the canvas; always closed afterwards. */
export async function withPage<T>(width: number, height: number, scale: number, fn: (page: PageHandle) => Promise<T>): Promise<T> {
  active++;
  if (idleTimer) clearTimeout(idleTimer);
  const b = await getBrowser();
  const { targetId } = await b.cdp.send("Target.createTarget", { url: "about:blank" });
  try {
    const { sessionId } = await b.cdp.send("Target.attachToTarget", { targetId, flatten: true });
    const page: PageHandle = {
      send: (method, params = {}, timeoutMs) => b.cdp.send(method, params, sessionId, timeoutMs),
      evaluate: async (expression, timeoutMs) => {
        const r = await b.cdp.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }, sessionId, timeoutMs);
        if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
        return r.result.value;
      },
    };
    await page.send("Page.enable");
    await page.send("Network.enable");
    await page.send("Network.emulateNetworkConditions", { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
    await page.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: scale, mobile: false });
    await page.send("Emulation.setDefaultBackgroundColorOverride", { color: { r: 0, g: 0, b: 0, a: 0 } });
    return await fn(page);
  } finally {
    b.cdp.send("Target.closeTarget", { targetId }).catch(() => {});
    active--;
    scheduleIdle();
  }
}

export async function setContent(page: PageHandle, html: string): Promise<void> {
  const tree = await page.send("Page.getFrameTree");
  await page.send("Page.setDocumentContent", { frameId: tree.frameTree.frame.id, html });
  await page.evaluate(
    `Promise.race([
      document.fonts.ready.then(() => Promise.all([...document.images].map(i => i.complete ? null : i.decode().catch(() => null)))),
      new Promise(r => setTimeout(r, 8000))
    ]).then(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))).then(() => true)`,
    15000,
  );
}

export async function rendererStatus(): Promise<{ available: boolean; executable?: string }> {
  const exe = findChrome();
  return exe ? { available: true, executable: exe } : { available: false };
}

/**
 * A normal, online page in a throwaway browser context (no shared cookies), used only to
 * screenshot public web pages the agent asked for. Never used for rendering frames.
 */
export async function withOnlinePage<T>(width: number, height: number, scale: number, fn: (page: PageHandle) => Promise<T>): Promise<T> {
  active++;
  if (idleTimer) clearTimeout(idleTimer);
  const b = await getBrowser();
  const { browserContextId } = await b.cdp.send("Target.createBrowserContext", { disposeOnDetach: true });
  const { targetId } = await b.cdp.send("Target.createTarget", { url: "about:blank", browserContextId });
  try {
    const { sessionId } = await b.cdp.send("Target.attachToTarget", { targetId, flatten: true });
    const page: PageHandle = {
      send: (method, params = {}, timeoutMs) => b.cdp.send(method, params, sessionId, timeoutMs),
      evaluate: async (expression, timeoutMs) => {
        const r = await b.cdp.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }, sessionId, timeoutMs);
        if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
        return r.result.value;
      },
    };
    await page.send("Page.enable");
    await page.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: scale, mobile: false });
    await page.send("Network.enable");
    await page.send("Network.setUserAgentOverride", { userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36" });
    return await fn(page);
  } finally {
    b.cdp.send("Target.closeTarget", { targetId }).catch(() => {});
    b.cdp.send("Target.disposeBrowserContext", { browserContextId }).catch(() => {});
    active--;
    scheduleIdle();
  }
}
