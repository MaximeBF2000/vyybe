import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Transport } from "../transport";
import { ToolError } from "../transport";
import { registerFonts, serializeFrame } from "../frame";
import { Icon } from "../Icon";
import { Canvas, type CanvasApi } from "./Canvas";
import { Inspector } from "./Inspector";
import { Filmstrip } from "./Filmstrip";
import { ExportMenu } from "./ExportMenu";
import { FrameView } from "../FrameView";

export interface FrameData {
  id: string;
  name: string;
  width: number;
  height: number;
  revision: number;
  html: string;
  lastEditBy?: string;
  missing?: string[];
}
export interface Bundle {
  project: { id: string; name: string; kind: "carousel" | "collection"; revision: number; theme: { colors: Record<string, string>; fonts: Record<string, { family: string }> }; logos: Record<string, string> };
  frames: FrameData[];
  css: string;
  fonts: any[];
  assets: { file: string; source: string; bytes: number }[];
}

type SaveState = "saved" | "saving" | "error" | "conflict";

export function Studio({ t, projectId, initialFrame, fullscreen }: { t: Transport; projectId: string; initialFrame?: string | null; fullscreen: boolean }) {
  const [bundle, setBundle] = useState<Bundle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(initialFrame ?? null);
  const [view, setView] = useState<"focus" | "grid">("focus");
  const [selected, setSelected] = useState<HTMLElement | null>(null);
  const [tick, setTick] = useState(0);
  const [mountKey, setMountKey] = useState(0);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [toast, setToast] = useState<{ text: string; action?: { label: string; fn: () => void }; onDismiss?: () => void } | null>(null);
  const [showExport, setShowExport] = useState(false);
  const [narrow, setNarrow] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasApi = useRef<CanvasApi | null>(null);

  const knownRevision = useRef(0);
  const pending = useRef(new Map<string, { html: string; display: string }>());
  const saveTimer = useRef<number | null>(null);
  const history = useRef(new Map<string, { undo: string[]; redo: string[]; last: string }>());
  const editedFrames = useRef(new Set<string>());
  const contextTimer = useRef<number | null>(null);

  const load = useCallback(
    async (keepActive?: string | null) => {
      const b = (await t.call("studio_load", { projectId })) as Bundle;
      await registerFonts(b.fonts);
      knownRevision.current = b.project.revision;
      setBundle(b);
      setActiveId((cur) => {
        const want = keepActive ?? cur;
        return want && b.frames.some((f) => f.id === want) ? want : b.frames[0]?.id ?? null;
      });
      setMountKey((k) => k + 1);
      return b;
    },
    [t, projectId],
  );

  useEffect(() => {
    load(initialFrame).catch((e) => setError(e.message));
  }, [load, initialFrame]);

  // responsive: inspector becomes a drawer when narrow
  useEffect(() => {
    const ro = new ResizeObserver(() => {
      const w = rootRef.current?.clientWidth ?? 1000;
      setNarrow(w < 760);
    });
    if (rootRef.current) ro.observe(rootRef.current);
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    if (narrow) setInspectorOpen(false);
    else setInspectorOpen(true);
  }, [narrow]);

  const active = bundle?.frames.find((f) => f.id === activeId) ?? null;
  const activeIndex = bundle && active ? bundle.frames.indexOf(active) : -1;

  // ---------- saving ----------
  const flush = useCallback(async () => {
    if (!bundle) return;
    const entries = [...pending.current.entries()];
    pending.current.clear();
    if (!entries.length) return;
    setSaveState("saving");
    for (const [frameId, { html }] of entries) {
      const frame = bundle.frames.find((f) => f.id === frameId);
      if (!frame) continue;
      try {
        const r: any = await t.call("studio_save_frame", { projectId, frameId, html, baseRevision: frame.revision, width: frame.width, height: frame.height });
        frame.revision = r.revision;
        knownRevision.current = r.projectRevision;
        editedFrames.current.add(frameId);
      } catch (e: any) {
        if (e instanceof ToolError && e.code === "REVISION_CONFLICT") {
          setSaveState("conflict");
          setToast({
            text: "The assistant changed this frame while you were editing. ✕ = use theirs.",
            action: {
              label: "Keep my version",
              fn: async () => {
                setToast(null);
                try {
                  const b = (await t.call("studio_load", { projectId })) as Bundle;
                  const fresh = b.frames.find((f) => f.id === frameId);
                  if (fresh) await t.call("studio_save_frame", { projectId, frameId, html, baseRevision: fresh.revision, width: frame.width, height: frame.height });
                  await load(frameId);
                  history.current.delete(frameId);
                  setSaveState("saved");
                } catch (err: any) {
                  setSaveState("error");
                  setToast({ text: `Couldn't save: ${err.message}` });
                }
              },
            },
            onDismiss: async () => {
              // dismissing = take the assistant's version
              await load(frameId);
              history.current.delete(frameId);
              setSaveState("saved");
            },
          });
          return;
        }
        setSaveState("error");
        setToast({ text: `Couldn't save: ${e.message}` });
        return;
      }
    }
    setSaveState(pending.current.size ? "saving" : "saved");
    // let the agent know (without starting a turn)
    if (contextTimer.current) clearTimeout(contextTimer.current);
    contextTimer.current = window.setTimeout(() => {
      const names = [...editedFrames.current].map((id) => {
        const f = bundle.frames.find((x) => x.id === id);
        return f ? `${f.id} "${f.name}" (rev ${f.revision})` : id;
      });
      t.updateContext?.(`The user manually edited project "${bundle.project.name}" (${projectId}) in Vyybe Studio: ${names.join(", ")}. Call read_frame before changing these frames so their edits are kept.`);
    }, 1500);
  }, [bundle, projectId, t]);

  const scheduleSave = useCallback(() => {
    setSaveState("saving");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(flush, 700);
  }, [flush]);

  // ---------- commits & history ----------
  const hist = (id: string) => {
    let h = history.current.get(id);
    if (!h) {
      h = { undo: [], redo: [], last: bundle?.frames.find((f) => f.id === id)?.html ?? "" };
      history.current.set(id, h);
    }
    return h;
  };

  const commit = useCallback(() => {
    const frameEl = canvasApi.current?.frameEl();
    if (!frameEl || !active || !bundle) return;
    const display = frameEl.innerHTML;
    const h = hist(active.id);
    if (display === h.last) {
      setTick((x) => x + 1);
      return;
    }
    h.undo.push(h.last);
    if (h.undo.length > 80) h.undo.shift();
    h.redo = [];
    h.last = display;
    active.html = display;
    pending.current.set(active.id, { html: serializeFrame(frameEl), display });
    setBundle({ ...bundle });
    setTick((x) => x + 1);
    scheduleSave();
  }, [active, bundle, scheduleSave]);

  const applyHistory = useCallback(
    (dir: "undo" | "redo") => {
      if (!active || !bundle) return;
      const h = hist(active.id);
      const from = dir === "undo" ? h.undo : h.redo;
      const to = dir === "undo" ? h.redo : h.undo;
      const html = from.pop();
      if (html === undefined) return;
      to.push(h.last);
      h.last = html;
      active.html = html;
      setSelected(null);
      setBundle({ ...bundle });
      setMountKey((k) => k + 1);
      // serialize after remount
      requestAnimationFrame(() => {
        const el = canvasApi.current?.frameEl();
        if (el) {
          pending.current.set(active.id, { html: serializeFrame(el), display: html });
          scheduleSave();
        }
      });
    },
    [active, bundle, scheduleSave],
  );

  // ---------- polling for agent changes ----------
  useEffect(() => {
    if (!bundle) return;
    const iv = window.setInterval(async () => {
      if (document.hidden || pending.current.size || saveState === "saving" || canvasApi.current?.isEditingText()) return;
      try {
        const r: any = await t.call("studio_poll", { projectId, revision: knownRevision.current });
        if (r.changed) {
          await load(activeId);
          history.current.clear();
          setSelected(null);
          setToast({ text: "Updated with the latest changes." });
          setTimeout(() => setToast(null), 2500);
        }
      } catch {}
    }, 4000);
    return () => clearInterval(iv);
  }, [bundle, t, projectId, load, activeId, saveState]);

  // ---------- frame operations ----------
  const frameOp = useCallback(
    async (action: "reorder" | "duplicate" | "delete" | "rename", frameId?: string, extra: Record<string, unknown> = {}) => {
      await flush();
      const r: any = await t.call("studio_frames", { projectId, action, frameId, ...extra });
      knownRevision.current = r.revision;
      const b = await load(action === "delete" && frameId === activeId ? null : activeId);
      if (action === "duplicate" && frameId) {
        const idx = b.frames.findIndex((f) => f.id === frameId);
        if (b.frames[idx + 1]) setActiveId(b.frames[idx + 1].id);
      }
      editedFrames.current.add(frameId ?? "order");
      t.updateContext?.(`The user ${action === "reorder" ? "reordered the frames" : `${action}d frame ${frameId}`} in Vyybe Studio for project ${projectId}. Current order: ${b.frames.map((f) => f.id).join(", ")}.`);
    },
    [flush, t, projectId, load, activeId],
  );

  const selectFrame = (id: string) => {
    canvasApi.current?.stopEditing();
    setSelected(null);
    setActiveId(id);
    setView("focus");
    setMountKey((k) => k + 1);
  };

  // keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (canvasApi.current?.isEditingText()) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        applyHistory(e.shiftKey ? "redo" : "undo");
      } else if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        applyHistory("redo");
      } else if (!selected && bundle && (e.key === "ArrowRight" || e.key === "ArrowLeft") && view === "focus") {
        const i = activeIndex + (e.key === "ArrowRight" ? 1 : -1);
        if (bundle.frames[i]) selectFrame(bundle.frames[i].id);
      } else {
        canvasApi.current?.onKey(e);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // flush on teardown
  useEffect(() => {
    const before = () => {
      if (pending.current.size) flush();
    };
    window.addEventListener("beforeunload", before);
    window.addEventListener("pagehide", before);
    return () => {
      window.removeEventListener("beforeunload", before);
      window.removeEventListener("pagehide", before);
    };
  }, [flush]);

  const issues = useMemo(() => active?.missing ?? [], [active]);

  if (error) return <div className="vy-center"><div><Icon name="triangle-alert" size={22} /><p>{error}</p></div></div>;
  if (!bundle) return <div className="vy-center"><div><div className="vy-spinner" />Loading your design…</div></div>;
  if (!bundle.frames.length) return <div className="vy-center">This project has no frames yet. Ask the assistant to create some.</div>;

  const h = active ? hist(active.id) : null;

  return (
    <div className="vy-main" ref={rootRef} style={{ flexDirection: "column" }}>
      <div className="vy-bar">
        <div className="vy-title">
          <span className="vy-logo-mark">V</span>
          <span title={bundle.project.name}>{bundle.project.name}</span>
        </div>
        <span className={`vy-status ${saveState}`} title={saveState === "saved" ? "All changes saved to your computer" : undefined}>
          <span className="dot" />
          {saveState === "saved" ? "Saved" : saveState === "saving" ? "Saving…" : saveState === "conflict" ? "Conflict" : "Not saved"}
        </span>
        <div className="vy-spacer" />
        <button className="vy-btn icon" title="Undo (⌘Z)" disabled={!h?.undo.length} onClick={() => applyHistory("undo")}><Icon name="undo-2" /></button>
        <button className="vy-btn icon" title="Redo (⇧⌘Z)" disabled={!h?.redo.length} onClick={() => applyHistory("redo")}><Icon name="redo-2" /></button>
        {bundle.frames.length > 1 && (
          <div className="vy-seg">
            <button className={`vy-btn icon ${view === "focus" ? "active" : ""}`} title="Edit one frame" onClick={() => setView("focus")}><Icon name="square" /></button>
            <button className={`vy-btn icon ${view === "grid" ? "active" : ""}`} title="See all frames" onClick={() => { canvasApi.current?.stopEditing(); setSelected(null); setView("grid"); }}><Icon name="layout-grid" /></button>
          </div>
        )}
        {narrow && view === "focus" && (
          <button className={`vy-btn icon ${inspectorOpen ? "active" : ""}`} title="Properties" onClick={() => setInspectorOpen((o) => !o)}><Icon name="panel-right" /></button>
        )}
        {t.fullscreen?.available && (
          <button className="vy-btn icon" title={fullscreen ? "Exit full screen" : "Full screen"} onClick={() => t.fullscreen!.toggle()}><Icon name={fullscreen ? "minimize-2" : "maximize-2"} /></button>
        )}
        <div style={{ position: "relative" }}>
          <button className="vy-btn primary" onClick={() => setShowExport((s) => !s)}><Icon name="download" />Download</button>
          {showExport && <ExportMenu t={t} projectId={projectId} frames={bundle.frames} activeId={activeId} kind={bundle.project.kind} beforeExport={flush} onClose={() => setShowExport(false)} />}
        </div>
      </div>

      <div className="vy-main">
        <div className="vy-stage" onPointerDown={() => showExport && setShowExport(false)}>
          {view === "grid" ? (
            <GridView bundle={bundle} activeId={activeId} onOpen={selectFrame} />
          ) : (
            active && (
              <Canvas
                key={`${active.id}:${mountKey}`}
                frame={active}
                css={bundle.css}
                selected={selected}
                onSelect={setSelected}
                onCommit={commit}
                apiRef={canvasApi}
                tick={tick}
                onMount={() => setTick((x) => x + 1)}
              />
            )
          )}
          {view === "focus" && issues.length > 0 && (
            <div className="vy-issues">{issues.slice(0, 3).map((m) => <div key={m} className="vy-issue">Missing {m}</div>)}</div>
          )}
          {toast && (
            <div className="vy-toast">
              <span>{toast.text}</span>
              {toast.action && <button onClick={toast.action.fn}>{toast.action.label}</button>}
              <button onClick={() => { toast.onDismiss?.(); setToast(null); }} aria-label="Dismiss" title={toast.onDismiss ? "Use the assistant's version" : "Dismiss"}><Icon name="x" size={14} /></button>
            </div>
          )}
        </div>
        {view === "focus" && inspectorOpen && active && (
          <Inspector
            t={t}
            bundle={bundle}
            frame={active}
            selected={selected}
            tick={tick}
            canvas={canvasApi}
            onCommit={commit}
            onSelect={setSelected}
            drawer={narrow}
            onClose={() => setInspectorOpen(false)}
            onRename={(name) => frameOp("rename", active.id, { name })}
          />
        )}
      </div>

      {bundle.frames.length > 1 || bundle.project.kind === "carousel" ? (
        <Filmstrip
          frames={bundle.frames}
          css={bundle.css}
          activeId={activeId}
          onSelect={selectFrame}
          onReorder={(order) => frameOp("reorder", undefined, { order })}
          onDuplicate={(id) => frameOp("duplicate", id)}
          onDelete={(id) => {
            if (bundle.frames.length <= 1) return;
            setToast({ text: `Delete "${bundle.frames.find((f) => f.id === id)?.name}"?`, action: { label: "Delete", fn: () => { setToast(null); frameOp("delete", id); } } });
          }}
        />
      ) : null}
    </div>
  );
}

function GridView({ bundle, activeId, onOpen }: { bundle: Bundle; activeId: string | null; onOpen: (id: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(600);
  useEffect(() => {
    const ro = new ResizeObserver(() => setW(ref.current?.clientWidth ?? 600));
    if (ref.current) ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  const maxW = Math.max(...bundle.frames.map((f) => f.width));
  const landscape = bundle.frames.every((f) => f.width > f.height);
  const cols = Math.max(1, Math.min(bundle.frames.length, Math.floor((w - 44) / (landscape ? 300 : 210))));
  const cell = (w - 44 - (cols - 1) * 22) / cols;
  return (
    <div className="vy-grid" ref={ref} style={{ gridTemplateColumns: `repeat(${cols}, ${cell}px)` }}>
      {bundle.frames.map((f, i) => (
        <div key={f.id} className={`vy-grid-item ${f.id === activeId ? "active" : ""}`} onClick={() => onOpen(f.id)}>
          <div className="thumb"><FrameView html={f.html} css={bundle.css} width={f.width} height={f.height} scale={(cell / maxW) * (maxW / f.width)} /></div>
          <div className="cap"><b>{i + 1}</b>{f.name}<span style={{ marginLeft: "auto", color: "var(--vy-text3)" }}>{f.width}×{f.height}</span></div>
        </div>
      ))}
    </div>
  );
}
