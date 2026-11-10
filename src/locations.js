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

// Paint every cell of each country in data.countryColors onto a base grid
// ({ "col,row": paletteIndex }). A country too small to own any cell (e.g.
// Singapore) lights the land cells within one cell of its pins instead.
// countryLookup: Map "col,row" -> country name (from buildCountryLookup).
export function applyCountryColors(grid, countryLookup, paletteHexes) {
  const colors = Object.entries(data.countryColors ?? {}).filter(([k]) => !k.startsWith("_"));
  for (const [country, hex] of colors) {
    const ci = paletteHexes.findIndex(h => h.toLowerCase() === hex.toLowerCase());
    if (ci < 0) continue;
    let painted = 0;
    for (const [key, name] of countryLookup) {
      if (name === country && key in grid) { grid[key] = ci; painted++; }
    }
    if (painted > 0) continue;
    for (const loc of data.locations.filter(l => l.country === country)) {
      const { col, row } = locationCell(loc);
      for (let dc = -1; dc <= 1; dc++) for (let dr = -1; dr <= 1; dr++) {
        const key = `${col + dc},${row + dr}`;
        if (key in grid) grid[key] = ci;
      }
    }
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
