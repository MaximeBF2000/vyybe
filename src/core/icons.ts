import fs from "node:fs";
import { dataFile } from "./paths.js";

interface LucideEntry { s: string; t: string[]; a?: 1 }
interface BrandEntry { t: string; h: string; p: string }

let lucide: Record<string, LucideEntry> | null = null;
let brands: Record<string, BrandEntry> | null = null;

function loadLucide(): Record<string, LucideEntry> {
  if (!lucide) lucide = JSON.parse(fs.readFileSync(dataFile("icons-lucide.json"), "utf8"));
  return lucide!;
}
function loadBrands(): Record<string, BrandEntry> {
  if (!brands) brands = JSON.parse(fs.readFileSync(dataFile("icons-brands.json"), "utf8"));
  return brands!;
}

/**
 * Resolve an icon reference to inline SVG.
 *  "rocket" / "lucide:rocket" → Lucide outline icon (stroke = currentColor)
 *  "brand:github" / "si:github" → Simple Icons brand logo (fill = currentColor)
 */
export function iconSvg(ref: string, strokeWidth?: string | null): string | null {
  const [lib, rawName] = ref.includes(":") ? (ref.split(":", 2) as [string, string]) : ["lucide", ref];
  const name = rawName.trim().toLowerCase();
  if (lib === "lucide" || lib === "icon") {
    const entry = loadLucide()[name];
    if (!entry) return null;
    const sw = strokeWidth && /^[0-9.]+$/.test(strokeWidth) ? strokeWidth : "2";
    return `<svg data-vy-gen xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${entry.s}</svg>`;
  }
  if (lib === "brand" || lib === "si" || lib === "logo") {
    const entry = loadBrands()[name.replace(/[^a-z0-9]/g, "")] ?? loadBrands()[name];
    if (!entry) return null;
    return `<svg data-vy-gen xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="${entry.p}"/></svg>`;
  }
  return null;
}

export interface IconHit { ref: string; label: string; tags?: string[]; brandColor?: string }

export function searchIcons(query: string, opts: { library?: "lucide" | "brand" | "all"; limit?: number } = {}): IconHit[] {
  const q = query.toLowerCase().trim();
  const terms = q.split(/[\s,]+/).filter(Boolean);
  const limit = opts.limit ?? 24;
  const lib = opts.library ?? "all";
  const scored: { hit: IconHit; score: number }[] = [];

  const scoreText = (name: string, tags: string[]): number => {
    let score = 0;
    for (const term of terms) {
      if (name === term) score += 100;
      else if (name.startsWith(term)) score += 40;
      else if (name.includes(term)) score += 25;
      if (tags.some((t) => t === term)) score += 30;
      else if (tags.some((t) => t.includes(term))) score += 10;
    }
    return score;
  };

  if (lib !== "brand") {
    for (const [name, e] of Object.entries(loadLucide())) {
      if (e.a) continue; // aliases resolve but aren't suggested
      const s = scoreText(name, e.t);
      if (s > 0) scored.push({ hit: { ref: `lucide:${name}`, label: name, tags: e.t.slice(0, 6) }, score: s });
    }
  }
  if (lib !== "lucide") {
    for (const [slug, e] of Object.entries(loadBrands())) {
      const s = scoreText(slug, [e.t.toLowerCase()]);
      if (s > 0) scored.push({ hit: { ref: `brand:${slug}`, label: e.t, brandColor: `#${e.h}` }, score: s + (lib === "brand" ? 0 : -5) });
    }
  }
  scored.sort((a, b) => b.score - a.score || a.hit.ref.length - b.hit.ref.length);
  return scored.slice(0, limit).map((s) => s.hit);
}
