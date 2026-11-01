// Build the distributable plugin: data files, the bundled MCP server and the single-file studio UI.
import { build } from "esbuild";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const plugin = path.join(root, "plugins/vyybe");
const watch = process.argv.includes("--watch");
const only = process.argv.find((a) => a.startsWith("--only="))?.slice(7);

fs.mkdirSync(path.join(plugin, "server"), { recursive: true });

if (!only || only === "data") {
  execFileSync("node", [path.join(root, "scripts/build-data.mjs")], { stdio: "inherit" });
}

if (!only || only === "server") {
  await build({
    entryPoints: [path.join(root, "src/server/main.ts")],
    outfile: path.join(plugin, "server/vyybe.mjs"),
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node22",
    minify: false,
    sourcemap: false,
    legalComments: "none",
    banner: {
      js: "// Vyybe MCP server — bundled. Source: src/server\nimport { createRequire as __vyCreateRequire } from 'node:module'; const require = __vyCreateRequire(import.meta.url);",
    },
    logLevel: "info",
  });
}

if (!only || only === "ui") {
  execFileSync("npx", ["vite", "build", "--config", path.join(root, "src/ui/vite.config.ts")], { stdio: "inherit", cwd: root });
  const built = path.join(root, "dist-ui/index.html");
  fs.copyFileSync(built, path.join(plugin, "server/studio.html"));
  console.log(`studio.html: ${(fs.statSync(built).size / 1024).toFixed(0)} KB`);
}
