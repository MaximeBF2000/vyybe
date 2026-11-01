import fs from "node:fs";
import path from "node:path";
import { lib, ensureDir, insideDir, tildify } from "./paths.js";
import { VyybeError, readJson, writeJson, slugify, uniqueSlug, nowIso, sniffImage, extFromMime } from "./util.js";
import { mergeTheme, DEFAULT_THEME, type Theme } from "./theme.js";
import { fetchRemote } from "./net.js";
import { sanitizeSvg, assetPath, saveAssetBuffer } from "./store.js";

export interface Branding {
  schema: 1;
  id: string;
  name: string;
  description?: string;
  theme: Theme;
  /** Logo variants (e.g. primary, mark, light) → file in the branding's assets folder. */
  logos: Record<string, string>;
  /** Art direction: layouts, composition, imagery, textures, what to avoid. */
  styleGuide?: string;
  /** Tone of voice for copy. */
  voice?: string;
  /** Social handle / signature shown on posts, e.g. "@maxime". */
  handle?: string;
  website?: string;
  /** Example creations that capture the look (project/frame references). */
  examples?: { project: string; frame: string; note?: string }[];
  isDefault?: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
}

function brandingDir(id: string): string {
  const safe = slugify(id, "");
  if (!safe || safe !== id) throw new VyybeError("BRANDING_NOT_FOUND", `Invalid branding id "${id}".`);
  return path.join(lib.brandings(), id);
}

export function listBrandings(): Branding[] {
  const dir = lib.brandings();
  if (!fs.existsSync(dir)) return [];
  const out: Branding[] = [];
  for (const id of fs.readdirSync(dir)) {
    const f = path.join(dir, id, "branding.json");
    if (fs.existsSync(f)) {
      try {
        out.push(readJson<Branding>(f));
      } catch {}
    }
  }
  return out.sort((a, b) => Number(!!b.isDefault) - Number(!!a.isDefault) || b.updatedAt.localeCompare(a.updatedAt));
}

export function findBranding(idOrName: string): Branding | null {
  const all = listBrandings();
  const q = idOrName.toLowerCase().trim();
  return all.find((b) => b.id === q) ?? all.find((b) => b.name.toLowerCase() === q) ?? all.find((b) => slugify(b.name) === slugify(q)) ?? null;
}

export function getBranding(idOrName: string): Branding {
  const b = findBranding(idOrName);
  if (!b) throw new VyybeError("BRANDING_NOT_FOUND", `No branding "${idOrName}".`, `Saved brandings: ${listBrandings().map((x) => x.id).join(", ") || "(none)"}`);
  return b;
}

export function defaultBranding(): Branding | null {
  const all = listBrandings();
  return all.find((b) => b.isDefault) ?? (all.length === 1 ? all[0] : null);
}

export interface LogoInput {
  variant: string;
  /** Local file path, https URL, or "asset:<file>" from a project (needs projectId). */
  source: string;
}

export interface BrandingInput {
  id?: string;
  name?: string;
  description?: string;
  theme?: Partial<Theme>;
  styleGuide?: string;
  voice?: string;
  handle?: string;
  website?: string;
  logos?: LogoInput[];
  removeLogos?: string[];
  examples?: Branding["examples"];
  isDefault?: boolean;
  expectedVersion?: number;
}

async function loadLogo(source: string, projectId?: string): Promise<Buffer> {
  if (source.startsWith("asset:")) {
    if (!projectId) throw new VyybeError("BAD_INPUT", "Logo source asset:... needs projectId.");
    const p = assetPath(projectId, source.slice(6));
    if (!p) throw new VyybeError("ASSET_MISSING", `No asset ${source} in project ${projectId}.`);
    return fs.readFileSync(p);
  }
  if (/^https?:\/\//i.test(source)) return (await fetchRemote(source, 10 * 1024 * 1024)).buf;
  const full = path.resolve(source.replace(/^~(?=\/|$)/, process.env.HOME ?? "~"));
  if (!fs.existsSync(full)) throw new VyybeError("FILE_NOT_FOUND", `Logo file not found: ${tildify(full)}`);
  return fs.readFileSync(full);
}

export async function saveBranding(input: BrandingInput, projectId?: string): Promise<{ branding: Branding; created: boolean }> {
  ensureDir(lib.brandings());
  const existing = input.id ? findBranding(input.id) : input.name ? findBranding(input.name) : null;
  if (existing && input.expectedVersion !== undefined && existing.version !== input.expectedVersion) {
    throw new VyybeError("REVISION_CONFLICT", `Branding "${existing.id}" is at version ${existing.version}, not ${input.expectedVersion}.`);
  }
  if (!existing && !input.name) throw new VyybeError("BAD_INPUT", "A new branding needs a name.");
  const now = nowIso();
  const b: Branding = existing
    ? structuredClone(existing)
    : {
        schema: 1,
        id: uniqueSlug(lib.brandings(), slugify(input.name!, "branding")),
        name: input.name!,
        theme: structuredClone(DEFAULT_THEME),
        logos: {},
        version: 0,
        createdAt: now,
        updatedAt: now,
      };
  if (!existing && input.theme) b.theme = { colors: {}, fonts: {}, ...structuredClone(input.theme) } as Theme;
  else if (input.theme) b.theme = mergeTheme(b.theme, input.theme);
  for (const key of ["name", "description", "styleGuide", "voice", "handle", "website", "examples"] as const) {
    if (input[key] !== undefined) (b as any)[key] = input[key];
  }
  const dir = ensureDir(brandingDir(b.id));
  const assets = ensureDir(path.join(dir, "assets"));
  for (const variant of input.removeLogos ?? []) {
    const file = b.logos[variant];
    if (file) fs.rmSync(path.join(assets, file), { force: true });
    delete b.logos[variant];
  }
  for (const logo of input.logos ?? []) {
    let buf = await loadLogo(logo.source, projectId);
    const mime = sniffImage(buf);
    if (!mime) throw new VyybeError("UNSUPPORTED_ASSET", `Logo "${logo.variant}" isn't an image.`);
    if (mime === "image/svg+xml") buf = Buffer.from(sanitizeSvg(buf.toString("utf8")));
    const file = `logo-${slugify(logo.variant)}${extFromMime(mime)}`;
    fs.writeFileSync(path.join(assets, file), buf);
    b.logos[slugify(logo.variant)] = file;
  }
  if (input.isDefault) {
    for (const other of listBrandings()) {
      if (other.id !== b.id && other.isDefault) {
        other.isDefault = false;
        writeJson(path.join(brandingDir(other.id), "branding.json"), other);
      }
    }
    b.isDefault = true;
  } else if (input.isDefault === false) b.isDefault = false;
  b.version++;
  b.updatedAt = now;
  writeJson(path.join(dir, "branding.json"), b);
  return { branding: b, created: !existing };
}

export function deleteBranding(id: string): void {
  const b = getBranding(id);
  const dir = brandingDir(b.id);
  const trash = ensureDir(path.join(lib.internal(), "trash"));
  fs.renameSync(dir, path.join(trash, `${b.id}-${Date.now()}`));
}

export function brandingLogoPath(b: Branding, variant: string): string | null {
  const file = b.logos[variant];
  if (!file) return null;
  const dir = path.join(brandingDir(b.id), "assets");
  const full = path.join(dir, file);
  return insideDir(dir, full) && fs.existsSync(full) ? full : null;
}

/** Copy a branding's logos into a project so the project stays self-contained. */
export function copyLogosIntoProject(b: Branding, projectId: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const variant of Object.keys(b.logos)) {
    const src = brandingLogoPath(b, variant);
    if (!src) continue;
    const rec = saveAssetBuffer(projectId, fs.readFileSync(src), { source: "branding", origin: `${b.id}/${variant}`, name: `brand-${variant}` });
    out[variant] = rec.file;
  }
  return out;
}

/** Compact branding card for tool results. */
export function summarizeBranding(b: Branding, detail: "brief" | "full" = "brief") {
  const base = {
    id: b.id,
    name: b.name,
    isDefault: !!b.isDefault,
    version: b.version,
    description: b.description,
    colors: b.theme.colors,
    fonts: Object.fromEntries(Object.entries(b.theme.fonts).map(([k, f]) => [k, f.family])),
    logos: Object.keys(b.logos),
    handle: b.handle,
  };
  if (detail === "brief") return base;
  return { ...base, theme: b.theme, styleGuide: b.styleGuide, voice: b.voice, website: b.website, examples: b.examples, folder: tildify(brandingDir(b.id)) };
}
