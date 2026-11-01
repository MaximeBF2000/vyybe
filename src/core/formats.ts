import { VyybeError } from "./util.js";

export interface FormatPreset {
  id: string;
  label: string;
  width: number;
  height: number;
  /** Areas the platform UI covers; keep text and key subjects out of them. */
  safe?: { top: number; right: number; bottom: number; left: number };
  notes: string;
}

export const FORMATS: FormatPreset[] = [
  { id: "instagram-portrait", label: "Instagram post / carousel 4:5", width: 1080, height: 1350, notes: "Best-performing feed format. Carousel slides share this size." },
  { id: "instagram-square", label: "Instagram square 1:1", width: 1080, height: 1080, notes: "Classic square post or carousel." },
  { id: "instagram-story", label: "Story / Reel cover 9:16", width: 1080, height: 1920, safe: { top: 250, right: 60, bottom: 340, left: 60 }, notes: "Top ~250px and bottom ~340px are covered by the platform UI." },
  { id: "tiktok-cover", label: "TikTok cover 9:16", width: 1080, height: 1920, safe: { top: 160, right: 140, bottom: 480, left: 60 }, notes: "Right edge has action buttons, bottom has the caption." },
  { id: "linkedin-portrait", label: "LinkedIn carousel / post 4:5", width: 1080, height: 1350, notes: "LinkedIn carousels are uploaded as a PDF document." },
  { id: "linkedin-square", label: "LinkedIn square", width: 1080, height: 1080, notes: "Square feed post or carousel." },
  { id: "linkedin-landscape", label: "LinkedIn landscape", width: 1200, height: 627, notes: "Link-share style image." },
  { id: "x-post", label: "X / Twitter image 16:9", width: 1600, height: 900, notes: "In-feed image." },
  { id: "x-header", label: "X / Twitter header", width: 1500, height: 500, safe: { top: 0, right: 0, bottom: 120, left: 240 }, notes: "Profile picture overlaps bottom-left." },
  { id: "facebook-post", label: "Facebook post", width: 1200, height: 1500, notes: "4:5 feed post." },
  { id: "youtube-thumbnail", label: "YouTube thumbnail 16:9", width: 1280, height: 720, safe: { top: 0, right: 0, bottom: 0, left: 0 }, notes: "Bottom-right corner shows the video duration badge. Must read at 160px wide." },
  { id: "youtube-banner", label: "YouTube channel banner", width: 2560, height: 1440, safe: { top: 509, right: 507, bottom: 509, left: 507 }, notes: "Only the centre 1546x423 is visible on all devices." },
  { id: "pinterest-pin", label: "Pinterest pin 2:3", width: 1000, height: 1500, notes: "Tall pin." },
  { id: "og-image", label: "Open Graph / link preview", width: 1200, height: 630, notes: "Shared-link preview." },
  { id: "ad-square", label: "Ad 1:1", width: 1080, height: 1080, notes: "Meta / LinkedIn square ad." },
  { id: "ad-portrait", label: "Ad 4:5", width: 1080, height: 1350, notes: "Meta feed ad." },
  { id: "ad-story", label: "Ad 9:16", width: 1080, height: 1920, safe: { top: 250, right: 60, bottom: 340, left: 60 }, notes: "Story / Reels ad." },
  { id: "ad-landscape", label: "Ad 1.91:1", width: 1200, height: 628, notes: "Landscape link ad." },
  { id: "display-leaderboard", label: "Display ad 728x90", width: 728, height: 90, notes: "Web banner." },
  { id: "display-rectangle", label: "Display ad 300x250", width: 300, height: 250, notes: "Medium rectangle." },
  { id: "slide-16x9", label: "Presentation slide 16:9", width: 1920, height: 1080, notes: "Deck slide." },
  { id: "web-hero", label: "Website hero section", width: 1440, height: 900, notes: "Static hero / landing section mockup." },
  { id: "email-header", label: "Email header", width: 1200, height: 400, notes: "Newsletter banner." },
  { id: "a4-portrait", label: "A4 flyer / poster", width: 1240, height: 1754, notes: "A4 at 150dpi." },
];

export const MIN_SIZE = 64;
export const MAX_SIZE = 4096;

export function resolveSize(input: { format?: string; width?: number; height?: number }, fallback?: { width: number; height: number }): { width: number; height: number; format?: string } {
  if (input.width && input.height) {
    return { width: checkDim(input.width), height: checkDim(input.height), format: input.format };
  }
  if (input.format) {
    const preset = FORMATS.find((f) => f.id === input.format);
    if (!preset) {
      throw new VyybeError("UNKNOWN_FORMAT", `Unknown format "${input.format}".`, `Use one of: ${FORMATS.map((f) => f.id).join(", ")} — or pass width and height.`);
    }
    return { width: preset.width, height: preset.height, format: preset.id };
  }
  if (fallback) return { ...fallback };
  return { width: 1080, height: 1350, format: "instagram-portrait" };
}

function checkDim(n: number): number {
  const v = Math.round(n);
  if (v < MIN_SIZE || v > MAX_SIZE) throw new VyybeError("BAD_SIZE", `Size ${v}px is outside ${MIN_SIZE}–${MAX_SIZE}px.`);
  return v;
}

export function formatFor(width: number, height: number, id?: string): FormatPreset | undefined {
  return FORMATS.find((f) => (id ? f.id === id : f.width === width && f.height === height));
}
