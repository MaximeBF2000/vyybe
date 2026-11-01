# Frame HTML contract

A frame is an **HTML fragment** placed inside a fixed-size canvas (`.vy-frame`, `position: relative; overflow: hidden`). Vyybe adds the document, Tailwind v4, the theme, fonts and components. You write only what goes on the canvas.

## The canvas
- Sizes are exact pixels (e.g. 1080×1350). Design in px: `left-[80px] top-[120px] w-[920px] text-[96px]`.
- Build in **layers**: top-level elements are positioned with `absolute` + explicit `left/top/right/bottom` and a width. The studio lets the user drag/resize these layers, so top-level absolute layers = best editing experience.
- Inside a layer, use normal flow / flex / grid freely (a card with a title and a list, a row of icons…).
- First layer is usually the background: `<div class="absolute inset-0 bg-background"></div>`.
- Later elements paint on top of earlier ones. Use `z-10` only when needed.
- `%` units are fine for symmetric layouts (`left-1/2 -translate-x-1/2`), px for everything else.

## Theme tokens (always prefer them over raw hex)
The project theme becomes Tailwind tokens:
- Colors: `bg-<name>`, `text-<name>`, `border-<name>`, `from-<name>`, `fill-<name>`… with opacity modifiers `bg-primary/20`. Names come from the theme (`vyybe_status`/`create_project` output): typically `background, surface, text, muted, primary, secondary, accent`.
- Fonts: `font-display`, `font-body`, `font-mono` (or the roles defined in the theme).
- Radius: `rounded-brand`.
- Raw values (`bg-[#FF3366]`) are allowed for one-offs, but tokens keep brands consistent and let the user restyle later.

## Components (expanded by Vyybe — cheap and consistent)
| Tag | Use |
|---|---|
| `<vy-icon name="lucide:rocket" class="size-12 text-primary"></vy-icon>` | 2000+ Lucide line icons. Size with `size-*`, color with `text-*`. Optional `stroke="1.5"`. |
| `<vy-icon name="brand:github" class="size-16"></vy-icon>` | 3400 brand logos (GitHub, Notion, Stripe, OpenAI, Figma, Instagram…). Solid fill = `currentColor`. |
| `<vy-logo variant="primary" class="h-14"></vy-logo>` | The branding's logo (variants listed by create_project). Size with height. |
| `<vy-page pad="2"></vy-page>` / `<vy-total pad="2"></vy-total>` | Current slide number / total ("03" / "07"). Stays correct when slides are reordered. |

Never paste raw SVG for icons — use `vy-icon`. Inline `<svg>` is fine for custom shapes, blobs, lines, arrows, charts.

## Images
- `<img src="asset:photo.jpg" class="absolute inset-0 size-full object-cover" data-name="Photo">`
- Backgrounds: `style="background-image:url(asset:texture.png)"` + `bg-cover bg-center`.
- Assets come from `import_asset`, `generate_image` or the user. An https image URL in `src` is auto-imported (fine for images you found), but prefer `import_asset` so credits are recorded.
- Legibility on photos: add a scrim layer (`bg-gradient-to-t from-black/80 via-black/30 to-transparent`) between the photo and the text.

## Nice-to-haves
- `data-name="Headline"` on key layers → friendly names in the editor's layer list.
- `data-decor` on intentional decorative text that bleeds off the canvas or overlaps (giant background numbers, watermarks) → skipped by the overflow/overlap checks.
- `text-balance` on headlines, `text-pretty` on paragraphs.
- A single `<style>` block per frame is allowed for things Tailwind can't express (complex keyframe-free effects, `-webkit-text-stroke`, mask images). Use unique class names (`.f3-outline`). Prefer arbitrary utilities first: `[-webkit-text-stroke:2px_#fff]`, `[mask-image:linear-gradient(...)]`.

## Not allowed (stripped by the sanitizer)
`<script>`, event handlers, `<iframe>`, `<form>`, `<video>`, `<link>`, external stylesheets, `@import`, remote fonts (fonts come from the theme), `<html>/<head>/<body>` wrappers.

## Typography sizes that work
For 1080-wide canvases (scale proportionally for others):
| Role | Size | Notes |
|---|---|---|
| Hero headline | 96–150px | `font-black`/`extrabold`, `leading-[0.9–1.0]`, `tracking-[-0.03em]` |
| Slide headline | 72–100px | 2–4 lines max |
| Subhead / lead | 38–52px | `leading-snug` |
| Body | 30–38px | never below 26px |
| Label / kicker | 22–28px | uppercase + `tracking-[0.15–0.3em]` works well |
YouTube thumbnail (1280×720): headline 110–200px, ≤ 5 words. Landscape 1200×627: headline 64–96px.
Margins: 64–96px on 1080 canvases. Leave the text column ≤ ~85% of the width.

## A complete example (carousel slide, 1080×1350)
```html
<div class="absolute inset-0 bg-background"></div>
<div class="absolute -right-40 -top-40 size-[620px] rounded-full bg-primary/20 blur-[120px]"></div>
<p class="absolute left-[80px] top-[88px] font-mono text-[24px] uppercase tracking-[0.25em] text-primary" data-name="Kicker">Step <vy-page pad="2"></vy-page></p>
<h2 class="absolute left-[80px] top-[170px] w-[900px] text-balance font-display text-[92px] font-extrabold leading-[0.95] tracking-[-0.03em] text-text" data-name="Headline">Ask Codex why the disk is full.</h2>
<div class="absolute left-[80px] right-[80px] top-[560px] rounded-brand border border-text/10 bg-surface p-12" data-name="Card">
  <div class="flex items-center gap-4 font-body text-[30px] font-medium text-muted"><vy-icon name="lucide:hard-drive" class="size-10 text-secondary"></vy-icon>What it found</div>
  <p class="mt-6 font-mono text-[32px] leading-relaxed text-text">/var/log/journal → 18 GB<br>Rotated and capped at 1 GB.</p>
</div>
<p class="absolute bottom-[80px] left-[80px] font-body text-[26px] text-muted" data-name="Handle">@yourhandle</p>
<p class="absolute bottom-[80px] right-[80px] font-mono text-[26px] text-muted"><vy-page pad="2"></vy-page>/<vy-total pad="2"></vy-total></p>
```

## Example (YouTube thumbnail, 1280×720)
```html
<div class="absolute inset-0 bg-[radial-gradient(circle_at_75%_40%,#3B1D8F_0%,#0A0A14_70%)]"></div>
<img src="asset:face.png" class="absolute bottom-0 right-[40px] h-[700px] object-contain" data-name="Face">
<h1 class="absolute left-[60px] top-[90px] w-[720px] font-display text-[150px] font-black uppercase leading-[0.85] tracking-[-0.02em] text-white [text-shadow:0_8px_30px_rgba(0,0,0,.6)]" data-name="Title">I quit <span class="text-accent">SSH</span></h1>
<div class="absolute bottom-[70px] left-[60px] -rotate-2 rounded-xl bg-accent px-6 py-3 font-display text-[54px] font-extrabold text-black" data-name="Badge">Codex runs it</div>
```
