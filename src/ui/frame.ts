/**
 * Frames render inside shadow roots so their Tailwind/preflight CSS never touches the editor UI.
 * Two document-level registrations make that work:
 *  - fonts are added to document.fonts with the FontFace API (works under strict iframe CSP)
 *  - Tailwind's @property rules are hoisted, since they are ignored inside shadow roots
 */

export interface FontPayload { family: string; weight: string; style: string; unicodeRange?: string; data: string }

const loadedFonts = new Set<string>();
export async function registerFonts(fonts: FontPayload[]): Promise<void> {
  const jobs: Promise<unknown>[] = [];
  for (const f of fonts) {
    const key = `${f.family}|${f.weight}|${f.style}|${f.unicodeRange ?? ""}`;
    if (loadedFonts.has(key)) continue;
    loadedFonts.add(key);
    try {
      const bytes = Uint8Array.from(atob(f.data), (c) => c.charCodeAt(0));
      const face = new FontFace(f.family, bytes.buffer, { weight: f.weight, style: f.style, ...(f.unicodeRange ? { unicodeRange: f.unicodeRange } : {}), display: "block" } as any);
      document.fonts.add(face);
      jobs.push(face.load().catch(() => null));
    } catch {}
  }
  await Promise.all(jobs);
}

const hoisted = new Set<string>();
export function hoistProperties(css: string): void {
  const rules = css.match(/@property\s+--[\w-]+\s*\{[^}]*\}/g) ?? [];
  const fresh = rules.filter((r) => !hoisted.has(r));
  if (!fresh.length) return;
  fresh.forEach((r) => hoisted.add(r));
  const style = document.createElement("style");
  style.dataset.vyProps = "";
  style.textContent = fresh.join("\n");
  document.head.appendChild(style);
}

const sheetCache = new Map<string, CSSStyleSheet>();
function sheetFor(css: string): CSSStyleSheet | null {
  if (!("adoptedStyleSheets" in Document.prototype)) return null;
  let s = sheetCache.get(css);
  if (!s) {
    s = new CSSStyleSheet();
    s.replaceSync(css.replace(/@property\s+--[\w-]+\s*\{[^}]*\}/g, ""));
    if (sheetCache.size > 20) sheetCache.clear();
    sheetCache.set(css, s);
  }
  return s;
}

const HOST_RESET = `:host{all:initial;display:block;contain:layout paint}
.vy-frame{transform-origin:0 0;-webkit-user-select:none;user-select:none}
[contenteditable]{outline:none;cursor:text;-webkit-user-select:text;user-select:text}`;

/** Mount (or re-mount) a frame into a shadow root. Returns the .vy-frame element. */
export function mountFrame(host: HTMLElement, opts: { css: string; html: string; width: number; height: number }): HTMLElement {
  const root = host.shadowRoot ?? host.attachShadow({ mode: "open" });
  hoistProperties(opts.css);
  const sheet = sheetFor(opts.css);
  const extra = new CSSStyleSheet();
  extra.replaceSync(HOST_RESET);
  if (sheet) {
    root.adoptedStyleSheets = [sheet, extra];
    root.innerHTML = `<div class="vy-frame" style="width:${opts.width}px;height:${opts.height}px">${opts.html}</div>`;
  } else {
    root.innerHTML = `<style>${opts.css}</style><style>${HOST_RESET}</style><div class="vy-frame" style="width:${opts.width}px;height:${opts.height}px">${opts.html}</div>`;
  }
  return root.querySelector(".vy-frame") as HTMLElement;
}

/** Serialize a frame back to source HTML: drop editor attributes and generated component children. */
export function serializeFrame(frameEl: HTMLElement): string {
  const clone = frameEl.cloneNode(true) as HTMLElement;
  clone.querySelectorAll("[data-vy-gen]").forEach((e) => e.remove());
  clone.querySelectorAll("[contenteditable]").forEach((e) => e.removeAttribute("contenteditable"));
  clone.querySelectorAll("[spellcheck]").forEach((e) => e.removeAttribute("spellcheck"));
  clone.querySelectorAll("[data-vy-hidden-edit]").forEach((e) => e.removeAttribute("data-vy-hidden-edit"));
  clone.querySelectorAll("[style='']").forEach((e) => e.removeAttribute("style"));
  return clone.innerHTML.trim();
}
