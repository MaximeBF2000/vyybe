import { App } from "@modelcontextprotocol/ext-apps";

/** What the UI was opened for. */
export type Boot = (
  | { view: "studio"; projectId: string; frameId?: string | null }
  | { view: "picker"; pickerId: string }
  | { view: "settings" }
  | { view: "loading" }
) & {
  /** Payload shipped inside the tool result so the view renders without calling back. */
  data?: any;
  /** Same view in the user's browser (full editing even when the host blocks app tool calls). */
  browserUrl?: string;
};

export interface Transport {
  mode: "embedded" | "browser";
  /** True once neither the host nor the local bridge can reach the Vyybe server. */
  offline: boolean;
  call<T = any>(name: string, args: Record<string, unknown>): Promise<T>;
  /** Send a message to the chat as the user (embedded hosts that support it). */
  sendMessage?(text: string): Promise<boolean>;
  /** Tell the model what changed without starting a turn. */
  updateContext?(text: string): Promise<void>;
  download?(file: { name: string; mime: string; data: string }): Promise<boolean>;
  openLink(url: string): Promise<void>;
  fullscreen?: { available: boolean; active: boolean; toggle(): Promise<boolean> };
  theme(): "light" | "dark";
  onThemeChange(fn: (t: "light" | "dark") => void): void;
  onDisplayChange(fn: () => void): void;
}

class ToolError extends Error {
  constructor(message: string, public code?: string) {
    super(message);
  }
}

/** The server couldn't be reached at all (not a tool-level error). */
export class OfflineError extends Error {
  code = "OFFLINE";
}

function unwrap(result: any): any {
  if (result?.isError) {
    const text = result.content?.find((c: any) => c.type === "text")?.text ?? "Unknown error";
    const code = text.match(/^([A-Z_]+):/)?.[1];
    throw new ToolError(text.replace(/^[A-Z_]+:\s*/, ""), code);
  }
  return result?.structuredContent ?? {};
}

export { ToolError };

function systemTheme(): "light" | "dark" {
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export async function connectBrowser(): Promise<{ transport: Transport; boot: Boot }> {
  const cfg = (window as any).__VYYBE_HTTP__ as { token: string };
  const q = new URLSearchParams(location.search);
  const view = q.get("view") ?? "studio";
  const boot: Boot =
    view === "picker" ? { view: "picker", pickerId: q.get("pickerId")! } : view === "settings" ? { view: "settings" } : { view: "studio", projectId: q.get("projectId")!, frameId: q.get("frameId") };
  const themeListeners: ((t: "light" | "dark") => void)[] = [];
  window.matchMedia?.("(prefers-color-scheme: dark)").addEventListener?.("change", () => themeListeners.forEach((f) => f(systemTheme())));
  const transport: Transport = {
    mode: "browser",
    offline: false,
    async call(name, args) {
      const res = await fetch("/api/call", { method: "POST", headers: { "Content-Type": "application/json", "X-Vyybe-Token": cfg.token }, body: JSON.stringify({ name, args }) });
      if (!res.ok) throw new ToolError(res.status === 401 || res.status === 403 ? "This studio link expired — ask the assistant to open the studio again." : `Server error ${res.status}`);
      return unwrap(await res.json());
    },
    async download(file) {
      const bytes = Uint8Array.from(atob(file.data), (c) => c.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes], { type: file.mime }));
      const a = document.createElement("a");
      a.href = url;
      a.download = file.name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
      return true;
    },
    async openLink(url) {
      window.open(url, "_blank", "noopener");
    },
    theme: systemTheme,
    onThemeChange: (fn) => themeListeners.push(fn),
    onDisplayChange: () => {},
  };
  return { transport, boot };
}

export async function connectEmbedded(onBoot: (b: Boot) => void): Promise<Transport> {
  const app = new App({ name: "Vyybe Studio", version: "0.1.0" }, { availableDisplayModes: ["inline", "fullscreen"] } as any, { autoResize: true } as any);
  const themeListeners: ((t: "light" | "dark") => void)[] = [];
  const displayListeners: (() => void)[] = [];
  let booted = false;
  const boot = (b: Boot) => {
    if (booted && b.view === "studio") return;
    booted = true;
    onBoot(b);
  };
  let bridge: { url: string; token: string } | null = null;
  app.ontoolresult = (r: any) => {
    const s = r?.structuredContent ?? {};
    if (s.bridge?.url) bridge = s.bridge;
    const extra = { data: r?._meta?.["vyybe/data"], browserUrl: s.browserUrl };
    if (s.view === "picker") {
      booted = false;
      boot({ view: "picker", pickerId: s.pickerId, ...extra });
    } else if (s.view === "settings") boot({ view: "settings", ...extra });
    else if (s.view === "studio" && s.projectId) {
      booted = false;
      boot({ view: "studio", projectId: s.projectId, frameId: s.frameId, ...extra });
    }
  };
  app.onhostcontextchanged = (ctx: any) => {
    if (ctx?.theme) themeListeners.forEach((f) => f(ctx.theme));
    if (ctx?.displayMode || ctx?.containerDimensions) displayListeners.forEach((f) => f());
    applyHostStyles(ctx);
  };
  app.onteardown = async () => ({});
  await app.connect();
  const ctx: any = app.getHostContext() ?? {};
  applyHostStyles(ctx);
  const caps: any = app.getHostCapabilities() ?? {};
  let displayMode: string = ctx.displayMode ?? "inline";

  // Some hosts render MCP Apps but don't proxy the view's tool calls (e.g. "IPC not available").
  // Then talk to the Vyybe server's loopback bridge directly (declared in the resource CSP).
  let route: "host" | "bridge" = "host";
  const viaBridge = async (name: string, args: Record<string, unknown>) => {
    if (!bridge) throw new OfflineError("No connection to Vyybe from this app.");
    let res: Response;
    try {
      res = await fetch(`${bridge.url}/api/call`, { method: "POST", headers: { "Content-Type": "text/plain" }, body: JSON.stringify({ token: bridge.token, name, args }) });
    } catch {
      throw new OfflineError("This app blocks Vyybe's connection.");
    }
    if (!res.ok) throw new OfflineError(`Vyybe bridge error ${res.status}`);
    return unwrap(await res.json());
  };
  const transport: Transport = {
    mode: "embedded",
    offline: false,
    async call(name, args) {
      if (route === "host") {
        let result: any;
        try {
          result = await app.callServerTool({ name, arguments: args });
        } catch {
          route = "bridge";
        }
        if (route === "host") return unwrap(result);
      }
      try {
        const r = await viaBridge(name, args);
        transport.offline = false;
        return r;
      } catch (e) {
        if (e instanceof OfflineError) transport.offline = true;
        throw e;
      }
    },
    async sendMessage(text) {
      try {
        const r: any = await app.sendMessage({ role: "user", content: [{ type: "text", text }] } as any);
        return !r?.isError;
      } catch {
        return false;
      }
    },
    async updateContext(text) {
      try {
        await app.updateModelContext({ content: [{ type: "text", text }] } as any);
      } catch {}
    },
    async download(file) {
      try {
        const r: any = await app.downloadFile({ contents: [{ type: "resource", resource: { uri: `file:///${encodeURIComponent(file.name)}`, mimeType: file.mime, blob: file.data } }] } as any);
        return !r?.isError;
      } catch {
        return false;
      }
    },
    async openLink(url) {
      try {
        await app.openLink({ url });
      } catch {}
    },
    fullscreen: {
      get available() {
        const modes: string[] = (app.getHostContext() as any)?.availableDisplayModes ?? [];
        return modes.includes("fullscreen");
      },
      get active() {
        return displayMode === "fullscreen";
      },
      async toggle() {
        const want = displayMode === "fullscreen" ? "inline" : "fullscreen";
        try {
          const r: any = await app.requestDisplayMode({ mode: want } as any);
          displayMode = r?.mode ?? displayMode;
        } catch {}
        displayListeners.forEach((f) => f());
        return displayMode === "fullscreen";
      },
    },
    theme: () => ((app.getHostContext() as any)?.theme ?? systemTheme()),
    onThemeChange: (fn) => themeListeners.push(fn),
    onDisplayChange: (fn) => displayListeners.push(fn),
  };
  void caps;
  const prevDisplay = app.onhostcontextchanged;
  app.onhostcontextchanged = (c: any) => {
    if (c?.displayMode) displayMode = c.displayMode;
    prevDisplay?.(c);
  };
  return transport;
}

function applyHostStyles(ctx: any) {
  const vars = ctx?.styles?.variables;
  if (vars) for (const [k, v] of Object.entries(vars)) if (v) document.documentElement.style.setProperty(k, String(v));
  if (ctx?.theme) document.documentElement.dataset.theme = ctx.theme;
}
