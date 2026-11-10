#!/usr/bin/env node
// Export the map as an SVG plus 1920x1080 PNGs, rendered from the repo's data.
//
//   node export_map.mjs [repo-root] [--out DIR] [--bg LIST] [--today YYYY-MM-DD] [--no-labels]
//
// Writes to DIR (default <repo>/exports, which is gitignored):
//   workday-map.svg                          same as the editor's "Export SVG" (transparent)
//   workday-map-1920x1080-<bg>.png           one per background in --bg, map centred and
//                                            scaled to fit
// --bg is a comma-separated list of hex colours and/or "transparent".
// Default: "#022043,transparent", which gives workday-map-1920x1080-022043.png (the deck navy)
// and workday-map-1920x1080-transparent.png (alpha background: drop it onto any slide colour).
// PNGs are rendered with headless Google Chrome (or Chromium/Edge/Brave).
// Prints the absolute path of every file written.

import { writeFileSync, mkdirSync, existsSync, statSync, rmSync } from "fs";
import { join, resolve } from "path";
import { execFileSync } from "child_process";
import { tmpdir } from "os";
import { pathToFileURL } from "url";
import { loadMap, mapSVG, VIEW_W, VIEW_H } from "./lib/app.mjs";

const args = process.argv.slice(2);
const take = (f) => { const i = args.indexOf(f); return i >= 0 ? args.splice(i, 2)[1] : undefined; };
const has = (f) => { const i = args.indexOf(f); return i >= 0 ? (args.splice(i, 1), true) : false; };
const today = take("--today") ?? new Date().toISOString().slice(0, 10);
const outArg = take("--out");
const bgs = (take("--bg") ?? "#022043,transparent").split(",").map(s => s.trim()).filter(Boolean);
const labels = !has("--no-labels");
const root = resolve(args[0] ?? process.cwd());
const out = resolve(outArg ?? join(root, "exports"));
mkdirSync(out, { recursive: true });

for (const bg of bgs) {
  if (bg !== "transparent" && !/^#[0-9a-fA-F]{6}$/.test(bg)) {
    console.error(`--bg: "${bg}" is not a #rrggbb colour or "transparent"`);
    process.exit(2);
  }
}

const map = await loadMap(root, today);
const svgPath = join(out, "workday-map.svg");
writeFileSync(svgPath, mapSVG(map, { labels }));
const written = [svgPath];

const browsers = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
  "/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser",
];
const chrome = browsers.find(existsSync);
if (!chrome) {
  console.error(`SVG written to ${svgPath}\nNo Chrome/Chromium found, so no PNG. Open the SVG in a browser at 1920x1080 and screenshot it instead.`);
  process.exit(1);
}

// 1920x1080 page, map scaled to fit with a margin.
const W = 1920, H = 1080, MARGIN = 40;
const scale = Math.min((W - 2 * MARGIN) / VIEW_W, (H - 2 * MARGIN) / VIEW_H);
const w = Math.round(VIEW_W * scale), h = Math.round(VIEW_H * scale);
const svg = mapSVG(map, { labels });

for (const bg of bgs) {
  const transparent = bg === "transparent";
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
html,body{margin:0;width:${W}px;height:${H}px;background:${transparent ? "transparent" : bg};overflow:hidden}
svg{position:absolute;left:${Math.round((W - w) / 2)}px;top:${Math.round((H - h) / 2)}px;width:${w}px;height:${h}px}
</style></head><body>${svg}</body></html>`;
  const htmlPath = join(tmpdir(), `workday-map-export-${process.pid}.html`);
  writeFileSync(htmlPath, html);
  const pngPath = join(out, `workday-map-1920x1080-${transparent ? "transparent" : bg.slice(1).toLowerCase()}.png`);
  rmSync(pngPath, { force: true });
  const profile = join(tmpdir(), `workday-map-chrome-${process.pid}`);
  execFileSync(chrome, [
    "--headless=new", "--disable-gpu", "--hide-scrollbars", "--force-device-scale-factor=1",
    // Chrome paints an opaque white canvas unless told otherwise; 00000000 keeps the alpha channel.
    ...(transparent ? ["--default-background-color=00000000"] : []),
    `--user-data-dir=${profile}`, `--window-size=${W},${H}`, `--screenshot=${pngPath}`,
    pathToFileURL(htmlPath).href,
  ], { stdio: "ignore", timeout: 60000 });
  if (!existsSync(pngPath) || statSync(pngPath).size === 0) { console.error(`Chrome did not produce ${pngPath}.`); process.exit(1); }
  written.push(pngPath);
}

// The old single-PNG name, from before --bg existed, would now be stale.
rmSync(join(out, "workday-map-1920x1080.png"), { force: true });

for (const p of written) console.log(p);
