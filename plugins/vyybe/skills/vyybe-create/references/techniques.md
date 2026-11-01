# Techniques cookbook (all snippets tested in Vyybe)

Copy, adapt sizes/colors (prefer theme tokens), position with `absolute` + px. Combine 3–5 of these per piece; never all of them.

## Backgrounds & light
Spotlight behind the subject + vignette:
```html
<div class="absolute inset-0 bg-[radial-gradient(ellipse_at_68%_45%,#1B3A8F_0%,#0A0E1A_55%,#05060A_100%)]"></div>
<div class="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_55%,rgba(0,0,0,.65)_100%)]"></div>
```
Fading tech grid:
```html
<div class="absolute inset-0 opacity-[0.08] bg-[linear-gradient(#fff_1px,transparent_1px),linear-gradient(90deg,#fff_1px,transparent_1px)] bg-[size:48px_48px] [mask-image:radial-gradient(ellipse_at_center,black,transparent_70%)]"></div>
```
Film grain (subtle texture on flat colors):
```html
<div class="absolute inset-0 opacity-[0.12] mix-blend-overlay" style="background-image:url(&quot;data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='3'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E&quot;)"></div>
```
Color glow blob (put behind the hero): `<div class="absolute size-[520px] rounded-full bg-primary/40 blur-[110px]"></div>`
Light beam / horizon: `<div class="absolute left-0 right-0 top-[60%] h-[2px] bg-gradient-to-r from-transparent via-primary to-transparent shadow-[0_0_40px_8px] shadow-primary/50"></div>`

## Depth
3D-tilted card / screen (perspective):
```html
<div class="absolute right-[70px] top-[100px] w-[620px] [transform:perspective(1400px)_rotateY(-18deg)_rotateX(6deg)] rounded-[20px] border border-white/15 bg-[#0B0F15] p-6 shadow-[0_40px_90px_-20px_rgba(0,0,0,.9),0_0_80px_-10px_rgba(16,163,127,.55)]">…</div>
```
Glow + rim light on a cut-out image (PNG with transparency): `<img src="asset:server.png" class="[filter:drop-shadow(0_0_40px_rgba(16,163,127,.7))_drop-shadow(0_30px_30px_rgba(0,0,0,.8))]">`
Depth of field: background elements `blur-[3px] opacity-70 scale-95`; foreground sharp. Overlap: let the hero cover a corner of a card or the text block (`z-10` on the front layer).
Stacked cards (fan): three cards with `rotate-[-6deg]`, `rotate-0`, `rotate-[6deg]` and increasing shadow.

## Typography treatments
Hard shadow (thumbnails, any background): `[text-shadow:0_6px_0_#000,0_14px_40px_rgba(0,0,0,.6)]`
Thick outline: `[-webkit-text-stroke:8px_#000] [paint-order:stroke_fill]`
3D extrude: `[text-shadow:1px_1px_0_#B8860B,2px_2px_0_#B8860B,3px_3px_0_#B8860B,4px_4px_0_#B8860B,5px_5px_0_#B8860B,8px_10px_20px_rgba(0,0,0,.5)]`
Gradient text: `bg-gradient-to-br from-white via-primary to-accent bg-clip-text text-transparent`
Marker highlight on a word: `<span class="bg-[linear-gradient(transparent_58%,#FFE45C_58%,#FFE45C_92%,transparent_92%)]">word</span>`
Word in a box (sticker word): `<span class="inline-block -rotate-2 rounded-lg bg-accent px-4 text-black">FAST</span>`
Outlined ghost word behind the title: `<p data-decor class="absolute … text-[260px] text-transparent [-webkit-text-stroke:2px_rgba(255,255,255,.12)]">VPS</p>`

## Graphic devices
Hand-drawn arrow:
```html
<svg data-decor class="absolute left-[430px] top-[470px] w-[170px]" viewBox="0 0 170 120" fill="none"><path d="M8 20 C 60 10, 120 30, 140 92" stroke="#FFD23F" stroke-width="9" stroke-linecap="round"/><path d="M112 78 L142 100 L152 64" stroke="#FFD23F" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/></svg>
```
Scribble circle around something:
```html
<svg data-decor class="absolute left-[600px] top-[180px] w-[340px]" viewBox="0 0 340 160" fill="none"><path d="M40 90 C 30 30, 300 10, 320 70 C 335 125, 120 160, 50 120 C 10 95, 60 40, 140 30" stroke="#FF3B3B" stroke-width="8" stroke-linecap="round"/></svg>
```
Badge / sticker: `<div class="absolute -rotate-3 rounded-[12px] bg-accent px-6 py-2 font-body text-[44px] font-extrabold uppercase text-black shadow-[6px_6px_0_#000]">No more SSH</div>`
VS emblem:
```html
<div class="absolute left-1/2 top-1/2 flex size-[140px] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-accent font-display text-[64px] text-black shadow-[0_0_0_10px_#000,0_0_60px_rgba(255,210,63,.6)]">VS</div>
```
✗ / ✓ marks: `<vy-icon name="lucide:x" stroke="3.5" class="size-28 text-[#FF3B3B]"></vy-icon>` / `<vy-icon name="lucide:check" stroke="3.5" class="size-28 text-[#22C55E]"></vy-icon>`
Big number callout: `<p class="font-display text-[220px] leading-none text-primary [text-shadow:0_8px_0_#000]">41s</p>`
Progress / bar chart (divs): `<div class="h-6 w-[500px] rounded-full bg-white/10"><div class="h-full w-[82%] rounded-full bg-primary shadow-[0_0_20px] shadow-primary"></div></div>`

## Mockups (show the real thing)
App-icon tile for a logo (makes logos feel like objects):
```html
<div class="absolute flex size-[150px] rotate-[-8deg] items-center justify-center rounded-[34px] bg-white shadow-[0_20px_50px_-10px_rgba(0,0,0,.8),0_0_60px_rgba(16,163,127,.6)]"><img src="asset:logo.svg" class="size-[96px]"></div>
```
Terminal window: see the reference build in the YouTube playbook (traffic lights + mono lines, colored prompt/success lines).
Browser window with a captured page:
```html
<div class="absolute left-[80px] top-[300px] w-[920px] overflow-hidden rounded-[18px] border border-black/10 bg-white shadow-[0_30px_80px_-20px_rgba(0,0,0,.6)]">
  <div class="flex items-center gap-2 bg-[#ECECEC] px-4 py-3"><span class="size-3 rounded-full bg-[#FF5F57]"></span><span class="size-3 rounded-full bg-[#FEBC2E]"></span><span class="size-3 rounded-full bg-[#28C840]"></span><span class="ml-4 flex-1 rounded-md bg-white px-3 py-1 font-body text-[16px] text-neutral-500">github.com/openai/codex</span></div>
  <img src="asset:screenshot.png" class="block h-[520px] w-full object-cover object-top">
</div>
```
Phone frame: `<div class="absolute w-[360px] rounded-[54px] bg-black p-[12px] shadow-[0_40px_80px_-20px_rgba(0,0,0,.7)]"><div class="overflow-hidden rounded-[44px]"><img src="asset:app.png" class="block w-full"></div></div>`
Chat bubbles (AI conversation): user bubble right `rounded-[28px] rounded-br-md bg-primary px-7 py-4 text-white`, assistant bubble left `rounded-[28px] rounded-bl-md bg-surface px-7 py-4`.
Tweet/post card: avatar circle + bold name + handle + 2–3 lines + small metrics row on a white `rounded-[24px]` card with a soft shadow.

## Composition grids
- 16:9 (1280×720): text in left 45–55% (x 50–60), subject right; or split 50/50 for before/after; keep bottom-right 220×90 clear.
- 4:5 (1080×1350): kicker top (y≈90), headline y 170–520, visual y 560–1150, footer y≈1240.
- 9:16 (1080×1920): content between y 250 and y 1580.
