# Formats

Pass `format` (preset id) or `width`+`height` to `create_project` / per frame. Frames in one project can have different sizes (e.g. a campaign in 3 sizes = a `collection`).

| Need | Preset | Size | Notes |
|---|---|---|---|
| Instagram carousel / feed post | `instagram-portrait` | 1080×1350 | Default. 4:5 gets the most feed space. 5–10 slides. |
| Instagram square | `instagram-square` | 1080×1080 | When the user asks for square. |
| Story / Reel cover | `instagram-story` | 1080×1920 | Keep text out of top 250px and bottom 340px. |
| TikTok cover | `tiktok-cover` | 1080×1920 | Right 140px has buttons, bottom 480px has caption. |
| LinkedIn carousel | `linkedin-portrait` | 1080×1350 | Exported as **PDF** (LinkedIn uploads documents). 6–12 slides. |
| LinkedIn post image | `linkedin-square` / `linkedin-landscape` | 1080×1080 / 1200×627 | |
| X / Twitter image | `x-post` | 1600×900 | |
| YouTube thumbnail | `youtube-thumbnail` | 1280×720 | See rules below. Bottom-right corner hidden by the duration badge. |
| YouTube banner | `youtube-banner` | 2560×1440 | Only the center 1546×423 is always visible. |
| Pinterest pin | `pinterest-pin` | 1000×1500 | |
| Link preview / OG | `og-image` | 1200×630 | |
| Ads | `ad-square`, `ad-portrait`, `ad-story`, `ad-landscape` | 1080×1080, 1080×1350, 1080×1920, 1200×628 | Same message adapted to each, not stretched. |
| Display ads | `display-rectangle`, `display-leaderboard` | 300×250, 728×90 | Tiny: 1 line + logo + button. |
| Slides | `slide-16x9` | 1920×1080 | |
| Website hero mockup | `web-hero` | 1440×900 | Static marketing section, not a working site. |
| Email header | `email-header` | 1200×400 | |
| Flyer / poster | `a4-portrait` | 1240×1754 | |
| Anything else | `width` + `height` | 64–4096px | "Instagram-like 9:16" → 1080×1920. |

## Format-specific rules

**Carousels (IG / LinkedIn)**
- Slide 1 = hook only (≤ 10 words) + swipe cue. Slides 2…n-1 = one point each. Last = recap/CTA.
- Page counter (`<vy-page>/<vy-total>`) and a consistent kicker help people follow.
- LinkedIn: slightly more text per slide is OK (professional, skimmable), still ≤ 40 words.

**YouTube thumbnails**
- ≤ 5 words, huge (110–200px), high contrast, thick weights. Text must complement the title, not repeat it.
- One focal subject (a face with clear emotion, an object, a dramatic before/after). Faces: big, cropped close, looking at the text or camera.
- Saturated, contrasting colors; dark outline or shadow on text over images.
- Avoid the bottom-right ~200×80px (duration badge).
- Variants: make 3 with different concepts so the user can A/B test.

**Stories / vertical**
- Center the important content vertically between the safe zones. Big type; ≤ 20 words.

**Ads**
- One message, one benefit, one CTA button. Product/visual + headline + CTA + logo.
- Text ≤ ~20% of the area for Meta-style ads when there's a strong visual.
- For multi-size sets: recompose for each ratio (don't just scale); keep identical copy and hierarchy.

**Quote cards / announcements**
- The quote is the hero: big, well-set typography, attribution small. Strong single accent.
