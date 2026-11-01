import { useState } from "react";
import type { Transport } from "../transport";
import { Icon } from "../Icon";
import type { FrameData } from "./Studio";

type Fmt = "png" | "jpg" | "pdf" | "zip";

const FORMATS: { id: Fmt; label: string; hint: string; icon: string }[] = [
  { id: "png", label: "PNG", hint: "Best quality, one image per frame", icon: "file-image" },
  { id: "jpg", label: "JPG", hint: "Smaller files, great for photos", icon: "file-image" },
  { id: "pdf", label: "PDF", hint: "One page per frame — LinkedIn carousels", icon: "file-text" },
  { id: "zip", label: "ZIP", hint: "All frames as PNGs in one file", icon: "file-archive" },
];

export function ExportMenu({ t, projectId, frames, activeId, kind, beforeExport, onClose }: {
  t: Transport;
  projectId: string;
  frames: FrameData[];
  activeId: string | null;
  kind: "carousel" | "collection";
  beforeExport: () => Promise<void>;
  onClose: () => void;
}) {
  const [fmt, setFmt] = useState<Fmt>(frames.length > 1 && kind === "carousel" ? "zip" : "png");
  const [scope, setScope] = useState<"all" | "current">(frames.length > 1 ? "all" : "current");
  const [scale, setScale] = useState(1);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ folder: string; files: any[]; downloaded: boolean } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const run = async () => {
    setBusy(true);
    setErr(null);
    setResult(null);
    try {
      await beforeExport();
      const frameIds = scope === "current" && activeId ? [activeId] : undefined;
      const r: any = await t.call("studio_export", { projectId, format: fmt, frameIds, scale, inline: true });
      let downloaded = false;
      if (t.download) {
        const files = r.files.filter((f: any) => f.data);
        if (files.length) {
          downloaded = true;
          for (const f of files) downloaded = (await t.download({ name: f.name, mime: f.mime, data: f.data })) && downloaded;
        }
      }
      setResult({ folder: r.folder, files: r.files, downloaded });
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="vy-pop" style={{ right: 0, top: 38, width: 300 }} onPointerDown={(e) => e.stopPropagation()}>
      <div className="vy-row" style={{ marginBottom: 6 }}>
        <b style={{ flex: 1 }}>Download</b>
        <button className="vy-btn icon" onClick={onClose}><Icon name="x" /></button>
      </div>
      {FORMATS.map((f) => (
        <button key={f.id} className={`vy-menu-item ${fmt === f.id ? "vy-btn active" : ""}`} style={{ height: "auto" }} onClick={() => setFmt(f.id)}>
          <Icon name={f.icon} />
          <span><b>{f.label}</b><small>{f.hint}</small></span>
        </button>
      ))}
      <div className="vy-row" style={{ margin: "10px 0 6px" }}>
        {frames.length > 1 && (
          <div className="vy-seg">
            <button className={`vy-btn ${scope === "all" ? "active" : ""}`} onClick={() => setScope("all")}>All {frames.length}</button>
            <button className={`vy-btn ${scope === "current" ? "active" : ""}`} onClick={() => setScope("current")}>This one</button>
          </div>
        )}
        <div className="vy-seg" title="Resolution">
          <button className={`vy-btn ${scale === 1 ? "active" : ""}`} onClick={() => setScale(1)}>1×</button>
          <button className={`vy-btn ${scale === 2 ? "active" : ""}`} onClick={() => setScale(2)}>2×</button>
        </div>
      </div>
      <button className="vy-btn primary" style={{ width: "100%", justifyContent: "center", height: 36 }} disabled={busy} onClick={run}>
        {busy ? "Rendering…" : `Download ${fmt.toUpperCase()}`}
      </button>
      {err && <div className="vy-hint" style={{ color: "var(--vy-danger)", marginTop: 8 }}>{err}</div>}
      {result && (
        <div className="vy-hint" style={{ marginTop: 10 }}>
          {result.downloaded ? "Downloaded. " : ""}Saved {result.files.length === 1 ? "to" : `${result.files.length} files to`}{" "}
          <code style={{ wordBreak: "break-all" }}>{result.files.length === 1 ? result.files[0].display : result.folder}</code>
          <div style={{ marginTop: 6 }}>
            <button className="vy-btn outline" onClick={() => t.call("studio_reveal", { path: result.files[0].path })}><Icon name="folder-open" />Show in folder</button>
          </div>
        </div>
      )}
    </div>
  );
}
