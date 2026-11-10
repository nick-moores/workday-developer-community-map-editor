import data from "./data/locations.json";

// Pin colors by status. Both must be in App.jsx's palette.
export const STATUS_COLORS = {
  held:     { label: "Held in 2026", hex: "#1C98E8" }, // Blue
  upcoming: { label: "Upcoming",     hex: "#FFC2FD" }, // Pink
};

// Inverse of cellToLonLat in countryLookup.js (calibrated on the original pins).
// Map is Atlantic-centered: col 0 ≈ -22.58° lon, so western longitudes wrap past 180.
export function lonLatToCell(lon, lat) {
  const lonWrapped = lon < -22.58 ? lon + 360 : lon;
  return {
    col: Math.round((lonWrapped + 22.58) / 2.680),
    row: Math.round((104.31 - lat) / 2.615),
  };
}

// Short hash of the data file. App.jsx folds it into its localStorage key so a
// data change automatically supersedes any editor state cached in a browser.
export const DATA_VERSION = (() => {
  let h = 0;
  for (const ch of JSON.stringify(data)) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return (h >>> 0).toString(36);
})();

// Grid cell a location's pin sits on (projection + optional manual nudge).
function locationCell(loc) {
  const { col, row } = lonLatToCell(loc.lon, loc.lat);
  return { col: col + (loc.nudge?.col ?? 0), row: row + (loc.nudge?.row ?? 0) };
}

// ─── Country lighting ────────────────────────────────────────────────────────
// Every country with a pin (plus any in data.litCountries) is painted across
// all of its grid cells, using real boundaries from countryLookup.js.
// Colors are picked automatically so neighbours differ; data.countryColors can
// pin a specific color for a country.

// Colors available for auto-assignment, in preference order. Pink and Blue are
// the pin colors (upcoming / held) and Ice Blue is too close to the held Blue;
// a country must contrast with its pins however their status changes over time.
// `family` groups look-alikes, so bordering countries avoid near-identical hues.
export const COUNTRY_PALETTE = [
  { label: "Deep Purple",   hex: "#6923B6", family: "purple" },
  { label: "Orange",        hex: "#FF9F2C", family: "orange" },
  { label: "Violet",        hex: "#BA4ACA", family: "purple" },
  { label: "Bright Orange", hex: "#FC5B05", family: "orange" },
];
// Chebyshev distance in grid cells. Within BORDER = shares a border or a narrow
// strait (must differ). Within NEARBY = visually close, e.g. Australia and
// New Zealand (should differ when a color is free).
export const BORDER_CELLS = 2;
export const NEARBY_CELLS = 6;

// Cells for each lit country: "col,row" keys. A country too small to own a
// cell (Singapore) gets the land cells within one cell of its pins.
export function litCountryCells(countryLookup, landKeys) {
  const order = [];
  const add = (c) => { if (c && !order.includes(c)) order.push(c); };
  for (const c of Object.keys(data.countryColors ?? {})) if (!c.startsWith("_")) add(c);
  for (const loc of data.locations) add(loc.country);
  for (const c of data.litCountries ?? []) add(c);

  const cells = new Map(order.map(c => [c, []]));
  for (const [key, name] of countryLookup) if (cells.has(name) && landKeys.has(key)) cells.get(name).push(key);
  for (const [country, keys] of cells) {
    if (keys.length) continue;
    for (const loc of data.locations.filter(l => l.country === country)) {
      const { col, row } = locationCell(loc);
      for (let dc = -1; dc <= 1; dc++) for (let dr = -1; dr <= 1; dr++) {
        const key = `${col + dc},${row + dr}`;
        if (landKeys.has(key) && !keys.includes(key)) keys.push(key);
      }
    }
  }
  return cells; // Map in assignment order: pinned colors first, then first appearance
}

function cellDistance(aKeys, bKeys) {
  let d = Infinity;
  const B = bKeys.map(k => k.split(",").map(Number));
  for (const k of aKeys) {
    const [x1, y1] = k.split(",").map(Number);
    for (const [x2, y2] of B) d = Math.min(d, Math.max(Math.abs(x1 - x2), Math.abs(y1 - y2)));
  }
  return d;
}

// Map country -> hex. Greedy, in a stable order, so appending a country never
// recolors the ones before it. Avoids (in priority order) a bordering country's
// color, a bordering country's color family, a nearby country's color; then
// takes the least-used color for variety, then palette order.
export function assignCountryColors(cells) {
  const colors = new Map();
  const used = new Map(COUNTRY_PALETTE.map(p => [p.hex, 0]));
  const familyOf = (hex) => COUNTRY_PALETTE.find(p => p.hex.toLowerCase() === hex.toLowerCase())?.family;
  const pinned = data.countryColors ?? {};
  for (const [country, keys] of cells) {
    let hex = pinned[country];
    if (!hex) {
      const border = new Set(), borderFamily = new Set(), near = new Set();
      for (const [other, oc] of colors) {
        const d = cellDistance(keys, cells.get(other));
        if (d <= BORDER_CELLS) { border.add(oc); borderFamily.add(familyOf(oc)); }
        else if (d <= NEARBY_CELLS) near.add(oc);
      }
      const rank = (p) => (border.has(p.hex) ? 4 : 0) + (borderFamily.has(p.family) ? 2 : 0) + (near.has(p.hex) ? 1 : 0);
      hex = [...COUNTRY_PALETTE]
        .sort((a, b) => rank(a) - rank(b) || used.get(a.hex) - used.get(b.hex))[0].hex;
    }
    colors.set(country, hex);
    used.set(hex, (used.get(hex) ?? 0) + 1);
  }
  return colors;
}

// Paint the lit countries onto a grid ({ "col,row": paletteIndex }). All other
// land is reset to navy (index 0); RAW_CELLS colors are only boundary hints.
export function applyCountryColors(grid, countryLookup, paletteHexes) {
  const land = new Set(Object.keys(grid));
  for (const k of land) grid[k] = 0;
  const cells = litCountryCells(countryLookup, land);
  for (const [country, hex] of assignCountryColors(cells)) {
    const ci = paletteHexes.findIndex(h => h.toLowerCase() === hex.toLowerCase());
    if (ci < 0) continue;
    for (const k of cells.get(country)) grid[k] = ci;
  }
  return grid;
}

const todayISO = () => new Date().toISOString().slice(0, 10);

// Upcoming if any event hasn't finished yet; otherwise held.
export function locationStatus(loc, today = todayISO()) {
  return loc.events.some(e => (e.end ?? e.start) >= today) ? "upcoming" : "held";
}

export function buildCities(today = todayISO()) {
  return data.locations.map((loc, i) => {
    const { col, row } = locationCell(loc);
    const status = locationStatus(loc, today);
    return {
      id: i + 1,
      name: loc.name,
      col,
      row,
      color: STATUS_COLORS[status].hex,
      status,
      labelSide: loc.labelSide ?? "right",
    };
  });
}
