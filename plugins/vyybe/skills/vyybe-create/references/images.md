# Images, logos and real-world assets

Specific, real material is what makes a design look professional. Gather it before building, look at it, keep only what fits.

## What to use when
| Need | Tool |
|---|---|
| A company/product logo (any brand mentioned) | `find_logo {brand, domain}` → `<vy-icon name="brand:…">` or `import_asset {url}` |
| What a product/site/app actually looks like | `capture_webpage {url}` (1440×900 desktop, `width: 390` for mobile view) → frame it in a browser/phone mock, crop with `object-cover object-top`, tilt in 3D |
| A hero visual (object, scene, mood, food, product shot) | your **own image generation** if available → `generate_image` (if configured) → `search_photos` |
| The user's face / product / team | their files → `import_asset {path}` (ask once for a photo when a face would clearly help and none is given) |
| Small supporting symbols | `<vy-icon name="lucide:…">` |

## Generating images (biggest quality lever for thumbnails, ads, posts)
**If you have a native image generation tool (e.g. Codex), use it** — it's free for the user. After generating, import the file:
- Codex saves generated images under `~/.codex/generated_images/<session>/…png`. Find the newest with `ls -t ~/.codex/generated_images/*/*.png | head -1`, then `import_asset {projectId, path}`.
- Otherwise use `generate_image` (uses the user's API key; one good image per concept).

Generate the **subject or scene**, not the whole design — Vyybe adds the real text, logos and layout:
- Structure: subject → style/medium → lighting → camera/composition → palette → background → "no text, no letters, no logos".
- Ask for a clean background (pure black, pure white, or a simple gradient) or a transparent PNG so the subject composites cleanly with glows and type.
- Leave room for text: "subject on the right third, empty dark space on the left".
- Match the palette to the theme colors.
Examples:
- "A sleek black server rack with glowing emerald status lights, 3D isometric render, glossy, dramatic rim lighting, floating on a pure black background, product photography, no text."
- "Macro photo of a flaky pistachio croissant cut open, vivid green cream, warm morning light, shallow depth of field, cream background with empty space on the left, no text."
- "A frustrated developer silhouette in a dark room lit only by a red-tinted monitor, cinematic, moody, empty space on the left, no text."

## Stock photos
`search_photos` → look at the numbered grid → `import_asset {photoId}`. Prefer authentic, non-cheesy shots; crop tight. Openverse (CC) results may need a small credit line on the design.

## Placing images well
- Full-bleed photo + gradient scrim on the text side.
- Cut-out subject with glow/rim light (`[filter:drop-shadow(0_0_40px_rgba(…))]`) overlapping the text block.
- Screenshots: never raw and full-size — frame (browser/phone), crop to the interesting part, tilt, add a highlight box or arrow.
- Logos: as app-icon tiles (white rounded square + shadow), or recolored `brand:` icons; never stretched, never altered.
- Duotone/brand tint: color layer with `mix-blend-multiply` / `mix-blend-color` over the photo.
- Check contrast in the preview — automatic checks can't always measure text over photos.

## Rights
Logos are trademarks: use them to refer to the product, unaltered. Don't generate fake people presented as real, fake testimonials, or another creator's likeness.
