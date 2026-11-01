// Minimal MCP Apps host for testing the embedded studio: sandboxed iframe + spec-default CSP + AppBridge.
import { AppBridge, PostMessageTransport } from "@modelcontextprotocol/ext-apps/app-bridge";

const log = (...a: unknown[]) => {
  const el = document.getElementById("log")!;
  el.textContent += a.map((x) => (typeof x === "string" ? x : JSON.stringify(x).slice(0, 300))).join(" ") + "\n";
  console.log(...a);
};
const rpc = async (method: string, params: unknown) => (await fetch("/rpc", { method: "POST", body: JSON.stringify({ method, params }) })).json();

const CSP = "default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; media-src 'self' data:; connect-src 'none';";

async function main() {
  const q = new URLSearchParams(location.search);
  const tool = q.get("tool") ?? "open_studio";
  const args = JSON.parse(q.get("args") ?? "{}");
  const toolResult = await rpc("tools/call", { name: tool, arguments: args });
  log("tool result", toolResult.structuredContent ?? toolResult);
  const res = await rpc("resources/read", { uri: q.get("uri") });
  let html: string = res.contents[0].text;
  // honorcsp=1: allow the origins the resource declares in _meta.ui.csp.connectDomains (like a compliant host)
  const declared: string[] = q.get("honorcsp") ? res.contents[0]._meta?.ui?.csp?.connectDomains ?? [] : [];
  const csp = declared.length ? CSP.replace("connect-src 'none'", `connect-src ${declared.join(" ")}`) : CSP;
  log("csp", csp);
  html = html.replace("<head>", `<head><meta http-equiv="Content-Security-Policy" content="${csp}">`);
  const iframe = document.createElement("iframe");
  iframe.setAttribute("sandbox", q.get("sameorigin") ? "allow-scripts allow-forms allow-same-origin" : "allow-scripts allow-forms");
  iframe.style.cssText = "width:860px;height:700px;border:1px solid #444;border-radius:12px;background:#fff";
  document.getElementById("frame")!.appendChild(iframe);
  const bridge = new AppBridge(null, { name: "vyybe-test-host", version: "1.0.0" }, { serverTools: {}, openLinks: {}, logging: {} } as any, {
    hostContext: { theme: "dark", displayMode: "inline", availableDisplayModes: ["inline", "fullscreen"], containerDimensions: { width: 860, maxHeight: 900 }, platform: "desktop" } as any,
  });
  bridge.oncalltool = async (params) => {
    // noipc=1 reproduces Claude's desktop host refusing app → server tool calls
    if (q.get("noipc")) {
      log("app → tool REFUSED (noipc)", params.name);
      throw new Error("IPC not available for MCP tool call");
    }
    const r = await rpc("tools/call", params);
    log("app → tool", params.name, r.isError ? "ERROR " + JSON.stringify(r.content) : "ok");
    return r;
  };
  bridge.onmessage = async (p) => (log("ui/message", p), {});
  bridge.onupdatemodelcontext = async (p) => (log("ui/update-model-context", p), {});
  bridge.ondownloadfile = async (p: any) => (log("ui/download-file", p.contents.map((c: any) => `${c.resource?.uri} ${c.resource?.blob?.length} b64 chars`)), {});
  bridge.onopenlink = async (p) => (log("ui/open-link", p), {});
  bridge.onrequestdisplaymode = async ({ mode }) => {
    iframe.style.width = mode === "fullscreen" ? "100vw" : "860px";
    iframe.style.height = mode === "fullscreen" ? "100vh" : "700px";
    log("display mode", mode);
    bridge.setHostContext({ displayMode: mode } as any);
    return { mode };
  };
  bridge.onsizechange = ({ height }) => {
    if (height) iframe.style.height = `${Math.min(height, 900)}px`;
  };
  bridge.oninitialized = () => {
    log("view initialized");
    bridge.sendToolInput({ arguments: args });
    bridge.sendToolResult(toolResult);
  };
  iframe.srcdoc = html;
  await new Promise((r) => (iframe.onload = r));
  await bridge.connect(new PostMessageTransport(iframe.contentWindow!, iframe.contentWindow!));
  log("bridge connected");
  if (q.get("sameorigin")) {
    const w = iframe.contentWindow as any;
    w.addEventListener("error", (e: any) => log("IFRAME ERROR", e.message, e.error?.stack?.slice(0, 400)));
    w.addEventListener("unhandledrejection", (e: any) => log("IFRAME REJECTION", String(e.reason), e.reason?.stack?.slice(0, 400)));
    const ce = w.console.error.bind(w.console);
    w.console.error = (...a: any[]) => (log("IFRAME console.error", ...a.map(String)), ce(...a));
    setTimeout(() => log("IFRAME body", w.document.body.innerHTML.slice(0, 300)), 3000);
  }
}
main().catch((e) => log("HOST ERROR", String(e)));
