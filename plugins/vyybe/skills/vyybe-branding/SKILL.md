---
name: vyybe-branding
description: Create, update or apply the user's reusable Vyybe branding (brand kit / visual identity memory) — colors, fonts, logo, art direction, tone of voice, handle — so every carousel, thumbnail and post stays consistent. Use when the user says "use my brand", "set up my branding", "save this look/style", "remember these colors", "extract my brand from my website/screenshot", "change my brand color", or asks which brandings they have.
---

# Vyybe — brandings

A **branding** is the user's saved visual identity, stored locally in `~/Vyybe/Brandings/`. Projects take a snapshot of it, so later changes never alter old creations. The default branding applies automatically to new projects.

**Never save or overwrite a branding without the user's explicit OK.** Show what you're about to save and ask. Saving after "yes / save it / looks good" is fine.

## What a great branding contains
- `name` — the brand or creator name.
- `theme.colors` — 5–8 named colors with clear roles: `background`, `surface`, `text`, `muted`, `primary` (main brand color), `secondary`, `accent`. Check text/background contrast.
- `theme.fonts` — `display` (headlines) and `body`, optionally `mono` or `hand`. Google Fonts names (verify with `search_fonts` if unsure) with the weights actually used.
- `theme.radius` — e.g. `0px` (editorial), `16px`, `28px`, `999px` (pill-heavy).
- `logos` — variants like `primary`, `mark`, `light` (for dark backgrounds). Sources: local path, https URL, or `asset:<file>` from a project.
- `styleGuide` — **concrete art direction**, written as rules a designer could follow:
  - layout & composition (alignment, margins, density, where the logo/handle go)
  - typography treatment (case, tracking, emphasis style)
  - imagery (photo style, illustration, icons, textures) and what to avoid
  - signature elements (e.g. "acid-green underline on one key word", "terminal cards", "grain overlay")
  Avoid vague adjectives alone ("modern, clean"). 60–200 words.
- `voice` — tone rules for copy (e.g. "Direct, first person, dev humor, no corporate jargon, short sentences").
- `handle` / `website` — shown on posts when appropriate.

## Flows

### "Set up my brand" (from scratch)
Ask, in one message (skip what you already know): brand name + what they do, logo file (optional), colors they use (or a vibe), fonts (optional), 2–3 words for the feel, social handle. If they don't know colors/fonts, propose a set — or use `show_options` with 3–4 style presets carrying their real name/headline and let them pick, then adapt.

### From a website
Fetch the site with your own browsing/fetch tools (if you can't access it, ask for screenshots or colors). Extract: logo URL (prefer SVG/PNG), CSS color variables or dominant colors, font families, tone of the copy. Present as a **proposal**: "Here's what I found: … Should I save it as your branding?" Mark guesses as guesses.

### From screenshots / images / existing posts
Look at them; propose palette (with hex estimates), font style (and the closest Google Fonts), layout patterns and voice. Ask for confirmation and any exact values they know.

### "Save this look" (from a project)
`save_branding { name, fromProject: "<projectId>", styleGuide, voice }` — `fromProject` copies the project's theme and logos. Write the styleGuide from what makes the project distinctive. Ask for a name only if you can't derive a good one.

### Update
`save_branding { id, ...changes }` merges into the existing branding (bumps the version). Use `removeLogos` to drop a logo. For "make this my default" → `isDefault: true`.
Clarify scope when ambiguous: "Change it just for this project (update_theme) or in your saved branding for future posts?"

### Apply / inspect
- New creations: `create_project { branding: "<id>" }` (the default applies automatically).
- Existing project: `update_theme { projectId, branding: "<id>" }`.
- "What brandings do I have?" → `vyybe_status`, details with `get_branding`.
- Delete only on explicit request → `delete_branding`.

## After saving
Confirm in one line (name, default or not) and offer to show it on a sample post. The first branding a user saves becomes their default automatically.
