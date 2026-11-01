import { withPage, setContent } from "./chrome.js";
import { projectContext, frameDocument, type ProjectRenderContext } from "./compose.js";
import { formatFor } from "./formats.js";

export interface Issue {
  severity: "error" | "warning";
  type: string;
  message: string;
}

export interface FrameRender {
  frameId: string;
  name: string;
  width: number;
  height: number;
  image: Buffer;
  mime: string;
  issues: Issue[];
}

/** Layout checks, run inside the rendered page. Pure DOM, no page scripts involved. */
const DIAGNOSTICS = (safe: { top: number; right: number; bottom: number; left: number } | null) => `(() => {
  const frame = document.querySelector('.vy-frame');
  const F = frame.getBoundingClientRect();
  const issues = [];
  const safe = ${JSON.stringify(safe)};
  const minFont = Math.max(14, Math.round(Math.min(F.width, F.height) * 0.02));
  const label = (el) => {
    const n = el.getAttribute('data-name');
    if (n) return '"' + n + '"';
    const t = (el.textContent || '').trim().replace(/\\s+/g, ' ');
    return '<' + el.tagName.toLowerCase() + '> "' + (t.length > 38 ? t.slice(0, 36) + '…' : t) + '"';
  };
  const textRect = (el) => {
    const r = document.createRange(); r.selectNodeContents(el);
    const rects = [...r.getClientRects()].filter(x => x.width > 0 && x.height > 0);
    if (!rects.length) return null;
    const L = Math.min(...rects.map(x => x.left)), T = Math.min(...rects.map(x => x.top));
    const R = Math.max(...rects.map(x => x.right)), B = Math.max(...rects.map(x => x.bottom));
    return { left: L, top: T, right: R, bottom: B, width: R - L, height: B - T };
  };
  const visible = (el) => {
    for (let e = el; e && e !== frame; e = e.parentElement) {
      const cs = getComputedStyle(e);
      if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) === 0) return false;
    }
    return true;
  };
  const parseColor = (c) => {
    const m = c.match(/rgba?\\(([^)]+)\\)/); if (!m) return null;
    const p = m[1].split(/[ ,\\/]+/).filter(Boolean).map(Number);
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  };
  const lum = ({ r, g, b }) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const bgOf = (el, r) => {
    // Sample what is actually painted behind the text (siblings included), not just ancestors.
    const pts = [[(r.left + r.right) / 2, (r.top + r.bottom) / 2], [r.left + 4, r.top + 4], [r.right - 4, r.bottom - 4]];
    let found = null;
    for (const [x, y] of pts) {
      const stack = document.elementsFromPoint(Math.max(0, x), Math.max(0, y));
      let bg = undefined;
      for (const e of stack) {
        if (e !== el && el.contains(e)) continue;
        if (e.tagName === 'IMG' || e.tagName === 'svg' || e.closest('svg')) { bg = null; break; }
        const cs = getComputedStyle(e);
        if (cs.backgroundImage && cs.backgroundImage !== 'none') { bg = null; break; }
        const c = parseColor(cs.backgroundColor);
        if (c && c.a > 0.95) { bg = c; break; }
        if (c && c.a > 0.05) { bg = null; break; }
        if (cs.backdropFilter && cs.backdropFilter !== 'none') { bg = null; break; }
      }
      if (!bg) return null;
      if (found && (Math.abs(found.r - bg.r) + Math.abs(found.g - bg.g) + Math.abs(found.b - bg.b)) > 30) return null;
      found = bg;
    }
    return found;
  };
  // Text laid out together inside a rotated/scaled box gets inflated axis-aligned rects: not a real overlap.
  const sharesTransformedBox = (x, y) => {
    for (let e = x.parentElement; e && e !== frame; e = e.parentElement) {
      if (!e.contains(y)) continue;
      for (let t = e; t && t !== frame; t = t.parentElement) {
        const cs = getComputedStyle(t);
        if ((cs.transform && cs.transform !== 'none') || (cs.rotate && cs.rotate !== 'none') || (cs.scale && cs.scale !== 'none')) return true;
      }
      return false;
    }
    return false;
  };
  const textEls = [...frame.querySelectorAll('*')].filter(el =>
    !el.closest('svg') && !el.closest('[data-decor],[aria-hidden="true"]') && [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()) && visible(el));
  const imgs = [...frame.querySelectorAll('img')];
  const rects = [];
  let words = 0, smallest = 999;
  for (const el of textEls) {
    const r = textRect(el); if (!r) continue;
    const cs = getComputedStyle(el);
    const fs = parseFloat(cs.fontSize);
    words += (el.textContent || '').trim().split(/\\s+/).length;
    smallest = Math.min(smallest, fs);
    rects.push({ el, r });
    if (r.left < F.left - 2 || r.top < F.top - 2 || r.right > F.right + 2 || r.bottom > F.bottom + 2) {
      issues.push({ severity: 'error', type: 'text-outside', message: 'Text runs outside the canvas: ' + label(el) });
    } else if (r.left - F.left < 16 || r.top - F.top < 16 || F.right - r.right < 16 || F.bottom - r.bottom < 16) {
      issues.push({ severity: 'warning', type: 'text-edge', message: 'Text is closer than 16px to the edge: ' + label(el) });
    }
    for (let e = el; e && e !== frame.parentElement; e = e.parentElement) {
      const s = getComputedStyle(e);
      const clips = s.overflow !== 'visible' || s.overflowX !== 'visible' || s.overflowY !== 'visible';
      if (clips && (e.scrollHeight > e.clientHeight + 2 || e.scrollWidth > e.clientWidth + 2) && e !== frame) {
        const er = e.getBoundingClientRect();
        if (r.bottom > er.bottom + 2 || r.right > er.right + 2 || r.top < er.top - 2 || r.left < er.left - 2) {
          issues.push({ severity: 'error', type: 'text-clipped', message: 'Text is cut off by its container: ' + label(el) });
          break;
        }
      }
    }
    if (cs.webkitLineClamp && cs.webkitLineClamp !== 'none' && el.scrollHeight > el.clientHeight + 2) {
      issues.push({ severity: 'warning', type: 'text-truncated', message: 'Text is truncated by line-clamp: ' + label(el) });
    }
    if (fs < minFont) issues.push({ severity: 'warning', type: 'text-small', message: 'Font size ' + fs + 'px may be unreadable on a phone (min ~' + minFont + 'px here): ' + label(el) });
    if (safe) {
      const inUnsafe = r.top - F.top < safe.top || F.bottom - r.bottom < safe.bottom || r.left - F.left < safe.left || F.right - r.right < safe.right;
      if (inUnsafe) issues.push({ severity: 'warning', type: 'safe-zone', message: 'Text sits where the platform UI overlays it: ' + label(el) });
    }
    const fg = parseColor(cs.color);
    const bg = bgOf(el, r);
    if (fg && bg && fg.a > 0.9) {
      const L1 = lum(fg), L2 = lum(bg);
      const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
      const need = fs >= 32 ? 3 : 4.5;
      if (ratio < need) issues.push({ severity: 'warning', type: 'contrast', message: 'Low contrast (' + ratio.toFixed(1) + ':1) for ' + label(el) });
    }
    const fam = cs.fontFamily.split(',')[0].trim().replace(/^["']|["']$/g, '');
    const generic = ['serif','sans-serif','monospace','cursive','fantasy','system-ui','ui-sans-serif','ui-serif','ui-monospace'];
    if (!generic.includes(fam) && !document.fonts.check(cs.fontStyle + ' ' + cs.fontWeight + ' 16px "' + fam + '"')) {
      issues.push({ severity: 'warning', type: 'font-missing', message: 'Font "' + fam + '" is not available, a fallback is shown (' + label(el) + ')' });
    }
  }
  for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
    const a = rects[i], b = rects[j];
    if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
    if (sharesTransformedBox(a.el, b.el)) continue;
    const w = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left);
    const h = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
    if (w > 4 && h > 4) {
      const area = w * h, small = Math.min(a.r.width * a.r.height, b.r.width * b.r.height);
      if (area > small * 0.12) issues.push({ severity: 'error', type: 'text-overlap', message: 'Text overlaps other text: ' + label(a.el) + ' ↔ ' + label(b.el) });
    }
  }
  for (const im of imgs) {
    if (!visible(im)) continue;
    if (!im.complete || im.naturalWidth === 0) issues.push({ severity: 'error', type: 'image-broken', message: 'Image failed to load: ' + (im.getAttribute('src') || '').slice(0, 60) });
  }
  const seen = new Set();
  const uniq = issues.filter(x => { const k = x.type + x.message; if (seen.has(k)) return false; seen.add(k); return true; });
  const fontWarn = uniq.filter(x => x.type === 'font-missing');
  const rest = uniq.filter(x => x.type !== 'font-missing');
  return { issues: rest.concat(fontWarn.slice(0, 2)).slice(0, 14), stats: { words, smallestFontPx: smallest === 999 ? null : smallest } };
})()`;

export async function renderFrameDoc(
  doc: string,
  width: number,
  height: number,
  opts: { scale?: number; format?: "png" | "jpeg" | "webp"; quality?: number; diagnostics?: boolean; safe?: { top: number; right: number; bottom: number; left: number } | null } = {},
): Promise<{ image: Buffer; issues: Issue[]; stats?: any }> {
  const scale = opts.scale ?? 1;
  return withPage(width, height, scale, async (page) => {
    await setContent(page, doc);
    let issues: Issue[] = [];
    let stats: any;
    if (opts.diagnostics) {
      try {
        const d = await page.evaluate(DIAGNOSTICS(opts.safe ?? null));
        issues = d.issues;
        stats = d.stats;
      } catch (err: any) {
        issues = [{ severity: "warning", type: "diagnostics", message: `Layout checks failed: ${err.message}` }];
      }
    }
    const shot = await page.send("Page.captureScreenshot", {
      format: opts.format ?? "png",
      quality: opts.format && opts.format !== "png" ? (opts.quality ?? 90) : undefined,
      clip: { x: 0, y: 0, width, height, scale: 1 },
      captureBeyondViewport: false,
      fromSurface: true,
    });
    return { image: Buffer.from(shot.data, "base64"), issues, stats };
  });
}

export async function renderFrames(
  projectId: string,
  frameIds?: string[],
  opts: { scale?: number; format?: "png" | "jpeg" | "webp"; quality?: number; diagnostics?: boolean } = {},
): Promise<{ ctx: ProjectRenderContext; renders: FrameRender[] }> {
  const ctx = await projectContext(projectId);
  const frames = ctx.project.frames.filter((f) => !frameIds?.length || frameIds.includes(f.id));
  const renders: FrameRender[] = [];
  // Sequential keeps memory low; each frame takes ~100-300ms once Chrome is warm.
  for (const f of frames) {
    const { doc, missing } = frameDocument(ctx, f.id);
    const preset = formatFor(f.width, f.height, f.format);
    const r = await renderFrameDoc(doc, f.width, f.height, { ...opts, safe: preset?.safe ?? null });
    const issues: Issue[] = missing.map((m) => ({ severity: "error" as const, type: "missing", message: `Missing ${m}` }));
    issues.push(...r.issues);
    renders.push({ frameId: f.id, name: f.name, width: f.width, height: f.height, image: r.image, mime: `image/${opts.format ?? "png"}`, issues });
  }
  return { ctx, renders };
}

/** One image showing several frames side by side — cheap for the agent to look at. */
export async function contactSheet(renders: FrameRender[], opts: { maxWidth?: number; columns?: number } = {}): Promise<Buffer> {
  const n = renders.length;
  const columns = opts.columns ?? (n <= 3 ? n : n === 4 ? 2 : n <= 6 ? 3 : 4);
  const maxWidth = opts.maxWidth ?? 1400;
  const gap = 24;
  const cellW = Math.floor((maxWidth - gap * (columns + 1)) / columns);
  const cells = renders.map((r) => ({ r, w: cellW, h: Math.round((cellW * r.height) / r.width) }));
  const rows: (typeof cells)[] = [];
  for (let i = 0; i < cells.length; i += columns) rows.push(cells.slice(i, i + columns));
  const rowHeights = rows.map((row) => Math.max(...row.map((c) => c.h)) + 30);
  const height = rowHeights.reduce((a, b) => a + b + gap, gap);
  const width = Math.min(maxWidth, columns * cellW + gap * (columns + 1));
  const body = rows
    .map(
      (row) =>
        `<div class="row">${row
          .map((c, i) => `<figure style="width:${c.w}px"><img src="data:${c.r.mime};base64,${c.r.image.toString("base64")}" style="width:${c.w}px;height:${c.h}px"><figcaption>${renders.indexOf(c.r) + 1} · ${escapeHtml(c.r.frameId)} · ${escapeHtml(c.r.name)}</figcaption></figure>`)
          .join("")}</div>`,
    )
    .join("");
  const doc = `<!doctype html><html><head><style>
  body{margin:0;background:#2a2a2e;font:500 15px/1.2 system-ui,sans-serif;color:#ddd}
  .wrap{padding:${gap}px;display:flex;flex-direction:column;gap:${gap}px}
  .row{display:flex;gap:${gap}px;align-items:flex-start}
  figure{margin:0} img{display:block;border-radius:4px;box-shadow:0 2px 10px #0006}
  figcaption{margin-top:8px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  </style></head><body><div class="wrap">${body}</div></body></html>`;
  const r = await renderFrameDoc(doc, width, height, { format: "jpeg", quality: 82 });
  return r.image;
}

/** Raster PDF: pixel-identical to the PNG export, one page per frame (mixed sizes OK). */
export async function renderPdf(renders: FrameRender[]): Promise<Buffer> {
  const pages = renders
    .map(
      (r, i) =>
        `<section class="p${i}"><img src="data:${r.mime};base64,${r.image.toString("base64")}"></section>`,
    )
    .join("");
  const pageCss = renders.map((r, i) => `@page p${i}{size:${r.width}px ${r.height}px;margin:0}.p${i}{page:p${i};width:${r.width}px;height:${r.height}px}`).join("\n");
  const doc = `<!doctype html><html><head><style>${pageCss}
  html,body{margin:0;padding:0} section{break-after:page;overflow:hidden} section:last-child{break-after:auto} img{width:100%;height:100%;display:block}</style></head><body>${pages}</body></html>`;
  const first = renders[0];
  return withPage(first.width, first.height, 1, async (page) => {
    await setContent(page, doc);
    const pdf = await page.send("Page.printToPDF", { printBackground: true, preferCSSPageSize: true, marginTop: 0, marginBottom: 0, marginLeft: 0, marginRight: 0, scale: 1 }, 120000);
    return Buffer.from(pdf.data, "base64");
  });
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}

/**
 * Show frames the way viewers meet them: a YouTube home feed + "up next" sidebar for thumbnails,
 * an Instagram feed post + profile grid for posts/carousels, phone-width otherwise.
 */
export async function contextSheet(renders: FrameRender[], opts: { title?: string; handle?: string } = {}): Promise<Buffer> {
  const uri = (r: FrameRender) => `data:${r.mime};base64,${r.image.toString("base64")}`;
  const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!);
  const first = renders[0];
  const landscape = first.width / first.height > 1.3;
  const title = esc(opts.title ?? "Your video title goes right here under the thumbnail");
  const handle = esc(opts.handle ?? "yourbrand");
  let body = "";
  let width = 1180;
  if (landscape) {
    const items = renders.slice(0, 6);
    const decoys = Math.max(0, 3 - items.length);
    const card = (src: string | null, i: number) => `<div class="yt">
      <div class="th">${src ? `<img src="${src}">` : `<div class="decoy d${i % 3}"></div>`}<span class="dur">${["14:32", "9:07", "22:15"][i % 3]}</span></div>
      <div class="meta"><div class="av"></div><div><div class="t">${src ? title : "Another creator's video competing for the same click"}</div><div class="s">${src ? handle : "Other Channel"} · 12K views · 2 days ago</div></div></div></div>`;
    body = `<div class="label">YouTube home feed (actual desktop size)</div>
      <div class="ytgrid">${items.map((r, i) => card(uri(r), i)).join("")}${Array.from({ length: decoys }, (_, i) => card(null, i + 1)).join("")}</div>
      <div class="label">Up next / mobile (168 px wide — the size most clicks happen at)</div>
      <div class="side">${items.map((r, i) => `<div class="sr"><div class="sth"><img src="${uri(r)}"><span class="dur sm">${["14:32", "9:07", "22:15"][i % 3]}</span></div><div><div class="t sm">${title}</div><div class="s">${handle}</div><div class="s">#${i + 1} ${esc(r.name)}</div></div></div>`).join("")}</div>`;
  } else {
    const cover = renders[0];
    width = 980;
    body = `<div class="row"><div><div class="label">Instagram feed (phone width)</div><div class="phone">
      <div class="ig-h"><div class="av"></div><b>${handle}</b></div>
      <img src="${uri(cover)}" style="width:390px;display:block">
      <div class="ig-a">♡ &nbsp;💬 &nbsp;➤<span class="dots">${renders.length > 1 ? renders.slice(0, 10).map((_, i) => `<i class="${i === 0 ? "on" : ""}"></i>`).join("") : ""}</span></div></div></div>
      <div><div class="label">Profile grid (cover crop)</div><div class="grid3">${[...renders.slice(0, 1), ...Array.from({ length: 5 })].map((r, i) => (r && i === 0 ? `<div class="gc"><img src="${uri(r as FrameRender)}"></div>` : `<div class="gc decoy d${i % 3}"></div>`)).join("")}</div>
      <div class="label" style="margin-top:18px">Slides at phone size</div><div class="mini">${renders.slice(0, 8).map((r) => `<img src="${uri(r)}" style="width:${Math.round((120 * r.width) / r.height)}px;height:120px">`).join("")}</div></div></div>`;
  }
  const doc = `<!doctype html><html><head><style>
  body{margin:0;background:#0f0f0f;color:#f1f1f1;font:14px/1.35 Roboto,"Helvetica Neue",Arial,sans-serif}
  .wrap{padding:22px;width:${width - 44}px}.label{color:#9a9a9a;font:600 12px system-ui;text-transform:uppercase;letter-spacing:.08em;margin:6px 0 12px}
  .ytgrid{display:grid;grid-template-columns:repeat(3,360px);gap:16px 18px;margin-bottom:26px}
  .th{position:relative;width:360px;height:202px;border-radius:12px;overflow:hidden;background:#222}.th img{width:100%;height:100%;object-fit:cover;display:block}
  .dur{position:absolute;right:6px;bottom:6px;background:rgba(0,0,0,.8);color:#fff;font:600 12px system-ui;padding:1px 5px;border-radius:4px}.dur.sm{font-size:10px;right:4px;bottom:4px}
  .meta{display:flex;gap:10px;margin-top:10px}.av{width:36px;height:36px;border-radius:50%;background:#555;flex-shrink:0}
  .t{font-weight:600;font-size:15px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}.t.sm{font-size:13px}.s{color:#aaa;font-size:12.5px;margin-top:3px}
  .side{display:grid;grid-template-columns:repeat(2,520px);gap:12px}.sr{display:flex;gap:10px}.sth{position:relative;width:168px;height:94px;border-radius:8px;overflow:hidden;flex-shrink:0}.sth img{width:100%;height:100%;object-fit:cover}
  .decoy{width:100%;height:100%}.d0{background:linear-gradient(135deg,#3a2a1a,#c0763a)}.d1{background:linear-gradient(135deg,#1d2b44,#4b7bd1)}.d2{background:linear-gradient(135deg,#2a2a2a,#777)}
  .row{display:flex;gap:40px}.phone{width:390px;background:#000;border-radius:18px;overflow:hidden;border:1px solid #333}
  .ig-h{display:flex;gap:10px;align-items:center;padding:10px 12px}.ig-h .av{width:30px;height:30px}.ig-a{padding:10px 12px;font-size:18px;position:relative}
  .dots{position:absolute;left:50%;top:16px;transform:translateX(-50%);display:flex;gap:4px}.dots i{width:6px;height:6px;border-radius:50%;background:#555}.dots i.on{background:#3897f0}
  .grid3{display:grid;grid-template-columns:repeat(3,128px);gap:3px}.gc{height:170px;overflow:hidden;background:#222}.gc img{width:100%;height:100%;object-fit:cover}
  .mini{display:flex;flex-wrap:wrap;gap:8px;max-width:520px}.mini img{border-radius:4px}
  </style></head><body><div class="wrap">${body}</div></body></html>`;
  const height = landscape ? 260 + Math.ceil(Math.max(3, Math.min(renders.length, 6)) / 3) * 290 + Math.ceil(Math.min(renders.length, 6) / 2) * 106 : 880;
  return (await renderFrameDoc(doc, width, height, { format: "jpeg", quality: 80 })).image;
}
