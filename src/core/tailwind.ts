import fs from "node:fs";
import path from "node:path";
import { compile } from "tailwindcss";
import { dataFile } from "./paths.js";
import { hash } from "./util.js";
import { themeToTailwindCss, type Theme } from "./theme.js";

function readTailwindFile(id: string): { path: string; content: string } {
  const name = id === "tailwindcss" ? "index.css" : id.replace(/^tailwindcss\//, "").replace(/^\.\//, "");
  const file = dataFile(path.join("tailwind", name.endsWith(".css") ? name : `${name}.css`));
  return { path: file, content: fs.readFileSync(file, "utf8") };
}

const cache = new Map<string, string>();

/**
 * Compile Tailwind v4 for a theme + the class candidates used by frames.
 * Pinned Tailwind ships with the plugin: no CDN, identical output in preview and export.
 */
export async function compileTailwind(theme: Theme, candidates: Iterable<string>): Promise<string> {
  const entry = themeToTailwindCss(theme);
  const list = [...new Set(candidates)].sort();
  const key = hash(entry, list.join(" "), theme.css ?? "");
  const hit = cache.get(key);
  if (hit) return hit;
  const compiler = await compile(entry, {
    base: dataFile("tailwind"),
    loadStylesheet: async (id: string) => {
      const f = readTailwindFile(id);
      return { path: f.path, base: path.dirname(f.path), content: f.content };
    },
  } as any);
  let css = compiler.build(list);
  if (theme.css) css += `\n/* theme css */\n${theme.css}\n`;
  if (cache.size > 50) cache.clear();
  cache.set(key, css);
  return css;
}

/** Base styles for the frame canvas and Vyybe components. */
export const FRAME_BASE_CSS = `@layer base {
.vy-frame{position:relative;overflow:hidden;isolation:isolate;-webkit-font-smoothing:antialiased;text-rendering:geometricPrecision}
vy-icon{display:inline-block;width:1em;height:1em;flex-shrink:0;line-height:0;vertical-align:middle}
vy-icon>svg{width:100%;height:100%;display:block}
vy-logo{display:inline-block;height:64px;line-height:0}
vy-logo>img{height:100%;width:auto;display:block}
vy-page,vy-total{display:inline}
}`;
