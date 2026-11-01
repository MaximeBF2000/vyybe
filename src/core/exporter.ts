import fs from "node:fs";
import path from "node:path";
import { projectDir } from "./store.js";
import { renderFrames, renderPdf } from "./render.js";
import { createZip } from "./zip.js";
import { ensureDir, tildify } from "./paths.js";
import { slugify, VyybeError } from "./util.js";

export type ExportFormat = "png" | "jpg" | "webp" | "pdf" | "zip";

export interface ExportResult {
  format: ExportFormat;
  files: { path: string; display: string; bytes: number; mime: string; frameId?: string }[];
  folder: string;
}

export async function exportProject(projectId: string, opts: { format: ExportFormat; frameIds?: string[]; scale?: number; quality?: number }): Promise<ExportResult> {
  const format = opts.format;
  const imageFormat = format === "jpg" ? "jpeg" : format === "webp" ? "webp" : format === "pdf" ? "jpeg" : "png";
  const scale = opts.scale ?? (format === "pdf" ? 2 : 1);
  const { ctx, renders } = await renderFrames(projectId, opts.frameIds, { scale, format: imageFormat, quality: opts.quality ?? (format === "pdf" ? 92 : 92) });
  if (!renders.length) throw new VyybeError("NOTHING_TO_EXPORT", "No frames to export.");
  const p = ctx.project;
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
  const folder = ensureDir(path.join(projectDir(p.id), "exports", stamp));
  const base = slugify(p.name, "vyybe");
  const ext = format === "jpg" ? "jpg" : format === "webp" ? "webp" : "png";
  const all = renders.length === p.frames.length;
  const nameFor = (i: number, frameId: string) => {
    const pos = p.frames.findIndex((f) => f.id === frameId) + 1;
    return `${base}-${String(all ? i + 1 : pos).padStart(2, "0")}.${ext}`;
  };
  const files: ExportResult["files"] = [];
  const write = (name: string, data: Buffer, mime: string, frameId?: string) => {
    const full = path.join(folder, name);
    fs.writeFileSync(full, data);
    files.push({ path: full, display: tildify(full), bytes: data.length, mime, frameId });
  };
  if (format === "pdf") {
    write(`${base}.pdf`, await renderPdf(renders), "application/pdf");
  } else if (format === "zip") {
    const zip = createZip(renders.map((r, i) => ({ name: nameFor(i, r.frameId), data: r.image })));
    write(`${base}.zip`, zip, "application/zip");
  } else {
    renders.forEach((r, i) => write(nameFor(i, r.frameId), r.image, `image/${imageFormat}`, r.frameId));
  }
  return { format, files, folder: tildify(folder) };
}
