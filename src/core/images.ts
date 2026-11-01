import fs from "node:fs";
import { getKey, readConfig, type ProviderId } from "./secrets.js";
import { saveAssetBuffer, assetPath, importAssetFromUrl, type AssetMeta } from "./store.js";
import { fetchRemote } from "./net.js";
import { VyybeError, sniffImage } from "./util.js";
import { renderFrameDoc } from "./render.js";

export type ImageProvider = "openai" | "gemini" | "fal" | "replicate";
const WATERFALL: ImageProvider[] = ["openai", "gemini", "fal", "replicate"];

const DEFAULT_MODELS: Record<ImageProvider, string[]> = {
  openai: ["gpt-image-2", "gpt-image-1.5", "gpt-image-1"],
  gemini: ["gemini-3.1-flash-image-preview", "gemini-3-pro-image-preview", "gemini-2.5-flash-image"],
  fal: ["fal-ai/flux-pro/v1.1"],
  replicate: ["black-forest-labs/flux-1.1-pro"],
};

export interface GenerateInput {
  projectId: string;
  prompt: string;
  /** Target aspect, e.g. "4:5", "16:9", "1:1". */
  aspect?: string;
  name?: string;
  provider?: ImageProvider | "auto";
  /** Project assets to use as visual references (supported by OpenAI and Gemini). */
  references?: string[];
  transparent?: boolean;
}

export async function availableImageProviders(): Promise<ImageProvider[]> {
  const out: ImageProvider[] = [];
  for (const p of WATERFALL) if (await getKey(p as ProviderId)) out.push(p);
  return out;
}

function ratio(aspect?: string): number {
  const m = aspect?.match(/^(\d+(?:\.\d+)?)\s*[:x/]\s*(\d+(?:\.\d+)?)$/);
  return m ? Number(m[1]) / Number(m[2]) : 1;
}

function closest<T extends string>(options: T[], target: number, toRatio: (o: T) => number): T {
  return options.reduce((best, o) => (Math.abs(Math.log(toRatio(o) / target)) < Math.abs(Math.log(toRatio(best) / target)) ? o : best), options[0]);
}

async function openaiGenerate(key: string, model: string, input: GenerateInput): Promise<Buffer> {
  const sizes = ["1024x1024", "1536x1024", "1024x1536"];
  const size = closest(sizes, ratio(input.aspect), (s) => Number(s.split("x")[0]) / Number(s.split("x")[1]));
  const refs = (input.references ?? []).map((f) => assetPath(input.projectId, f)).filter(Boolean) as string[];
  let res: Response;
  if (refs.length) {
    const form = new FormData();
    form.append("model", model);
    form.append("prompt", input.prompt);
    form.append("size", size);
    form.append("quality", "high");
    if (input.transparent) form.append("background", "transparent");
    for (const r of refs) {
      const buf = fs.readFileSync(r);
      form.append("image[]", new Blob([buf], { type: sniffImage(buf) ?? "image/png" }), r.split("/").pop());
    }
    res = await fetch("https://api.openai.com/v1/images/edits", { method: "POST", headers: { Authorization: `Bearer ${key}` }, body: form, signal: AbortSignal.timeout(240000) });
  } else {
    res = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model, prompt: input.prompt, size, quality: "high", n: 1, ...(input.transparent ? { background: "transparent" } : {}) }),
      signal: AbortSignal.timeout(240000),
    });
  }
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new ProviderError(json?.error?.message ?? `HTTP ${res.status}`, res.status, /model/i.test(json?.error?.message ?? "") && res.status !== 401);
  const b64 = json?.data?.[0]?.b64_json;
  if (b64) return Buffer.from(b64, "base64");
  if (json?.data?.[0]?.url) return (await fetchRemote(json.data[0].url, 30e6)).buf;
  throw new ProviderError("No image in response", 500, false);
}

async function geminiGenerate(key: string, model: string, input: GenerateInput): Promise<Buffer> {
  const aspects = ["1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9"];
  const aspectRatio = closest(aspects, ratio(input.aspect), (a) => ratio(a));
  const parts: any[] = [{ text: input.prompt }];
  for (const f of input.references ?? []) {
    const p = assetPath(input.projectId, f);
    if (!p) continue;
    const buf = fs.readFileSync(p);
    parts.push({ inlineData: { mimeType: sniffImage(buf) ?? "image/png", data: buf.toString("base64") } });
  }
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST",
    headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
    body: JSON.stringify({ contents: [{ role: "user", parts }], generationConfig: { responseModalities: ["IMAGE"], imageConfig: { aspectRatio } } }),
    signal: AbortSignal.timeout(240000),
  });
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new ProviderError(json?.error?.message ?? `HTTP ${res.status}`, res.status, res.status === 404 || /not found|not supported/i.test(json?.error?.message ?? ""));
  const part = json?.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData?.data || p.inline_data?.data);
  const data = part?.inlineData?.data ?? part?.inline_data?.data;
  if (!data) throw new ProviderError(json?.candidates?.[0]?.finishReason ? `Blocked: ${json.candidates[0].finishReason}` : "No image in response", 500, false);
  return Buffer.from(data, "base64");
}

async function falGenerate(key: string, model: string, input: GenerateInput): Promise<Buffer> {
  const r = ratio(input.aspect);
  const width = Math.round((r >= 1 ? 1440 : 1440 * r) / 16) * 16;
  const height = Math.round((r >= 1 ? 1440 / r : 1440) / 16) * 16;
  const res = await fetch(`https://fal.run/${model}`, {
    method: "POST",
    headers: { Authorization: `Key ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: input.prompt, image_size: { width, height }, num_images: 1, output_format: "png" }),
    signal: AbortSignal.timeout(240000),
  });
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new ProviderError(json?.detail?.toString?.() ?? `HTTP ${res.status}`, res.status, res.status === 404);
  const url = json?.images?.[0]?.url;
  if (!url) throw new ProviderError("No image in response", 500, false);
  if (url.startsWith("data:")) return Buffer.from(url.split(",")[1], "base64");
  return (await fetchRemote(url, 30e6)).buf;
}

async function replicateGenerate(key: string, model: string, input: GenerateInput): Promise<Buffer> {
  const aspects = ["1:1", "16:9", "21:9", "3:2", "2:3", "4:5", "5:4", "3:4", "4:3", "9:16", "9:21"];
  const aspect_ratio = closest(aspects, ratio(input.aspect), (a) => ratio(a));
  const res = await fetch(`https://api.replicate.com/v1/models/${model}/predictions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", Prefer: "wait=60" },
    body: JSON.stringify({ input: { prompt: input.prompt, aspect_ratio, output_format: "png" } }),
    signal: AbortSignal.timeout(240000),
  });
  let json: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new ProviderError(json?.detail ?? `HTTP ${res.status}`, res.status, res.status === 404);
  for (let i = 0; i < 60 && json.status !== "succeeded" && json.status !== "failed" && json.urls?.get; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    json = await (await fetch(json.urls.get, { headers: { Authorization: `Bearer ${key}` } })).json();
  }
  if (json.status !== "succeeded") throw new ProviderError(json.error ?? `Prediction ${json.status}`, 500, false);
  const url = Array.isArray(json.output) ? json.output[0] : json.output;
  return (await fetchRemote(url, 30e6)).buf;
}

class ProviderError extends Error {
  constructor(message: string, public status: number, public modelProblem: boolean) {
    super(message);
  }
}

const RUNNERS: Record<ImageProvider, (key: string, model: string, input: GenerateInput) => Promise<Buffer>> = {
  openai: openaiGenerate,
  gemini: geminiGenerate,
  fal: falGenerate,
  replicate: replicateGenerate,
};

/**
 * Generate an image with the first configured provider (or the one requested),
 * falling back through models and providers, and save it as a project asset.
 */
export async function generateImage(input: GenerateInput): Promise<{ asset: AssetMeta; provider: ImageProvider; model: string; notes: string[] }> {
  const cfg = readConfig();
  const preferred = input.provider && input.provider !== "auto" ? input.provider : cfg.imageProvider && cfg.imageProvider !== "auto" ? cfg.imageProvider : null;
  const configured = await availableImageProviders();
  if (!configured.length) {
    throw new VyybeError(
      "PROVIDER_UNAVAILABLE",
      "No image generation provider is configured.",
      "Use your own native image tool if you have one and import the file with import_asset, or ask the user to add an API key via open_settings (OpenAI, Gemini, fal.ai or Replicate). Otherwise design with type, shapes, icons and photos.",
    );
  }
  const order = preferred ? [preferred, ...configured.filter((p) => p !== preferred)] : configured;
  const notes: string[] = [];
  for (const provider of order) {
    const key = await getKey(provider);
    if (!key) {
      notes.push(`${provider}: no API key`);
      continue;
    }
    const custom = cfg.imageModels?.[provider];
    const models = custom ? [custom, ...DEFAULT_MODELS[provider].filter((m) => m !== custom)] : DEFAULT_MODELS[provider];
    for (const model of models) {
      try {
        const buf = await RUNNERS[provider](key, model, input);
        const asset = saveAssetBuffer(input.projectId, buf, { source: "generated", provider, prompt: input.prompt, origin: model, name: input.name ?? "generated" });
        return { asset, provider, model, notes };
      } catch (err: any) {
        notes.push(`${provider}/${model}: ${String(err.message).slice(0, 160)}`);
        if (!(err instanceof ProviderError) || !err.modelProblem) break; // auth / quota / safety → next provider
      }
    }
  }
  throw new VyybeError("GENERATION_FAILED", `Image generation failed. ${notes.join(" | ")}`, "Simplify or rephrase the prompt (safety filters), check the API key/billing, or design without a generated image.");
}

// ---------- stock photos ----------

export interface PhotoResult {
  id: string;
  provider: "pexels" | "unsplash" | "openverse";
  thumb: string;
  download: string;
  width: number;
  height: number;
  description: string;
  credit: string;
  license: string;
  pageUrl: string;
  trackUrl?: string;
}

const photoMemo = new Map<string, PhotoResult>();

export async function searchPhotos(query: string, opts: { orientation?: "landscape" | "portrait" | "square"; limit?: number; provider?: "pexels" | "unsplash" | "openverse" } = {}): Promise<{ provider: string; results: PhotoResult[] }> {
  const limit = Math.min(opts.limit ?? 9, 20);
  const pexels = await getKey("pexels");
  const unsplash = await getKey("unsplash");
  const order = opts.provider ? [opts.provider] : [pexels ? "pexels" : null, unsplash ? "unsplash" : null, "openverse"].filter(Boolean) as string[];
  let lastErr = "";
  for (const provider of order) {
    try {
      let results: PhotoResult[] = [];
      if (provider === "pexels" && pexels) {
        const u = new URL("https://api.pexels.com/v1/search");
        u.searchParams.set("query", query);
        u.searchParams.set("per_page", String(limit));
        if (opts.orientation) u.searchParams.set("orientation", opts.orientation);
        const json: any = await (await fetch(u, { headers: { Authorization: pexels }, signal: AbortSignal.timeout(15000) })).json();
        results = (json.photos ?? []).map((p: any) => ({
          id: `pexels-${p.id}`, provider: "pexels", thumb: p.src.medium, download: p.src.large2x ?? p.src.original, width: p.width, height: p.height,
          description: p.alt ?? "", credit: `Photo by ${p.photographer} on Pexels`, license: "Pexels License (free to use, no attribution required)", pageUrl: p.url,
        }));
      } else if (provider === "unsplash" && unsplash) {
        const u = new URL("https://api.unsplash.com/search/photos");
        u.searchParams.set("query", query);
        u.searchParams.set("per_page", String(limit));
        if (opts.orientation) u.searchParams.set("orientation", opts.orientation === "square" ? "squarish" : opts.orientation);
        const json: any = await (await fetch(u, { headers: { Authorization: `Client-ID ${unsplash}`, "Accept-Version": "v1" }, signal: AbortSignal.timeout(15000) })).json();
        results = (json.results ?? []).map((p: any) => ({
          id: `unsplash-${p.id}`, provider: "unsplash", thumb: p.urls.small, download: `${p.urls.raw}&w=2160&q=85&fm=jpg`, width: p.width, height: p.height,
          description: p.alt_description ?? p.description ?? "", credit: `Photo by ${p.user?.name} on Unsplash`, license: "Unsplash License (free to use)", pageUrl: p.links?.html, trackUrl: p.links?.download_location,
        }));
      } else if (provider === "openverse") {
        const u = new URL("https://api.openverse.org/v1/images/");
        u.searchParams.set("q", query);
        u.searchParams.set("page_size", String(limit));
        u.searchParams.set("license_type", "commercial,modification");
        if (opts.orientation) u.searchParams.set("aspect_ratio", opts.orientation === "landscape" ? "wide" : opts.orientation === "portrait" ? "tall" : "square");
        const json: any = await (await fetch(u, { headers: { "User-Agent": "Vyybe/0.1" }, signal: AbortSignal.timeout(15000) })).json();
        results = (json.results ?? []).map((p: any) => ({
          id: `openverse-${p.id}`, provider: "openverse", thumb: p.thumbnail ?? p.url, download: p.url, width: p.width ?? 0, height: p.height ?? 0,
          description: p.title ?? "", credit: `"${p.title ?? "Untitled"}" by ${p.creator ?? "unknown"} (${(p.license ?? "").toUpperCase()} ${p.license_version ?? ""})`.trim(), license: `${p.license} ${p.license_version ?? ""} — ${p.license_url ?? ""}`, pageUrl: p.foreign_landing_url,
        }));
      }
      if (results.length) {
        for (const r of results) photoMemo.set(r.id, r);
        return { provider, results };
      }
    } catch (err: any) {
      lastErr = err.message;
    }
  }
  if (lastErr) throw new VyybeError("SEARCH_FAILED", `Photo search failed: ${lastErr}`);
  return { provider: order[0] ?? "none", results: [] };
}

/** Numbered thumbnail grid so the agent can look at search results in one image. */
export async function photoGrid(results: PhotoResult[]): Promise<Buffer | null> {
  const thumbs = await Promise.all(
    results.map(async (r) => {
      try {
        const { buf } = await fetchRemote(r.thumb, 3e6);
        return `data:${sniffImage(buf) ?? "image/jpeg"};base64,${buf.toString("base64")}`;
      } catch {
        return null;
      }
    }),
  );
  if (!thumbs.some(Boolean)) return null;
  const cols = 3;
  const cell = 300;
  const rows = Math.ceil(results.length / cols);
  const doc = `<!doctype html><html><head><style>body{margin:0;background:#222;font:600 16px system-ui;color:#fff}
  .g{display:grid;grid-template-columns:repeat(${cols},${cell}px);gap:8px;padding:8px}
  .c{position:relative;width:${cell}px;height:${cell}px;background:#333}
  .c img{width:100%;height:100%;object-fit:cover;display:block}
  .c span{position:absolute;left:6px;top:6px;background:#000c;padding:3px 8px;border-radius:6px}</style></head><body><div class="g">
  ${results.map((r, i) => `<div class="c">${thumbs[i] ? `<img src="${thumbs[i]}">` : ""}<span>${i + 1}</span></div>`).join("")}</div></body></html>`;
  const width = cols * cell + (cols + 1) * 8;
  const height = rows * cell + (rows + 1) * 8;
  return (await renderFrameDoc(doc, width, height, { format: "jpeg", quality: 75 })).image;
}

export async function importPhoto(projectId: string, photoId: string, name?: string): Promise<AssetMeta> {
  const r = photoMemo.get(photoId);
  if (!r) throw new VyybeError("PHOTO_NOT_FOUND", `Unknown photo id "${photoId}".`, "Run search_photos again in this session, then import by id.");
  if (r.trackUrl) {
    const key = await getKey("unsplash");
    fetch(r.trackUrl, { headers: { Authorization: `Client-ID ${key}` } }).catch(() => {});
  }
  return importAssetFromUrl(projectId, r.download, { source: "photo", credit: r.credit, license: r.license, name: name ?? r.description.slice(0, 40) ?? r.id, provider: r.provider });
}
