import fs from "node:fs";
import { loadProject, readFrameHtml, assetPath, listAssets, type Project } from "./store.js";
import { expandComponents, extractClasses, ASSET_REF_RE } from "./html.js";
import { compileTailwind, FRAME_BASE_CSS } from "./tailwind.js";
import { themeFaces, fontFaceCss, fileBase64, type FontFaceRecord } from "./fonts.js";
import { iconSvg } from "./icons.js";
import { mimeFromExt } from "./util.js";

export interface ProjectRenderContext {
  project: Project;
  css: string;
  faces: FontFaceRecord[];
  warnings: string[];
}

const ctxCache = new Map<string, { key: string; ctx: ProjectRenderContext }>();

export async function projectContext(projectId: string): Promise<ProjectRenderContext> {
  const project = loadProject(projectId);
  const sources = project.frames.map((f) => readFrameHtml(projectId, f.id));
  const classes = new Set<string>();
  for (const s of sources) extractClasses(s, classes);
  const key = `${project.revision}|${project.frames.map((f) => f.revision).join(",")}`;
  const hit = ctxCache.get(projectId);
  if (hit && hit.key === key) return hit.ctx;
  const [css, fonts] = await Promise.all([compileTailwind(project.theme, classes), themeFaces(project.theme)]);
  const ctx: ProjectRenderContext = { project, css, faces: fonts.faces, warnings: fonts.warnings };
  ctxCache.set(projectId, { key, ctx });
  return ctx;
}

function assetDataUri(projectId: string, file: string): string | null {
  const p = assetPath(projectId, file);
  if (!p) return null;
  return `data:${mimeFromExt(p)};base64,${fileBase64(p)}`;
}

/** Expand components and inline asset references for one frame. */
export function displayHtml(project: Project, frameId: string, source?: string): { html: string; missing: string[] } {
  const missing: string[] = [];
  // Page counters count frames of the same size, so a story or thumbnail added to a carousel
  // project doesn't change the carousel's "03/06".
  const me = project.frames.find((f) => f.id === frameId);
  const sameSize = project.frames.filter((f) => !me || (f.width === me.width && f.height === me.height));
  const idx = sameSize.findIndex((f) => f.id === frameId);
  const raw = source ?? readFrameHtml(project.id, frameId);
  let html = expandComponents(
    raw,
    {
      icon: (name, stroke) => iconSvg(name, stroke),
      logo: (variant) => {
        const logos = project.logos ?? {};
        return (variant && logos[variant]) || logos.primary || Object.values(logos)[0] || null;
      },
      page: idx + 1,
      total: sameSize.length,
    },
    missing,
  );
  html = html.replace(ASSET_REF_RE, (m, file: string) => {
    const uri = assetDataUri(project.id, file);
    if (!uri) {
      missing.push(`asset:${file}`);
      return m;
    }
    return uri;
  });
  return { html, missing };
}

/** Standalone HTML document for one frame (used by the renderer and HTML export). */
export function frameDocument(ctx: ProjectRenderContext, frameId: string, opts: { source?: string; background?: string } = {}): { doc: string; missing: string[]; width: number; height: number } {
  const frame = ctx.project.frames.find((f) => f.id === frameId)!;
  const { html, missing } = displayHtml(ctx.project, frameId, opts.source);
  const doc = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=${frame.width}"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; font-src data:; style-src 'unsafe-inline'; script-src 'none'">
<style>${fontFaceCss(ctx.faces)}</style>
<style>${ctx.css}</style>
<style>${FRAME_BASE_CSS}
html,body{margin:0;padding:0;background:${opts.background ?? "transparent"};}
.vy-frame{width:${frame.width}px;height:${frame.height}px;}
</style></head><body><div class="vy-frame" data-vy-frame="${frame.id}">${html}</div></body></html>`;
  return { doc, missing, width: frame.width, height: frame.height };
}

/** Everything the studio UI needs to render and edit a project, in one payload. */
export async function studioBundle(projectId: string) {
  const ctx = await projectContext(projectId);
  const p = ctx.project;
  const frames = p.frames.map((f) => {
    const d = displayHtml(p, f.id);
    return { ...f, html: d.html, missing: d.missing };
  });
  const fonts = ctx.faces.map((f) => ({ family: f.family, weight: String(f.weight), style: f.style, unicodeRange: f.unicodeRange, data: fileBase64(f.file) }));
  return {
    project: { id: p.id, name: p.name, kind: p.kind, revision: p.revision, branding: p.branding, theme: p.theme, logos: p.logos ?? {} },
    frames,
    css: ctx.css + "\n" + FRAME_BASE_CSS,
    fonts,
    assets: listAssetFiles(p.id),
  };
}

function listAssetFiles(projectId: string): { file: string; source: string; bytes: number }[] {
  return listAssets(projectId).map((a) => {
    const p = assetPath(projectId, a.file);
    return { file: a.file, source: a.source, bytes: p ? fs.statSync(p).size : 0 };
  });
}

export function readAssetDataUri(projectId: string, file: string): string | null {
  return assetDataUri(projectId, file);
}

/**
 * Compose a fragment that isn't part of a project frame list (picker options, style samples).
 * Each call compiles its own CSS so options with different themes stay isolated.
 */
export async function composeLoose(html: string, theme: import("./theme.js").Theme, opts: { projectId?: string; logos?: Record<string, string> } = {}) {
  const classes = new Set<string>();
  extractClasses(html, classes);
  const [css, fonts] = await Promise.all([compileTailwind(theme, classes), themeFaces(theme)]);
  const missing: string[] = [];
  let out = expandComponents(html, { icon: (n, s) => iconSvg(n, s), logo: (v) => (opts.logos ? (v && opts.logos[v]) || Object.values(opts.logos)[0] || null : null), page: 1, total: 1 }, missing);
  if (opts.projectId) {
    out = out.replace(ASSET_REF_RE, (m, file: string) => assetDataUri(opts.projectId!, file) ?? m);
  }
  return { html: out, css: css + "\n" + FRAME_BASE_CSS, faces: fonts.faces, missing };
}
