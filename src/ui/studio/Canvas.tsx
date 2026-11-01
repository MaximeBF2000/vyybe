import { useEffect, useLayoutEffect, useRef, useState, type MutableRefObject } from "react";
import { mountFrame } from "../frame";
import { pickElement, isTextElement, frameRect, getOffset, setOffset, setSize, duplicateElement, moveLayer, describe } from "./edit";
import type { FrameData } from "./Studio";

export interface CanvasApi {
  frameEl(): HTMLElement | null;
  scale(): number;
  isEditingText(): boolean;
  stopEditing(): void;
  startEditing(el: HTMLElement): void;
  onKey(e: KeyboardEvent): void;
  refresh(): void;
}

const HANDLES = ["nw", "n", "ne", "e", "se", "s", "sw", "w"] as const;
type Handle = (typeof HANDLES)[number];

export function Canvas({
  frame,
  css,
  selected,
  onSelect,
  onCommit,
  apiRef,
  tick,
  onMount,
  readOnly,
}: {
  frame: FrameData;
  css: string;
  selected: HTMLElement | null;
  onSelect: (el: HTMLElement | null) => void;
  onCommit: () => void;
  apiRef: MutableRefObject<CanvasApi | null>;
  tick: number;
  onMount?: () => void;
  readOnly?: boolean;
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const frameElRef = useRef<HTMLElement | null>(null);
  const [scale, setScale] = useState(0.4);
  const [hover, setHover] = useState<HTMLElement | null>(null);
  const [editing, setEditing] = useState<HTMLElement | null>(null);
  const [, force] = useState(0);
  const drag = useRef<null | { kind: "move" | "resize"; handle?: Handle; el: HTMLElement; sx: number; sy: number; ox: number; oy: number; ow: number; oh: number; moved: boolean; ratio: number; r0?: { x: number; y: number; w: number; h: number }; drillTo?: HTMLElement | null }>(null);
  const [guides, setGuides] = useState<{ x?: number; y?: number }>({});
  const editingRef = useRef<HTMLElement | null>(null);
  editingRef.current = editing;

  // mount the frame once per key
  useLayoutEffect(() => {
    if (hostRef.current) frameElRef.current = mountFrame(hostRef.current, { css, html: frame.html, width: frame.width, height: frame.height });
    force((x) => x + 1);
    onMount?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // fit to stage
  useEffect(() => {
    const fit = () => {
      const st = stageRef.current;
      if (!st) return;
      const pad = 36;
      const s = Math.min((st.clientWidth - pad * 2) / frame.width, (st.clientHeight - pad * 2) / frame.height);
      setScale(Math.max(0.05, Math.min(s, 1.5)));
    };
    fit();
    const ro = new ResizeObserver(fit);
    if (stageRef.current) ro.observe(stageRef.current);
    return () => ro.disconnect();
  }, [frame.width, frame.height]);

  const stopEditing = () => {
    const el = editingRef.current;
    if (!el) return;
    el.removeAttribute("contenteditable");
    el.removeAttribute("spellcheck");
    setEditing(null);
    onCommit();
  };

  const startEditing = (el: HTMLElement) => {
    if (!isTextElement(el)) return;
    onSelect(el);
    let mode = "plaintext-only";
    el.setAttribute("contenteditable", mode);
    if (el.contentEditable !== mode) el.setAttribute("contenteditable", (mode = "true"));
    el.setAttribute("spellcheck", "false");
    el.focus();
    const root = el.getRootNode() as ShadowRoot & { getSelection?: () => Selection | null };
    const sel = root.getSelection?.() ?? window.getSelection();
    if (sel && (sel.isCollapsed || !el.contains(sel.anchorNode))) {
      const range = document.createRange();
      range.selectNodeContents(el);
      sel.removeAllRanges();
      sel.addRange(range);
    }
    setEditing(el);
  };

  const nudge = (dx: number, dy: number) => {
    if (!selected) return;
    const o = getOffset(selected);
    setOffset(selected, o.x + dx, o.y + dy);
    onCommit();
  };

  apiRef.current = {
    frameEl: () => frameElRef.current,
    scale: () => scale,
    isEditingText: () => !!editingRef.current,
    stopEditing,
    startEditing,
    refresh: () => force((x) => x + 1),
    onKey: (e: KeyboardEvent) => {
      if (!selected) return;
      const mod = e.metaKey || e.ctrlKey;
      const step = e.shiftKey ? 10 : 1;
      if (e.key === "Escape") onSelect(null);
      else if (e.key === "Backspace" || e.key === "Delete") {
        e.preventDefault();
        selected.remove();
        onSelect(null);
        onCommit();
      } else if (e.key === "ArrowLeft") (e.preventDefault(), nudge(-step, 0));
      else if (e.key === "ArrowRight") (e.preventDefault(), nudge(step, 0));
      else if (e.key === "ArrowUp") (e.preventDefault(), nudge(0, -step));
      else if (e.key === "ArrowDown") (e.preventDefault(), nudge(0, step));
      else if (mod && e.key.toLowerCase() === "d") {
        e.preventDefault();
        onSelect(duplicateElement(selected));
        onCommit();
      } else if (e.key === "]") (moveLayer(selected, mod ? "front" : "forward"), onCommit());
      else if (e.key === "[") (moveLayer(selected, mod ? "back" : "backward"), onCommit());
      else if (e.key === "Enter" && isTextElement(selected)) (e.preventDefault(), startEditing(selected));
    },
  };

  const targetOf = (e: React.PointerEvent | React.MouseEvent) => (e.nativeEvent.composedPath()[0] as Element) ?? null;

  const onPointerDown = (e: React.PointerEvent) => {
    if (readOnly) return;
    const frameEl = frameElRef.current;
    if (!frameEl || e.button !== 0) return;
    const target = targetOf(e);
    if (editingRef.current) {
      if (editingRef.current.contains(target)) return; // caret placement inside the text
      stopEditing();
    }
    if (!frameEl.contains(target)) {
      onSelect(null);
      return;
    }
    const deep = e.metaKey || e.ctrlKey;
    const picked = pickElement(target, frameEl, selected, deep);
    // Pressing inside the current selection drags the selection; a plain click (no movement) drills in.
    const keep = !deep && selected && frameEl.contains(selected) && selected.contains(target) ? selected : null;
    const el = keep ?? picked;
    if (!keep) onSelect(el);
    if (!el) return;
    window.getSelection()?.removeAllRanges();
    const o = getOffset(el);
    drag.current = { kind: "move", el, sx: e.clientX, sy: e.clientY, ox: o.x, oy: o.y, ow: 0, oh: 0, moved: false, ratio: 1, drillTo: keep && picked !== keep ? picked : null };
  };

  const startResize = (e: React.PointerEvent, handle: Handle) => {
    if (!selected || !frameElRef.current) return;
    e.stopPropagation();
    const r = frameRect(selected, frameElRef.current, scale);
    const o = getOffset(selected);
    // use layout size (pre-transform) so rotation/scale classes don't distort
    const ow = selected.offsetWidth || r.w;
    const oh = selected.offsetHeight || r.h;
    drag.current = { kind: "resize", handle, el: selected, sx: e.clientX, sy: e.clientY, ox: o.x, oy: o.y, ow, oh, moved: false, ratio: ow / Math.max(1, oh), r0: r };
    stageRef.current?.setPointerCapture(e.pointerId);
  };

  const snap = (el: HTMLElement, nx: number, ny: number) => {
    // snap the element's edges/center to the frame's edges/center
    const frameEl = frameElRef.current!;
    const cur = getOffset(el);
    const r = frameRect(el, frameEl, scale);
    const baseX = r.x - cur.x;
    const baseY = r.y - cur.y;
    const tol = 6 / scale;
    const g: { x?: number; y?: number } = {};
    const xs = [[0, 0], [frame.width / 2, r.w / 2], [frame.width, r.w]] as const;
    const ys = [[0, 0], [frame.height / 2, r.h / 2], [frame.height, r.h]] as const;
    for (const [line, off] of xs) {
      const left = baseX + nx + off;
      if (Math.abs(left - line) < tol) {
        nx += line - left;
        g.x = line;
        break;
      }
    }
    for (const [line, off] of ys) {
      const top = baseY + ny + off;
      if (Math.abs(top - line) < tol) {
        ny += line - top;
        g.y = line;
        break;
      }
    }
    setGuides(g);
    return { nx, ny };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    const frameEl = frameElRef.current;
    if (!frameEl) return;
    if (!d) {
      if (editingRef.current || readOnly) return;
      const target = targetOf(e);
      const h = frameEl.contains(target) ? pickElement(target, frameEl, selected, e.metaKey || e.ctrlKey) : null;
      if (h !== hover) setHover(h);
      return;
    }
    const dx = (e.clientX - d.sx) / scale;
    const dy = (e.clientY - d.sy) / scale;
    if (!d.moved && Math.hypot(dx * scale, dy * scale) < 3) return;
    if (!d.moved) {
      // capture only once a real drag starts, so clicks/double-clicks keep their real target
      try {
        stageRef.current?.setPointerCapture(e.pointerId);
      } catch {}
    }
    d.moved = true;
    if (d.kind === "move") {
      const { nx, ny } = e.altKey ? { nx: d.ox + dx, ny: d.oy + dy } : snap(d.el, d.ox + dx, d.oy + dy);
      setOffset(d.el, nx, ny);
    } else {
      const hnd = d.handle!;
      let w = d.ow;
      let h = d.oh;
      if (hnd.includes("e")) w = d.ow + dx;
      if (hnd.includes("w")) w = d.ow - dx;
      if (hnd.includes("s")) h = d.oh + dy;
      if (hnd.includes("n")) h = d.oh - dy;
      const corner = hnd.length === 2;
      const keepRatio = corner && (e.shiftKey || d.el.tagName === "IMG" || d.el.tagName === "VY-ICON" || d.el.tagName === "VY-LOGO");
      if (keepRatio) {
        if (Math.abs(w - d.ow) / d.ow > Math.abs(h - d.oh) / d.oh) h = w / d.ratio;
        else w = h * d.ratio;
      }
      const isText = isTextElement(d.el);
      const setW = hnd !== "n" && hnd !== "s";
      const setH = hnd !== "e" && hnd !== "w" && (!isText || keepRatio);
      // Resize, then shift so the opposite edge stays put whatever the element's anchoring is.
      setOffset(d.el, d.ox, d.oy);
      const before = d.r0!;
      setSize(d.el, setW ? w : undefined, setH ? h : undefined);
      const after = frameRect(d.el, frameElRef.current!, scale);
      const adjX = hnd.includes("w") ? before.x + before.w - (after.x + after.w) : before.x - after.x;
      const adjY = hnd.includes("n") ? before.y + before.h - (after.y + after.h) : before.y - after.y;
      setOffset(d.el, d.ox + adjX, d.oy + adjY);
    }
    force((x) => x + 1);
  };

  const onPointerUp = () => {
    const d = drag.current;
    drag.current = null;
    setGuides({});
    if (d?.moved) onCommit();
    else if (d?.drillTo) onSelect(d.drillTo);
  };

  const onDoubleClick = (e: React.MouseEvent) => {
    if (readOnly) return;
    const frameEl = frameElRef.current;
    if (!frameEl) return;
    const root = frameEl.getRootNode() as ShadowRoot;
    const hit = root.elementFromPoint?.(e.clientX, e.clientY) ?? targetOf(e);
    const el = pickElement(hit, frameEl, null, true);
    if (el && isTextElement(el)) startEditing(el);
    else if (el) onSelect(el);
  };

  // keyboard inside text editing
  useEffect(() => {
    if (!editing) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        stopEditing();
      } else if (e.key === "Enter" && !e.shiftKey && editing.getAttribute("contenteditable") === "true") {
        e.preventDefault();
        document.execCommand("insertLineBreak");
      }
    };
    const onPaste = (e: ClipboardEvent) => {
      e.preventDefault();
      const text = e.clipboardData?.getData("text/plain") ?? "";
      document.execCommand("insertText", false, text);
    };
    editing.addEventListener("keydown", onKey);
    editing.addEventListener("paste", onPaste);
    return () => {
      editing.removeEventListener("keydown", onKey);
      editing.removeEventListener("paste", onPaste);
    };
  }, [editing]);

  const frameEl = frameElRef.current;
  const selValid = selected && frameEl?.contains(selected) ? selected : null;
  const hoverValid = hover && hover !== selValid && frameEl?.contains(hover) ? hover : null;
  const sr = selValid && frameEl ? frameRect(selValid, frameEl, scale) : null;
  const hr = hoverValid && frameEl ? frameRect(hoverValid, frameEl, scale) : null;
  void tick;

  const boxW = frame.width * scale;
  const boxH = frame.height * scale;

  return (
    <div
      ref={stageRef}
      className={`vy-stage-inner ${editing ? "text-editing" : ""}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={() => setHover(null)}
      onDoubleClick={onDoubleClick}
      style={{ cursor: drag.current?.kind === "move" ? "grabbing" : "default", touchAction: "none" }}
    >
      <div className="vy-canvas-box" style={{ width: boxW, height: boxH }}>
        <div className="vy-canvas-scale" style={{ width: frame.width, height: frame.height, transform: `scale(${scale})` }}>
          <div ref={hostRef} className="vy-canvas-host" />
        </div>
        <div className="vy-overlay">
          {guides.x !== undefined && <div style={{ position: "absolute", left: guides.x * scale, top: 0, bottom: 0, width: 1, background: "#ff3d8b" }} />}
          {guides.y !== undefined && <div style={{ position: "absolute", top: guides.y * scale, left: 0, right: 0, height: 1, background: "#ff3d8b" }} />}
          {hr && <div className="vy-sel hover" style={{ left: hr.x * scale, top: hr.y * scale, width: hr.w * scale, height: hr.h * scale }} />}
          {sr && selValid && (
            <div className="vy-sel" style={{ left: sr.x * scale, top: sr.y * scale, width: sr.w * scale, height: sr.h * scale }}>
              <div className="vy-sel-label">{describe(selValid)}</div>
              {!editing &&
                HANDLES.map((h) => {
                  const x = h.includes("w") ? 0 : h.includes("e") ? 100 : 50;
                  const y = h.includes("n") ? 0 : h.includes("s") ? 100 : 50;
                  return (
                    <div
                      key={h}
                      className="vy-handle"
                      style={{ left: `${x}%`, top: `${y}%`, cursor: `${h}-resize` }}
                      onPointerDown={(e) => startResize(e, h)}
                    />
                  );
                })}
              {drag.current?.moved && <div className="vy-sel-size">{Math.round(sr.w)} × {Math.round(sr.h)}</div>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
