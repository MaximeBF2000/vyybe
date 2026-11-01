import { parse, HTMLElement, Node as HNode, NodeType } from "node-html-parser";

/**
 * Frame HTML contract (what the agent writes):
 * - A fragment, not a document: the scaffold provides <html>, <head>, fonts, Tailwind and the fixed-size canvas.
 * - Tailwind utility classes, inline styles, SVG and an optional <style> block.
 * - No scripts, event handlers, iframes, forms, external stylesheets or remote URLs.
 * - Images / files are referenced as `asset:<file>` (files in the project's assets/ folder).
 * - Vyybe components: <vy-icon name="lucide:rocket">, <vy-logo variant="primary">, <vy-page>, <vy-total>.
 */

const DISALLOWED_TAGS = new Set([
  "script", "iframe", "frame", "frameset", "object", "embed", "applet", "link", "meta", "base",
  "form", "portal", "noscript", "audio", "video", "source", "track", "title", "head", "html", "body",
]);
const SVG_DISALLOWED = new Set(["foreignobject", "animate", "set", "animatemotion", "animatetransform"]);
const URL_ATTRS = new Set(["src", "href", "xlink:href", "srcset", "poster", "background", "action", "formaction", "data", "lowsrc", "dynsrc", "ping"]);

const PARSE_OPTS = {
  comment: false,
  lowerCaseTagName: false,
  voidTag: { closingSlash: false },
  blockTextElements: { script: true, style: true, pre: true, textarea: true, noscript: true },
} as const;

export interface SanitizeResult {
  html: string;
  warnings: string[];
  /** http(s) URLs of images used by the frame, to be imported into the project. */
  remoteUrls: string[];
  classes: string[];
}

export function parseFragment(html: string): HTMLElement {
  return parse(html, PARSE_OPTS as any);
}

function stripDocument(html: string, warnings: string[]): string {
  let out = html.replace(/<!doctype[^>]*>/gi, "");
  const body = out.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  if (body) {
    warnings.push("Removed the <html>/<head>/<body> wrapper: frames are fragments, Vyybe provides the document.");
    out = body[1];
  }
  return out.trim();
}

function walk(el: HTMLElement, fn: (el: HTMLElement) => boolean | void): void {
  for (const child of [...el.childNodes]) {
    if (child.nodeType === NodeType.ELEMENT_NODE) {
      const keep = fn(child as HTMLElement);
      if (keep !== false) walk(child as HTMLElement, fn);
    }
  }
}

/**
 * Walk every url(...) in CSS, honouring quotes so data: URIs that contain url(#id) or parentheses
 * are treated as one value. The callback returns a replacement for the whole url(...) or null to keep it.
 */
function mapCssUrls(css: string, fn: (url: string) => string | null): string {
  let out = "";
  let i = 0;
  const lower = css.toLowerCase();
  while (i < css.length) {
    const at = lower.indexOf("url(", i);
    if (at < 0) break;
    out += css.slice(i, at);
    let j = at + 4;
    while (css[j] === " ") j++;
    const q = css[j] === '"' || css[j] === "'" ? css[j] : "";
    let end: number;
    let value: string;
    if (q) {
      const close = css.indexOf(q, j + 1);
      if (close < 0) return out + css.slice(at);
      value = css.slice(j + 1, close);
      end = css.indexOf(")", close);
    } else {
      end = css.indexOf(")", j);
      value = css.slice(j, end < 0 ? css.length : end);
    }
    if (end < 0) return out + css.slice(at);
    const original = css.slice(at, end + 1);
    const rep = fn(value);
    out += rep === null ? original : rep;
    i = end + 1;
  }
  return out + css.slice(i);
}

function checkCss(css: string, warnings: string[], remote: Set<string>, where: string): string {
  let out = css;
  if (/@import/i.test(out)) {
    out = out.replace(/@import[^;]+;?/gi, "");
    warnings.push(`Removed @import from ${where}: fonts come from the theme, stylesheets are not loaded.`);
  }
  if (/expression\s*\(|javascript:|behavior\s*:|-moz-binding/i.test(out)) {
    out = out.replace(/expression\s*\(|javascript:|behavior\s*:|-moz-binding/gi, "");
    warnings.push(`Removed unsafe CSS from ${where}.`);
  }
  out = mapCssUrls(out, (url) => {
    const u = url.trim();
    if (/^(asset:|data:image\/|data:font\/|#)/i.test(u)) return null;
    if (/^https?:\/\//i.test(u)) {
      remote.add(u);
      return null;
    }
    warnings.push(`Removed url(${u.slice(0, 60)}) from ${where}: only asset:, data: and https images are allowed.`);
    return "none";
  });
  return out;
}

export function sanitizeFrame(input: string): SanitizeResult {
  const warnings: string[] = [];
  const remote = new Set<string>();
  const classes = new Set<string>();
  const root = parseFragment(stripDocument(input, warnings));

  walk(root, (el) => {
    const tag = (el.rawTagName || "").toLowerCase();
    if (DISALLOWED_TAGS.has(tag) || SVG_DISALLOWED.has(tag)) {
      if (tag !== "title") warnings.push(`Removed <${tag}>: not allowed in frames.`);
      el.remove();
      return false;
    }
    if (tag === "style") {
      el.set_content(checkCss(el.text, warnings, remote, "<style>"));
      return false;
    }
    for (const [name, value] of Object.entries(el.attributes)) {
      const lname = name.toLowerCase();
      if (lname.startsWith("on")) {
        el.removeAttribute(name);
        warnings.push(`Removed ${lname} handler: frames can't run scripts.`);
        continue;
      }
      if (lname === "style") {
        const css = checkCss(value, warnings, remote, `style on <${tag}>`);
        if (css !== value) el.setAttribute(name, css);
        continue;
      }
      if (lname === "class") {
        for (const c of value.split(/\s+/)) if (c) classes.add(c);
        continue;
      }
      if (URL_ATTRS.has(lname)) {
        const v = value.trim();
        if (/^(asset:|data:image\/|#)/i.test(v) || v === "") continue;
        if (/^https?:\/\//i.test(v) && (lname === "src" || lname === "href" || lname === "xlink:href") && (tag === "img" || tag === "image")) {
          remote.add(v);
          continue;
        }
        if (tag === "a" && lname === "href" && /^(https?:|mailto:)/i.test(v)) continue; // inert in a static render
        el.removeAttribute(name);
        warnings.push(`Removed ${lname}="${v.slice(0, 60)}" on <${tag}>: use asset:<file> for images.`);
      }
    }
  });

  return { html: root.toString().trim(), warnings, remoteUrls: [...remote], classes: [...classes] };
}

/** Collect class tokens without sanitizing (used to compile Tailwind for a set of frames). */
export function extractClasses(html: string, into: Set<string>): void {
  const re = /\bclass\s*=\s*("([^"]*)"|'([^']*)')/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) for (const c of (m[2] ?? m[3] ?? "").split(/\s+/)) if (c) into.add(c);
}

export interface ExpandContext {
  icon: (name: string, stroke?: string | null) => string | null;
  logo: (variant?: string) => string | null; // returns asset file name
  page: number;
  total: number;
}

/**
 * Expand <vy-*> components. Generated children are tagged data-vy-gen so the editor can
 * strip them before saving (the source keeps the short component tag).
 */
export function expandComponents(html: string, ctx: ExpandContext, missing: string[]): string {
  if (!/<vy-/i.test(html)) return html;
  const root = parseFragment(html);
  walk(root, (el) => {
    const tag = (el.rawTagName || "").toLowerCase();
    if (tag === "vy-icon") {
      const name = el.getAttribute("name") || "";
      const svg = ctx.icon(name, el.getAttribute("stroke"));
      if (!svg) missing.push(`icon "${name}"`);
      el.set_content(svg ?? "");
      return false;
    }
    if (tag === "vy-logo") {
      const file = ctx.logo(el.getAttribute("variant") || undefined);
      if (!file) missing.push(`logo "${el.getAttribute("variant") || "default"}" (no logo in the project theme)`);
      el.set_content(file ? `<img data-vy-gen src="asset:${file}" alt="">` : "");
      return false;
    }
    if (tag === "vy-page" || tag === "vy-total") {
      const n = tag === "vy-page" ? ctx.page : ctx.total;
      const pad = Number(el.getAttribute("pad") || 0);
      el.set_content(`<span data-vy-gen>${String(n).padStart(pad, "0")}</span>`);
      return false;
    }
  });
  return root.toString();
}

/** Remove generated component children (inverse of expandComponents). */
export function collapseComponents(html: string): string {
  if (!/data-vy-gen/.test(html)) return html;
  const root = parseFragment(html);
  for (const el of root.querySelectorAll("[data-vy-gen]")) el.remove();
  return root.toString();
}

export const ASSET_REF_RE = /asset:([A-Za-z0-9][A-Za-z0-9._-]{0,120})/g;

export function listAssetRefs(html: string): string[] {
  const out = new Set<string>();
  for (const m of html.matchAll(ASSET_REF_RE)) out.add(m[1]);
  return [...out];
}

/** Count visible words (rough copy-length signal for the agent). */
export function textStats(html: string): { words: number } {
  const text = parseFragment(html).text.replace(/\s+/g, " ").trim();
  return { words: text ? text.split(" ").length : 0 };
}

export type { HNode };
