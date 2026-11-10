// Load the map exactly as the app builds it, from the repo's own source:
// src/locations.js, src/countryLookup.js, src/data/locations.json and the
// RAW_CELLS / palette in src/App.jsx. Shared by check_map.mjs and export_map.mjs.
//
// npm deps (topojson-client, world-atlas) come from <repo>/node_modules when
// installed, otherwise they're downloaded once from jsDelivr into
// ~/.cache/workday-map-skill (useful where `npm install` is blocked).

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join, resolve } from "path";
import { homedir, tmpdir } from "os";
import { pathToFileURL } from "url";

export const STEP = 28.54, RECT = 18.27, VIEW_W = 3900, VIEW_H = 1845.02, BG = "#0B1437";
const CACHE = join(homedir(), ".cache", "workday-map-skill");

async function dep(root, localPath, url, cacheName) {
  const local = join(root, "node_modules", localPath);
  if (existsSync(local)) return local;
  const cached = join(CACHE, cacheName);
  if (!existsSync(cached)) {
    mkdirSync(CACHE, { recursive: true });
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Download failed (${res.status}): ${url}`);
    writeFileSync(cached, Buffer.from(await res.arrayBuffer()));
  }
  return cached;
}

export async function loadMap(rootArg, today = new Date().toISOString().slice(0, 10)) {
  const root = resolve(rootArg);
  const topoPath = await dep(root, "topojson-client/dist/topojson-client.js",
    "https://cdn.jsdelivr.net/npm/topojson-client@3.1.0/dist/topojson-client.js", "topojson-client-3.1.0.cjs");
  const atlasPath = await dep(root, "world-atlas/countries-50m.json",
    "https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-50m.json", "world-atlas-2.0.2-countries-50m.json");

  // Copy the repo modules to a temp dir with their imports pointed at real files.
  const work = join(tmpdir(), `workday-map-${process.pid}-${Date.now()}`);
  mkdirSync(work, { recursive: true });
  const shim = join(work, "topojson.mjs");
  writeFileSync(shim, `import { createRequire } from "module"; const t = createRequire(import.meta.url)(${JSON.stringify(topoPath)}); export const feature = t.feature;`);
  const rewrite = (file, out, pairs) => {
    let src = readFileSync(join(root, "src", file), "utf8");
    for (const [re, rep] of pairs) src = src.replace(re, rep);
    writeFileSync(join(work, out), src);
    return pathToFileURL(join(work, out)).href;
  };
  const dataPath = join(root, "src", "data", "locations.json");
  const locs = await import(rewrite("locations.js", "locations.mjs",
    [[/^import data from .*$/m, `import data from ${JSON.stringify(dataPath)} with { type: "json" };`]]));
  const { buildCountryLookup } = await import(rewrite("countryLookup.js", "countryLookup.mjs", [
    [/^import \{ feature \} from .*$/m, `import { feature } from ${JSON.stringify(pathToFileURL(shim).href)};`],
    [/^import worldData from .*$/m, `import worldData from ${JSON.stringify(atlasPath)} with { type: "json" };`],
  ]));

  const lookupSrc = readFileSync(join(root, "src", "countryLookup.js"), "utf8");
  const countryNames = new Set([...lookupSrc.matchAll(/\d+:\s*"([^"]+)"/g)].map(m => m[1]));
  const app = readFileSync(join(root, "src", "App.jsx"), "utf8");
  const RAW_CELLS = JSON.parse(app.match(/const RAW_CELLS = (\[\[.*?\]\]);/)[1]);
  const PALETTE = [...app.matchAll(/\{ label: "([^"]+)",\s*hex: "(#[0-9A-Fa-f]{6})" \}/g)].map(m => ({ label: m[1], hex: m[2] }));
  const data = JSON.parse(readFileSync(dataPath, "utf8"));

  const lookup = buildCountryLookup(RAW_CELLS);
  const raw = {};
  for (const [c, r, ci] of RAW_CELLS) raw[`${c},${r}`] = ci;
  const grid = locs.applyCountryColors({ ...raw }, lookup, PALETTE.map(p => p.hex));
  const cells = locs.litCountryCells(lookup, new Set(Object.keys(raw)));
  const colorOf = locs.assignCountryColors(cells);
  const cities = locs.buildCities(today).map((c, i) => ({ ...c, country: data.locations[i].country }));

  return { data, raw, grid, lookup, countryNames, cells, colorOf, cities, PALETTE, STATUS_COLORS: locs.STATUS_COLORS, BORDER_CELLS: locs.BORDER_CELLS, NEARBY_CELLS: locs.NEARBY_CELLS };
}

// The same SVG the editor's "Export SVG" button produces (App.jsx generateSVG):
// grid cells, pins, labels, legend; transparent background (drops onto a navy slide).
export function mapSVG({ grid, cities, PALETTE, STATUS_COLORS }, { labels = true, background = false } = {}) {
  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");
  const rects = Object.entries(grid).map(([key, ci]) => {
    const [col, row] = key.split(",").map(Number);
    return `<rect x="${(col * STEP).toFixed(2)}" y="${(row * STEP).toFixed(2)}" width="${RECT}" height="${RECT}" fill="${PALETTE[ci].hex}" opacity="0.99"/>`;
  }).join("");
  const pins = cities.map(c => `<rect x="${(c.col * STEP).toFixed(2)}" y="${(c.row * STEP).toFixed(2)}" width="${RECT}" height="${RECT}" fill="${c.color}"/>`).join("");
  const text = labels ? cities.map(c => {
    const left = c.labelSide === "left";
    const x = left ? c.col * STEP - 6 : c.col * STEP + RECT + 6;
    return `<text x="${x.toFixed(2)}" y="${(c.row * STEP + RECT * 0.75).toFixed(2)}" text-anchor="${left ? "end" : "start"}" fill="white" font-size="16" font-family="Arial, sans-serif">${esc(c.name)}</text>`;
  }).join("") : "";
  const LX = 2 * STEP, LY = 58 * STEP;
  const legend = Object.values(STATUS_COLORS).map((s, i) => {
    const y = LY + i * STEP * 1.2;
    return `<rect x="${LX}" y="${y.toFixed(2)}" width="${RECT}" height="${RECT}" fill="${s.hex}"/><text x="${(LX + RECT + 8).toFixed(2)}" y="${(y + RECT * 0.8).toFixed(2)}" fill="white" font-size="20" font-family="Arial, sans-serif">${esc(s.label)}</text>`;
  }).join("");
  const bg = background ? `<rect width="${VIEW_W}" height="${VIEW_H}" fill="${BG}"/>` : "";
  return `<svg viewBox="0 0 ${VIEW_W} ${VIEW_H}" xmlns="http://www.w3.org/2000/svg" id="Layer_2" overflow="hidden"><defs></defs><g id="_150_Group">${bg}${rects}${pins}${text}${legend}</g></svg>`;
}
