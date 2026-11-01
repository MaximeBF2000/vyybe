// Test host server: spawns the Vyybe MCP server (stdio) and serves the host page + an RPC relay.
import http from "node:http";
import { spawn } from "node:child_process";
import { build } from "esbuild";
import path from "node:path";
const root = path.resolve(import.meta.dirname, "../..");
const bundle = await build({ entryPoints: [path.join(import.meta.dirname, "host-client.ts")], bundle: true, write: false, format: "esm", platform: "browser" });
const js = bundle.outputFiles[0].text;
const p = spawn("node", [path.join(root, "plugins/vyybe/server/vyybe.mjs")], { env: { ...process.env, VYYBE_NO_BROWSER: "1" }, stdio: ["pipe", "pipe", "inherit"] });
let buf = ""; const pending = new Map(); let id = 0;
p.stdout.on("data", (d) => { buf += d; let i; while ((i = buf.indexOf("\n")) >= 0) { const line = buf.slice(0, i); buf = buf.slice(i + 1); if (!line.trim()) continue; const m = JSON.parse(line); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } } });
const call = (method, params) => new Promise((r) => { const i = ++id; pending.set(i, r); p.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: i, method, params }) + "\n"); });
await call("initialize", { protocolVersion: "2025-06-18", capabilities: { extensions: { "io.modelcontextprotocol/ui": { mimeTypes: ["text/html;profile=mcp-app"] } } }, clientInfo: { name: "vyybe-test-host", version: "1" } });
p.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n");
const tools = (await call("tools/list", {})).result.tools;
const uri = tools.find((t) => t.name === "open_studio")._meta.ui.resourceUri;
http.createServer(async (req, res) => {
  if (req.url.startsWith("/rpc")) {
    let body = ""; for await (const c of req) body += c;
    const { method, params } = JSON.parse(body);
    const r = await call(method, params);
    res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify(r.result ?? { isError: true, content: [{ type: "text", text: JSON.stringify(r.error) }] }));
  } else if (req.url.startsWith("/host.js")) res.writeHead(200, { "Content-Type": "text/javascript" }).end(js);
  else res.writeHead(200, { "Content-Type": "text/html" }).end(`<!doctype html><html><body style="margin:0;background:#111;color:#ccc;font:12px monospace"><div id="frame" style="padding:10px"></div><pre id="log" style="padding:10px;white-space:pre-wrap"></pre><script type="module" src="/host.js"></script></body></html>`);
}).listen(4800, "127.0.0.1", () => console.log(`host ready http://127.0.0.1:4800/?uri=${encodeURIComponent(uri)}`));
