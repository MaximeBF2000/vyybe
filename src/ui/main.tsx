import { Component, StrictMode, useEffect, useState, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import { connectBrowser, connectEmbedded, type Boot, type Transport } from "./transport";
import { Studio } from "./studio/Studio";
import { Picker } from "./Picker";
import { Settings } from "./Settings";

function App() {
  const [t, setT] = useState<Transport | null>(null);
  const [boot, setBoot] = useState<Boot>({ view: "loading" });
  const [fullscreen, setFullscreen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        if ((window as any).__VYYBE_HTTP__) {
          const { transport, boot } = await connectBrowser();
          document.title = "Vyybe Studio";
          setT(transport);
          setBoot(boot);
          document.documentElement.dataset.theme = transport.theme();
          transport.onThemeChange((th) => (document.documentElement.dataset.theme = th));
        } else {
          const transport = await connectEmbedded((b) => setBoot(b));
          setT(transport);
          document.documentElement.dataset.theme = transport.theme();
          transport.onThemeChange((th) => (document.documentElement.dataset.theme = th));
          transport.onDisplayChange(() => setFullscreen(!!transport.fullscreen?.active));
        }
      } catch (e: any) {
        setError(e?.message ?? String(e));
      }
    })();
  }, []);

  const cls = `vy-app ${t?.mode === "browser" ? "browser" : ""} ${fullscreen ? "fullscreen" : ""}`;
  if (error) return <div className={cls}><div className="vy-center">{error}</div></div>;
  if (!t || boot.view === "loading") return <div className={cls}><div className="vy-center"><div><div className="vy-spinner" />Opening Vyybe…</div></div></div>;
  return (
    <div className={cls} style={boot.view === "picker" ? { height: "auto", minHeight: 420, maxHeight: fullscreen || t.mode === "browser" ? undefined : 760 } : undefined}>
      {boot.view === "studio" && <Studio key={boot.projectId} t={t} projectId={boot.projectId} initialFrame={boot.frameId} initialData={boot.data} browserUrl={boot.browserUrl} fullscreen={fullscreen} />}
      {boot.view === "picker" && <Picker key={boot.pickerId} t={t} pickerId={boot.pickerId} initialData={boot.data} />}
      {boot.view === "settings" && <Settings t={t} browserUrl={boot.browserUrl} />}
    </div>
  );
}

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  override state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  override render() {
    if (this.state.error)
      return (
        <div className="vy-app"><div className="vy-center"><div><b>Something went wrong in Vyybe Studio.</b><p style={{ fontSize: 12 }}>{String(this.state.error.message)}</p><p className="vy-hint">Your work is saved. Ask the assistant to open the studio again.</p></div></div></div>
      );
    return this.props.children;
  }
}

function showFatal(msg: string) {
  const el = document.getElementById("root");
  if (el && !el.textContent?.trim()) el.innerHTML = `<div style="padding:24px;font:13px system-ui;color:#c33">Vyybe Studio failed to start: ${msg.replace(/</g, "&lt;")}</div>`;
}
window.addEventListener("error", (e) => showFatal(e.message));
window.addEventListener("unhandledrejection", (e) => showFatal(String((e as PromiseRejectionEvent).reason)));

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
