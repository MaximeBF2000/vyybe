import { useEffect, useState, type MutableRefObject } from "react";
import type { Transport } from "../transport";
import { Icon } from "../Icon";
import type { Bundle, FrameData } from "./Studio";
import type { CanvasApi } from "./Canvas";
import { describe, isTextElement, isImageElement, frameRect, getOffset, setOffset, setSize, moveLayer, duplicateElement, rgbToHex } from "./edit";
import { AssetModal } from "./AssetModal";

interface Props {
  t: Transport;
  bundle: Bundle;
  frame: FrameData;
  selected: HTMLElement | null;
  tick: number;
  canvas: MutableRefObject<CanvasApi | null>;
  onCommit: () => void;
  onSelect: (el: HTMLElement | null) => void;
  drawer: boolean;
  onClose: () => void;
  onRename: (name: string) => void;
}

export function Inspector(p: Props) {
  const frameEl = p.canvas.current?.frameEl() ?? null;
  const el = p.selected && frameEl?.contains(p.selected) ? p.selected : null;
  return (
    <aside className={`vy-insp ${p.drawer ? "drawer" : ""}`} onPointerDown={(e) => e.stopPropagation()}>
      {p.drawer && (
        <div className="vy-sec" style={{ flexDirection: "row", alignItems: "center" }}>
          <b style={{ flex: 1 }}>Properties</b>
          <button className="vy-btn icon" onClick={p.onClose}><Icon name="x" /></button>
        </div>
      )}
      {el && frameEl ? <ElementPanel {...p} el={el} frameEl={frameEl} /> : <FramePanel {...p} frameEl={frameEl} />}
    </aside>
  );
}

function FramePanel(p: Props & { frameEl: HTMLElement | null }) {
  const [name, setName] = useState(p.frame.name);
  useEffect(() => setName(p.frame.name), [p.frame.id, p.frame.name]);
  const layers = p.frameEl ? [...p.frameEl.children].filter((c) => c.tagName !== "STYLE").reverse() as HTMLElement[] : [];
  void p.tick;
  return (
    <>
      <div className="vy-sec">
        <h4>Frame</h4>
        <div className="vy-field">
          <input value={name} onChange={(e) => setName(e.target.value)} onBlur={() => name.trim() && name !== p.frame.name && p.onRename(name.trim())} onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()} />
        </div>
        <div className="vy-hint">{p.frame.width} × {p.frame.height}px</div>
      </div>
      <div className="vy-sec">
        <h4>Layers</h4>
        <div className="vy-layers">
          {layers.map((l, i) => (
            <div key={i} className="vy-layer" onClick={() => p.onSelect(l)}>
              <Icon name={l.tagName === "IMG" ? "image" : isTextElement(l) ? "type" : l.tagName === "VY-ICON" ? "sparkles" : "shapes"} />
              <span>{describe(l)}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="vy-sec">
        <h4>Tips</h4>
        <div className="vy-hint">
          Click to select · double-click text to edit it · drag to move · drag corners to resize · ⌘Z undo · ⌘D duplicate · Delete removes. Everything saves automatically. For bigger changes, just ask the assistant in the chat.
        </div>
      </div>
    </>
  );
}

function ElementPanel(p: Props & { el: HTMLElement; frameEl: HTMLElement }) {
  const { el, frameEl } = p;
  void p.tick;
  const cs = getComputedStyle(el);
  const scale = p.canvas.current?.scale() ?? 1;
  const rect = frameRect(el, frameEl, scale);
  const text = isTextElement(el);
  const image = isImageElement(el);
  const isIcon = el.tagName === "VY-ICON";
  const theme = p.bundle.project.theme;
  const [assetOpen, setAssetOpen] = useState(false);

  const set = (prop: string, value: string | null) => {
    if (value === null || value === "") el.style.removeProperty(prop);
    else el.style.setProperty(prop, value);
    p.onCommit();
  };

  const num = (v: string) => Math.round(parseFloat(v) * 10) / 10 || 0;

  return (
    <>
      <div className="vy-sec">
        <h4>
          <span style={{ textTransform: "none", letterSpacing: 0, fontSize: 12.5, color: "var(--vy-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{describe(el)}</span>
          <span style={{ display: "flex", gap: 2 }}>
            <button className="vy-btn icon" title="Bring forward (])" onClick={() => (moveLayer(el, "forward"), p.onCommit())}><Icon name="arrow-up" /></button>
            <button className="vy-btn icon" title="Send backward ([)" onClick={() => (moveLayer(el, "backward"), p.onCommit())}><Icon name="arrow-down" /></button>
            <button className="vy-btn icon" title="Duplicate (⌘D)" onClick={() => (p.onSelect(duplicateElement(el)), p.onCommit())}><Icon name="copy" /></button>
            <button className="vy-btn icon danger" title="Delete" onClick={() => (el.remove(), p.onSelect(null), p.onCommit())}><Icon name="trash-2" /></button>
          </span>
        </h4>
        {text && (
          <button className="vy-btn outline" onClick={() => p.canvas.current?.startEditing(el)}><Icon name="pencil" />Edit text</button>
        )}
        {el.parentElement && el.parentElement !== frameEl && (
          <button className="vy-btn" style={{ justifyContent: "flex-start", color: "var(--vy-text2)" }} onClick={() => p.onSelect(el.parentElement as HTMLElement)}><Icon name="chevrons-up" />Select parent group</button>
        )}
      </div>

      {text && (
        <div className="vy-sec">
          <h4>Text</h4>
          <div className="vy-field">
            <select
              value={fontRoleOf(el, theme)}
              onChange={(e) => set("font-family", e.target.value ? `var(--font-${e.target.value})` : null)}
            >
              <option value="">{cs.fontFamily.split(",")[0].replace(/"/g, "")}</option>
              {Object.entries(theme.fonts).map(([role, f]) => (
                <option key={role} value={role}>{f.family} ({role})</option>
              ))}
            </select>
          </div>
          <div className="vy-row">
            <div className="vy-field" title="Font size (px)"><label>S</label><input type="number" value={num(cs.fontSize)} onChange={(e) => set("font-size", `${e.target.value}px`)} /></div>
            <div className="vy-field" title="Weight">
              <select value={cs.fontWeight} onChange={(e) => set("font-weight", e.target.value)}>
                {[100, 200, 300, 400, 500, 600, 700, 800, 900].map((w) => <option key={w} value={String(w)}>{w}</option>)}
              </select>
            </div>
          </div>
          <div className="vy-row">
            <div className="vy-field" title="Line height"><label>↕</label><input type="number" step="0.05" value={lineHeightRatio(cs)} onChange={(e) => set("line-height", e.target.value)} /></div>
            <div className="vy-field" title="Letter spacing (em)"><label>↔</label><input type="number" step="0.01" value={Math.round((parseFloat(cs.letterSpacing) || 0) / parseFloat(cs.fontSize) * 100) / 100} onChange={(e) => set("letter-spacing", `${e.target.value}em`)} /></div>
          </div>
          <div className="vy-row">
            <div className="vy-seg">
              {(["left", "center", "right"] as const).map((a) => (
                <button key={a} className={`vy-btn icon ${cs.textAlign === a || (a === "left" && cs.textAlign === "start") ? "active" : ""}`} onClick={() => set("text-align", a)}><Icon name={`align-${a}`} /></button>
              ))}
            </div>
            <div className="vy-seg">
              <button className={`vy-btn icon ${cs.textTransform === "uppercase" ? "active" : ""}`} title="Uppercase" onClick={() => set("text-transform", cs.textTransform === "uppercase" ? "none" : "uppercase")}><Icon name="case-upper" /></button>
              <button className={`vy-btn icon ${cs.fontStyle === "italic" ? "active" : ""}`} title="Italic" onClick={() => set("font-style", cs.fontStyle === "italic" ? "normal" : "italic")}><Icon name="italic" /></button>
            </div>
          </div>
          <Swatches label="Color" theme={theme.colors} current={cs.color} onPick={(v) => set("color", v)} allowNone={false} />
        </div>
      )}

      {isIcon && <IconPanel t={p.t} el={el} onCommit={p.onCommit} theme={theme.colors} />}

      {image && (
        <div className="vy-sec">
          <h4>Image</h4>
          <button className="vy-btn outline" onClick={() => setAssetOpen(true)}><Icon name="image" />Replace image</button>
          {el.tagName === "IMG" && (
            <div className="vy-field">
              <select value={cs.objectFit} onChange={(e) => set("object-fit", e.target.value)}>
                <option value="cover">Fill (crop)</option>
                <option value="contain">Fit (no crop)</option>
                <option value="fill">Stretch</option>
              </select>
            </div>
          )}
          {assetOpen && (
            <AssetModal
              t={p.t}
              projectId={p.bundle.project.id}
              assets={p.bundle.assets}
              onClose={() => setAssetOpen(false)}
              onPick={(uri, file) => {
                if (el.tagName === "IMG") (el as HTMLImageElement).src = uri;
                else el.style.backgroundImage = `url("${uri}")`;
                if (!p.bundle.assets.some((a) => a.file === file)) p.bundle.assets.push({ file, source: "upload", bytes: 0 });
                setAssetOpen(false);
                p.onCommit();
              }}
            />
          )}
        </div>
      )}

      {!text && !isIcon && el.tagName !== "IMG" && (
        <div className="vy-sec">
          <h4>Fill</h4>
          <Swatches label="Background" theme={theme.colors} current={cs.backgroundColor} onPick={(v) => set("background", v)} allowNone onNone={() => set("background", "transparent")} />
        </div>
      )}
      {text && (
        <div className="vy-sec">
          <h4>Background</h4>
          <Swatches label="Background" theme={theme.colors} current={cs.backgroundColor} onPick={(v) => set("background-color", v)} allowNone onNone={() => set("background-color", "transparent")} />
        </div>
      )}

      <div className="vy-sec">
        <h4>Layout</h4>
        <div className="vy-row">
          <NumField label="X" value={rect.x} onChange={(v) => { const o = getOffset(el); setOffset(el, o.x + (v - rect.x), o.y); p.onCommit(); }} />
          <NumField label="Y" value={rect.y} onChange={(v) => { const o = getOffset(el); setOffset(el, o.x, o.y + (v - rect.y)); p.onCommit(); }} />
        </div>
        <div className="vy-row">
          <NumField label="W" value={el.offsetWidth || rect.w} onChange={(v) => { setSize(el, v, undefined); p.onCommit(); }} />
          <NumField label="H" value={el.offsetHeight || rect.h} onChange={(v) => { setSize(el, undefined, v); p.onCommit(); }} />
        </div>
        <div className="vy-row">
          <NumField label="↻" title="Rotation (deg)" value={rotationOf(cs)} onChange={(v) => set("rotate", `${v}deg`)} />
          <NumField label="◐" title="Opacity (%)" value={Math.round(parseFloat(cs.opacity) * 100)} onChange={(v) => set("opacity", String(Math.max(0, Math.min(100, v)) / 100))} />
        </div>
        <div className="vy-row">
          <NumField label="◜" title="Corner radius (px)" value={parseFloat(cs.borderTopLeftRadius) || 0} onChange={(v) => set("border-radius", `${v}px`)} />
          <div style={{ flex: 1 }} />
        </div>
      </div>
    </>
  );
}

function NumField({ label, value, onChange, title }: { label: string; value: number; onChange: (v: number) => void; title?: string }) {
  const [v, setV] = useState(String(Math.round(value)));
  useEffect(() => setV(String(Math.round(value))), [value]);
  return (
    <div className="vy-field" title={title ?? label}>
      <label>{label}</label>
      <input
        type="number"
        value={v}
        onChange={(e) => setV(e.target.value)}
        onBlur={() => v !== "" && Number(v) !== Math.round(value) && onChange(Number(v))}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
      />
    </div>
  );
}

function Swatches({ label, theme, current, onPick, allowNone, onNone }: { label: string; theme: Record<string, string>; current: string; onPick: (v: string) => void; allowNone: boolean; onNone?: () => void }) {
  const cur = rgbToHex(current).toLowerCase();
  const transparent = /rgba\(0, 0, 0, 0\)|transparent/.test(current);
  return (
    <div>
      <div className="vy-hint" style={{ marginBottom: 6 }}>{label}</div>
      <div className="vy-swatches">
        {allowNone && <button className={`vy-swatch none ${transparent ? "active" : ""}`} title="None" onClick={onNone} />}
        {Object.entries(theme).map(([name, value]) => (
          <button
            key={name}
            className={`vy-swatch ${!transparent && value.toLowerCase().startsWith("#") && value.toLowerCase().slice(0, 7) === cur ? "active" : ""}`}
            title={`${name} ${value}`}
            style={{ background: value }}
            onClick={() => onPick(`var(--color-${name})`)}
          />
        ))}
        <span className="vy-swatch custom" title="Custom color">
          <input type="color" value={transparent ? "#ffffff" : cur} onChange={(e) => onPick(e.target.value)} />
        </span>
      </div>
    </div>
  );
}

function IconPanel({ t, el, onCommit, theme }: { t: Transport; el: HTMLElement; onCommit: () => void; theme: Record<string, string> }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<{ ref: string; label: string; svg: string }[]>([]);
  useEffect(() => {
    if (q.trim().length < 2) {
      setHits([]);
      return;
    }
    const id = setTimeout(async () => {
      try {
        const r: any = await t.call("studio_icons", { query: q });
        setHits(r.icons ?? []);
      } catch {}
    }, 250);
    return () => clearTimeout(id);
  }, [q, t]);
  return (
    <div className="vy-sec">
      <h4>Icon</h4>
      <div className="vy-hint">{el.getAttribute("name")}</div>
      <div className="vy-field"><input placeholder="Search icons (e.g. rocket, chart)…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      {hits.length > 0 && (
        <div className="vy-swatches">
          {hits.map((h) => (
            <button
              key={h.ref}
              className="vy-btn icon outline"
              title={h.label}
              onClick={() => {
                el.setAttribute("name", h.ref);
                el.innerHTML = h.svg;
                onCommit();
              }}
              dangerouslySetInnerHTML={{ __html: h.svg }}
            />
          ))}
        </div>
      )}
      <Swatches label="Color" theme={theme} current={getComputedStyle(el).color} onPick={(v) => { el.style.color = v; onCommit(); }} allowNone={false} />
    </div>
  );
}

function fontRoleOf(el: HTMLElement, theme: Bundle["project"]["theme"]): string {
  const inline = el.style.fontFamily.match(/var\(--font-([\w-]+)\)/)?.[1];
  if (inline) return inline;
  const family = getComputedStyle(el).fontFamily.split(",")[0].replace(/"/g, "").trim();
  return Object.entries(theme.fonts).find(([, f]) => f.family === family)?.[0] ?? "";
}

function lineHeightRatio(cs: CSSStyleDeclaration): number {
  const lh = parseFloat(cs.lineHeight);
  const fs = parseFloat(cs.fontSize);
  if (!lh || !fs) return 1.2;
  return Math.round((lh / fs) * 100) / 100;
}

function rotationOf(cs: CSSStyleDeclaration): number {
  if (cs.rotate && cs.rotate !== "none") return parseFloat(cs.rotate) || 0;
  return 0;
}
