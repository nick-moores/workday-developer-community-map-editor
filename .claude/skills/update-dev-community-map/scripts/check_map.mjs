#!/usr/bin/env node
// Validate the developer community map data against the real app code.
//
//   node check_map.mjs [repo-root] [--today YYYY-MM-DD] [--json]
//
// Reports every pin (grid cell, status, country) and flags:
//   - pins on a sea cell, or two pins on the same cell
//   - labels that run over another pin or another label
//   - country names (locations, litCountries, countryColors) the lookup doesn't
//     know, which would leave the country dark
//   - bordering countries with the same color (problem) and nearby ones (warning)
//   - a pin the same color as its country, or a forced color not in the palette
// Exit code 1 if any problem is found, 0 otherwise. Warnings don't fail.
//
// Uses the repo's own app code via lib/app.mjs (npm deps come from node_modules,
// or are cached from jsDelivr when npm is blocked).

import { resolve } from "path";
import { loadMap, STEP, RECT } from "./lib/app.mjs";

const args = process.argv.slice(2);
const flag = (name) => { const i = args.indexOf(name); return i >= 0 ? args.splice(i, 2)[1] : undefined; };
const today = flag("--today") ?? new Date().toISOString().slice(0, 10);
const asJson = args.includes("--json") && args.splice(args.indexOf("--json"), 1);
const root = resolve(args[0] ?? process.cwd());
const FONT = 16;

const { data, raw, lookup, countryNames, cells: cellsOf, colorOf, cities, PALETTE, BORDER_CELLS, NEARBY_CELLS } = await loadMap(root, today);

const problems = [], warnings = [];
const colorName = (hex) => PALETTE.find(p => p.hex.toLowerCase() === hex?.toLowerCase())?.label ?? hex;

// ── Pins ─────────────────────────────────────────────────────────────────────
const byCell = new Map();
for (const c of cities) {
  const key = `${c.col},${c.row}`;
  c.onLand = key in raw;
  c.cellCountry = lookup.get(key) ?? null;
  if (!c.onLand) problems.push(`${c.name}: pin is on a sea cell (${key}); add a "nudge" to move it onto land`);
  if (byCell.has(key)) problems.push(`${c.name} and ${byCell.get(key)} share cell ${key}`);
  byCell.set(key, c.name);
}

// ── Labels (approximate Arial width: 0.55em per char) ───────────────────────
const box = (c) => {
  const w = c.name.length * FONT * 0.55;
  const y0 = c.row * STEP + RECT * 0.75 - FONT * 0.8, y1 = y0 + FONT;
  const x0 = c.labelSide === "left" ? c.col * STEP - 6 - w : c.col * STEP + RECT + 6;
  return { x0, x1: x0 + w, y0, y1 };
};
const hit = (a, b) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
for (const a of cities) {
  const la = box(a);
  for (const b of cities) {
    if (a === b) continue;
    const pin = { x0: b.col * STEP, x1: b.col * STEP + RECT, y0: b.row * STEP, y1: b.row * STEP + RECT };
    if (hit(la, pin)) problems.push(`Label "${a.name}" runs over the ${b.name} pin; try "labelSide": "left" on ${a.name} or a nudge`);
    if (a.name < b.name && hit(la, box(b))) problems.push(`Labels "${a.name}" and "${b.name}" overlap`);
  }
}

// ── Countries ────────────────────────────────────────────────────────────────
for (const [country, keys] of cellsOf) {
  if (keys.length) continue;
  const known = countryNames.has(country);
  problems.push(known
    ? `Country "${country}" is too small to own a grid cell at this map resolution, so it stays dark. Add a city pin there (small countries light the cells around their pins).`
    : `Country "${country}" isn't a name in COUNTRY_NAMES in src/countryLookup.js, so it stays dark. Check the spelling (e.g. "United Kingdom", "United States").`);
}
for (const [country, hex] of Object.entries(data.countryColors ?? {})) {
  if (country.startsWith("_")) continue;
  if (!PALETTE.some(p => p.hex.toLowerCase() === hex.toLowerCase())) problems.push(`countryColors "${country}" uses ${hex}, which is not in the App.jsx palette (it would not be painted)`);
}
for (const c of cities) {
  if (!c.country) { problems.push(`${c.name}: no "country" field, so no country lights up`); continue; }
  const hex = colorOf.get(c.country);
  c.countryColor = hex ? colorName(hex) : "-";
  if (hex && hex.toLowerCase() === c.color.toLowerCase())
    problems.push(`${c.name}: pin color (${colorName(c.color)}) is the same as its country color, so the pin vanishes; force a different color in countryColors`);
}
const dist = (A, B) => {
  let d = Infinity;
  for (const a of A) { const [x1, y1] = a.split(",").map(Number);
    for (const b of B) { const [x2, y2] = b.split(",").map(Number); d = Math.min(d, Math.max(Math.abs(x1 - x2), Math.abs(y1 - y2))); } }
  return d;
};
const lit = [...colorOf];
for (let i = 0; i < lit.length; i++) for (let j = i + 1; j < lit.length; j++) {
  const [a, ca] = lit[i], [b, cb] = lit[j];
  if (ca.toLowerCase() !== cb.toLowerCase()) continue;
  const d = dist(cellsOf.get(a), cellsOf.get(b));
  if (d <= BORDER_CELLS) problems.push(`${a} and ${b} share a border and are both ${colorName(ca)}; force a different color for one in countryColors`);
  else if (d <= NEARBY_CELLS) warnings.push(`${a} and ${b} are both ${colorName(ca)} and ${d} cells apart (not bordering; the auto-colorer ran out of free colors nearby)`);
}

// ── Report ───────────────────────────────────────────────────────────────────
const virtualCount = (data.virtualEvents ?? []).length;
if (asJson) {
  console.log(JSON.stringify({ today, pins: cities, countries: Object.fromEntries([...colorOf].map(([n, h]) => [n, colorName(h)])), virtualEvents: virtualCount, problems, warnings }, null, 2));
} else {
  console.log(`Map check for ${root} (today = ${today})\n`);
  console.log("Pin".padEnd(26) + "Cell".padEnd(10) + "Status".padEnd(10) + "Country".padEnd(18) + "Country color");
  for (const c of cities) console.log(c.name.padEnd(26) + `${c.col},${c.row}`.padEnd(10) + c.status.padEnd(10) + String(c.country ?? "-").padEnd(18) + (c.countryColor ?? "-"));
  console.log(`\nLit countries: ${[...colorOf].map(([n, h]) => `${n} (${colorName(h)})`).join(", ")}`);
  console.log(`Virtual events (no pin): ${virtualCount}`);
  console.log(`\n${problems.length ? "PROBLEMS:\n  - " + problems.join("\n  - ") : "No problems found."}`);
  if (warnings.length) console.log(`\nWarnings:\n  - ${warnings.join("\n  - ")}`);
}
process.exit(problems.length ? 1 : 0);
