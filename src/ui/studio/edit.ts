/** DOM-level editing operations on a mounted frame (inside its shadow root). */

export function isFrameRoot(el: Element | null): boolean {
  return !!el && el.classList?.contains("vy-frame");
}

/** Resolve the raw event target to an editable element (icons/logos as a whole, never generated children). */
export function normalizeTarget(target: Element | null): HTMLElement | null {
  let el = target as HTMLElement | null;
  if (!el) return null;
  const gen = el.closest?.("vy-icon, vy-logo, vy-page, vy-total");
  if (gen) return gen as HTMLElement;
  let svg = el.closest?.("svg") as Element | null;
  while (svg?.parentElement?.closest("svg")) svg = svg.parentElement.closest("svg");
  return (svg as unknown as HTMLElement) ?? el;
}

function coversFrame(el: HTMLElement, frame: HTMLElement): boolean {
  const a = el.getBoundingClientRect();
  const b = frame.getBoundingClientRect();
  return Math.abs(a.left - b.left) < 3 && Math.abs(a.top - b.top) < 3 && Math.abs(a.width - b.width) < 4 && Math.abs(a.height - b.height) < 4;
}

/**
 * Figma-like selection: first click picks the top-level layer (skipping full-canvas wrapper
 * containers), clicking again inside a selected group drills one level down, deep=true picks the
 * exact element.
 */
export function pickElement(rawTarget: Element | null, frame: HTMLElement, current: HTMLElement | null, deep: boolean): HTMLElement | null {
  const el = normalizeTarget(rawTarget);
  if (!el || el === frame || !frame.contains(el)) return null;
  if (deep) return el;
  if (current && current !== el && current.contains(el) && frame.contains(current)) {
    let child = el;
    while (child.parentElement && child.parentElement !== current) child = child.parentElement;
    return child;
  }
  if (current && current === el) return current;
  // climb to the top-level layer
  let top = el;
  while (top.parentElement && top.parentElement !== frame) top = top.parentElement;
  // skip full-canvas wrappers that contain the target in a child
  while (top !== el && top.children.length > 0 && coversFrame(top, frame) && !hasOwnPaint(top)) {
    let next = el;
    while (next.parentElement && next.parentElement !== top) next = next.parentElement;
    if (next === top) break;
    top = next;
  }
  return top;
}

function hasOwnPaint(el: HTMLElement): boolean {
  const cs = getComputedStyle(el);
  return (cs.backgroundColor !== "rgba(0, 0, 0, 0)" && cs.backgroundColor !== "transparent") || cs.backgroundImage !== "none";
}

export function isTextElement(el: HTMLElement): boolean {
  if (/^(VY-ICON|VY-LOGO|IMG|SVG|VIDEO)$/i.test(el.tagName)) return false;
  return [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent!.trim()) || (!!el.textContent?.trim() && el.querySelectorAll("div, img, svg, vy-icon, section, ul, ol, table").length === 0);
}

export function isImageElement(el: HTMLElement): boolean {
  return el.tagName === "IMG" || (getComputedStyle(el).backgroundImage.includes("url(") && !el.children.length);
}

export function describe(el: HTMLElement): string {
  const n = el.getAttribute("data-name");
  if (n) return n;
  const tag = el.tagName.toLowerCase();
  if (tag === "vy-icon") return `Icon · ${el.getAttribute("name") ?? ""}`;
  if (tag === "vy-logo") return "Logo";
  if (tag === "img") return "Image";
  const t = (el.textContent ?? "").trim().replace(/\s+/g, " ");
  if (t) return t.length > 28 ? t.slice(0, 26) + "…" : t;
  const cs = getComputedStyle(el);
  if (cs.backgroundImage !== "none") return "Shape · gradient";
  return "Shape";
}

/** Rect of an element in frame coordinates (unscaled px). */
export function frameRect(el: Element, frame: HTMLElement, scale: number) {
  const r = el.getBoundingClientRect();
  const f = frame.getBoundingClientRect();
  return { x: (r.left - f.left) / scale, y: (r.top - f.top) / scale, w: r.width / scale, h: r.height / scale };
}

// ----- moves are stored as a leading translate() in the inline `transform` -----
// `transform` composes with the separate `translate`/`rotate`/`scale` properties Tailwind v4 uses,
// so centered (-translate-x-1/2) or rotated elements keep their own transforms.

const OFFSET_RE = /^\s*translate\((-?[\d.]+)px,\s*(-?[\d.]+)px\)\s*/;

export function getOffset(el: HTMLElement): { x: number; y: number } {
  const m = el.style.transform?.match(OFFSET_RE);
  return m ? { x: Number(m[1]), y: Number(m[2]) } : { x: 0, y: 0 };
}

export function setOffset(el: HTMLElement, x: number, y: number): void {
  const rx = Math.round(x * 10) / 10;
  const ry = Math.round(y * 10) / 10;
  const rest = (el.style.transform ?? "").replace(OFFSET_RE, "").trim();
  const next = [rx || ry ? `translate(${rx}px, ${ry}px)` : "", rest].filter(Boolean).join(" ");
  if (next) el.style.transform = next;
  else el.style.removeProperty("transform");
}

export function setSize(el: HTMLElement, w?: number, h?: number): void {
  if (w !== undefined) {
    el.style.width = `${Math.max(4, Math.round(w))}px`;
    el.style.maxWidth = "none";
  }
  if (h !== undefined) {
    el.style.height = `${Math.max(4, Math.round(h))}px`;
    el.style.maxHeight = "none";
  }
}

export function duplicateElement(el: HTMLElement): HTMLElement {
  const copy = el.cloneNode(true) as HTMLElement;
  copy.removeAttribute("contenteditable");
  el.after(copy);
  const o = getOffset(el);
  setOffset(copy, o.x + 24, o.y + 24);
  return copy;
}

export function moveLayer(el: HTMLElement, dir: "forward" | "backward" | "front" | "back"): void {
  const parent = el.parentElement;
  if (!parent) return;
  if (dir === "forward" && el.nextElementSibling) el.nextElementSibling.after(el);
  else if (dir === "backward" && el.previousElementSibling) el.previousElementSibling.before(el);
  else if (dir === "front") parent.appendChild(el);
  else if (dir === "back") parent.insertBefore(el, parent.firstElementChild);
}

/** Path of child indexes from the frame root, so a selection survives re-mounting. */
export function pathOf(el: HTMLElement, frame: HTMLElement): number[] | null {
  const path: number[] = [];
  let cur: HTMLElement | null = el;
  while (cur && cur !== frame) {
    const parent: HTMLElement | null = cur.parentElement;
    if (!parent) return null;
    path.unshift([...parent.children].indexOf(cur));
    cur = parent;
  }
  return cur === frame ? path : null;
}

export function byPath(frame: HTMLElement, path: number[] | null): HTMLElement | null {
  if (!path) return null;
  let cur: Element | null = frame;
  for (const i of path) {
    cur = cur?.children[i] ?? null;
    if (!cur) return null;
  }
  return cur as HTMLElement;
}

export function rgbToHex(c: string): string {
  const m = c.match(/rgba?\(([^)]+)\)/);
  if (!m) return c.startsWith("#") ? c : "#000000";
  const [r, g, b] = m[1].split(/[ ,/]+/).map(Number);
  return "#" + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");
}
