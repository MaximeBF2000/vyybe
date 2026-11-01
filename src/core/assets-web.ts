import { fetchRemote, assertPublicUrl } from "./net.js";
import { withOnlinePage } from "./chrome.js";
import { renderFrameDoc } from "./render.js";
import { searchIcons, iconSvg } from "./icons.js";
import { saveAssetBuffer, sanitizeSvg, type AssetMeta } from "./store.js";
import { sniffImage, VyybeError } from "./util.js";

export interface LogoCandidate {
  n: number;
  source: "simple-icons" | "wikimedia" | "website" | "favicon";
  label: string;
  /** For simple-icons: use directly as <vy-icon name="brand:…">. Others: import_asset {url}. */
  ref?: string;
  url?: string;
  license?: string;
  dataUri?: string;
}

const UA = "Vyybe/0.1 (local creative studio; logo lookup)";

async function wikimediaLogos(brand: string, limit: number): Promise<LogoCandidate[]> {
  const q = encodeURIComponent(`${brand} logo filetype:drawing`);
  const res = await fetch(`https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${q}&gsrnamespace=6&gsrlimit=${limit}&prop=imageinfo&iiprop=url|extmetadata|mime&iiextmetadatafilter=LicenseShortName&format=json`, {
    headers: { "User-Agent": UA },
    signal: AbortSignal.timeout(12000),
  });
  const json: any = await res.json();
  const pages = Object.values(json?.query?.pages ?? {}) as any[];
  pages.sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  return pages
    .filter((p) => p.imageinfo?.[0]?.url)
    .map((p) => ({
      n: 0,
      source: "wikimedia" as const,
      label: String(p.title).replace(/^File:/, "").replace(/\.svg$/i, ""),
      url: String(p.imageinfo[0].url).split("?")[0],
      license: p.imageinfo[0].extmetadata?.LicenseShortName?.value ?? "see Wikimedia Commons",
    }));
}

async function websiteIcons(domain: string): Promise<LogoCandidate[]> {
  const base = `https://${domain.replace(/^https?:\/\//, "").replace(/\/.*$/, "")}`;
  const out: LogoCandidate[] = [];
  try {
    const { buf } = await fetchRemote(base, 3_000_000, { "User-Agent": "Mozilla/5.0 (Macintosh) AppleWebKit/537.36 Chrome/131 Safari/537.36" });
    const html = buf.toString("utf8");
    const links = [...html.matchAll(/<link[^>]+>/gi)].map((m) => m[0]).filter((l) => /rel=["'][^"']*(icon|apple-touch-icon|mask-icon)[^"']*["']/i.test(l));
    for (const l of links) {
      const href = l.match(/href=["']([^"']+)["']/i)?.[1];
      if (href) out.push({ n: 0, source: "website", label: `${domain} ${/apple-touch/i.test(l) ? "app icon" : /\.svg/i.test(href) ? "svg icon" : "icon"}`, url: new URL(href, base).toString() });
    }
    const og = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)?.[1];
    if (og) out.push({ n: 0, source: "website", label: `${domain} share image`, url: new URL(og, base).toString() });
  } catch {}
  out.push({ n: 0, source: "favicon", label: `${domain} favicon (256px)`, url: `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=256` });
  // prefer svg / apple-touch first
  return out.sort((a, b) => Number(/svg/i.test(b.url!)) - Number(/svg/i.test(a.url!)) || Number(/app icon/.test(b.label)) - Number(/app icon/.test(a.label)));
}

/** Find candidate logos for a brand and render them as a numbered grid the agent can look at. */
export async function findLogo(brand: string, opts: { domain?: string; limit?: number } = {}): Promise<{ candidates: LogoCandidate[]; grid: Buffer | null }> {
  const limit = Math.min(opts.limit ?? 6, 10);
  const candidates: LogoCandidate[] = [];
  const norm = (x: string) => x.toLowerCase().replace(/[^a-z0-9]/g, "");
  for (const hit of searchIcons(brand, { library: "brand", limit: 5 })) {
    if (norm(hit.label) === norm(brand) || hit.ref === `brand:${norm(brand)}`) {
      const svg = iconSvg(hit.ref)!.replace(" data-vy-gen", "").replace("currentColor", hit.brandColor ?? "#000");
      candidates.push({ n: 0, source: "simple-icons", label: `${hit.label} — use <vy-icon name="${hit.ref}"> (recolorable)`, ref: hit.ref, dataUri: `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}` });
    }
  }
  const [wiki, site] = await Promise.all([wikimediaLogos(brand, limit).catch(() => []), opts.domain ? websiteIcons(opts.domain).catch(() => []) : Promise.resolve([])]);
  candidates.push(...wiki.slice(0, limit), ...site.slice(0, 4));
  await Promise.all(
    candidates.map(async (c) => {
      if (c.dataUri || !c.url) return;
      try {
        const { buf, mime } = await fetchRemote(c.url, 6_000_000);
        let b = buf;
        const kind = sniffImage(b) ?? mime.split(";")[0];
        if (!kind.startsWith("image/")) return;
        if (kind === "image/svg+xml") b = Buffer.from(sanitizeSvg(b.toString("utf8")));
        c.dataUri = `data:${kind};base64,${b.toString("base64")}`;
      } catch {}
    }),
  );
  const usable = candidates.filter((c) => c.dataUri);
  usable.forEach((c, i) => (c.n = i + 1));
  if (!usable.length) return { candidates: [], grid: null };
  const cell = 220;
  const cols = Math.min(4, usable.length);
  const rows = Math.ceil(usable.length / cols);
  const doc = `<!doctype html><html><head><style>body{margin:0;background:#1d1d20;font:600 13px system-ui;color:#eee}
  .g{display:grid;grid-template-columns:repeat(${cols},${cell}px);gap:10px;padding:10px}
  .c{height:${cell}px;border-radius:10px;overflow:hidden;display:grid;grid-template-rows:96px 96px 28px}
  .l,.d{min-height:0;overflow:hidden;display:flex;align-items:center;justify-content:center;padding:10px}.l{background:#fff}.d{background:#0d0d0f}
  img{max-width:180px;max-height:76px;object-fit:contain}.t{background:#333;padding:6px 8px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}</style></head>
  <body><div class="g">${usable.map((c) => `<div class="c"><div class="l"><img src="${c.dataUri}"></div><div class="d"><img src="${c.dataUri}"></div><div class="t">${c.n}. ${c.label.replace(/</g, "")}</div></div>`).join("")}</div></body></html>`;
  const grid = (await renderFrameDoc(doc, cols * cell + (cols + 1) * 10, rows * cell + (rows + 1) * 10, { format: "jpeg", quality: 80 })).image;
  return { candidates: usable, grid };
}

/** Screenshot a public web page (product UI, landing page, article) into the project as an asset. */
export async function captureWebpage(projectId: string, url: string, opts: { width?: number; height?: number; scale?: number; fullPage?: boolean; name?: string; waitMs?: number } = {}): Promise<{ asset: AssetMeta; preview: Buffer }> {
  await assertPublicUrl(url);
  const width = opts.width ?? 1440;
  const height = opts.height ?? 900;
  const scale = opts.scale ?? 2;
  const shot = await withOnlinePage(width, height, scale, async (page) => {
    await page.send("Page.navigate", { url });
    await page.evaluate(
      `new Promise(r => { if (document.readyState === 'complete') r(true); else addEventListener('load', () => r(true)); setTimeout(() => r(true), 15000); })`,
      20000,
    ).catch(() => {});
    await new Promise((r) => setTimeout(r, opts.waitMs ?? 1500));
    // hide common cookie banners
    await page.evaluate(`(() => { for (const el of document.querySelectorAll('[id*="cookie" i],[class*="cookie" i],[id*="consent" i],[class*="consent" i],[aria-label*="cookie" i]')) { const s = getComputedStyle(el); if (s.position === 'fixed' || s.position === 'sticky') el.style.display = 'none'; } return true; })()`).catch(() => {});
    let clipH = height;
    if (opts.fullPage) clipH = Math.min(6000, await page.evaluate(`document.documentElement.scrollHeight`));
    const r = await page.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: !!opts.fullPage, clip: { x: 0, y: 0, width, height: clipH, scale: 1 } }, 60000);
    return { buf: Buffer.from(r.data, "base64"), clipH };
  });
  if (shot.buf.length < 2000) throw new VyybeError("CAPTURE_FAILED", "The page rendered empty (blocked or needs login).");
  const asset = saveAssetBuffer(projectId, shot.buf, { source: "url", origin: url, name: opts.name ?? `screenshot-${new URL(url).hostname}` });
  const pvH = Math.min(2400, Math.round((900 * shot.clipH) / width));
  const preview = (await renderFrameDoc(`<!doctype html><body style="margin:0"><img src="data:image/png;base64,${shot.buf.toString("base64")}" style="width:900px;display:block"></body>`, 900, pvH, { format: "jpeg", quality: 75 })).image;
  return { asset, preview };
}
