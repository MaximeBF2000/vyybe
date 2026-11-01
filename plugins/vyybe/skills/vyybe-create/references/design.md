# Design craft for social & marketing visuals

People see these at phone size, while scrolling, for under a second. Design for that.

## The 1-second test
- One focal point per frame: usually the headline. Everything else supports it.
- Headline readable when the frame is shown at ~350px wide. If in doubt: bigger, fewer words.
- Contrast ≥ 4.5:1 for body, ≥ 3:1 for big headlines. Never light-gray text on white or mid-gray on photos.

## Hierarchy
- Max 3 levels of text per frame: headline → support → label. Size ratio between levels ≥ 1.6×.
- Weight and size do the work; don't add colors to create hierarchy unless the palette is built for it.
- Highlight one key word (accent color, marker highlight, italic serif, underline) — never three.

## Layout
- Consistent margins (64–96px on 1080 canvases) on all sides. Align everything to the same left edge unless the composition is deliberately centered.
- Use a simple grid: one strong column + optional side elements. Avoid floating random elements.
- Whitespace is premium. If it feels busy, remove something rather than shrinking text.
- Group related things (title + description in one block). Separate unrelated things with space, not lines.
- Anchor elements to edges/corners consistently across frames (kicker top-left, page count bottom-right, handle bottom-left).

## Color
- 60/30/10: background dominant, secondary surface, accent used sparingly (CTA, one word, one shape).
- Dark themes: avoid pure #000 backgrounds and pure #fff text when the brand allows; use near-black/off-white.
- Gradients: subtle and directional, or one soft glow. Muddy mid-tone gradients look cheap.
- Use theme tokens so the brand stays consistent.

## Typography
- Max 2 families (display + body), optionally a mono/hand accent.
- Big headlines: tight leading (0.88–1.0) and slightly negative tracking. Body: 1.35–1.5 leading.
- Uppercase only for short labels and some thumbnail titles; add tracking to uppercase small text.
- Avoid orphans (one word on the last line) — use `text-balance` or adjust width.
- Line length: 20–40 characters for slide body text at phone size.

## Making it look designed (not template-y)
- Build in **planes**: lit background → hero subject with depth (shadow/glow, perspective, overlap) → treated typography → one accent device. One plane = template.
- Specific beats generic: the real logo, the real UI, the real number, a generated hero object — not a stock icon on a gradient.
- A clear visual idea per piece: oversized number, a real UI/terminal mock, a bold quote mark, a before/after split, a photo with a sharp crop, a sticker, a chart drawn with divs.
- Texture/depth sparingly: one soft glow, subtle grain, a thin grid, a hard offset shadow (brutalist), glass card (neon). Pick one per design, not all.
- Real details: page counters, a small handle/logo, a "swipe →" cue on slide 1, consistent icons from one family.
- Mock UIs (chat bubbles, terminals, browser windows, phone frames, tweets, notifications) built with divs are powerful for tech/product topics.
- Data: draw simple bar/progress/number callouts with divs instead of dense charts.

## Carousels
- Slide 1 sells the swipe: big hook, minimal text, a visual cue to swipe.
- Same system on every slide (margins, kicker, type scale, colors); vary composition and the visual element.
- Continuity tricks: a shape or line that crosses slide edges, progress dots, consistent numbering.
- Last slide: payoff or summary + one CTA (follow / save / comment / link in bio). Include handle or logo.

## Variants
When asked for variants, make them genuinely different (different composition, focal element or hook) — not the same layout with a color swap. Label each by its idea ("Big face + 3 words", "Before/After split", "Bold claim").

## Self-review checklist (run before presenting)
1. Hook legible at phone size? Focal point obvious?
2. Any text overflow, collisions, cramped edges, orphans?
3. Contrast OK on every text element, especially over photos?
4. Consistent margins, type scale and colors across frames?
5. Copy: specific, short, no filler, no invented facts, CTA present where it should be?
6. Brand/style rules followed (fonts, colors, logo, voice)?
7. Would a good designer post this? If it looks generic, add one strong idea.
