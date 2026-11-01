import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/server";
import { registerAppTool, registerAppResource, RESOURCE_MIME_TYPE, getUiCapability } from "@modelcontextprotocol/ext-apps/server";

import { lib, tildify, insideDir, pluginRoot } from "../core/paths.js";
import { VyybeError, formatBytes } from "../core/util.js";
import { FORMATS, resolveSize } from "../core/formats.js";
import { ThemeSchema, FontSpecSchema, DEFAULT_THEME, mergeTheme, describeTheme, type Theme } from "../core/theme.js";
import * as store from "../core/store.js";
import * as brands from "../core/brandings.js";
import { STYLES, getStyle, fillSample } from "../core/styles.js";
import { renderFrames, contactSheet, contextSheet, type FrameRender } from "../core/render.js";
import { findLogo, captureWebpage } from "../core/assets-web.js";
import { exportProject } from "../core/exporter.js";
import { studioBundle, composeLoose, readAssetDataUri } from "../core/compose.js";
import { searchIcons, iconSvg } from "../core/icons.js";
import { searchFonts, fileBase64 } from "../core/fonts.js";
import { generateImage, searchPhotos, photoGrid, importPhoto, availableImageProviders } from "../core/images.js";
import { PROVIDERS, providerStatus, setKey, readConfig, writeConfig, type ProviderId } from "../core/secrets.js";
import { rendererStatus, installHeadlessShell } from "../core/chrome.js";
import { createPicker, loadPicker, answerPicker, type PickerOption } from "../core/pickers.js";
import { ok, wrap, mwrap, type ToolResult } from "./results.js";
import { studioUrl, openInBrowser } from "./http.js";

export const VERSION = "0.1.0";
export const UI_URI = `ui://vyybe/${VERSION}/studio.html`;

const MODEL_ONLY = { ui: { visibility: ["model"] } };

function uiMeta(extra: Record<string, unknown> = {}) {
  return {
    ui: { resourceUri: UI_URI, visibility: ["model", "app"] },
    "ui/resourceUri": UI_URI,
    "openai/outputTemplate": UI_URI,
    "openai/widgetAccessible": true,
    ...extra,
  };
}
const APP_ONLY = { ui: { resourceUri: UI_URI, visibility: ["app"] } };

// ---------- shared schemas ----------

const sizeFields = {
  format: z.string().optional().describe("Size preset id (list in vyybe_status), e.g. instagram-portrait, youtube-thumbnail"),
  width: z.number().int().optional().describe("custom px, with height"),
  height: z.number().int().optional(),
};

const FrameInput = z.object({
  id: z.string().optional().describe("Existing frame id to update (e.g. f2). Omit to create a new frame."),
  name: z.string().max(60).optional().describe('Short role name, e.g. "Hook", "CTA", "Variant B"'),
  html: z.string().max(200_000).optional().describe("Full frame HTML fragment (frame contract in the vyybe-create skill)"),
  edits: z
    .array(z.object({ find: z.string().min(1), replace: z.string(), all: z.boolean().optional() }))
    .optional()
    .describe("Cheap exact find/replace on current HTML (each find must match once, or set all)"),
  position: z.number().int().optional().describe("1-based insert position for a new frame"),
  baseRevision: z.number().int().optional(),
  ...sizeFields,
});

const PreviewMode = z.enum(["sheet", "frames", "context", "none"]).optional().describe("sheet (default; thumbnails also get the feed view): one image of written frames; frames: one image each; context: in-feed mock (YouTube/Instagram) at real size; none: checks only");

// ---------- helpers ----------

/** UI tools keep structuredContent (the view needs it) and repeat the message there for hosts that only show structured output. */
function uiOk(text: string, structured: Record<string, unknown>): ToolResult {
  return ok(text, { ...structured, message: text });
}

function issueLines(renders: FrameRender[]): string {
  const lines: string[] = [];
  for (const r of renders) {
    if (!r.issues.length) continue;
    lines.push(`  ${r.frameId} (${r.name}):`);
    for (const i of r.issues) lines.push(`    ${i.severity === "error" ? "✗" : "⚠"} ${i.message}`);
  }
  return lines.length ? `Checks found issues:\n${lines.join("\n")}` : "Checks: ✓ no layout issues detected (overflow, overlap, contrast, fonts, images).";
}

async function previewResult(projectId: string, frameIds: string[] | undefined, mode: "sheet" | "frames" | "context" | "none" = "sheet") {
  const { ctx, renders } = await renderFrames(projectId, frameIds, { diagnostics: true, format: "png" });
  const images: { data: Buffer; mime: string }[] = [];
  const p = ctx.project;
  const isThumb = renders.length > 0 && renders.every((r) => r.width / r.height > 1.6 && r.width <= 1920);
  if ((mode === "sheet" || mode === "context") && renders.length) {
    const cols = renders.length <= 3 ? renders.length : renders.length === 4 ? 2 : renders.length <= 6 ? 3 : 4;
    const landscape = renders[0].width > renders[0].height * 1.2;
    if (mode === "sheet" || !isThumb) images.push({ data: await contactSheet(renders, { maxWidth: Math.min(1400, cols * (landscape ? 700 : 520)), columns: cols }), mime: "image/jpeg" });
  } else if (mode === "frames") {
    for (const r of renders) {
      const sheet = await contactSheet([r], { maxWidth: r.width > r.height ? 1000 : 720, columns: 1 });
      images.push({ data: sheet, mime: "image/jpeg" });
    }
  }
  // Thumbnails are judged in the feed at small size: always show that view for them.
  if (renders.length && (mode === "context" || (mode === "sheet" && isThumb))) {
    const handle = p.handle ?? (p.branding ? brands.findBranding(p.branding.id)?.handle?.replace(/^@/, "") : undefined);
    images.push({ data: await contextSheet(renders, { title: p.caption ?? p.brief?.split("\n")[0]?.slice(0, 90), handle }), mime: "image/jpeg" });
  }
  return { renders, images };
}

function projectSummary(p: store.Project): string {
  const sizes = [...new Set(p.frames.map((f) => `${f.width}×${f.height}`))].join(", ") || "no frames";
  return `Project "${p.name}" (id: ${p.id}) — ${p.frames.length} frame${p.frames.length === 1 ? "" : "s"}, ${sizes}${p.branding ? `, branding: ${p.branding.name}` : ""}.`;
}

function frameList(p: store.Project): string {
  return p.frames.map((f, i) => `  ${i + 1}. ${f.id} "${f.name}" ${f.width}×${f.height} rev ${f.revision}${f.lastEditBy === "user" ? " (last edited by the user in the studio)" : ""}`).join("\n");
}

async function writeFrames(projectId: string, frames: z.infer<typeof FrameInput>[], defaultSize: { width: number; height: number; format?: string }) {
  const results: store.FrameWriteResult[] = [];
  for (const f of frames) {
    const p = store.loadProject(projectId);
    const existing = f.id ? p.frames.find((x) => x.id === f.id) : undefined;
    const size = f.format || (f.width && f.height) ? resolveSize(f) : existing ? { width: existing.width, height: existing.height, format: existing.format } : defaultSize;
    if (!existing && f.html === undefined) throw new VyybeError("BAD_INPUT", `Frame ${f.id ?? "(new)"}: a new frame needs html.`);
    results.push(await store.writeFrame(projectId, f, "agent", size));
  }
  return results;
}

function supportsUi(server: McpServer): boolean {
  try {
    const caps = server.server.getClientCapabilities();
    return !!getUiCapability(caps)?.mimeTypes?.includes(RESOURCE_MIME_TYPE) || !!(caps as any)?.experimental?.["openai/visibility"];
  } catch {
    return false;
  }
}

function themeForProject(input: { branding?: string; style?: string; theme?: Partial<Theme> }) {
  let base: Theme = structuredClone(DEFAULT_THEME);
  const notes: string[] = [];
  const style = input.style ? getStyle(input.style) : undefined;
  if (input.style && !style) throw new VyybeError("UNKNOWN_STYLE", `Unknown style "${input.style}".`, `Styles: ${STYLES.map((s) => s.id).join(", ")}`);
  if (style) base = structuredClone(style.theme);
  let branding: brands.Branding | null = null;
  if (input.branding && input.branding !== "none") branding = brands.getBranding(input.branding);
  else if (!input.branding) {
    branding = brands.defaultBranding();
    if (branding) notes.push(`Applied default branding "${branding.name}" (pass branding:"none" to skip).`);
  }
  if (branding) base = mergeTheme(base, branding.theme);
  const theme = input.theme ? mergeTheme(base, input.theme as Theme) : base;
  return { theme, branding, style, notes };
}

// ---------- registration ----------

export function registerTools(server: McpServer) {
  const studioHtml = () => fs.readFileSync(path.join(pluginRoot(), "server", "studio.html"), "utf8");

  registerAppResource(
    server,
    "Vyybe Studio",
    UI_URI,
    { description: "Preview, edit and export Vyybe creations; pick between visual options.", _meta: { ui: { prefersBorder: false, csp: { connectDomains: [], resourceDomains: [] } } } },
    async () => ({
      contents: [{ uri: UI_URI, mimeType: RESOURCE_MIME_TYPE, text: studioHtml(), _meta: { ui: { prefersBorder: false, csp: { connectDomains: [], resourceDomains: [] } } } }],
    }),
  );

  // ---- status & setup ----

  server.registerTool(
    "vyybe_status",
    {
      title: "Vyybe status",
      description:
        "Start here. Returns the user's saved brandings (with the default), recent projects, available style presets, size formats, which image/photo providers are configured, and whether the renderer works. Cheap; call once per conversation before creating.",
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      _meta: MODEL_ONLY,
    },
    mwrap(async () => {
      const [renderer, providers] = await Promise.all([rendererStatus(), providerStatus()]);
      const brandingList = brands.listBrandings().map((b) => brands.summarizeBranding(b, "brief"));
      const projects = store.listProjects(undefined, 6);
      const imageProviders = (Object.keys(providers) as ProviderId[]).filter((p) => PROVIDERS[p].kind === "image" && providers[p]);
      const photoProviders = (Object.keys(providers) as ProviderId[]).filter((p) => PROVIDERS[p].kind === "photo" && providers[p]);
      const lines = [
        `Library: ${tildify(lib.root())}`,
        `Renderer: ${renderer.available ? "ready" : "MISSING — call vyybe_setup with installRenderer:true (or install Google Chrome)"}`,
        `Brandings (${brandingList.length}): ${brandingList.map((b) => `${b.id}${b.isDefault ? " [default]" : ""}`).join(", ") || "none saved yet"}`,
        `Recent projects: ${projects.map((p) => `${p.id} (${p.frames} frames)`).join(", ") || "none"}`,
        `Image generation via Vyybe: ${imageProviders.join(", ") || "not configured (use your own native image tool if you have one, else design without generated images or offer open_settings)"}`,
        `Stock photos: ${photoProviders.length ? photoProviders.join(", ") : "openverse (free, no key; Pexels/Unsplash keys give better results)"}`,
        `Styles: ${STYLES.map((s) => `${s.id} (${s.tags.slice(0, 3).join(", ")})`).join("; ")}`,
        `Formats: ${FORMATS.map((f) => `${f.id} ${f.width}x${f.height}`).join("; ")}`,
      ];
      return ok(lines.join("\n"), { renderer: renderer.available, brandings: brandingList, projects, imageProviders, photoProviders, styles: STYLES.map((s) => ({ id: s.id, name: s.name, tags: s.tags })) });
    }),
  );

  server.registerTool(
    "vyybe_setup",
    {
      title: "Configure Vyybe",
      description:
        "One-time setup actions: download a private headless Chrome if no Chrome-based browser is installed, set the preferred image provider, or store an API key the user pasted in chat (stored in the macOS Keychain, never in files you can read). Prefer open_settings so keys never pass through the chat.",
      inputSchema: z.object({
        installRenderer: z.boolean().optional().describe("Download chrome-headless-shell (~90 MB) into ~/Vyybe/.vyybe/runtime."),
        imageProvider: z.enum(["auto", "openai", "gemini", "fal", "replicate"]).optional(),
        apiKey: z.object({ provider: z.enum(Object.keys(PROVIDERS) as [ProviderId, ...ProviderId[]]), key: z.string().min(8).nullable() }).optional().describe("Store (or remove with null) a provider API key."),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
      _meta: MODEL_ONLY,
    },
    mwrap(async (args) => {
      const out: string[] = [];
      if (args.installRenderer) {
        const existing = await rendererStatus();
        out.push(existing.available ? `Renderer already available (${existing.executable}).` : `Installed headless Chrome at ${tildify(await installHeadlessShell())}.`);
      }
      if (args.imageProvider) {
        writeConfig({ imageProvider: args.imageProvider });
        out.push(`Preferred image provider: ${args.imageProvider}.`);
      }
      if (args.apiKey) {
        const where = await setKey(args.apiKey.provider, args.apiKey.key);
        out.push(where === "removed" ? `Removed ${args.apiKey.provider} key.` : `Saved ${PROVIDERS[args.apiKey.provider].label} key (${where === "keychain" ? "macOS Keychain" : tildify(lib.credentials())}). Don't repeat the key back to the user.`);
      }
      return ok(out.join("\n") || "Nothing to do.");
    }),
  );

  registerAppTool(
    server,
    "open_settings",
    {
      title: "Open Vyybe settings",
      description: "Show the Vyybe settings panel where the user can paste API keys for image generation (OpenAI, Gemini, fal.ai, Replicate) and stock photos (Pexels, Unsplash). Keys go straight to the Keychain without passing through the chat.",
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      _meta: uiMeta(),
    },
    wrap(async () => {
      const url = await studioUrl({ view: "settings" });
      if (!supportsUi(server)) await openInBrowser(url);
      return uiOk(`Vyybe settings are open${supportsUi(server) ? " below" : " in the browser"}. Browser link (works while this chat is open): ${url}`, { view: "settings" });
    }),
  );

  // ---- projects ----

  server.registerTool(
    "list_projects",
    {
      title: "List projects",
      description: "Find existing Vyybe projects (most recent first). Use when the user refers to a previous creation.",
      inputSchema: z.object({ query: z.string().optional(), limit: z.number().int().max(50).optional() }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      _meta: MODEL_ONLY,
    },
    mwrap(async ({ query, limit }) => {
      const list = store.listProjects(query, limit ?? 15);
      if (!list.length) return ok(query ? `No projects match "${query}".` : "No projects yet.");
      return ok(list.map((p) => `${p.id} — "${p.name}", ${p.frames} frames (${p.size})${p.branding ? `, ${p.branding}` : ""}, updated ${p.updatedAt.slice(0, 16).replace("T", " ")}`).join("\n"), { projects: list });
    }),
  );

  server.registerTool(
    "create_project",
    {
      title: "Create a Vyybe project",
      description:
        "Create a project and (ideally) all its frames in one call, then render them and run layout checks. Returns a preview image + issues. A carousel = ordered frames; a collection = independent designs/variants (thumbnail options, ad set, multi-size campaign). The theme comes from: style preset → branding (default branding applies automatically) → your theme overrides.",
      inputSchema: z.object({
        name: z.string().min(1).max(80).describe('Human name, e.g. "Codex VPS carousel".'),
        kind: z.enum(["carousel", "collection"]).optional().describe("carousel (default): ordered slides. collection: variants / separate designs."),
        brief: z.string().max(2000).optional().describe("The brief in a few lines (audience, goal, CTA, key points, sources). Stored for later edits."),
        caption: z.string().max(200).optional().describe("The video title / post caption that will sit next to the visual (used in feed previews)."),
        handle: z.string().max(60).optional().describe("Account name for feed previews (defaults to the branding handle)."),
        branding: z.string().optional().describe('Saved branding id/name to apply. Omit to use the default branding (if any); "none" for no branding.'),
        style: z.string().optional().describe("Style preset id to start from (theme + direction), e.g. tech-editorial. See get_style."),
        theme: ThemeSchema.partial().optional().describe("Theme overrides/additions (colors, fonts, radius, css). Merged on top of style and branding."),
        frames: z.array(FrameInput).max(30).optional().describe("Frames to create right away (recommended)."),
        preview: PreviewMode,
        ...sizeFields,
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
      _meta: MODEL_ONLY,
    },
    mwrap(async (args) => {
      const size = resolveSize(args);
      const { theme, branding, style, notes } = themeForProject(args);
      const p = store.createProject({ name: args.name, kind: args.kind, brief: args.brief, defaultSize: size, caption: args.caption, handle: args.handle?.replace(/^@/, ""), theme, branding: branding ? { id: branding.id, name: branding.name, version: branding.version } : null });
      if (branding) store.updateProjectMeta(p.id, { logos: brands.copyLogosIntoProject(branding, p.id) });
      const written = args.frames?.length ? await writeFrames(p.id, args.frames, size) : [];
      const fresh = store.loadProject(p.id);
      const lines = [projectSummary(fresh), ...notes];
      if (style) lines.push(`Style: ${style.name}.`);
      lines.push(`Theme: ${describeTheme(fresh.theme)}`);
      if (fresh.logos && Object.keys(fresh.logos).length) lines.push(`Logos for <vy-logo variant="…">: ${Object.keys(fresh.logos).join(", ")}`);
      const warnings = written.flatMap((w) => w.warnings.map((x) => `${w.id}: ${x}`));
      if (warnings.length) lines.push(`Sanitizer notes:\n  ${warnings.join("\n  ")}`);
      let images: { data: Buffer; mime: string }[] = [];
      if (written.length) {
        const pr = await previewResult(p.id, written.map((w) => w.id), args.preview ?? "sheet");
        images = pr.images;
        lines.push(`Frames:\n${frameList(fresh)}`, issueLines(pr.renders));
      } else {
        lines.push("No frames yet — add them with write_frames.");
      }
      lines.push(`Folder: ${tildify(store.projectDir(p.id))}`);
      return ok(lines.join("\n"), { projectId: p.id, frames: fresh.frames.map((f) => ({ id: f.id, name: f.name, revision: f.revision })) }, images);
    }),
  );

  server.registerTool(
    "write_frames",
    {
      title: "Add or update frames",
      description:
        "Create new frames or update existing ones (full html, or cheap find/replace edits), then re-render only those frames and run checks. Other frames are never touched. If the user edited a frame in the studio, read_frame first.",
      inputSchema: z.object({ projectId: z.string(), frames: z.array(FrameInput).min(1).max(30), preview: PreviewMode }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
      _meta: MODEL_ONLY,
    },
    mwrap(async ({ projectId, frames, preview }) => {
      const p = store.loadProject(projectId);
      const first = p.frames[0];
      const fallback = p.defaultSize ?? (first ? { width: first.width, height: first.height, format: first.format } : resolveSize({}));
      const written = await writeFrames(projectId, frames, fallback);
      const pr = await previewResult(projectId, written.map((w) => w.id), preview ?? "sheet");
      const fresh = store.loadProject(projectId);
      const warnings = written.flatMap((w) => w.warnings.map((x) => `${w.id}: ${x}`));
      const lines = [
        projectSummary(fresh),
        `Wrote: ${written.map((w) => `${w.id} "${w.name}" → rev ${w.revision}${w.created ? " (new)" : ""}`).join(", ")}`,
        ...(warnings.length ? [`Sanitizer notes:\n  ${warnings.join("\n  ")}`] : []),
        issueLines(pr.renders),
      ];
      return ok(lines.join("\n"), { projectId, written }, pr.images);
    }),
  );

  server.registerTool(
    "get_project",
    {
      title: "Get project",
      description: "Project overview: frames (ids, names, sizes, revisions, who edited last), theme tokens, logos, assets with credits, brief, folder path.",
      inputSchema: z.object({ projectId: z.string() }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      _meta: MODEL_ONLY,
    },
    mwrap(async ({ projectId }) => {
      const p = store.loadProject(projectId);
      const assets = store.listAssets(projectId);
      const lines = [
        projectSummary(p),
        p.brief ? `Brief: ${p.brief}` : "",
        `Frames (in order):\n${frameList(p) || "  (none)"}`,
        `Theme: ${describeTheme(p.theme)}`,
        p.logos && Object.keys(p.logos).length ? `Logos: ${Object.keys(p.logos).join(", ")}` : "",
        assets.length ? `Assets:\n${assets.map((a) => `  asset:${a.file} (${a.source}${a.credit ? `, ${a.credit}` : ""}${a.prompt ? `, prompt: ${a.prompt.slice(0, 80)}` : ""})`).join("\n")}` : "Assets: none",
        `Folder: ${tildify(store.projectDir(projectId))} (frames/<id>.html)`,
      ].filter(Boolean);
      return ok(lines.join("\n"), { project: p, assets });
    }),
  );

  server.registerTool(
    "read_frame",
    {
      title: "Read frame HTML",
      description: "Get the current HTML of one frame (including the user's manual edits from the studio), or an older revision.",
      inputSchema: z.object({ projectId: z.string(), frameId: z.string(), revision: z.number().int().optional() }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      _meta: MODEL_ONLY,
    },
    mwrap(async ({ projectId, frameId, revision }) => {
      const p = store.loadProject(projectId);
      const f = store.getFrame(p, frameId);
      const html = revision && revision !== f.revision ? store.readFrameRevision(projectId, frameId, revision) : store.readFrameHtml(projectId, frameId);
      return ok(`Frame ${f.id} "${f.name}" ${f.width}×${f.height}, revision ${revision ?? f.revision}${f.lastEditBy === "user" ? " (last edited by the user)" : ""}:\n\n${html}`, { frameId, revision: revision ?? f.revision, html });
    }),
  );

  const manageFramesSchema = z.object({
    projectId: z.string(),
    action: z.enum(["reorder", "delete", "duplicate", "rename", "restore"]),
    frameId: z.string().optional(),
    order: z.array(z.string()).optional().describe("reorder: full list of frame ids in the new order."),
    name: z.string().optional().describe("rename: new name."),
    revision: z.number().int().optional().describe("restore: older revision number to bring back."),
  });
  const manageFrames = mwrap(async (args: z.infer<typeof manageFramesSchema>) => {
    const { projectId, action, frameId } = args;
    let p: store.Project;
    let note = "";
    if (action === "reorder") {
      if (!args.order?.length) throw new VyybeError("BAD_INPUT", "reorder needs order.");
      p = store.reorderFrames(projectId, args.order);
    } else if (action === "delete") {
      p = store.deleteFrame(projectId, frameId!);
      note = `Deleted ${frameId} (a backup is kept in .history).`;
    } else if (action === "duplicate") {
      const r = store.duplicateFrame(projectId, frameId!);
      p = r.project;
      note = `Duplicated ${frameId} as ${r.newId}.`;
    } else if (action === "rename") {
      const cur = store.loadProject(projectId);
      store.getFrame(cur, frameId!);
      await store.writeFrame(projectId, { id: frameId, name: args.name }, "agent", { width: 0, height: 0 });
      p = store.loadProject(projectId);
    } else {
      const html = store.readFrameRevision(projectId, frameId!, args.revision!);
      const cur = store.getFrame(store.loadProject(projectId), frameId!);
      await store.writeFrame(projectId, { id: frameId, html }, "agent", { width: cur.width, height: cur.height, format: cur.format });
      p = store.loadProject(projectId);
      note = `Restored ${frameId} to the content of revision ${args.revision}.`;
    }
    return ok([note, projectSummary(p), frameList(p)].filter(Boolean).join("\n"), { projectId, revision: p.revision, frames: p.frames });
  });
  server.registerTool(
    "manage_frames",
    {
      title: "Reorder / delete / duplicate frames",
      description: "Structural changes: reorder, delete, duplicate, rename a frame, or restore an older revision.",
      inputSchema: manageFramesSchema,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
      _meta: { ui: { visibility: ["model", "app"] } },
    },
    manageFrames as any,
  );

  server.registerTool(
    "update_theme",
    {
      title: "Update project theme",
      description: "Change a project's colors/fonts/radius or apply a saved branding / style to it. All frames re-render with the new tokens (frame HTML is unchanged).",
      inputSchema: z.object({ projectId: z.string(), theme: ThemeSchema.partial().optional(), branding: z.string().optional(), style: z.string().optional(), preview: PreviewMode }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
      _meta: MODEL_ONLY,
    },
    mwrap(async ({ projectId, theme, branding, style, preview }) => {
      const p = store.loadProject(projectId);
      let next = p.theme;
      let brandRef = p.branding;
      let logos = p.logos;
      if (style) {
        const s = getStyle(style);
        if (!s) throw new VyybeError("UNKNOWN_STYLE", `Unknown style "${style}".`);
        next = structuredClone(s.theme);
      }
      if (branding) {
        const b = brands.getBranding(branding);
        next = mergeTheme(next, b.theme);
        brandRef = { id: b.id, name: b.name, version: b.version };
        logos = { ...(logos ?? {}), ...brands.copyLogosIntoProject(b, projectId) };
      }
      if (theme) next = mergeTheme(next, theme as Theme);
      store.updateProjectMeta(projectId, { theme: next, branding: brandRef, logos });
      const pr = await previewResult(projectId, undefined, preview ?? "sheet");
      return ok([`Theme updated. ${describeTheme(next)}`, issueLines(pr.renders)].join("\n"), { projectId }, pr.images);
    }),
  );

  server.registerTool(
    "preview",
    {
      title: "Render preview",
      description: "Render frames and look at them: contact sheet, individual images, or in context (mock YouTube feed + 168px sidebar, Instagram feed + grid) — the best way to judge scroll-stopping power and legibility. write_frames already previews what it writes.",
      inputSchema: z.object({ projectId: z.string(), frameIds: z.array(z.string()).optional(), mode: z.enum(["sheet", "frames", "context"]).optional().describe("context = in a mock YouTube feed / Instagram feed at real viewing size") }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      _meta: MODEL_ONLY,
    },
    mwrap(async ({ projectId, frameIds, mode }) => {
      const pr = await previewResult(projectId, frameIds, mode ?? "sheet");
      return ok(issueLines(pr.renders), { projectId }, pr.images);
    }),
  );

  server.registerTool(
    "export",
    {
      title: "Export",
      description: "Export frames to files in the project's exports folder: png / jpg / webp (one file per frame), pdf (one page per frame — use for LinkedIn carousels), zip (all PNGs). Returns file paths.",
      inputSchema: z.object({
        projectId: z.string(),
        format: z.enum(["png", "jpg", "webp", "pdf", "zip"]),
        frameIds: z.array(z.string()).optional(),
        scale: z.number().min(1).max(3).optional().describe("Pixel density. 1 = exact platform size (default for images), 2 = retina."),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
      _meta: MODEL_ONLY,
    },
    mwrap(async ({ projectId, format, frameIds, scale }) => {
      const r = await exportProject(projectId, { format, frameIds, scale });
      return ok(`Exported ${r.files.length} file${r.files.length === 1 ? "" : "s"} to ${r.folder}:\n${r.files.map((f) => `  ${f.display} (${formatBytes(f.bytes)})`).join("\n")}`, { files: r.files.map((f) => f.path), folder: r.folder });
    }),
  );

  registerAppTool(
    server,
    "open_studio",
    {
      title: "Open Vyybe Studio",
      description:
        "Show the project in Vyybe Studio inside the chat: the user can preview every frame, edit text/colors/fonts, move/resize/reorder, replace images and download PNG/JPG/PDF/ZIP. Call this when presenting finished work. The user's edits are saved to the frame HTML.",
      inputSchema: z.object({ projectId: z.string(), frameId: z.string().optional().describe("Frame to focus first.") }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      _meta: uiMeta(),
    },
    wrap(async ({ projectId, frameId }) => {
      const p = store.loadProject(projectId);
      const url = await studioUrl({ view: "studio", projectId, frameId });
      const embedded = supportsUi(server);
      if (!embedded) await openInBrowser(url);
      return uiOk(
        `${projectSummary(p)}\nVyybe Studio is open ${embedded ? "in the chat" : "in the user's browser"}. If it doesn't show up, give the user this link (works while this chat session is running): ${url}\nProject folder: ${tildify(store.projectDir(projectId))}`,
        { view: "studio", projectId, frameId: frameId ?? null },
      );
    }),
  );

  // ---- options picker ----

  registerAppTool(
    server,
    "show_options",
    {
      title: "Show visual options",
      description:
        "Let the user pick visually between options (style directions, layout variants, thumbnail concepts, saved brandings) in an interactive gallery. Options can be style presets (styles), saved brandings (brandings), or your own mini-designs (options[].html). The choice comes back as a user message; if not, call get_choice. Only use when the user wants to choose/compare, or when a visual choice genuinely matters before investing in a full creation.",
      inputSchema: z.object({
        title: z.string().max(80).describe('e.g. "Pick a direction for your carousel"'),
        question: z.string().max(240).optional(),
        styles: z.array(z.string()).max(12).optional().describe("Style preset ids to show, rendered with your sampleCopy."),
        brandings: z.array(z.string()).max(8).optional().describe("Saved branding ids to show as options."),
        options: z
          .array(
            z.object({
              id: z.string().max(40),
              label: z.string().max(60),
              description: z.string().max(240).optional(),
              html: z.string().max(60_000).optional().describe("Mini-design frame HTML"),
              theme: z.object({ colors: z.record(z.string(), z.string()).optional(), fonts: z.record(z.string(), FontSpecSchema).optional(), radius: z.string().optional() }).optional(),
              ...sizeFields,
            }),
          )
          .max(8)
          .optional(),
        sampleCopy: z.object({ kicker: z.string().optional(), title: z.string().optional(), body: z.string().optional() }).optional().describe("Real copy to show inside style/branding previews."),
        multiple: z.boolean().optional().describe("Allow selecting several options."),
        projectId: z.string().optional().describe("Project whose theme/assets the custom options use."),
      }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      _meta: uiMeta(),
    },
    wrap(async (args) => {
      const options: PickerOption[] = [];
      const project = args.projectId ? store.loadProject(args.projectId) : null;
      for (const id of args.styles ?? []) {
        const s = getStyle(id);
        if (!s) throw new VyybeError("UNKNOWN_STYLE", `Unknown style "${id}".`, `Styles: ${STYLES.map((x) => x.id).join(", ")}`);
        options.push({ id: s.id, label: s.name, description: s.direction.split(". ").slice(0, 2).join(". ") + ".", html: fillSample(s.sample, args.sampleCopy ?? {}), theme: s.theme, width: 1080, height: 1350, styleId: s.id });
      }
      for (const id of args.brandings ?? []) {
        const b = brands.getBranding(id);
        const sample = fillSample(STYLES[0].sample.replace(/bg-line|border-line/g, "bg-muted/30"), args.sampleCopy ?? {});
        options.push({ id: b.id, label: b.name, description: b.description ?? b.styleGuide?.slice(0, 200), html: sample, theme: mergeTheme(DEFAULT_THEME, b.theme), width: 1080, height: 1350, brandingId: b.id });
      }
      for (const o of args.options ?? []) {
        const size = resolveSize(o, project?.frames[0] ?? { width: 1080, height: 1350 });
        options.push({ id: o.id, label: o.label, description: o.description, html: o.html, theme: o.theme ? mergeTheme(project?.theme ?? DEFAULT_THEME, o.theme as Theme) : project?.theme ?? DEFAULT_THEME, width: size.width, height: size.height });
      }
      if (options.length < 2) throw new VyybeError("BAD_INPUT", "Give at least 2 options (styles, brandings and/or options).");
      const picker = createPicker({ title: args.title, question: args.question, multiple: !!args.multiple, projectId: args.projectId, options });
      const url = await studioUrl({ view: "picker", pickerId: picker.id });
      const embedded = supportsUi(server);
      if (!embedded) await openInBrowser(url);
      return uiOk(
        `Showing ${options.length} options (picker ${picker.id}) ${embedded ? "in the chat" : "in the browser"}: ${options.map((o) => `${o.id} = ${o.label}`).join("; ")}.\nWait for the user's choice (it arrives as their next message). If they reply in text instead, use that. Link if it doesn't display: ${url}`,
        { view: "picker", pickerId: picker.id },
      );
    }),
  );

  server.registerTool(
    "get_choice",
    {
      title: "Get picker choice",
      description: "Read what the user selected in a show_options gallery (fallback when the selection didn't arrive as a message).",
      inputSchema: z.object({ pickerId: z.string() }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      _meta: MODEL_ONLY,
    },
    mwrap(async ({ pickerId }) => {
      const p = loadPicker(pickerId);
      if (!p.answer) return ok("The user hasn't picked anything yet.", { answered: false });
      const chosen = p.options.filter((o) => p.answer!.selected.includes(o.id));
      return ok(`User picked: ${chosen.map((o) => `${o.id} (${o.label})`).join(", ")}${p.answer.note ? `. Note: ${p.answer.note}` : ""}`, { answered: true, selected: p.answer.selected, note: p.answer.note });
    }),
  );

  // ---- styles, brandings ----

  server.registerTool(
    "get_style",
    {
      title: "Get style preset",
      description: "Full art direction, theme tokens and a sample frame for a style preset. Use it as a starting point or reference when designing.",
      inputSchema: z.object({ id: z.string() }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      _meta: MODEL_ONLY,
    },
    mwrap(async ({ id }) => {
      const s = getStyle(id);
      if (!s) throw new VyybeError("UNKNOWN_STYLE", `Unknown style "${id}".`, `Styles: ${STYLES.map((x) => x.id).join(", ")}`);
      return ok(`${s.name} (${s.id}) — ${s.tags.join(", ")}\n\nDirection: ${s.direction}\n\nTheme: ${JSON.stringify(s.theme)}\n\nSample cover (1080x1350):\n${s.sample}`, { style: s });
    }),
  );

  server.registerTool(
    "get_branding",
    {
      title: "Get branding",
      description: "Full details of a saved branding: tokens, fonts, logos, art direction, voice, handle, example creations.",
      inputSchema: z.object({ id: z.string().describe("Branding id or name.") }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      _meta: MODEL_ONLY,
    },
    mwrap(async ({ id }) => {
      const b = brands.getBranding(id);
      return ok(JSON.stringify(brands.summarizeBranding(b, "full"), null, 2), { branding: b });
    }),
  );

  server.registerTool(
    "save_branding",
    {
      title: "Save branding",
      description:
        "Create or update a reusable branding (the user's memory for consistent creations): theme tokens, fonts, logos, art direction, voice, handle. Only call after the user explicitly asked to save/update it. Updates merge into the existing branding (matched by id or name).",
      inputSchema: z.object({
        id: z.string().optional().describe("Existing branding id to update."),
        name: z.string().max(60).optional().describe("Name (required for a new branding)."),
        description: z.string().max(400).optional(),
        theme: z.object({ colors: z.record(z.string(), z.string()).optional(), fonts: z.record(z.string(), FontSpecSchema).optional(), radius: z.string().optional(), css: z.string().optional() }).optional(),
        fromProject: z.string().optional().describe("Copy theme + logos from this project (e.g. after the user says 'save this look')."),
        styleGuide: z.string().max(4000).optional().describe("Art direction rules: layout, composition, imagery, textures, do / don't."),
        voice: z.string().max(1500).optional().describe("Tone of voice for copy."),
        handle: z.string().max(60).optional(),
        website: z.string().max(200).optional(),
        logos: z.array(z.object({ variant: z.string().describe("primary, mark, light, dark…"), source: z.string().describe("Local path, https URL, or asset:<file> from fromProject/projectId.") })).optional(),
        removeLogos: z.array(z.string()).optional(),
        examples: z.array(z.object({ project: z.string(), frame: z.string(), note: z.string().optional() })).optional(),
        isDefault: z.boolean().optional().describe("Make it the default branding for new projects."),
        projectId: z.string().optional().describe("Project whose assets logo sources refer to."),
        expectedVersion: z.number().int().optional(),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
      _meta: MODEL_ONLY,
    },
    mwrap(async (args) => {
      let theme = args.theme as Partial<Theme> | undefined;
      let logos = args.logos;
      const assetProject = args.projectId ?? args.fromProject;
      if (args.fromProject) {
        const p = store.loadProject(args.fromProject);
        theme = mergeTheme(p.theme, theme as Theme);
        if (!logos && p.logos) logos = Object.entries(p.logos).map(([variant, file]) => ({ variant, source: `asset:${file}` }));
      }
      const isFirst = brands.listBrandings().length === 0;
      const { branding, created } = await brands.saveBranding({ ...args, theme, logos, isDefault: args.isDefault ?? (isFirst ? true : undefined) }, assetProject);
      return ok(
        `${created ? "Created" : "Updated"} branding "${branding.name}" (id: ${branding.id}, version ${branding.version})${branding.isDefault ? " — default for new projects" : ""}.\n${describeTheme(branding.theme)}\nLogos: ${Object.keys(branding.logos).join(", ") || "none"}`,
        { branding: brands.summarizeBranding(branding, "brief") },
      );
    }),
  );

  server.registerTool(
    "delete_branding",
    {
      title: "Delete branding",
      description: "Delete a saved branding (moved to ~/Vyybe/.vyybe/trash). Only when the user explicitly asks. Existing projects keep their snapshot.",
      inputSchema: z.object({ id: z.string() }),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
      _meta: MODEL_ONLY,
    },
    mwrap(async ({ id }) => {
      brands.deleteBranding(id);
      return ok(`Deleted branding "${id}".`);
    }),
  );

  // ---- assets ----

  server.registerTool(
    "search_icons",
    {
      title: "Search icons",
      description: 'Find icons for <vy-icon name="…">: 2000 Lucide line icons (lucide:name) and 3400 brand logos (brand:slug, e.g. brand:github). Returns refs to use directly — no SVG tokens needed.',
      inputSchema: z.object({ query: z.string(), library: z.enum(["lucide", "brand", "all"]).optional(), limit: z.number().int().max(60).optional() }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      _meta: MODEL_ONLY,
    },
    mwrap(async ({ query, library, limit }) => {
      const hits = searchIcons(query, { library, limit });
      if (!hits.length) return ok(`No icons for "${query}". Try a simpler word (e.g. "chart", "lock", "user").`);
      return ok(hits.map((h) => `${h.ref}${h.brandColor ? ` (${h.label}, brand color ${h.brandColor})` : h.tags?.length ? ` — ${h.tags.join(", ")}` : ""}`).join("\n"), { icons: hits });
    }),
  );

  server.registerTool(
    "search_fonts",
    {
      title: "Search fonts",
      description: "Search Google Fonts (any family listed works in a theme and is downloaded automatically). Filter by name and/or category (sans-serif, serif, display, handwriting, monospace).",
      inputSchema: z.object({ query: z.string().optional(), category: z.string().optional(), limit: z.number().int().max(50).optional() }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      _meta: MODEL_ONLY,
    },
    mwrap(async ({ query, category, limit }) => {
      const list = await searchFonts(query, category, limit ?? 15);
      if (!list.length) return ok("No fonts found (or offline). Popular safe choices: Inter, Inter Tight, DM Sans, Plus Jakarta Sans, Space Grotesk, Sora, Archivo, Instrument Serif, Fraunces, Playfair Display, JetBrains Mono, Caveat.");
      return ok(list.map((f) => `${f.family} — ${f.category}, weights ${f.weights.join("/")}${f.italic ? ", italic" : ""}`).join("\n"), { fonts: list });
    }),
  );

  server.registerTool(
    "generate_image",
    {
      title: "Generate image",
      description:
        "Generate an image with the user's configured provider (OpenAI GPT Image, Gemini, fal.ai or Replicate — automatic fallback) and save it as a project asset (asset:<file>). Costs the user API credits: generate only what the design needs. If you have your own native image generation tool, prefer it and import the file with import_asset.",
      inputSchema: z.object({
        projectId: z.string(),
        prompt: z.string().min(3).max(4000).describe("Detailed visual prompt. Describe subject, composition, lighting, style, palette (use theme colors), and leave negative space where text will go. Never ask for text in the image unless essential."),
        aspect: z.string().optional().describe('Aspect ratio like "4:5", "16:9", "1:1", "9:16".'),
        name: z.string().optional().describe("File name hint, e.g. hero-server-room."),
        provider: z.enum(["auto", "openai", "gemini", "fal", "replicate"]).optional(),
        references: z.array(z.string()).optional().describe("Project asset files to use as visual references (product shots, the user's face, logo) — OpenAI/Gemini only."),
        transparent: z.boolean().optional().describe("Transparent background (OpenAI only) for cut-out subjects/stickers."),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
      _meta: MODEL_ONLY,
    },
    mwrap(async (args) => {
      const r = await generateImage(args);
      return ok(`Generated asset:${r.asset.file} with ${r.provider} (${r.model}).${r.notes.length ? ` Fallbacks: ${r.notes.join("; ")}` : ""}\nUse it as <img src="asset:${r.asset.file}" class="absolute inset-0 size-full object-cover">.`, { asset: r.asset }, [
        { data: fs.readFileSync(store.assetPath(args.projectId, r.asset.file)!), mime: r.asset.file.endsWith(".png") ? "image/png" : r.asset.file.endsWith(".webp") ? "image/webp" : "image/jpeg" },
      ].filter((i) => i.data.length < 4_000_000));
    }),
  );

  server.registerTool(
    "find_logo",
    {
      title: "Find a brand logo",
      description:
        "Find real logos for a company/product (OpenAI, Notion, a client…): bundled brand icons, Wikimedia Commons SVGs, and the brand's own website icons. Returns a numbered grid (on light and dark) to look at; use a vy-icon ref directly, or import_asset {url} the one you pick. Use whenever a design mentions a real product or company.",
      inputSchema: z.object({ brand: z.string().min(1).max(80), domain: z.string().max(120).optional().describe("Brand website, e.g. openai.com (adds its official icons)"), limit: z.number().int().min(1).max(10).optional() }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
      _meta: MODEL_ONLY,
    },
    mwrap(async ({ brand, domain, limit }) => {
      const r = await findLogo(brand, { domain, limit });
      if (!r.candidates.length) return ok(`No logo found for "${brand}". Try the official domain (domain: "example.com"), capture_webpage of their site, or draw a simple wordmark with type.`);
      return ok(
        `${r.candidates.length} logo candidates for "${brand}" (each shown on white and on black):\n${r.candidates.map((c) => `${c.n}. ${c.label} — ${c.ref ? `<vy-icon name="${c.ref}">` : `import_asset {url: "${c.url}"}`}${c.license ? ` (${c.license})` : ""}`).join("\n")}\nPick the current, cleanest version (SVG preferred). Logos are trademarks: use them to reference the product, unaltered.`,
        undefined,
        r.grid ? [{ data: r.grid, mime: "image/jpeg" }] : [],
      );
    }),
  );

  server.registerTool(
    "capture_webpage",
    {
      title: "Screenshot a web page",
      description:
        "Screenshot a public web page into the project as an image asset — a product's real UI or landing page, a GitHub repo, an article, a tweet. Great for tech/product content (show the real thing, then crop/frame it in a device or browser mock). Returns the asset and a preview.",
      inputSchema: z.object({
        projectId: z.string(),
        url: z.string().url(),
        width: z.number().int().min(320).max(2560).optional().describe("Viewport width (default 1440; 390 for mobile view)"),
        height: z.number().int().min(320).max(4000).optional().describe("Viewport height (default 900)"),
        fullPage: z.boolean().optional(),
        name: z.string().optional(),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
      _meta: MODEL_ONLY,
    },
    mwrap(async ({ projectId, url, width, height, fullPage, name }) => {
      store.loadProject(projectId);
      const r = await captureWebpage(projectId, url, { width, height, fullPage, name });
      return ok(`Captured ${url} as asset:${r.asset.file} (${(width ?? 1440)}px wide, 2x). Crop it with an overflow-hidden container + object-cover/object-position, or frame it in a browser/phone mock.`, undefined, [{ data: r.preview, mime: "image/jpeg" }]);
    }),
  );

  server.registerTool(
    "search_photos",
    {
      title: "Search stock photos",
      description: "Search free stock photos (Pexels / Unsplash with keys, Openverse CC images otherwise). Returns a numbered thumbnail grid to look at plus ids; import the chosen one with import_asset {photoId}. Credits are recorded automatically.",
      inputSchema: z.object({ query: z.string().min(2), orientation: z.enum(["landscape", "portrait", "square"]).optional(), limit: z.number().int().min(3).max(15).optional() }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
      _meta: MODEL_ONLY,
    },
    mwrap(async ({ query, orientation, limit }) => {
      const { provider, results } = await searchPhotos(query, { orientation, limit: limit ?? 9 });
      if (!results.length) return ok(`No photos for "${query}" on ${provider}. Try broader words.`);
      const grid = await photoGrid(results);
      return ok(
        `${results.length} photos from ${provider}:\n${results.map((r, i) => `${i + 1}. ${r.id} — ${r.description.slice(0, 80) || "(no description)"} — ${r.width}x${r.height} — ${r.credit}`).join("\n")}`,
        { results },
        grid ? [{ data: grid, mime: "image/jpeg" }] : [],
      );
    }),
  );

  server.registerTool(
    "import_asset",
    {
      title: "Import asset",
      description: "Copy an image into the project (from a local file path — e.g. the user's photo, logo, or an image your native tool generated — an https URL, or a search_photos id). Returns asset:<file> to use in frames.",
      inputSchema: z.object({
        projectId: z.string(),
        path: z.string().optional(),
        url: z.string().optional(),
        photoId: z.string().optional(),
        name: z.string().optional(),
        credit: z.string().optional().describe("Attribution / source, kept in the project."),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
      _meta: MODEL_ONLY,
    },
    mwrap(async ({ projectId, path: p, url, photoId, name, credit }) => {
      let a: store.AssetMeta;
      if (photoId) a = await importPhoto(projectId, photoId, name);
      else if (url) a = await store.importAssetFromUrl(projectId, url, { name, credit });
      else if (p) a = store.importAssetFromPath(projectId, p, { name, credit });
      else throw new VyybeError("BAD_INPUT", "Give path, url or photoId.");
      return ok(`Imported as asset:${a.file}${a.credit ? ` (${a.credit})` : ""}.`, { asset: a });
    }),
  );

  // ---------- app-only tools (called by the studio UI) ----------

  for (const [name, def] of Object.entries(appHandlers())) {
    server.registerTool(name, { title: name, description: def.description, inputSchema: def.schema, _meta: APP_ONLY }, wrap(def.handler as any) as any);
  }
}

// App handlers are shared by the MCP Apps bridge and the local browser bridge.
export function appHandlers(): Record<string, { description: string; schema: z.ZodObject<any>; handler: (args: any) => Promise<ToolResult> }> {
  return {
    studio_load: {
      description: "Load everything the studio needs for a project.",
      schema: z.object({ projectId: z.string() }),
      handler: async ({ projectId }) => {
        const bundle = await studioBundle(projectId);
        return ok(`Loaded ${projectId}`, bundle as any);
      },
    },
    studio_poll: {
      description: "Check whether a project changed.",
      schema: z.object({ projectId: z.string(), revision: z.number().int() }),
      handler: async ({ projectId, revision }) => {
        const p = store.loadProject(projectId);
        return ok(p.revision === revision ? "unchanged" : "changed", { changed: p.revision !== revision, revision: p.revision });
      },
    },
    studio_save_frame: {
      description: "Save a frame edited in the studio.",
      schema: z.object({ projectId: z.string(), frameId: z.string(), html: z.string().max(4_000_000), baseRevision: z.number().int(), width: z.number().int().optional(), height: z.number().int().optional() }),
      handler: async ({ projectId, frameId, html, baseRevision, width, height }) => {
        const p = store.loadProject(projectId);
        const f = store.getFrame(p, frameId);
        const assetsBack = restoreAssetRefs(projectId, html);
        const size = width && height ? { width, height } : { width: f.width, height: f.height, format: f.format };
        const r = await store.writeFrame(projectId, { id: frameId, html: assetsBack, baseRevision, ...(width && height ? { width, height } : {}) }, "user", size);
        const fresh = store.loadProject(projectId);
        return ok(`Saved ${frameId} rev ${r.revision}`, { revision: r.revision, projectRevision: fresh.revision, warnings: r.warnings });
      },
    },
    studio_frames: {
      description: "Reorder / duplicate / delete frames from the studio.",
      schema: z.object({ projectId: z.string(), action: z.enum(["reorder", "delete", "duplicate", "rename"]), frameId: z.string().optional(), order: z.array(z.string()).optional(), name: z.string().optional() }),
      handler: async ({ projectId, action, frameId, order, name }) => {
        let p: store.Project;
        if (action === "reorder") p = store.reorderFrames(projectId, order ?? []);
        else if (action === "delete") p = store.deleteFrame(projectId, frameId);
        else if (action === "duplicate") p = store.duplicateFrame(projectId, frameId).project;
        else {
          const cur = store.getFrame(store.loadProject(projectId), frameId);
          await store.writeFrame(projectId, { id: frameId, name }, "user", { width: cur.width, height: cur.height, format: cur.format });
          p = store.loadProject(projectId);
        }
        return ok("ok", { revision: p.revision });
      },
    },
    studio_export: {
      description: "Export from the studio; returns the files (base64 when small enough to download through the host).",
      schema: z.object({ projectId: z.string(), format: z.enum(["png", "jpg", "webp", "pdf", "zip"]), frameIds: z.array(z.string()).optional(), scale: z.number().min(1).max(3).optional(), inline: z.boolean().optional() }),
      handler: async ({ projectId, format, frameIds, scale, inline }) => {
        const r = await exportProject(projectId, { format, frameIds, scale });
        let total = 0;
        const files = r.files.map((f) => {
          total += f.bytes;
          return { name: path.basename(f.path), path: f.path, display: f.display, bytes: f.bytes, mime: f.mime, data: inline && total < 40_000_000 ? fs.readFileSync(f.path).toString("base64") : undefined };
        });
        return ok(`Exported to ${r.folder}`, { folder: r.folder, files });
      },
    },
    studio_reveal: {
      description: "Reveal an exported file or folder in Finder / Explorer.",
      schema: z.object({ path: z.string() }),
      handler: async ({ path: p }) => {
        const full = path.resolve(p.replace(/^~(?=\/|$)/, process.env.HOME ?? "~"));
        if (!insideDir(lib.root(), full) && full !== lib.root()) throw new VyybeError("FORBIDDEN", "Can only reveal files in the Vyybe library.");
        const cmd = process.platform === "darwin" ? ["open", ["-R", full]] : process.platform === "win32" ? ["explorer", [`/select,${full}`]] : ["xdg-open", [path.dirname(full)]];
        execFile(cmd[0] as string, cmd[1] as string[], () => {});
        return ok("revealed");
      },
    },
    studio_upload: {
      description: "Add an image the user dropped into the studio to the project assets.",
      schema: z.object({ projectId: z.string(), name: z.string().max(120), data: z.string().max(36_000_000) }),
      handler: async ({ projectId, name, data }) => {
        const a = store.saveAssetBuffer(projectId, Buffer.from(data.replace(/^data:[^,]+,/, ""), "base64"), { source: "upload", name });
        return ok(`asset:${a.file}`, { file: a.file, dataUri: readAssetDataUri(projectId, a.file) });
      },
    },
    studio_asset: {
      description: "Get an asset as a data URI.",
      schema: z.object({ projectId: z.string(), file: z.string() }),
      handler: async ({ projectId, file }) => ok(file, { file, dataUri: readAssetDataUri(projectId, file) }),
    },
    studio_icons: {
      description: "Search icons for the studio icon picker.",
      schema: z.object({ query: z.string().max(60) }),
      handler: async ({ query }) => {
        const hits = searchIcons(query, { limit: 24 });
        return ok("icons", { icons: hits.map((h) => ({ ref: h.ref, label: h.label, svg: iconSvg(h.ref) ?? "" })) });
      },
    },
    picker_load: {
      description: "Load a picker's options with rendered previews.",
      schema: z.object({ pickerId: z.string() }),
      handler: async ({ pickerId }) => {
        const p = loadPicker(pickerId);
        const fontMap = new Map<string, any>();
        const options = [];
        for (const o of p.options) {
          const theme = o.theme ?? DEFAULT_THEME;
          const c = o.html ? await composeLoose(o.html, theme, { projectId: p.projectId }) : null;
          for (const f of c?.faces ?? []) fontMap.set(`${f.family}|${f.weight}|${f.style}|${f.unicodeRange}`, { family: f.family, weight: String(f.weight), style: f.style, unicodeRange: f.unicodeRange, data: fileBase64(f.file) });
          options.push({ id: o.id, label: o.label, description: o.description, width: o.width ?? 1080, height: o.height ?? 1350, html: c?.html ?? "", css: c?.css ?? "", styleId: o.styleId, brandingId: o.brandingId });
        }
        return ok(`picker ${pickerId}`, { picker: { id: p.id, title: p.title, question: p.question, multiple: p.multiple, answer: p.answer }, options, fonts: [...fontMap.values()] });
      },
    },
    picker_submit: {
      description: "Record the user's choice in a picker.",
      schema: z.object({ pickerId: z.string(), selected: z.array(z.string()).min(1), note: z.string().max(1000).optional() }),
      handler: async ({ pickerId, selected, note }) => {
        const p = answerPicker(pickerId, selected, note);
        return ok("saved", { answer: p.answer });
      },
    },
    settings_load: {
      description: "Provider status for the settings panel (never returns keys).",
      schema: z.object({}),
      handler: async () => {
        const status = await providerStatus();
        const cfg = readConfig();
        const renderer = await rendererStatus();
        return ok("settings", {
          providers: (Object.keys(PROVIDERS) as ProviderId[]).map((id) => ({ id, label: PROVIDERS[id].label, kind: PROVIDERS[id].kind, url: PROVIDERS[id].url, configured: status[id] })),
          imageProvider: cfg.imageProvider ?? "auto",
          renderer: renderer.available,
          library: tildify(lib.root()),
          configuredImage: await availableImageProviders(),
        });
      },
    },
    settings_save: {
      description: "Store an API key or preference from the settings panel.",
      schema: z.object({ provider: z.string().optional(), key: z.string().max(400).nullable().optional(), imageProvider: z.enum(["auto", "openai", "gemini", "fal", "replicate"]).optional() }),
      handler: async ({ provider, key, imageProvider }) => {
        if (provider) {
          if (!(provider in PROVIDERS)) throw new VyybeError("BAD_INPUT", "Unknown provider.");
          await setKey(provider as ProviderId, key ? key.trim() : null);
        }
        if (imageProvider) writeConfig({ imageProvider });
        return ok("saved");
      },
    },
  };
}

/** The studio sends back display HTML with inlined data: URIs — turn them back into asset: refs. */
function restoreAssetRefs(projectId: string, html: string): string {
  if (!html.includes("data:")) return html;
  let out = html;
  for (const a of store.listAssets(projectId)) {
    const uri = readAssetDataUri(projectId, a.file);
    if (uri && out.includes(uri)) out = out.split(uri).join(`asset:${a.file}`);
  }
  // Any remaining large data: image (e.g. pasted) becomes a real asset.
  out = out.replace(/data:image\/(png|jpeg|webp|gif|svg\+xml);base64,([A-Za-z0-9+/=]{2000,})/g, (_m, _t, b64) => {
    const a = store.saveAssetBuffer(projectId, Buffer.from(b64, "base64"), { source: "upload", name: "pasted" });
    return `asset:${a.file}`;
  });
  return out;
}
