# Architecture

```
User ──► Codex / Claude Code (the agent: plans, writes copy, writes frame HTML)
            │  skills: vyybe-create · vyybe-edit · vyybe-branding · vyybe-setup
            ▼
        Vyybe MCP server (stdio, Node 22+, one bundled file)
            ├── project store        ~/Vyybe/Projects  (HTML frames = source of truth, revisions, history)
            ├── brandings            ~/Vyybe/Brandings (theme tokens, logos, art direction, voice)
            ├── compositor           theme → Tailwind v4 (pinned, compiled in-process), fonts, <vy-*> components, assets
            ├── renderer             headless Chrome via CDP — offline, CSP script-src 'none'
            ├── checks               overflow, clipping, overlap, contrast, tiny text, safe zones, fonts, images
            ├── export               PNG / JPG / WebP / PDF (raster, one page per frame) / ZIP
            ├── providers            image generation waterfall (OpenAI → Gemini → fal → Replicate), stock photos
            └── studio UI (MCP App ui://vyybe/<ver>/studio.html) + loopback browser fallback (token-protected)
```

## Key decisions
- **HTML is the source of truth.** Studio edits are written back into the frame HTML (inline styles for moves/resizes/colors), so the agent always sees the real state and downloads are simple. Each write snapshots the previous revision (40 kept per frame).
- **Layers.** Top-level elements of a frame are layers; moves are stored as an inline `translate` composed with any Tailwind translate, so flow layouts and centered elements can be moved too. Resizes set width/height and keep the opposite edge fixed whatever the anchoring.
- **Tokens over values.** Theme colors/fonts become Tailwind tokens (`bg-primary`, `font-display`, `rounded-brand`): shorter frames, consistent brands, one-call restyles (`update_theme`).
- **Components save tokens.** `<vy-icon>`, `<vy-logo>`, `<vy-page>`/`<vy-total>` expand at render time; generated children are tagged `data-vy-gen` and stripped on save.
- **One render path.** Preview, checks and export all use the same composed document; the studio renders the same HTML + CSS in shadow DOM (fonts registered with the FontFace API, Tailwind `@property` rules hoisted), so what you edit is what you export.
- **Cheap feedback for the agent.** Writes return a single contact-sheet image + check results, so a whole carousel can be reviewed in one image.
- **Host differences handled by fallbacks.** UI-linked tools carry `_meta.ui.resourceUri` (+ OpenAI aliases). When the client doesn't declare MCP Apps support, the same UI opens in the browser from a loopback server bound to 127.0.0.1 with a random token, Host/Origin checks and a strict CSP.

## Security
- Frame HTML is sanitized on every write: no scripts, handlers, iframes, forms, external CSS/fonts; URLs limited to `asset:`/`data:image`; remote images are downloaded by the server (SSRF guard: public addresses only, size caps, redirect checks) and become project assets. SVG assets are sanitized.
- Rendering pages run offline (network emulation) with a CSP that forbids scripts.
- Paths are canonicalized against the library root; ids are slug-validated.
- API keys never appear in tool results; the settings panel sends them straight to the Keychain.
