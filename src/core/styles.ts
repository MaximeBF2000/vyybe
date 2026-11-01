import type { Theme } from "./theme.js";

/**
 * Curated starting styles. Each one is a full art direction (theme + written rules)
 * plus a sample 1080x1350 cover that shows it. Sample copy uses {{kicker}}, {{title}}, {{body}}.
 */
export interface StylePreset {
  id: string;
  name: string;
  tags: string[];
  direction: string;
  theme: Theme;
  sample: string;
}

export const STYLES: StylePreset[] = [
  {
    id: "tech-editorial",
    name: "Tech Editorial",
    tags: ["dark", "developer", "bold", "mono", "editorial"],
    direction:
      "Near-black canvas, oversized tight sans headlines (800-900 weight, -0.03em tracking), monospace kickers in caps with wide tracking, a single acid accent used sparingly (one word, one rule, one dot). Terminal / code cards with subtle borders. Thin grid lines or rules as structure. Generous left margin (80px), strong left alignment. No gradients except one soft accent glow.",
    theme: {
      colors: { background: "#0B0C0E", surface: "#16181C", text: "#F2F2EE", muted: "#8B8E96", primary: "#C6FF3D", secondary: "#5B8CFF", line: "#26292F" },
      fonts: { display: { family: "Inter Tight", weights: [700, 800, 900] }, body: { family: "Inter", weights: [400, 500, 600] }, mono: { family: "JetBrains Mono", weights: [400, 600] } },
      radius: "20px",
    },
    sample: `<div class="absolute inset-0 bg-background"></div>
<div class="absolute inset-x-[80px] top-[150px] h-px bg-line"></div>
<div class="absolute -right-48 -top-48 size-[640px] rounded-full bg-primary/15 blur-[120px]"></div>
<p class="absolute left-[80px] top-[92px] font-mono text-[24px] uppercase tracking-[0.25em] text-primary">{{kicker}}</p>
<h1 class="absolute left-[80px] top-[200px] w-[900px] font-display text-[124px] font-black leading-[0.9] tracking-[-0.035em] text-text">{{title}}</h1>
<div class="absolute bottom-[96px] left-[80px] right-[80px] rounded-brand border border-line bg-surface p-12">
  <div class="mb-7 flex gap-3"><span class="size-4 rounded-full bg-[#FF5F57]"></span><span class="size-4 rounded-full bg-[#FEBC2E]"></span><span class="size-4 rounded-full bg-[#28C840]"></span></div>
  <p class="font-mono text-[32px] leading-snug text-muted"><span class="text-primary">$</span> {{body}}</p>
</div>`,
  },
  {
    id: "swiss-bold",
    name: "Swiss Bold",
    tags: ["light", "minimal", "grid", "typographic", "red"],
    direction:
      "International Typographic Style. Off-white background, black type, one signal red. Huge numerals or a single giant word as the visual. Strict modular grid, flush-left ragged-right, hairline rules, small caps labels. No shadows, no rounded corners, no illustrations — typography is the image.",
    theme: {
      colors: { background: "#F4F2EE", text: "#111111", muted: "#6B6B6B", primary: "#E5261F", line: "#111111" },
      fonts: { display: { family: "Inter Tight", weights: [500, 800, 900] }, body: { family: "Inter", weights: [400, 500] } },
      radius: "0px",
    },
    sample: `<div class="absolute inset-0 bg-background"></div>
<div class="absolute left-[72px] right-[72px] top-[72px] flex justify-between border-t-[3px] border-line pt-5 font-body text-[24px] font-medium uppercase tracking-[0.12em] text-text"><span>{{kicker}}</span><span><vy-page pad="2"></vy-page>/<vy-total pad="2"></vy-total></span></div>
<p data-decor class="absolute -left-[18px] top-[150px] font-display text-[560px] font-black leading-[0.8] tracking-[-0.06em] text-primary">01</p>
<h1 class="absolute bottom-[200px] left-[72px] w-[860px] font-display text-[96px] font-extrabold leading-[0.95] tracking-[-0.03em] text-text">{{title}}</h1>
<p class="absolute bottom-[90px] left-[72px] w-[600px] font-body text-[30px] leading-snug text-muted">{{body}}</p>`,
  },
  {
    id: "soft-gradient",
    name: "Soft Gradient",
    tags: ["light", "friendly", "pastel", "rounded", "saas"],
    direction:
      "Airy pastel mesh gradients (lavender, peach, mint) made of 2-3 large blurred circles. White frosted cards with large radius and soft shadows. Rounded geometric sans, medium-heavy headlines, sentence case, friendly emoji-free tone. Lots of breathing room, centered or left compositions.",
    theme: {
      colors: { background: "#FBF8FF", surface: "#FFFFFF", text: "#1E1B2E", muted: "#6F6A86", primary: "#6A45F5", secondary: "#FF9F7A", accent: "#4FD1A5" },
      fonts: { display: { family: "Plus Jakarta Sans", weights: [600, 800] }, body: { family: "Plus Jakarta Sans", weights: [400, 500, 600] } },
      radius: "40px",
    },
    sample: `<div class="absolute inset-0 bg-background"></div>
<div class="absolute -left-40 -top-24 size-[760px] rounded-full bg-primary/35 blur-[110px]"></div>
<div class="absolute -right-40 top-[380px] size-[680px] rounded-full bg-secondary/40 blur-[110px]"></div>
<div class="absolute -bottom-56 left-[220px] size-[620px] rounded-full bg-accent/30 blur-[110px]"></div>
<div class="absolute left-[80px] top-[96px] rounded-full bg-surface/80 px-7 py-3 font-body text-[26px] font-semibold text-primary shadow-sm">{{kicker}}</div>
<h1 class="absolute left-[80px] top-[230px] w-[900px] font-display text-[104px] font-extrabold leading-[1.0] tracking-[-0.02em] text-text">{{title}}</h1>
<div class="absolute bottom-[96px] left-[80px] right-[80px] rounded-brand bg-surface/85 p-12 shadow-[0_30px_80px_-30px_rgba(60,40,140,0.35)] backdrop-blur-xl">
  <p class="font-body text-[34px] font-medium leading-snug text-muted">{{body}}</p>
</div>`,
  },
  {
    id: "magazine-serif",
    name: "Magazine Serif",
    tags: ["light", "elegant", "serif", "editorial", "cream"],
    direction:
      "Print-magazine feel. Warm cream paper, ink-black text, one deep accent (oxblood or forest). Big high-contrast display serif, often with an italic word for emphasis. Small uppercase sans captions, issue numbers, thin rules, drop caps. Asymmetric layouts with generous white space; photos framed with thin borders.",
    theme: {
      colors: { background: "#F3EDE2", text: "#1A1714", muted: "#6E655A", primary: "#7A1F2B", line: "#1A1714" },
      fonts: { display: { family: "Instrument Serif", weights: [400], italic: true }, body: { family: "Inter", weights: [400, 500, 600] } },
      radius: "0px",
    },
    sample: `<div class="absolute inset-0 bg-background"></div>
<div class="absolute left-[80px] right-[80px] top-[80px] flex items-end justify-between border-b border-line pb-4 font-body text-[22px] font-semibold uppercase tracking-[0.2em] text-text"><span>{{kicker}}</span><span class="text-muted">No. <vy-page pad="2"></vy-page></span></div>
<h1 class="absolute left-[80px] top-[210px] w-[920px] font-display text-[150px] leading-[0.92] tracking-[-0.02em] text-text">{{title}}</h1>
<div class="absolute bottom-[96px] left-[80px] w-[560px] border-t border-line pt-6">
  <p class="font-body text-[30px] leading-[1.45] text-muted"><span class="float-left mr-3 font-display text-[96px] leading-[0.8] text-primary">“</span>{{body}}</p>
</div>`,
  },
  {
    id: "neo-brutalist",
    name: "Neo-Brutalist",
    tags: ["bright", "bold", "playful", "borders", "yellow"],
    direction:
      "Loud and graphic. Saturated flat background (yellow, pink or blue), thick 4-6px black outlines on every card, hard offset shadows (12px 12px 0 black), chunky grotesk type, stickers and tilted labels. No gradients, no blur. Elements slightly rotated (-3deg to 3deg) for energy.",
    theme: {
      colors: { background: "#FFE14D", surface: "#FFFFFF", text: "#0A0A0A", primary: "#FF5CA8", secondary: "#3D7BFF", accent: "#00D18F" },
      fonts: { display: { family: "Space Grotesk", weights: [500, 700] }, body: { family: "Space Grotesk", weights: [400, 500, 700] } },
      radius: "18px",
    },
    sample: `<div class="absolute inset-0 bg-background"></div>
<div class="absolute left-[80px] top-[96px] -rotate-3 rounded-brand border-[5px] border-text bg-primary px-8 py-3 font-display text-[30px] font-bold uppercase text-text shadow-[8px_8px_0_#0A0A0A]">{{kicker}}</div>
<h1 class="absolute left-[80px] top-[250px] w-[920px] font-display text-[118px] font-bold leading-[0.95] tracking-[-0.03em] text-text">{{title}}</h1>
<div class="absolute bottom-[110px] left-[80px] right-[110px] rotate-1 rounded-brand border-[5px] border-text bg-surface p-12 shadow-[14px_14px_0_#0A0A0A]">
  <p class="font-body text-[34px] font-medium leading-snug text-text">{{body}}</p>
</div>
<div class="absolute bottom-[420px] right-[70px] flex size-[150px] rotate-12 items-center justify-center rounded-full border-[5px] border-text bg-accent font-display text-[34px] font-bold text-text">NEW</div>`,
  },
  {
    id: "neon-night",
    name: "Neon Night",
    tags: ["dark", "glow", "futuristic", "gradient", "ai"],
    direction:
      "Deep midnight backgrounds with luminous gradient accents (electric violet → cyan → magenta). Glowing text highlights via gradient-clipped text, glassy panels with 1px light borders, subtle grid or noise. Geometric modern sans, medium weights, very clean. Feels like AI / future / product launch.",
    theme: {
      colors: { background: "#070714", surface: "#11122A", text: "#EEF0FF", muted: "#8F93C2", primary: "#8B5CFF", secondary: "#22D3EE", accent: "#FF4FD8" },
      fonts: { display: { family: "Sora", weights: [600, 700, 800] }, body: { family: "Sora", weights: [300, 400, 500] } },
      radius: "28px",
    },
    sample: `<div class="absolute inset-0 bg-background"></div>
<div class="absolute inset-0 bg-[linear-gradient(rgba(139,92,255,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(139,92,255,0.08)_1px,transparent_1px)] bg-[size:60px_60px]"></div>
<div class="absolute -top-40 left-1/2 size-[900px] -translate-x-1/2 rounded-full bg-primary/30 blur-[140px]"></div>
<p class="absolute left-[80px] top-[100px] font-body text-[26px] font-medium uppercase tracking-[0.3em] text-secondary">{{kicker}}</p>
<h1 class="absolute left-[80px] top-[200px] w-[920px] bg-gradient-to-br from-text via-secondary to-accent bg-clip-text font-display text-[112px] font-extrabold leading-[0.98] tracking-[-0.03em] text-transparent">{{title}}</h1>
<div class="absolute bottom-[96px] left-[80px] right-[80px] rounded-brand border border-white/15 bg-surface/70 p-12 backdrop-blur-xl">
  <p class="font-body text-[32px] font-light leading-snug text-muted">{{body}}</p>
</div>`,
  },
  {
    id: "notebook",
    name: "Notebook Notes",
    tags: ["light", "handwritten", "personal", "creator", "paper"],
    direction:
      "Personal and approachable: lined or dotted paper background, handwritten accent font for annotations/arrows/circled words, clean sans for the main copy, highlighter-marker strokes (semi-transparent yellow/pink bars behind words), tape strips and sticky notes. Feels like a creator sharing their notes.",
    theme: {
      colors: { background: "#FFFDF6", text: "#1F2430", muted: "#5D6475", primary: "#2F6BFF", highlight: "#FFE45C", accent: "#FF6B6B", rule: "#D9E3F5" },
      fonts: { display: { family: "Inter", weights: [700, 800] }, body: { family: "Inter", weights: [400, 500] }, hand: { family: "Caveat", weights: [600, 700] } },
      radius: "14px",
    },
    sample: `<div class="absolute inset-0 bg-background bg-[repeating-linear-gradient(transparent_0,transparent_63px,#D9E3F5_63px,#D9E3F5_65px)]"></div>
<div class="absolute bottom-0 left-[120px] top-0 w-[3px] bg-accent/40"></div>
<p class="absolute left-[170px] top-[90px] -rotate-2 font-hand text-[64px] font-bold text-primary">{{kicker}}</p>
<h1 class="absolute left-[170px] top-[220px] w-[820px] font-display text-[96px] font-extrabold leading-[1.02] tracking-[-0.02em] text-text"><span class="bg-[linear-gradient(transparent_55%,#FFE45C_55%,#FFE45C_90%,transparent_90%)]">{{title}}</span></h1>
<div class="absolute bottom-[110px] left-[170px] w-[760px] rotate-1 rounded-brand bg-highlight p-10 shadow-[0_18px_40px_-18px_rgba(0,0,0,0.35)]">
  <div class="absolute -top-5 left-1/2 h-10 w-40 -translate-x-1/2 -rotate-3 bg-white/70"></div>
  <p class="font-hand text-[48px] font-semibold leading-tight text-text">{{body}}</p>
</div>`,
  },
  {
    id: "corporate-clean",
    name: "Corporate Clean",
    tags: ["light", "professional", "b2b", "blue", "linkedin"],
    direction:
      "Trustworthy B2B look for LinkedIn. White and very light gray surfaces, one confident blue, navy text. Clean humanist sans, semibold headlines, clear hierarchy, data callouts in big numbers, simple line icons in tinted circles, cards with 1px borders and small radius. Calm, structured, no gimmicks.",
    theme: {
      colors: { background: "#FFFFFF", surface: "#F4F7FB", text: "#0F1E3D", muted: "#5A6B8C", primary: "#1F5BFF", line: "#E2E8F2", accent: "#12B886" },
      fonts: { display: { family: "DM Sans", weights: [600, 700] }, body: { family: "DM Sans", weights: [400, 500] } },
      radius: "20px",
    },
    sample: `<div class="absolute inset-0 bg-background"></div>
<div class="absolute inset-x-0 top-0 h-[12px] bg-primary"></div>
<div class="absolute left-[80px] top-[100px] flex items-center gap-4"><span class="flex size-16 items-center justify-center rounded-full bg-primary/10"><vy-icon name="lucide:trending-up" class="size-9 text-primary"></vy-icon></span><span class="font-body text-[28px] font-medium text-primary">{{kicker}}</span></div>
<h1 class="absolute left-[80px] top-[230px] w-[900px] font-display text-[92px] font-bold leading-[1.04] tracking-[-0.02em] text-text">{{title}}</h1>
<div class="absolute bottom-[96px] left-[80px] right-[80px] rounded-brand border border-line bg-surface p-12">
  <p class="font-body text-[32px] leading-relaxed text-muted">{{body}}</p>
</div>`,
  },
  {
    id: "retro-sunset",
    name: "Retro Sunset",
    tags: ["warm", "vintage", "70s", "orange", "fun"],
    direction:
      "Seventies warmth: cream background, burnt orange / mustard / brown palette, stacked sunset stripes and arches, chunky soft serif or heavy rounded grotesk headlines, slightly letterspaced small caps. Flat shapes, no gradients except banded stripes. Optional grain.",
    theme: {
      colors: { background: "#F6E9D3", text: "#3B2416", muted: "#7C5B43", primary: "#E2582B", secondary: "#F1A93B", accent: "#9C3D1F" },
      fonts: { display: { family: "Bricolage Grotesque", weights: [700, 800] }, body: { family: "DM Sans", weights: [400, 500, 700] } },
      radius: "999px",
    },
    sample: `<div class="absolute inset-0 bg-background"></div>
<div class="absolute -bottom-[400px] left-1/2 flex size-[980px] -translate-x-1/2 flex-col overflow-hidden rounded-full">
  <div class="h-1/4 bg-secondary"></div><div class="h-1/4 bg-primary"></div><div class="h-1/4 bg-accent"></div><div class="h-1/4 bg-text"></div>
</div>
<p class="absolute left-0 right-0 top-[100px] text-center font-body text-[26px] font-bold uppercase tracking-[0.35em] text-accent">{{kicker}}</p>
<h1 class="absolute left-[80px] right-[80px] top-[180px] text-center font-display text-[120px] font-extrabold leading-[0.92] tracking-[-0.02em] text-text">{{title}}</h1>
<p class="absolute left-[150px] right-[150px] top-[560px] text-center font-body text-[32px] leading-snug text-muted">{{body}}</p>`,
  },
  {
    id: "quiet-luxury",
    name: "Quiet Luxury",
    tags: ["minimal", "premium", "beige", "serif", "fashion"],
    direction:
      "Restraint signals premium. Warm sand / stone / espresso neutrals, light thin serif display with generous tracking, tiny uppercase sans labels, extreme white space, centered symmetry, hairline frames. One image max, never busy. Copy is short and confident.",
    theme: {
      colors: { background: "#E9E3D8", surface: "#F5F1EA", text: "#2B2520", muted: "#6A6055", primary: "#2B2520", line: "#B7AC9E" },
      fonts: { display: { family: "Cormorant Garamond", weights: [300, 400, 500], italic: true }, body: { family: "Inter", weights: [300, 400, 500] } },
      radius: "0px",
    },
    sample: `<div class="absolute inset-0 bg-background"></div>
<div class="absolute inset-[48px] border border-line"></div>
<p class="absolute left-0 right-0 top-[130px] text-center font-body text-[22px] font-medium uppercase tracking-[0.5em] text-muted">{{kicker}}</p>
<h1 class="absolute left-[120px] right-[120px] top-[420px] text-center font-display text-[112px] font-light italic leading-[1.0] text-text">{{title}}</h1>
<div class="absolute left-1/2 top-[880px] h-px w-24 -translate-x-1/2 bg-text/40"></div>
<p class="absolute left-[200px] right-[200px] top-[930px] text-center font-body text-[26px] font-light leading-relaxed tracking-wide text-muted">{{body}}</p>`,
  },
  {
    id: "pop-candy",
    name: "Pop Candy",
    tags: ["bright", "colorful", "playful", "rounded", "gen-z"],
    direction:
      "Joyful and loud: candy colors (hot pink, electric blue, lime, tangerine) on a bold base, bubbly rounded display font, pill shapes, blobs and stars, stickers, big emoji-like icons. Overlapping shapes, tilted elements, high saturation. Great for consumer apps and creators with energy.",
    theme: {
      colors: { background: "#3D5AFE", surface: "#FFFFFF", text: "#FFFFFF", ink: "#14123A", primary: "#FF4FA3", secondary: "#C6F432", accent: "#FF9A3D" },
      fonts: { display: { family: "Rubik", weights: [700, 800, 900] }, body: { family: "Rubik", weights: [400, 500, 600] } },
      radius: "999px",
    },
    sample: `<div class="absolute inset-0 bg-background"></div>
<div class="absolute -right-24 -top-24 size-[420px] rounded-full bg-primary"></div>
<div class="absolute -left-20 bottom-[300px] size-[260px] rotate-12 rounded-[80px] bg-secondary"></div>
<vy-icon name="lucide:sparkles" class="absolute right-[120px] top-[120px] size-40 text-secondary"></vy-icon>
<div class="absolute left-[80px] top-[110px] rounded-brand bg-secondary px-8 py-3 font-display text-[30px] font-extrabold uppercase text-ink">{{kicker}}</div>
<h1 class="absolute left-[80px] top-[260px] w-[880px] font-display text-[124px] font-black leading-[0.92] tracking-[-0.02em] text-text">{{title}}</h1>
<div class="absolute bottom-[100px] left-[80px] right-[80px] rounded-[48px] bg-surface p-12">
  <p class="font-body text-[34px] font-medium leading-snug text-ink">{{body}}</p>
</div>`,
  },
  {
    id: "photo-overlay",
    name: "Photo Overlay",
    tags: ["photo", "cinematic", "bold", "lifestyle", "ads"],
    direction:
      "Full-bleed photography (generated or stock) with a dark gradient scrim from the bottom for legibility, big white condensed-feel headline at the bottom, small brand tag at top. Strong single focal subject. Works for ads, YouTube thumbnails and lifestyle content. Without a photo, use a rich gradient as a stand-in.",
    theme: {
      colors: { background: "#111111", text: "#FFFFFF", muted: "#D6D6D6", primary: "#FFD43B", scrim: "#000000" },
      fonts: { display: { family: "Archivo", weights: [800, 900] }, body: { family: "Archivo", weights: [400, 500, 600] } },
      radius: "16px",
    },
    sample: `<div class="absolute inset-0 bg-[radial-gradient(circle_at_70%_30%,#E07A3F_0%,#6B2D5C_45%,#141026_100%)]"></div>
<div class="absolute inset-x-0 bottom-0 h-[70%] bg-gradient-to-t from-scrim/90 via-scrim/50 to-transparent"></div>
<p class="absolute left-[72px] top-[72px] rounded-brand bg-primary px-6 py-2 font-body text-[26px] font-semibold uppercase tracking-wider text-background">{{kicker}}</p>
<h1 class="absolute bottom-[250px] left-[72px] w-[940px] font-display text-[128px] font-black uppercase leading-[0.88] tracking-[-0.02em] text-text">{{title}}</h1>
<p class="absolute bottom-[110px] left-[72px] w-[860px] font-body text-[34px] font-medium leading-snug text-muted">{{body}}</p>`,
  },
];

export function getStyle(id: string): StylePreset | undefined {
  return STYLES.find((s) => s.id === id);
}

export function fillSample(sample: string, copy: { kicker?: string; title?: string; body?: string }): string {
  const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!);
  return sample
    .replace(/\{\{kicker\}\}/g, esc(copy.kicker ?? "Your series"))
    .replace(/\{\{title\}\}/g, esc(copy.title ?? "A headline that stops the scroll"))
    .replace(/\{\{body\}\}/g, esc(copy.body ?? "One supporting line that tells people why they should keep swiping."));
}
