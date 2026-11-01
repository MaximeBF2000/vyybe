---
name: vyybe-setup
description: Set up or troubleshoot Vyybe — first-run onboarding, connecting an image generation provider (OpenAI, Gemini, fal.ai, Replicate) or stock photo keys (Pexels, Unsplash), installing the rendering engine, and checking what works. Use when the user installs Vyybe, asks how to get started, wants to enable image generation, or when a Vyybe tool reports a missing renderer or provider.
---

# Vyybe — setup & onboarding

Keep it short and friendly: the user wants to make visuals, not configure software.

## 1. Check status
Call `vyybe_status`. It reports the library folder, renderer, brandings, image/photo providers.

## 2. Renderer (required)
Vyybe renders with any installed Chrome-based browser (Chrome, Edge, Brave, Chromium).
If it reports the renderer is missing: explain in one line, and **ask** before downloading — "Vyybe needs a small rendering engine (~90 MB, private to Vyybe). Install it?" On yes → `vyybe_setup { installRenderer: true }`.

## 3. Image generation (optional)
Vyybe works without it (typography, icons, stock photos). To enable generated images:
- If your environment already has its own image generation (e.g. Codex), nothing is needed — you'll use it and import the files.
- Otherwise call `open_settings`: the user pastes a key from OpenAI, Google Gemini, fal.ai or Replicate. Keys go to the macOS Keychain and never pass through the chat. Mention that generation uses their own API credits.
- If the user pastes a key directly in the chat, store it with `vyybe_setup { apiKey: { provider, key } }`, don't repeat it back, and suggest using the settings panel next time.
- Stock photos work out of the box (Openverse). A free Pexels or Unsplash key (via `open_settings`) gives better results.

## 4. First branding (optional, recommended)
Offer: "Want me to set up your branding so everything you create looks like you? I can take it from your website, a few posts, or a quick chat." → follow `vyybe-branding`.

## 5. Show what it can do
Suggest a first creation tailored to them, e.g. "Tell me a topic and I'll make a 6-slide carousel", "Give me your next video title and I'll make 3 thumbnail options".

## Where things live (for the user)
- Creations: `~/Vyybe/Projects/<project>/` (exports in `exports/`).
- Brandings: `~/Vyybe/Brandings/`.
- Everything stays on their computer. No account needed.

## Troubleshooting
- Studio doesn't appear in the chat → the tool result contains a browser link; share it (it works while the chat is open).
- Fonts missing in previews → the computer was offline when the font was first used; it will download next time online, or pick a system font.
- `RENDERER_UNAVAILABLE` even with Chrome installed → set up the private renderer with `vyybe_setup { installRenderer: true }`.
