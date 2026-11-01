import fs from "node:fs";
import path from "node:path";
import { lib, ensureDir, insideDir, tildify } from "./paths.js";
import { VyybeError, readJson, writeJson, writeFileAtomic, slugify, uniqueSlug, shortId, nowIso, sniffImage, extFromMime, mimeFromExt } from "./util.js";
import { sanitizeFrame, collapseComponents } from "./html.js";
import { DEFAULT_THEME, type Theme } from "./theme.js";
import { fetchRemote } from "./net.js";

export interface FrameMeta {
  id: string;
  name: string;
  width: number;
  height: number;
  format?: string;
  revision: number;
  updatedAt: string;
  /** Who made the last change: the agent or the user in the studio. */
  lastEditBy?: "agent" | "user";
}

export interface AssetMeta {
  file: string;
  source: "upload" | "url" | "generated" | "photo" | "branding" | "local";
  origin?: string;
  prompt?: string;
  provider?: string;
  credit?: string;
  license?: string;
  createdAt: string;
}

export interface Project {
  schema: 1;
  id: string;
  name: string;
  kind: "carousel" | "collection";
  brief?: string;
  /** Video title / post caption shown next to the visual in feed previews. */
  caption?: string;
  /** Handle shown in feed previews. */
  handle?: string;
  /** Size used for new frames when none is given. */
  defaultSize?: { width: number; height: number; format?: string };
  branding?: { id: string; name: string; version: number } | null;
  theme: Theme;
  /** Logo variants available to <vy-logo>, mapping variant → asset file. */
  logos?: Record<string, string>;
  frames: FrameMeta[];
  revision: number;
  createdAt: string;
  updatedAt: string;
}

export function projectDir(id: string): string {
  const safe = slugify(id, "");
  if (!safe || safe !== id) throw new VyybeError("PROJECT_NOT_FOUND", `Invalid project id "${id}".`);
  return path.join(lib.projects(), id);
}

export function loadProject(id: string): Project {
  const file = path.join(projectDir(id), "project.json");
  if (!fs.existsSync(file)) throw new VyybeError("PROJECT_NOT_FOUND", `No project "${id}".`, "Call list_projects to see existing projects.");
  return readJson<Project>(file);
}

function saveProject(p: Project): void {
  p.updatedAt = nowIso();
  writeJson(path.join(projectDir(p.id), "project.json"), p);
}

export function listProjects(query?: string, limit = 20) {
  const dir = lib.projects();
  if (!fs.existsSync(dir)) return [];
  const q = query?.toLowerCase().trim();
  const out: { id: string; name: string; frames: number; size: string; branding?: string; updatedAt: string }[] = [];
  for (const id of fs.readdirSync(dir)) {
    const f = path.join(dir, id, "project.json");
    if (!fs.existsSync(f)) continue;
    try {
      const p = readJson<Project>(f);
      if (q && !`${p.name} ${p.id} ${p.brief ?? ""}`.toLowerCase().includes(q)) continue;
      const sizes = [...new Set(p.frames.map((fr) => `${fr.width}x${fr.height}`))].join(", ");
      out.push({ id: p.id, name: p.name, frames: p.frames.length, size: sizes, branding: p.branding?.name, updatedAt: p.updatedAt });
    } catch {}
  }
  out.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return out.slice(0, limit);
}

export function framePath(projectId: string, frameId: string): string {
  return path.join(projectDir(projectId), "frames", `${frameId}.html`);
}

export function readFrameHtml(projectId: string, frameId: string): string {
  const f = framePath(projectId, frameId);
  if (!fs.existsSync(f)) throw new VyybeError("FRAME_NOT_FOUND", `No frame "${frameId}" in project "${projectId}".`);
  return fs.readFileSync(f, "utf8");
}

export function getFrame(p: Project, frameId: string): FrameMeta {
  const fr = p.frames.find((f) => f.id === frameId);
  if (!fr) {
    throw new VyybeError("FRAME_NOT_FOUND", `No frame "${frameId}" in project "${p.id}".`, `Frames: ${p.frames.map((f) => f.id).join(", ") || "(none)"}`);
  }
  return fr;
}

export function createProject(input: { name: string; kind?: "carousel" | "collection"; brief?: string; caption?: string; handle?: string; defaultSize?: Project["defaultSize"]; theme?: Theme; branding?: Project["branding"]; logos?: Record<string, string> }): Project {
  ensureDir(lib.projects());
  const id = uniqueSlug(lib.projects(), slugify(input.name, "project"));
  const dir = ensureDir(path.join(lib.projects(), id));
  ensureDir(path.join(dir, "frames"));
  ensureDir(path.join(dir, "assets"));
  const p: Project = {
    schema: 1,
    id,
    name: input.name,
    kind: input.kind ?? "carousel",
    brief: input.brief,
    caption: input.caption,
    handle: input.handle,
    defaultSize: input.defaultSize,
    branding: input.branding ?? null,
    theme: input.theme ?? structuredClone(DEFAULT_THEME),
    logos: input.logos ?? {},
    frames: [],
    revision: 1,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  saveProject(p);
  return p;
}

export function updateProjectMeta(id: string, patch: Partial<Pick<Project, "name" | "kind" | "brief" | "caption" | "handle" | "theme" | "logos" | "branding">>): Project {
  const p = loadProject(id);
  Object.assign(p, Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)));
  p.revision++;
  saveProject(p);
  return p;
}

function snapshot(projectId: string, frameId: string, revision: number): void {
  const src = framePath(projectId, frameId);
  if (!fs.existsSync(src)) return;
  const dir = ensureDir(path.join(projectDir(projectId), ".history", frameId));
  fs.copyFileSync(src, path.join(dir, `${String(revision).padStart(5, "0")}.html`));
  const files = fs.readdirSync(dir).sort();
  for (const old of files.slice(0, Math.max(0, files.length - 40))) fs.rmSync(path.join(dir, old), { force: true });
}

export interface FrameWrite {
  id?: string;
  name?: string;
  html?: string;
  edits?: { find: string; replace: string; all?: boolean }[];
  width?: number;
  height?: number;
  format?: string;
  position?: number;
  baseRevision?: number;
}

export interface FrameWriteResult { id: string; name: string; revision: number; created: boolean; warnings: string[] }

/**
 * Create or update one frame. Sanitizes HTML, imports remote images, snapshots history,
 * and checks optimistic concurrency when baseRevision is given.
 */
export async function writeFrame(projectId: string, w: FrameWrite, by: "agent" | "user", size: { width: number; height: number; format?: string }): Promise<FrameWriteResult> {
  const p = loadProject(projectId);
  let fr = w.id ? p.frames.find((f) => f.id === w.id) : undefined;
  const created = !fr;
  const warnings: string[] = [];

  let source: string;
  if (w.html !== undefined) {
    source = w.html;
  } else if (w.edits?.length) {
    if (!fr) throw new VyybeError("FRAME_NOT_FOUND", `Can't apply edits: no frame "${w.id}".`);
    source = readFrameHtml(projectId, fr.id);
    for (const e of w.edits) {
      const count = source.split(e.find).length - 1;
      if (count === 0) throw new VyybeError("EDIT_NOT_FOUND", `Edit target not found in frame "${fr.id}": ${JSON.stringify(e.find.slice(0, 80))}`, "Call read_frame to get the exact current HTML (the user may have edited it in the studio).");
      if (count > 1 && !e.all) throw new VyybeError("EDIT_AMBIGUOUS", `Edit target appears ${count} times in frame "${fr.id}": ${JSON.stringify(e.find.slice(0, 80))}`, "Include more surrounding text, or set all: true.");
      source = e.all ? source.split(e.find).join(e.replace) : source.replace(e.find, () => e.replace);
    }
  } else if (fr) {
    source = readFrameHtml(projectId, fr.id);
  } else {
    throw new VyybeError("BAD_INPUT", "A new frame needs html.");
  }

  if (fr && w.baseRevision !== undefined && w.baseRevision !== fr.revision) {
    throw new VyybeError("REVISION_CONFLICT", `Frame "${fr.id}" changed (now revision ${fr.revision}, you had ${w.baseRevision}).`, "Re-read the frame and re-apply your change.");
  }

  if (by === "user") source = collapseComponents(source);
  const clean = sanitizeFrame(source);
  warnings.push(...clean.warnings);
  let html = clean.html;
  for (const url of clean.remoteUrls) {
    try {
      const asset = await importAssetFromUrl(projectId, url, { source: "url" });
      html = html.split(url).join(`asset:${asset.file}`);
      warnings.push(`Imported ${url.slice(0, 80)} as asset:${asset.file}.`);
    } catch (err: any) {
      warnings.push(`Couldn't import image ${url.slice(0, 80)} (${err.message}). Replace it with an imported asset.`);
    }
  }

  const fresh = loadProject(projectId); // re-read: imports may have taken time
  fr = w.id ? fresh.frames.find((f) => f.id === w.id) : undefined;
  if (fr) {
    snapshot(projectId, fr.id, fr.revision);
    fr.revision++;
    fr.updatedAt = nowIso();
    fr.lastEditBy = by;
    if (w.name) fr.name = w.name;
    if (w.width && w.height) {
      fr.width = size.width;
      fr.height = size.height;
      fr.format = size.format;
    } else if (w.format) {
      fr.width = size.width;
      fr.height = size.height;
      fr.format = size.format;
    }
  } else {
    let id = w.id ? slugify(w.id, "") : "";
    if (!id || fresh.frames.some((f) => f.id === id)) id = nextFrameId(fresh);
    fr = { id, name: w.name ?? `Frame ${fresh.frames.length + 1}`, width: size.width, height: size.height, format: size.format, revision: 1, updatedAt: nowIso(), lastEditBy: by };
    const pos = w.position !== undefined ? Math.max(0, Math.min(fresh.frames.length, w.position - 1)) : fresh.frames.length;
    fresh.frames.splice(pos, 0, fr);
  }
  writeFileAtomic(framePath(projectId, fr.id), html + "\n");
  fresh.revision++;
  saveProject(fresh);
  return { id: fr.id, name: fr.name, revision: fr.revision, created, warnings };
}

function nextFrameId(p: Project): string {
  let n = p.frames.length + 1;
  const taken = new Set(p.frames.map((f) => f.id));
  while (taken.has(`f${n}`)) n++;
  return `f${n}`;
}

export function reorderFrames(projectId: string, order: string[]): Project {
  const p = loadProject(projectId);
  const byId = new Map(p.frames.map((f) => [f.id, f]));
  const next: FrameMeta[] = [];
  for (const id of order) {
    const f = byId.get(id);
    if (f) {
      next.push(f);
      byId.delete(id);
    }
  }
  next.push(...byId.values());
  p.frames = next;
  p.revision++;
  saveProject(p);
  return p;
}

export function deleteFrame(projectId: string, frameId: string): Project {
  const p = loadProject(projectId);
  getFrame(p, frameId);
  snapshot(projectId, frameId, p.frames.find((f) => f.id === frameId)!.revision);
  p.frames = p.frames.filter((f) => f.id !== frameId);
  fs.rmSync(framePath(projectId, frameId), { force: true });
  p.revision++;
  saveProject(p);
  return p;
}

export function duplicateFrame(projectId: string, frameId: string): { project: Project; newId: string } {
  const p = loadProject(projectId);
  const src = getFrame(p, frameId);
  const id = nextFrameId(p);
  fs.copyFileSync(framePath(projectId, frameId), framePath(projectId, id));
  const idx = p.frames.indexOf(src);
  p.frames.splice(idx + 1, 0, { ...src, id, name: `${src.name} copy`, revision: 1, updatedAt: nowIso() });
  p.revision++;
  saveProject(p);
  return { project: p, newId: id };
}

export function frameHistory(projectId: string, frameId: string): number[] {
  const dir = path.join(projectDir(projectId), ".history", frameId);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).map((f) => Number(f.replace(".html", ""))).filter(Boolean).sort((a, b) => a - b);
}

export function readFrameRevision(projectId: string, frameId: string, revision: number): string {
  const f = path.join(projectDir(projectId), ".history", frameId, `${String(revision).padStart(5, "0")}.html`);
  if (!fs.existsSync(f)) throw new VyybeError("NOT_FOUND", `No saved revision ${revision} for frame "${frameId}".`);
  return fs.readFileSync(f, "utf8");
}

// ---------- assets ----------

const MAX_ASSET_BYTES = 25 * 1024 * 1024;

function assetsDir(projectId: string): string {
  return ensureDir(path.join(projectDir(projectId), "assets"));
}

function assetIndexFile(projectId: string): string {
  return path.join(assetsDir(projectId), ".assets.json");
}

export function listAssets(projectId: string): AssetMeta[] {
  const dir = assetsDir(projectId);
  const index = readJson<AssetMeta[]>(assetIndexFile(projectId), []);
  const files = fs.readdirSync(dir).filter((f) => !f.startsWith("."));
  return files.map((file) => index.find((a) => a.file === file) ?? { file, source: "local" as const, createdAt: "" });
}

export function assetPath(projectId: string, file: string): string | null {
  const dir = assetsDir(projectId);
  const full = path.join(dir, file);
  if (!insideDir(dir, full) || !fs.existsSync(full)) return null;
  return full;
}

export function saveAssetBuffer(projectId: string, buf: Buffer, meta: Omit<AssetMeta, "file" | "createdAt"> & { name?: string; mime?: string }): AssetMeta {
  if (buf.length > MAX_ASSET_BYTES) throw new VyybeError("ASSET_TOO_LARGE", `Asset is ${(buf.length / 1e6).toFixed(1)} MB (max 25 MB).`);
  const mime = sniffImage(buf) ?? meta.mime ?? "";
  if (!mime.startsWith("image/")) throw new VyybeError("UNSUPPORTED_ASSET", "Only images (png, jpg, webp, gif, svg, avif) can be imported.");
  if (mime === "image/svg+xml") buf = Buffer.from(sanitizeSvg(buf.toString("utf8")));
  const ext = extFromMime(mime) || ".png";
  const base = slugify((meta.name ?? "image").replace(/\.[a-z0-9]+$/i, ""), "image");
  const dir = assetsDir(projectId);
  let file = `${base}${ext}`;
  let i = 2;
  while (fs.existsSync(path.join(dir, file))) file = `${base}-${i++}${ext}`;
  writeFileAtomic(path.join(dir, file), buf);
  const record: AssetMeta = { file, source: meta.source, origin: meta.origin, prompt: meta.prompt, provider: meta.provider, credit: meta.credit, license: meta.license, createdAt: nowIso() };
  const index = readJson<AssetMeta[]>(assetIndexFile(projectId), []);
  index.push(record);
  writeJson(assetIndexFile(projectId), index);
  return record;
}

export async function importAssetFromUrl(projectId: string, url: string, meta: Partial<AssetMeta> & { name?: string }): Promise<AssetMeta> {
  const { buf, mime } = await fetchRemote(url, MAX_ASSET_BYTES);
  const urlName = decodeURIComponent(new URL(url).pathname.split("/").pop() || "image");
  return saveAssetBuffer(projectId, buf, { source: meta.source ?? "url", origin: url, credit: meta.credit, license: meta.license, prompt: meta.prompt, provider: meta.provider, name: meta.name ?? urlName, mime });
}

export function importAssetFromPath(projectId: string, file: string, meta: Partial<AssetMeta> & { name?: string } = {}): AssetMeta {
  const full = path.resolve(file.replace(/^~(?=\/|$)/, process.env.HOME ?? "~"));
  if (!fs.existsSync(full) || !fs.statSync(full).isFile()) throw new VyybeError("FILE_NOT_FOUND", `No file at ${tildify(full)}.`);
  const buf = fs.readFileSync(full);
  return saveAssetBuffer(projectId, buf, { source: meta.source ?? "local", origin: tildify(full), name: meta.name ?? path.basename(full), mime: mimeFromExt(full), credit: meta.credit, license: meta.license, prompt: meta.prompt, provider: meta.provider });
}

export function sanitizeSvg(svg: string): string {
  return svg
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi, "")
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/(href|xlink:href)\s*=\s*("|')\s*(javascript:|https?:|file:)[^"']*\2/gi, "")
    .replace(/<!ENTITY[^>]*>/gi, "");
}

export function newFrameIdHint(p: Project): string {
  return nextFrameId(p);
}

export { shortId };
