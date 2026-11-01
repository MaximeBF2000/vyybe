import { useEffect, useState } from "react";
import type { Transport } from "./transport";
import { Icon } from "./Icon";

interface Prov { id: string; label: string; kind: "image" | "photo"; url: string; configured: boolean }

export function Settings({ t }: { t: Transport }) {
  const [data, setData] = useState<{ providers: Prov[]; imageProvider: string; renderer: boolean; library: string } | null>(null);
  const [keys, setKeys] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = async () => setData((await t.call("settings_load", {})) as any);
  useEffect(() => {
    load().catch((e) => setErr(e.message));
  }, []);

  const save = async (provider: string, key: string | null) => {
    setErr(null);
    try {
      await t.call("settings_save", { provider, key });
      setKeys((k) => ({ ...k, [provider]: "" }));
      setSaved(provider);
      setTimeout(() => setSaved(null), 2000);
      await load();
    } catch (e: any) {
      setErr(e.message);
    }
  };

  if (!data) return <div className="vy-center">{err ?? <div><div className="vy-spinner" />Loading settings…</div>}</div>;

  const section = (kind: "image" | "photo", title: string, hint: string) => (
    <div className="vy-card">
      <h3>{title}</h3>
      <div className="vy-hint">{hint}</div>
      {data.providers.filter((p) => p.kind === kind).map((p) => (
        <div key={p.id} className="vy-prov">
          <div className="name">
            {p.label}
            <div><a onClick={() => t.openLink(p.url)}>Get a key <Icon name="external-link" size={11} /></a></div>
          </div>
          {p.configured ? (
            <>
              <span className="vy-badge on">Connected</span>
              <button className="vy-btn" onClick={() => save(p.id, null)}>Remove</button>
            </>
          ) : (
            <>
              <input type="password" autoComplete="off" placeholder="Paste API key" value={keys[p.id] ?? ""} onChange={(e) => setKeys((k) => ({ ...k, [p.id]: e.target.value }))} onKeyDown={(e) => e.key === "Enter" && keys[p.id] && save(p.id, keys[p.id])} />
              <button className="vy-btn primary" disabled={!keys[p.id]} onClick={() => save(p.id, keys[p.id])}>Save</button>
            </>
          )}
          {saved === p.id && <span className="vy-badge on">Saved ✓</span>}
        </div>
      ))}
    </div>
  );

  return (
    <div className="vy-settings">
      <div className="vy-title" style={{ fontSize: 16 }}><span className="vy-logo-mark">V</span>Vyybe settings</div>
      {section("image", "Image generation (optional)", "Add a key for at least one provider to let the assistant generate pictures for your designs. Keys are stored in your Mac's Keychain and never shared with the chat. If several are set, Vyybe uses the first that works.")}
      {data.providers.some((p) => p.kind === "image" && p.configured) && (
        <div className="vy-card">
          <h3>Preferred image provider</h3>
          <div className="vy-field" style={{ maxWidth: 260 }}>
            <select value={data.imageProvider} onChange={async (e) => { await t.call("settings_save", { imageProvider: e.target.value }); load(); }}>
              <option value="auto">Automatic</option>
              {data.providers.filter((p) => p.kind === "image").map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
          </div>
        </div>
      )}
      {section("photo", "Stock photos (optional)", "Free keys from Pexels or Unsplash give much better photo search. Without one, Vyybe searches Openverse (Creative Commons).")}
      <div className="vy-card">
        <h3>Your library</h3>
        <div className="vy-hint">Projects and brandings are saved on this computer in <code>{data.library}</code>. Rendering engine: {data.renderer ? "ready" : "missing — ask the assistant to run Vyybe setup"}.</div>
      </div>
      {err && <div className="vy-hint" style={{ color: "var(--vy-danger)" }}>{err}</div>}
    </div>
  );
}
