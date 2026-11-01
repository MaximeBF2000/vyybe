import fs from "node:fs";
import path from "node:path";
import { lib, ensureDir } from "./paths.js";
import { readJson, writeJson, slugify } from "./util.js";
import type { FontSpec, Theme } from "./theme.js";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const KEEP_SUBSETS = new Set(["latin", "latin-ext", "cyrillic", "cyrillic-ext", "greek", "greek-ext", "vietnamese"]);

export interface FontFaceRecord {
  family: string;
  weight: number | string;
  style: "normal" | "italic";
  unicodeRange?: string;
  file: string; // absolute path to woff2
}

interface CatalogFamily {
  family: string;
  category: string;
  styles: string[]; // e.g. ["400", "700", "400i"]
  variable: boolean;
  popularity: number;
}

let catalogMem: CatalogFamily[] | null = null;

/** Google Fonts catalog, cached for 30 days. Falls back to an empty list offline. */
export async function fontCatalog(): Promise<CatalogFamily[]> {
  if (catalogMem) return catalogMem;
  const file = path.join(lib.cache(), "google-fonts-catalog.json");
  try {
    const stat = fs.statSync(file);
    if (Date.now() - stat.mtimeMs < 30 * 86400_000) {
      catalogMem = readJson<CatalogFamily[]>(file);
      return catalogMem;
    }
  } catch {}
  try {
    const res = await fetch("https://fonts.google.com/metadata/fonts", { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(15000) });
    const text = (await res.text()).replace(/^\)\]\}'\s*/, "");
    const json = JSON.parse(text);
    const list: CatalogFamily[] = (json.familyMetadataList ?? []).map((f: any) => ({
      family: f.family,
      category: f.category,
      styles: Object.keys(f.fonts ?? {}),
      variable: Array.isArray(f.axes) && f.axes.length > 0,
      popularity: f.popularity ?? 9999,
    }));
    if (list.length) {
      ensureDir(lib.cache());
      writeJson(file, list);
      catalogMem = list;
      return list;
    }
  } catch {}
  try {
    catalogMem = readJson<CatalogFamily[]>(file);
    return catalogMem;
  } catch {
    return [];
  }
}

export async function searchFonts(query?: string, category?: string, limit = 20) {
  const all = await fontCatalog();
  const q = (query ?? "").toLowerCase().trim();
  const cat = (category ?? "").toLowerCase().replace(/[^a-z]/g, "");
  let list = all.filter((f) => (!q || f.family.toLowerCase().includes(q)) && (!cat || f.category.toLowerCase().replace(/[^a-z]/g, "").includes(cat)));
  list.sort((a, b) => {
    const exact = Number(b.family.toLowerCase() === q) - Number(a.family.toLowerCase() === q);
    return exact || a.popularity - b.popularity;
  });
  return list.slice(0, limit).map((f) => ({
    family: f.family,
    category: f.category,
    weights: [...new Set(f.styles.filter((s) => !s.endsWith("i")).map(Number))].sort((a, b) => a - b),
    italic: f.styles.some((s) => s.endsWith("i")),
  }));
}

function pickWeights(spec: FontSpec, fam?: CatalogFamily): number[] {
  const wanted = spec.weights?.length ? spec.weights : [400, 700];
  if (!fam) return [...new Set(wanted)].sort((a, b) => a - b);
  const available = [...new Set(fam.styles.filter((s) => !s.endsWith("i")).map(Number))];
  if (!available.length) return [400];
  const nearest = wanted.map((w) => available.reduce((best, a) => (Math.abs(a - w) < Math.abs(best - w) ? a : best), available[0]));
  return [...new Set(nearest)].sort((a, b) => a - b);
}

const inflight = new Map<string, Promise<FontFaceRecord[]>>();

/** Make sure a Google font is cached locally; returns its @font-face records. */
export async function ensureGoogleFont(spec: FontSpec): Promise<{ faces: FontFaceRecord[]; warning?: string }> {
  const catalog = await fontCatalog();
  const fam = catalog.find((f) => f.family.toLowerCase() === spec.family.toLowerCase());
  const family = fam?.family ?? spec.family;
  const weights = pickWeights(spec, fam);
  const italic = !!spec.italic && (!fam || fam.styles.some((s) => s.endsWith("i")));
  const dir = path.join(lib.fontsCache(), slugify(family));
  const key = `${family}|${weights.join(",")}|${italic}`;
  const manifest = path.join(dir, `faces-${slugify(key)}.json`);
  if (fs.existsSync(manifest)) {
    const faces = readJson<FontFaceRecord[]>(manifest).filter((f) => fs.existsSync(f.file));
    if (faces.length) return { faces };
  }
  if (!inflight.has(key)) {
    inflight.set(key, downloadFaces(family, weights, italic, dir).finally(() => inflight.delete(key)));
  }
  try {
    const faces = await inflight.get(key)!;
    writeJson(manifest, faces);
    const warning = fam ? undefined : `"${spec.family}" isn't in the Google Fonts catalog (offline or misspelled?). Downloaded what Google returned.`;
    return { faces, warning };
  } catch (err: any) {
    return { faces: [], warning: `Couldn't load font "${spec.family}" (${err.message}). It will fall back to a system font.` };
  }
}

async function downloadFaces(family: string, weights: number[], italic: boolean, dir: string): Promise<FontFaceRecord[]> {
  const axis = italic
    ? `ital,wght@${[...weights.map((w) => `0,${w}`), ...weights.map((w) => `1,${w}`)].join(";")}`
    : `wght@${weights.join(";")}`;
  const urls = [
    `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family).replace(/%20/g, "+")}:${axis}&display=swap`,
    `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family).replace(/%20/g, "+")}&display=swap`,
  ];
  let css = "";
  for (const url of urls) {
    const res = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(15000) });
    if (res.ok) {
      css = await res.text();
      break;
    }
  }
  if (!css) throw new Error("Google Fonts returned no stylesheet");
  ensureDir(dir);
  const blocks = [...css.matchAll(/\/\*\s*([\w-\[\]]+)\s*\*\/\s*@font-face\s*\{([^}]+)\}/g)];
  const parsed = blocks.map((b) => ({ subset: b[1], body: b[2] }));
  const keep = parsed.some((p) => KEEP_SUBSETS.has(p.subset)) ? parsed.filter((p) => KEEP_SUBSETS.has(p.subset)) : parsed.slice(0, 120);
  const faces: FontFaceRecord[] = [];
  await Promise.all(
    keep.map(async ({ subset, body }) => {
      const src = body.match(/url\((https:[^)]+)\)/)?.[1];
      const weight = body.match(/font-weight:\s*([^;]+);/)?.[1]?.trim() ?? "400";
      const style = (body.match(/font-style:\s*(\w+)/)?.[1] ?? "normal") as "normal" | "italic";
      const range = body.match(/unicode-range:\s*([^;]+);/)?.[1]?.trim();
      if (!src) return;
      const file = path.join(dir, `${weight.replace(/\s+/g, "-")}${style === "italic" ? "i" : ""}-${subset.replace(/[^\w-]/g, "")}.woff2`);
      if (!fs.existsSync(file)) {
        const r = await fetch(src, { signal: AbortSignal.timeout(20000) });
        if (!r.ok) return;
        fs.writeFileSync(file, Buffer.from(await r.arrayBuffer()));
      }
      faces.push({ family, weight: /^\d+$/.test(weight) ? Number(weight) : weight, style, unicodeRange: range, file });
    }),
  );
  if (!faces.length) throw new Error("no font files downloaded");
  return faces;
}

/** Resolve all theme fonts to local faces (downloads missing Google fonts). */
export async function themeFaces(theme: Theme): Promise<{ faces: FontFaceRecord[]; warnings: string[] }> {
  const warnings: string[] = [];
  const seen = new Map<string, FontSpec>();
  for (const spec of Object.values(theme.fonts)) {
    if (spec.source === "system") continue;
    const k = spec.family.toLowerCase();
    const prev = seen.get(k);
    seen.set(k, prev ? { ...spec, weights: [...new Set([...(prev.weights ?? [400, 700]), ...(spec.weights ?? [400, 700])])], italic: prev.italic || spec.italic } : spec);
  }
  const results = await Promise.all([...seen.values()].map((s) => ensureGoogleFont(s)));
  const faces = results.flatMap((r) => r.faces);
  for (const r of results) if (r.warning) warnings.push(r.warning);
  return { faces, warnings };
}

const b64Cache = new Map<string, string>();
export function fileBase64(file: string): string {
  let v = b64Cache.get(file);
  if (!v) {
    v = fs.readFileSync(file).toString("base64");
    if (b64Cache.size > 400) b64Cache.clear();
    b64Cache.set(file, v);
  }
  return v;
}

export function fontFaceCss(faces: FontFaceRecord[]): string {
  return faces
    .map(
      (f) =>
        `@font-face{font-family:"${f.family}";font-style:${f.style};font-weight:${f.weight};font-display:block;src:url(data:font/woff2;base64,${fileBase64(f.file)}) format("woff2");${f.unicodeRange ? `unicode-range:${f.unicodeRange};` : ""}}`,
    )
    .join("\n");
}
