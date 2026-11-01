# Development

```bash
npm install
npm run build        # data (icons, tailwind) + server bundle + studio UI → plugins/vyybe/
npm run typecheck
npm test
```

- `src/core/` — engine: projects, brandings, theme → Tailwind, fonts, icons, HTML sanitizer, compositor, Chrome renderer (CDP), checks, export, images/providers, secrets.
- `src/server/` — MCP server (`tools.ts`), local browser bridge (`http.ts`), entry (`main.ts`).
- `src/ui/` — studio React app (built into one self-contained `studio.html`).
- `plugins/vyybe/` — the distributable plugin: manifests for Claude Code (`.claude-plugin/`) and Codex (`.codex-plugin/`), MCP configs, skills, built server + UI, data.

The built files under `plugins/vyybe/server` and `plugins/vyybe/data` are committed so the plugin installs straight from git.

## Trying it locally
- Claude Code: `claude --plugin-dir plugins/vyybe`
- Codex: `codex plugin marketplace add .` then `codex plugin add vyybe@vyybe`
- Use a throwaway library: `VYYBE_HOME=/tmp/vyybe-dev`. `VYYBE_NO_BROWSER=1` stops the fallback from opening browser tabs.
