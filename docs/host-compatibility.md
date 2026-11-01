# Host compatibility

Tested 2026-11-01 on macOS (Apple Silicon), Node 26 / bundled-runtime fallback, Chrome installed.

| Capability | Claude Code CLI (`claude -p`) | Codex CLI (`codex exec`) | Reference MCP Apps host (tests/host) | Claude / Codex desktop apps |
|---|---|---|---|---|
| Plugin install & skills discovered | ✅ tested (`--plugin-dir`, marketplace validated) | ✅ tested (`codex plugin marketplace add` + `codex plugin add`) | n/a | expected (same plugin format) — **not driven by automation** |
| MCP server starts (stdio, `server/launch.sh`) | ✅ | ✅ | ✅ | expected |
| Tools callable without approval prompts | ✅ (with allowed tools) | ✅ via `default_tools_approval_mode: "approve"` in `mcp.codex.json` | n/a | Claude asks permission per tool unless the user allows the server |
| Preview images returned to the model | ✅ (agent reviews its contact sheet) | ✅ | n/a | expected |
| Inline studio (MCP App) | ❌ CLI has no UI → browser fallback opens | ❌ CLI has no UI → browser fallback | ✅ tested: load, select, move/resize, text edit, autosave, `ui/update-model-context`, picker `ui/message`, `ui/download-file`, fullscreen request | Codex desktop renders MCP Apps (OpenAI's own Codex Security plugin uses them); Claude Desktop renders MCP Apps; Claude Code desktop: unverified |
| Browser fallback studio | ✅ tested (all features) | ✅ (same server) | n/a | ✅ |
| Picker choice back to chat | via user message (browser fallback: user says "go with my choice"; `get_choice` reads it) | same | ✅ `ui/message` | ✅ when the host supports `ui/message` |

## Claude desktop app (Code tab)
Renders the MCP App, but refuses the view's own tool calls for local plugin servers ("IPC not available for MCP tool call"). Vyybe handles it in three layers:
1. `open_studio` / `show_options` ship everything the view needs in the tool result's `_meta["vyybe/data"]` (never shown to the model), so it renders without calling back.
2. Saves/exports then go straight to the server's loopback bridge (`http://127.0.0.1:<port>`, token-authenticated, CORS + Private Network Access headers), declared in the resource's `_meta.ui.csp.connectDomains`.
3. If the host also blocks that connection, the studio switches to a clean preview with an "Open the full editor" button (same studio in the browser).
Picker choices go back through `ui/message`, which doesn't need a tool call.

## Notes
- The UI is a single self-contained HTML file (no CDN), works under the MCP Apps default CSP (`connect-src 'none'`, `img-src data:`): fonts are registered with the FontFace API from bytes, images are data URIs, frame CSS lives in shadow roots.
- Tool results: model-facing tools return text + images only (Claude Code shows `structuredContent` *instead of* text when present); UI tools also repeat their message inside `structuredContent.message`.
- When the client doesn't declare the `io.modelcontextprotocol/ui` extension, UI tools open the same studio in the default browser (loopback server, random token) and return the link.
- Windows / Linux: the engine is cross-platform; `launch.sh` covers macOS/Linux. A Windows launcher is still to do.
