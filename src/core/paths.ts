import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * Where the user's Vyybe library lives. Deliberately a visible folder in the
 * home directory: non-technical users should be able to find their creations
 * in Finder / Explorer.
 */
export function libraryRoot(): string {
  const override = process.env.VYYBE_HOME?.trim();
  return override ? path.resolve(override) : path.join(os.homedir(), "Vyybe");
}

export const lib = {
  root: () => libraryRoot(),
  projects: () => path.join(libraryRoot(), "Projects"),
  brandings: () => path.join(libraryRoot(), "Brandings"),
  internal: () => path.join(libraryRoot(), ".vyybe"),
  config: () => path.join(libraryRoot(), ".vyybe", "config.json"),
  credentials: () => path.join(libraryRoot(), ".vyybe", "credentials.json"),
  cache: () => path.join(libraryRoot(), ".vyybe", "cache"),
  fontsCache: () => path.join(libraryRoot(), ".vyybe", "cache", "fonts"),
  runtime: () => path.join(libraryRoot(), ".vyybe", "runtime"),
  pickers: () => path.join(libraryRoot(), ".vyybe", "pickers"),
};

/** Root of the installed plugin (the folder containing `server/`, `data/`, `skills/`). */
export function pluginRoot(): string {
  const env = process.env.VYYBE_PLUGIN_ROOT || process.env.CLAUDE_PLUGIN_ROOT || process.env.PLUGIN_ROOT;
  if (env && fs.existsSync(path.join(env, "data"))) return env;
  // Bundled file lives at <plugin>/server/vyybe.mjs
  const here = path.dirname(fileURLToPath(import.meta.url));
  for (const candidate of [path.resolve(here, ".."), path.resolve(here, "../.."), path.resolve(here, "../../plugins/vyybe")]) {
    if (fs.existsSync(path.join(candidate, "data"))) return candidate;
  }
  return path.resolve(here, "..");
}

export function dataFile(name: string): string {
  return path.join(pluginRoot(), "data", name);
}

export function ensureDir(dir: string): string {
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/** Display a path with ~ for the home directory (friendlier in chat). */
export function tildify(p: string): string {
  const home = os.homedir();
  return p.startsWith(home) ? "~" + p.slice(home.length) : p;
}

/** Ensure `child` stays inside `parent` once resolved (blocks ../ traversal and symlink escapes). */
export function insideDir(parent: string, child: string): boolean {
  let realParent = parent;
  let realChild = child;
  try { realParent = fs.realpathSync(parent); } catch {}
  try {
    realChild = fs.realpathSync(child);
  } catch {
    // Resolve the nearest existing ancestor so symlinked roots (/var → /private/var) compare correctly.
    let dir = path.resolve(child);
    const rest: string[] = [];
    while (!fs.existsSync(dir) && path.dirname(dir) !== dir) {
      rest.unshift(path.basename(dir));
      dir = path.dirname(dir);
    }
    try { dir = fs.realpathSync(dir); } catch {}
    realChild = path.join(dir, ...rest);
  }
  const rel = path.relative(realParent, realChild);
  return !!rel && !rel.startsWith("..") && !path.isAbsolute(rel);
}
