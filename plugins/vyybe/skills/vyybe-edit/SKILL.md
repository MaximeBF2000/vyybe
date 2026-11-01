---
name: vyybe-edit
description: Change an existing Vyybe creation — rewrite or restyle a slide, change copy, colors or fonts, add/remove/reorder slides, make variants or resize it to another format (story, thumbnail, LinkedIn), export files. Use when the user refers to something already made with Vyybe ("make slide 3 punchier", "change the background to blue", "add a slide about pricing", "now do a story version", "export it as PDF").
---

# Vyybe — edit existing creations

Golden rule: **touch only what the user asked for.** Every other frame, and every manual edit the user made in the studio, must survive unchanged.

## 1. Find the project
- If it's the project from this conversation, use its id.
- Otherwise `list_projects` (with a query if they named it). If several plausibly match, ask which one — show names, not ids.

## 2. Get the current state
`get_project` → frame order, ids, names, sizes, revisions, theme, and which frames were **last edited by the user** in the studio.
- Read with `read_frame` only the frames you will change. Always re-read a frame the user edited — their changes live in its HTML (often as inline `style` such as `translate`, `width`, `color`, `font-size`).
- Map "slide 3" to the 3rd frame in the current order (the user may have reordered).

## 3. Classify the change and pick the cheapest correct tool
| Request | How |
|---|---|
| Copy tweak, color/size/font on one element, small fix | `write_frames` with `edits` (exact find/replace on the current HTML). Keep inline styles the user added. |
| Restyle everything (colors/fonts/brand) | `update_theme` (palette/fonts/branding/style) — frame HTML stays, all frames update. Then fix any frame that breaks. |
| Redesign one frame | `write_frames` with full `html` for that frame only, keeping the same `id`. Keep the user's copy unless asked to change it. |
| New frame(s) | `write_frames` with new frames (`position` to insert). Match the existing system: margins, kicker, type scale, page counter. |
| Delete / reorder / duplicate / rename | `manage_frames`. |
| Variants ("3 other hooks") | Duplicate or add frames in the same project (or a `collection` project for alternatives) — genuinely different ideas, named by idea. |
| Other format ("story version", "now a thumbnail") | New frames with the new `format` in the same project (same theme), recomposed for the ratio — not scaled. Page counters only count frames of the same size, so the carousel numbering stays correct. Use a new project only if the user wants it separate. |
| Undo something | `manage_frames {action: "restore", revision}` (history keeps ~40 revisions per frame), or tell the user ⌘Z works in the studio. |
| Export | `export` with the format they want (PDF for LinkedIn carousels, ZIP for Instagram carousels, PNG for single images), then give the file paths. |

Follow the `vyybe-create` process and references for anything you write: the frame contract, the playbook for the format (`references/playbooks/`), `references/techniques.md`, and its asset tools (`find_logo`, `capture_webpage`, image generation). "Make it better / punchier / more professional" means: new concept from the playbook archetypes, real assets, more depth — not just bigger text.

## 4. Verify and present
- Look at the preview returned by your write; fix ✗ issues (max 2 rounds).
- Make sure untouched frames weren't touched (you only wrote the ones you meant to).
- Call `open_studio` (with `frameId` of the changed frame) so the user sees the result, then summarize in one or two lines what changed.

## Conflicts
`REVISION_CONFLICT` means the user edited that frame while you were working: re-read it and re-apply your change on top. Never overwrite their version blindly; if your change contradicts theirs, ask.

## Manual edits made by the user
When the studio reports that the user edited frames, those are their decisions. Don't revert positions, text or colors they changed unless they ask. If a request ("make it more readable") conflicts with a manual edit, mention it.
