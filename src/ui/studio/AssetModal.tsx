import { useEffect, useRef, useState } from "react";
import type { Transport } from "../transport";
import { Icon } from "../Icon";

export function AssetModal({ t, projectId, assets, onPick, onClose }: { t: Transport; projectId: string; assets: { file: string }[]; onPick: (dataUri: string, file: string) => void; onClose: () => void }) {
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      for (const a of assets) {
        if (!/\.(png|jpe?g|webp|gif|svg|avif)$/i.test(a.file)) continue;
        try {
          const r: any = await t.call("studio_asset", { projectId, file: a.file });
          if (alive && r.dataUri) setThumbs((s) => ({ ...s, [a.file]: r.dataUri }));
        } catch {}
      }
    })();
    return () => {
      alive = false;
    };
  }, [assets, projectId, t]);

  const upload = async (file: File) => {
    if (!file.type.startsWith("image/")) return setErr("Please choose an image file.");
    if (file.size > 25 * 1024 * 1024) return setErr("That image is larger than 25 MB.");
    setBusy(true);
    setErr(null);
    try {
      const data = await new Promise<string>((res, rej) => {
        const fr = new FileReader();
        fr.onload = () => res(String(fr.result));
        fr.onerror = () => rej(fr.error);
        fr.readAsDataURL(file);
      });
      const r: any = await t.call("studio_upload", { projectId, name: file.name, data });
      onPick(r.dataUri, r.file);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="vy-modal-back" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="vy-modal">
        <div className="vy-row">
          <h3 style={{ flex: 1 }}>Replace image</h3>
          <button className="vy-btn icon" onClick={onClose}><Icon name="x" /></button>
        </div>
        <div
          className={`vy-drop ${over ? "over" : ""}`}
          onClick={() => input.current?.click()}
          onDragOver={(e) => (e.preventDefault(), setOver(true))}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setOver(false);
            const f = e.dataTransfer.files[0];
            if (f) upload(f);
          }}
        >
          <Icon name="upload" size={20} />
          <div>{busy ? "Uploading…" : "Drop an image here or click to choose one from your computer"}</div>
          <input ref={input} type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
        </div>
        {err && <div className="vy-hint" style={{ color: "var(--vy-danger)" }}>{err}</div>}
        {assets.length > 0 && (
          <>
            <div className="vy-hint">Images in this project</div>
            <div className="vy-assets">
              {assets.map((a) => (
                <div key={a.file} className="vy-asset" title={a.file} onClick={() => thumbs[a.file] && onPick(thumbs[a.file], a.file)}>
                  {thumbs[a.file] ? <img src={thumbs[a.file]} alt="" /> : <span>{a.file}</span>}
                </div>
              ))}
            </div>
          </>
        )}
        <div className="vy-hint">Need a new picture? Ask the assistant to generate one or find a stock photo.</div>
      </div>
    </div>
  );
}
