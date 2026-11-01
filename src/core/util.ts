import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

export class VyybeError extends Error {
  constructor(public code: string, message: string, public hint?: string) {
    super(message);
  }
}

export function slugify(input: string, fallback = "untitled"): string {
  const s = input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return s || fallback;
}

/** Pick a slug that doesn't exist yet in `dir` (appends -2, -3, ...). */
export function uniqueSlug(dir: string, base: string): string {
  let slug = base;
  let i = 2;
  while (fs.existsSync(path.join(dir, slug))) slug = `${base}-${i++}`;
  return slug;
}

export function shortId(prefix = ""): string {
  return prefix + crypto.randomBytes(4).toString("hex");
}

export function hash(...parts: (string | Buffer)[]): string {
  const h = crypto.createHash("sha256");
  for (const p of parts) h.update(p);
  return h.digest("hex").slice(0, 16);
}

export function nowIso(): string {
  return new Date().toISOString();
}

/** Write atomically: temp file + rename, so a crash never leaves a half-written file. */
export function writeFileAtomic(file: string, data: string | Buffer, mode?: number): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, data, mode ? { mode } : undefined);
  fs.renameSync(tmp, file);
}

export function readJson<T>(file: string, fallback?: T): T {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as T;
  } catch (err) {
    if (fallback !== undefined) return fallback;
    throw err;
  }
}

export function writeJson(file: string, value: unknown): void {
  writeFileAtomic(file, JSON.stringify(value, null, 2) + "\n");
}

export function mimeFromExt(file: string): string {
  const ext = path.extname(file).toLowerCase();
  return (
    {
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".webp": "image/webp",
      ".gif": "image/gif",
      ".svg": "image/svg+xml",
      ".avif": "image/avif",
      ".woff2": "font/woff2",
      ".woff": "font/woff",
      ".ttf": "font/ttf",
      ".otf": "font/otf",
      ".pdf": "application/pdf",
      ".zip": "application/zip",
      ".html": "text/html; charset=utf-8",
      ".js": "text/javascript; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".json": "application/json",
    } as Record<string, string>
  )[ext] ?? "application/octet-stream";
}

export function extFromMime(mime: string): string {
  const m = mime.split(";")[0].trim().toLowerCase();
  return (
    {
      "image/png": ".png",
      "image/jpeg": ".jpg",
      "image/webp": ".webp",
      "image/gif": ".gif",
      "image/svg+xml": ".svg",
      "image/avif": ".avif",
    } as Record<string, string>
  )[m] ?? "";
}

/** Sniff an image type from its first bytes. */
export function sniffImage(buf: Buffer): string | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "image/png";
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  if (buf.toString("ascii", 0, 3) === "GIF") return "image/gif";
  if (buf.toString("ascii", 4, 12).includes("ftypavif")) return "image/avif";
  const head = buf.toString("utf8", 0, Math.min(buf.length, 512)).trimStart().toLowerCase();
  if (head.startsWith("<svg") || (head.startsWith("<?xml") && head.includes("<svg"))) return "image/svg+xml";
  return null;
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}
