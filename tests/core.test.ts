import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const home = fs.mkdtempSync(path.join(os.tmpdir(), "vyybe-test-"));
process.env.VYYBE_HOME = home;
process.env.VYYBE_PLUGIN_ROOT = path.resolve("plugins/vyybe");

const { sanitizeFrame, expandComponents, collapseComponents } = await import("../src/core/html.js");
const store = await import("../src/core/store.js");
const { createZip } = await import("../src/core/zip.js");
const { resolveSize } = await import("../src/core/formats.js");
const { insideDir } = await import("../src/core/paths.js");
const brands = await import("../src/core/brandings.js");

test("sanitizer strips scripts, handlers, iframes and unsafe URLs", () => {
  const r = sanitizeFrame(`<div onclick="x()"><script>alert(1)</script><iframe src="https://x"></iframe><img src="javascript:alert(1)"><a href="javascript:1">x</a><p style="background:url(file:///etc/passwd)">t</p><svg><foreignObject>x</foreignObject></svg><link rel="stylesheet" href="https://x"></div>`);
  assert.doesNotMatch(r.html, /script|onclick|iframe|javascript:img|foreignObject|file:|<link/i);
  assert.ok(r.warnings.length >= 5);
});

test("sanitizer keeps asset refs, data images and collects remote images and classes", () => {
  const r = sanitizeFrame(`<img src="asset:a.png" class="size-10"><img src="https://example.com/b.jpg"><div style="background-image:url(data:image/png;base64,AAAA)"></div>`);
  assert.match(r.html, /asset:a\.png/);
  assert.deepEqual(r.remoteUrls, ["https://example.com/b.jpg"]);
  assert.ok(r.classes.includes("size-10"));
});

test("data: URIs containing url(#id) and quotes survive sanitizing", () => {
  const html = `<div style="background-image:url(&quot;data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'%3E%3Crect filter='url(%23n)'/%3E%3C/svg%3E&quot;)"></div>`;
  const r = sanitizeFrame(html);
  assert.equal(r.warnings.length, 0);
  assert.match(r.html, /filter='url\(%23n\)'/);
});

test("document wrappers are removed", () => {
  const r = sanitizeFrame(`<!doctype html><html><head><title>x</title></head><body><p>hi</p></body></html>`);
  assert.equal(r.html, "<p>hi</p>");
});

test("components expand and collapse back to source", () => {
  const src = `<p>Slide <vy-page pad="2"></vy-page>/<vy-total></vy-total></p><vy-icon name="rocket" class="size-8"></vy-icon>`;
  const expanded = expandComponents(src, { icon: () => `<svg data-vy-gen viewBox="0 0 24 24"></svg>`, logo: () => null, page: 3, total: 7 }, []);
  assert.match(expanded, /03/);
  assert.match(expanded, /<svg data-vy-gen/);
  assert.equal(collapseComponents(expanded).replace(/\s/g, ""), src.replace(/\s/g, ""));
});

test("frame writes are revisioned, edits are exact, conflicts detected", async () => {
  const p = store.createProject({ name: "Test project" });
  const size = { width: 1080, height: 1350 };
  const w1 = await store.writeFrame(p.id, { name: "A", html: `<h1 class="text-text">Hello world</h1>` }, "agent", size);
  assert.equal(w1.revision, 1);
  const w2 = await store.writeFrame(p.id, { id: w1.id, edits: [{ find: "Hello", replace: "Hi" }] }, "agent", size);
  assert.equal(w2.revision, 2);
  assert.match(store.readFrameHtml(p.id, w1.id), /Hi world/);
  await assert.rejects(store.writeFrame(p.id, { id: w1.id, edits: [{ find: "Nope", replace: "x" }] }, "agent", size), /not found/);
  await assert.rejects(store.writeFrame(p.id, { id: w1.id, html: "<p>x</p>", baseRevision: 1 }, "user", size), /changed/);
  assert.equal(store.readFrameRevision(p.id, w1.id, 1).trim(), `<h1 class="text-text">Hello world</h1>`);
  const second = await store.writeFrame(p.id, { name: "B", html: "<p>b</p>" }, "agent", size);
  const r = store.reorderFrames(p.id, [second.id, w1.id]);
  assert.deepEqual(r.frames.map((f) => f.id), [second.id, w1.id]);
});

test("ids and paths cannot escape the library", () => {
  assert.throws(() => store.projectDir("../etc"));
  assert.throws(() => store.loadProject("..%2f"));
  assert.equal(insideDir(home, path.join(home, "Projects", "x")), true);
  assert.equal(insideDir(home, path.join(home, "..", "x")), false);
});

test("sizes resolve from presets and bounds are enforced", () => {
  assert.deepEqual(resolveSize({ format: "youtube-thumbnail" }), { width: 1280, height: 720, format: "youtube-thumbnail" });
  assert.throws(() => resolveSize({ width: 10, height: 10 }));
  assert.throws(() => resolveSize({ format: "nope" }));
});

test("zip writer produces a valid archive", () => {
  const zip = createZip([{ name: "a.txt", data: Buffer.from("hello") }, { name: "../b.txt", data: Buffer.from("x") }]);
  assert.equal(zip.readUInt32LE(0), 0x04034b50);
  assert.equal(zip.readUInt32LE(zip.length - 22), 0x06054b50);
  assert.ok(!zip.includes(Buffer.from("../")));
});

test("brandings save, version, merge and become default", async () => {
  const { branding } = await brands.saveBranding({ name: "Acme", theme: { colors: { primary: "#ff0000" }, fonts: { display: { family: "Inter" } } }, isDefault: true });
  assert.equal(branding.version, 1);
  const { branding: b2, created } = await brands.saveBranding({ id: branding.id, theme: { colors: { accent: "#00ff00" } } });
  assert.equal(created, false);
  assert.equal(b2.version, 2);
  assert.equal(b2.theme.colors.primary, "#ff0000");
  assert.equal(b2.theme.colors.accent, "#00ff00");
  assert.equal(brands.defaultBranding()?.id, branding.id);
});
