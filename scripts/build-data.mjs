// Generates the runtime data shipped with the plugin: icon indexes and the pinned Tailwind stylesheets.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const out = path.join(root, "plugins/vyybe/data");
fs.mkdirSync(path.join(out, "tailwind"), { recursive: true });

// Lucide: name → inner SVG + tags
const nodes = require("lucide-static/icon-nodes.json");
const tags = require("lucide-static/tags.json");
const esc = (v) => String(v).replace(/&/g, "&amp;").replace(/"/g, "&quot;");
const lucide = {};
for (const [name, children] of Object.entries(nodes)) {
  const inner = children
    .map(([tag, attrs]) => `<${tag} ${Object.entries(attrs).map(([k, v]) => `${k}="${esc(v)}"`).join(" ")}/>`)
    .join("");
  lucide[name] = { s: inner, t: tags[name] ?? [] };
}
// Aliases (old/alternate names) only exist as SVG files — include them so any common name resolves.
const svgDir = path.join(path.dirname(require.resolve("lucide-static/package.json")), "icons");
for (const f of fs.readdirSync(svgDir)) {
  const name = f.replace(/\.svg$/, "");
  if (lucide[name]) continue;
  const svg = fs.readFileSync(path.join(svgDir, f), "utf8");
  const inner = svg.replace(/^[\s\S]*?<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "").replace(/\s*\n\s*/g, "").trim();
  if (inner) lucide[name] = { s: inner, t: [], a: 1 };
}
fs.writeFileSync(path.join(out, "icons-lucide.json"), JSON.stringify(lucide));

// Simple Icons: slug → title, brand hex, path
const si = require("simple-icons");
const brands = {};
for (const icon of Object.values(si)) {
  if (!icon || !icon.slug || !icon.path) continue;
  brands[icon.slug] = { t: icon.title, h: icon.hex, p: icon.path };
}
fs.writeFileSync(path.join(out, "icons-brands.json"), JSON.stringify(brands));

// Tailwind v4 stylesheets (pinned with the plugin)
const twDir = path.dirname(require.resolve("tailwindcss/package.json"));
for (const f of ["index.css", "theme.css", "preflight.css", "utilities.css"]) {
  fs.copyFileSync(path.join(twDir, f), path.join(out, "tailwind", f));
}
const twVersion = require("tailwindcss/package.json").version;
fs.writeFileSync(path.join(out, "tailwind", "VERSION"), twVersion + "\n");

console.log(`data: ${Object.keys(lucide).length} lucide icons, ${Object.keys(brands).length} brand icons, tailwind ${twVersion}`);

// Small icon subset for the studio UI itself
const UI_ICONS = ["undo-2", "redo-2", "download", "maximize-2", "minimize-2", "layout-grid", "square", "copy", "trash-2", "image", "type", "layers", "x", "check", "arrow-up", "arrow-down", "settings", "folder-open", "plus", "panel-right", "chevrons-up", "chevrons-down", "file-image", "file-text", "file-archive", "upload", "square-dashed", "shapes", "sparkles", "align-left", "align-center", "align-right", "bold", "italic", "case-upper", "rotate-cw", "zoom-in", "zoom-out", "scan", "external-link", "alert-triangle", "loader", "key-round", "eye", "eye-off", "pencil", "message-square", "triangle-alert"];
const uiIcons = {};
for (const n of UI_ICONS) if (lucide[n]) uiIcons[n] = lucide[n].s;
fs.writeFileSync(path.join(root, "src/ui/ui-icons.json"), JSON.stringify(uiIcons));
