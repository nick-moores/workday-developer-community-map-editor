#!/usr/bin/env node
// Export the map as an SVG and a 1920x1080 PNG, rendered from the repo's data.
//
//   node export_map.mjs [repo-root] [--out DIR] [--today YYYY-MM-DD] [--no-labels]
//
// Writes to DIR (default <repo>/exports, which is gitignored):
//   workday-map.svg            same as the editor's "Export SVG" (transparent background)
//   workday-map-1920x1080.png  navy background, map centred and scaled to fit
// The PNG is rendered with headless Google Chrome (or Chromium/Edge/Brave).
// Prints the two absolute paths on success.

import { writeFileSync, mkdirSync, existsSync, statSync } from "fs";
import { join, resolve } from "path";
import { execFileSync } from "child_process";
import { tmpdir } from "os";
import { pathToFileURL } from "url";
import { loadMap, mapSVG, BG, VIEW_W, VIEW_H } from "./lib/app.mjs";

const args = process.argv.slice(2);
const take = (f) => { const i = args.indexOf(f); return i >= 0 ? args.splice(i, 2)[1] : undefined; };
const has = (f) => { const i = args.indexOf(f); return i >= 0 ? (args.splice(i, 1), true) : false; };
const today = take("--today") ?? new Date().toISOString().slice(0, 10);
const outArg = take("--out");
const labels = !has("--no-labels");
const root = resolve(args[0] ?? process.cwd());
const out = resolve(outArg ?? join(root, "exports"));
mkdirSync(out, { recursive: true });

const map = await loadMap(root, today);
const svgPath = join(out, "workday-map.svg");
writeFileSync(svgPath, mapSVG(map, { labels }));

// PNG: 1920x1080 page, navy background, map scaled to fit with a margin.
const W = 1920, H = 1080, MARGIN = 40;
const scale = Math.min((W - 2 * MARGIN) / VIEW_W, (H - 2 * MARGIN) / VIEW_H);
const w = Math.round(VIEW_W * scale), h = Math.round(VIEW_H * scale);
const html = `<!doctype html><html><head><meta charset="utf-8"><style>
html,body{margin:0;width:${W}px;height:${H}px;background:${BG};overflow:hidden}
svg{position:absolute;left:${Math.round((W - w) / 2)}px;top:${Math.round((H - h) / 2)}px;width:${w}px;height:${h}px}
</style></head><body>${mapSVG(map, { labels })}</body></html>`;
const htmlPath = join(tmpdir(), `workday-map-export-${process.pid}.html`);
writeFileSync(htmlPath, html);

const browsers = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
  "/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser",
];
const chrome = browsers.find(existsSync);
const pngPath = join(out, "workday-map-1920x1080.png");
if (!chrome) {
  console.error(`SVG written to ${svgPath}\nNo Chrome/Chromium found, so no PNG. Open ${htmlPath} in a browser at 1920x1080 and screenshot it instead.`);
  process.exit(1);
}
const profile = join(tmpdir(), `workday-map-chrome-${process.pid}`);
execFileSync(chrome, [
  "--headless=new", "--disable-gpu", "--hide-scrollbars", "--force-device-scale-factor=1",
  `--user-data-dir=${profile}`, `--window-size=${W},${H}`, `--screenshot=${pngPath}`,
  pathToFileURL(htmlPath).href,
], { stdio: "ignore", timeout: 60000 });
if (!existsSync(pngPath) || statSync(pngPath).size === 0) { console.error("Chrome did not produce a PNG."); process.exit(1); }

console.log(svgPath);
console.log(pngPath);
