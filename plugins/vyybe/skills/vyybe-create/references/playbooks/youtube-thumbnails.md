# Playbook — YouTube thumbnails (1280×720)

A thumbnail has one job: **win the click** against ~20 others, seen for under a second at **168–360 px wide**. Click-through rate is decided by the thumbnail + title together. Design for the small size first.

## The three ingredients (every strong thumbnail has all three)
1. **One focal subject** — a face with a strong emotion, *or* a striking object (product, logo-as-object, device, hardware, result). Big: it fills 35–60% of the frame. Lit and sharp, separated from the background (glow, rim light, shadow).
2. **2–4 words of text** that *complement* the title with curiosity/tension — never repeat it. Huge (110–200 px), heavy condensed or black weight, uppercase is common. One accent-colored word.
3. **Contrast & color pop** — a saturated hero color against a dark or neutral field; complementary pairs (teal/orange, yellow/black, red/black, lime/charcoal). Must stand out on both YouTube's white and dark UI.

Plus optionally **one graphic device** that directs the eye: arrow, circle scribble, red box, ✗/✓, "VS", big number, progress bar.

## Archetypes — pick per concept
| Archetype | When | Example (title "How I use Codex to manage my VPS") |
|---|---|---|
| **Hero object + claim** | Product/tool videos | 3D-tilted terminal showing Codex fixing a 502, glowing OpenAI logo tile, text "AI RUNS MY SERVER" |
| **Before → After split** | Transformations, workflows | Left red: "2AM SSH" + error log; right green: "CODEX" + "✓ fixed in 41s"; divider with logo |
| **Versus** | Comparisons, replacements | "SSH vs CODEX" with both as objects, winner lit |
| **The result** | Outcomes, money, time | "4 HOURS → 4 MIN" big numbers + server glow |
| **UI zoom + highlight** | Tutorials, features | Real screenshot zoomed on the key line, red box + arrow, 2-word text |
| **Reaction + object** | Personal channels (with the user's photo) | Face cut-out (surprised/confident) pointing at the glowing object |
| **Mystery / warning** | Curiosity, mistakes | Blurred or censored detail + "?" / big red ✗ "DON'T DO THIS" |
| **Collection** | Lists/tool roundups | 3–5 big logos max (never 10 tiny ones) + number "10 AGENTS" |

## Composition rules
- **Three planes**: background (gradient/spotlight/blurred scene, darker at edges) → subject (sharp, glowing/rim-lit, drop shadow) → text & device (front, with hard shadow or stroke). Let the subject overlap the text area slightly or break the frame edge — overlap creates depth.
- Text block typically left 45–55%, subject right (or the reverse). Keep the **bottom-right ~220×90 px clear** (duration badge). Margins ≥ 40 px.
- Max **3 focal elements** (subject, text, device). Anything that's unreadable at 168 px is decoration — keep it subtle or remove it.
- Real things beat icons: real logos (`find_logo`), real UI (`capture_webpage`), generated hero objects. A generic Lucide icon as the hero = weak.
- Faces: the user's own photo (ask once if it's a personal channel and they didn't say "no face"), cut out, big, eyes toward the text/object. Never generate a fake "the creator" face.
- Consistency: if the channel has a branding, use its fonts/colors so the thumbnails form a recognizable series.

## Typography
- Fonts: **Anton**, **Bebas Neue**, **Archivo Black**, **Inter Tight 900**, **Montserrat 900**, **Poppins 800**. Tight leading 0.85–0.95.
- Treatment for contrast on any background: hard drop shadow `[text-shadow:0_6px_0_#000]`, or stroke via `[-webkit-text-stroke:6px_#000] [paint-order:stroke_fill]`, or a solid box/sticker behind.
- Max 2 lines; ≤ 4 words; numbers are great ("41s", "$5", "10×").

## Color & light
- Build a **lighting story**: one key light (radial spotlight behind the subject) + accent glow in the hero color + vignette.
- Saturation up, but keep a calm area for the text. Avoid mid-gray, low-contrast dark-on-dark layouts.

## Generated hero images (biggest quality lever)
If you can generate images (native tool, or `generate_image`): generate the **subject**, not the whole thumbnail — e.g. "a sleek dark server rack, isometric 3D render, emerald rim light, glossy, floating on pure black background, product photography, no text". Prefer transparent/black backgrounds so you can composite it with glow + text in HTML.

## Variants (when asked for several)
Each variant = a different archetype **and** a different focal subject (e.g. hero object / before-after / result / versus). Name each by its idea. End with a recommendation and why (clarity at 168 px, curiosity, fit with the title).
- If image generation is free (your native tool), **generate a distinct hero image per variant** (different subject, angle or scene) — reusing one render across variants makes them look like the same thumbnail.
- **Quality gate — every variant must pass all four, or be rebuilt:**
  1. A hero subject filling ≥ 35% of the frame (generated object/scene, real UI in a 3D frame, a logo *as an object* at ≥ 220 px, or the user's face). Text + small icons alone fail.
  2. At least 3 planes (lit background, subject with shadow/glow/overlap, treated text) — no flat diagram layouts. "A → B" box diagrams belong in carousels, not thumbnails.
  3. Text ≤ 4 words at ≥ 110 px, legible in the 168 px sidebar preview.
  4. A tension/curiosity element (result, conflict, before/after, surprise, warning, number).
  Rebuild the weakest variant at least once after seeing the feed preview.

## Self-check at real size (the feed preview)
- In the 168 px sidebar: can you read every word? Can you tell what the subject is? If not → bigger, fewer.
- Does it look different from the decoys around it (color, value, shape)?
- Does title + thumbnail make a curiosity gap (thumbnail doesn't say the same thing)?
- Would a top creator in this niche post it?

## Reference build (calibration — this level of richness is the bar)
```html
<div class="absolute inset-0 bg-[radial-gradient(ellipse_at_70%_45%,#0F3B31_0%,#07090D_62%)]"></div>
<div class="absolute inset-0 opacity-[0.07] bg-[linear-gradient(#fff_1px,transparent_1px),linear-gradient(90deg,#fff_1px,transparent_1px)] bg-[size:48px_48px] [mask-image:radial-gradient(ellipse_at_70%_50%,black,transparent_70%)]"></div>
<div class="absolute right-[150px] top-[60px] size-[520px] rounded-full bg-primary/35 blur-[110px]"></div>
<div class="absolute right-[70px] top-[95px] w-[640px] [transform:perspective(1400px)_rotateY(-18deg)_rotateX(6deg)] rounded-[20px] border border-white/15 bg-[#0B0F15]/95 shadow-[0_40px_90px_-20px_rgba(0,0,0,.9),0_0_80px_-10px_rgba(16,163,127,.55)]" data-name="Terminal">
  <div class="flex items-center gap-2 border-b border-white/10 px-5 py-4"><span class="size-3.5 rounded-full bg-[#FF5F57]"></span><span class="size-3.5 rounded-full bg-[#FEBC2E]"></span><span class="size-3.5 rounded-full bg-[#28C840]"></span><span class="ml-3 font-mono text-[18px] text-muted">root@vps-01 — codex</span></div>
  <div class="space-y-3 px-6 py-6 font-mono text-[25px] leading-snug">
    <p class="text-text"><span class="text-primary">❯</span> codex "why is my site down?"</p>
    <p class="text-muted">› nginx: 502 — upstream died</p>
    <p class="text-primary">✓ logs rotated · nginx restarted</p>
  </div>
</div>
<div class="absolute left-[595px] top-[410px] flex size-[150px] rotate-[-8deg] items-center justify-center rounded-[34px] bg-white shadow-[0_20px_50px_-10px_rgba(0,0,0,.8),0_0_60px_rgba(16,163,127,.6)]" data-name="Logo"><img src="asset:openai-symbol.svg" class="size-[96px]"></div>
<h1 class="absolute left-[56px] top-[70px] w-[560px] font-display text-[150px] uppercase leading-[0.88] text-text [text-shadow:0_6px_0_#000,0_14px_40px_rgba(0,0,0,.7)]" data-name="Title">AI runs my <span class="text-primary">server</span></h1>
<div class="absolute bottom-[64px] left-[56px] -rotate-3 rounded-[12px] bg-accent px-6 py-2 font-body text-[44px] font-extrabold uppercase text-black shadow-[6px_6px_0_#000]" data-name="Badge">No more SSH</div>
<svg data-decor class="absolute left-[430px] top-[470px] w-[170px]" viewBox="0 0 170 120" fill="none"><path d="M8 20 C 60 10, 120 30, 140 92" stroke="#FFD23F" stroke-width="9" stroke-linecap="round"/><path d="M112 78 L142 100 L152 64" stroke="#FFD23F" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/></svg>
```
Theme for it: display = Anton, mono = JetBrains Mono, primary = OpenAI green #10A37F, accent = #FFD23F. Assets: OpenAI symbol via `find_logo`. With a generated 3D server render behind the terminal it would be even stronger.
