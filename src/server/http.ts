import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFile } from "node:child_process";
import { pluginRoot } from "../core/paths.js";

/**
 * Loopback server for hosts that can't embed the studio: serves the same studio UI
 * and a token-protected bridge to the app tools. Bound to 127.0.0.1 only.
 */
let server: http.Server | null = null;
let port = 0;
const token = crypto.randomBytes(18).toString("base64url");
let handlersRef: (() => Record<string, { handler: (args: any) => Promise<any> }>) | null = null;

export function setHttpHandlers(fn: typeof handlersRef) {
  handlersRef = fn;
}

export async function ensureServer(): Promise<number> {
  if (server) return port;
  server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", `http://127.0.0.1:${port}`);
      const host = req.headers.host ?? "";
      if (host !== `127.0.0.1:${port}` && host !== `localhost:${port}`) {
        res.writeHead(403).end("Forbidden host");
        return;
      }
      if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/studio")) {
        if (url.searchParams.get("t") !== token) {
          res.writeHead(403, { "Content-Type": "text/plain" }).end("This Vyybe link has expired. Ask the assistant to open the studio again.");
          return;
        }
        let html = fs.readFileSync(path.join(pluginRoot(), "server", "studio.html"), "utf8");
        const boot = `<script>window.__VYYBE_HTTP__=${JSON.stringify({ token })};</script>`;
        html = html.replace("<head>", `<head>${boot}`);
        res.writeHead(200, {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store",
          "Content-Security-Policy": "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none'",
          "Referrer-Policy": "no-referrer",
        });
        res.end(html);
        return;
      }
      // CORS: the embedded studio (sandboxed iframe on the host's origin) may call us directly
      // when the host doesn't proxy app tool calls. The random token is the authentication.
      const cors = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, X-Vyybe-Token",
        "Access-Control-Allow-Private-Network": "true",
        "Access-Control-Max-Age": "600",
      };
      if (req.method === "OPTIONS" && url.pathname === "/api/call") {
        res.writeHead(204, cors).end();
        return;
      }
      if (req.method === "POST" && url.pathname === "/api/call") {
        const chunks: Buffer[] = [];
        let size = 0;
        for await (const c of req) {
          size += (c as Buffer).length;
          if (size > 60_000_000) {
            res.writeHead(413, cors).end("Too large");
            return;
          }
          chunks.push(c as Buffer);
        }
        let body: any;
        try {
          body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        } catch {
          res.writeHead(400, cors).end("Bad JSON");
          return;
        }
        const given = (req.headers["x-vyybe-token"] as string | undefined) ?? body.token;
        if (given !== token) {
          res.writeHead(401, cors).end("Bad token");
          return;
        }
        const { name, args } = body;
        const handlers = handlersRef?.() ?? {};
        const h = handlers[name];
        if (!h) {
          res.writeHead(404, cors).end("Unknown tool");
          return;
        }
        let result: any;
        try {
          result = await h.handler(args ?? {});
        } catch (err: any) {
          result = { isError: true, content: [{ type: "text", text: `${err.code ?? "ERROR"}: ${err.message}` }] };
        }
        res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store", ...cors });
        res.end(JSON.stringify(result));
        return;
      }
      res.writeHead(404).end("Not found");
    } catch (err: any) {
      res.writeHead(500).end(String(err?.message ?? err));
    }
  });
  await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", () => resolve()));
  port = (server.address() as any).port;
  server.unref();
  return port;
}

export async function studioUrl(params: Record<string, string | undefined | null>): Promise<string> {
  const p = await ensureServer();
  const q = new URLSearchParams({ t: token });
  for (const [k, v] of Object.entries(params)) if (v) q.set(k, v);
  return `http://127.0.0.1:${p}/studio?${q.toString()}`;
}

const opened = new Map<string, number>();
export async function openInBrowser(url: string): Promise<void> {
  if (process.env.VYYBE_NO_BROWSER === "1") return;
  const key = url.replace(/[?&]t=[^&]+/, "");
  if (Date.now() - (opened.get(key) ?? 0) < 10_000) return;
  opened.set(key, Date.now());
  const [cmd, args] = process.platform === "darwin" ? ["open", [url]] : process.platform === "win32" ? ["cmd", ["/c", "start", "", url]] : ["xdg-open", [url]];
  execFile(cmd, args as string[], () => {});
}

/** Connection details the embedded studio uses when the host can't proxy its tool calls. */
export async function bridgeInfo(): Promise<{ url: string; token: string }> {
  const p = await ensureServer();
  return { url: `http://127.0.0.1:${p}`, token };
}

export function bridgeOrigins(): string[] {
  return port ? [`http://127.0.0.1:${port}`, `http://localhost:${port}`] : [];
}
