import { feature } from "topojson-client";
import worldData from "world-atlas/countries-50m.json";

// Calibrated projection from known city pin anchor points:
//   Barcelona(col9,row25)→2°E,41°N   Warsaw(col17,row20)→21°E,52°N
//   Pune(col36,row33)→74°E,18°N      Tokyo(col60,row26)→140°E,36°N
//   Dallas(col105,row29)→-97°W,33°N  Washington(col115,row25)→-77°W,39°N
//   Toronto(col114,row22)→-79°W,44°N
// Map is Atlantic-centered (col 0 ≈ -23°E), NOT standard -180°.
function cellToLonLat(col, row) {
  const lonRaw = 2.680 * col - 22.58;
  const lon    = lonRaw > 180 ? lonRaw - 360 : lonRaw;
  const lat    = Math.min(90, Math.max(-90, 104.31 - 2.615 * row));
  return [lon, lat];
}

// Standard ray-casting point-in-polygon
function pointInRing(px, py, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

function pointInGeometry(lon, lat, geometry) {
  if (geometry.type === "Polygon") {
    const [outer, ...holes] = geometry.coordinates;
    if (!pointInRing(lon, lat, outer)) return false;
    return !holes.some(h => pointInRing(lon, lat, h));
  }
  if (geometry.type === "MultiPolygon") {
    return geometry.coordinates.some(poly => {
      const [outer, ...holes] = poly;
      if (!pointInRing(lon, lat, outer)) return false;
      return !holes.some(h => pointInRing(lon, lat, h));
    });
  }
  return false;
}

const COUNTRY_NAMES = {
  4: "Afghanistan", 8: "Albania", 12: "Algeria", 24: "Angola", 32: "Argentina",
  36: "Australia", 40: "Austria", 50: "Bangladesh", 56: "Belgium", 64: "Bhutan",
  68: "Bolivia", 76: "Brazil", 100: "Bulgaria", 104: "Myanmar", 116: "Cambodia",
  120: "Cameroon", 124: "Canada", 140: "Central African Republic", 144: "Sri Lanka",
  152: "Chile", 156: "China", 170: "Colombia", 178: "Congo", 180: "DR Congo",
  188: "Costa Rica", 191: "Croatia", 192: "Cuba", 196: "Cyprus", 203: "Czech Republic",
  208: "Denmark", 214: "Dominican Republic", 218: "Ecuador", 222: "El Salvador",
  231: "Ethiopia", 246: "Finland", 250: "France", 266: "Gabon", 276: "Germany",
  288: "Ghana", 300: "Greece", 304: "Greenland", 320: "Guatemala", 324: "Guinea",
  332: "Haiti", 340: "Honduras", 348: "Hungary", 356: "India", 360: "Indonesia",
  364: "Iran", 368: "Iraq", 372: "Ireland", 376: "Israel", 380: "Italy",
  388: "Jamaica", 392: "Japan", 398: "Kazakhstan", 400: "Jordan", 404: "Kenya",
  408: "North Korea", 410: "South Korea", 414: "Kuwait", 418: "Laos", 422: "Lebanon",
  426: "Lesotho", 434: "Libya", 440: "Lithuania", 450: "Madagascar", 458: "Malaysia",
  466: "Mali", 484: "Mexico", 496: "Mongolia", 504: "Morocco", 508: "Mozambique",
  516: "Namibia", 524: "Nepal", 528: "Netherlands", 554: "New Zealand",
  558: "Nicaragua", 562: "Niger", 566: "Nigeria", 578: "Norway", 586: "Pakistan",
  591: "Panama", 598: "Papua New Guinea", 600: "Paraguay", 604: "Peru",
  608: "Philippines", 616: "Poland", 620: "Portugal", 630: "Puerto Rico",
  634: "Qatar", 642: "Romania", 643: "Russia", 682: "Saudi Arabia", 686: "Senegal",
  704: "Vietnam", 706: "Somalia", 710: "South Africa", 716: "Zimbabwe",
  724: "Spain", 729: "South Sudan", 736: "Sudan", 752: "Sweden", 756: "Switzerland",
  760: "Syria", 158: "Taiwan", 764: "Thailand", 784: "United Arab Emirates",
  788: "Tunisia", 792: "Turkey", 800: "Uganda", 804: "Ukraine", 818: "Egypt",
  826: "United Kingdom", 834: "Tanzania", 840: "United States",
  854: "Burkina Faso", 858: "Uruguay", 860: "Uzbekistan", 862: "Venezuela",
  887: "Yemen", 894: "Zambia", 384: "Ivory Coast", 480: "Mauritius",
};

// Post-process: fill unassigned cells by majority vote of assigned neighbors
function adjacencyFill(lookup, rawCells) {
  const cellSet = new Set(rawCells.map(([c, r]) => `${c},${r}`));
  const dirs = [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[-1,1],[1,-1],[1,1]];

  let changed = true;
  let passes = 0;
  while (changed && passes < 3) {
    changed = false;
    passes++;
    for (const [col, row] of rawCells) {
      const key = `${col},${row}`;
      if (lookup.has(key)) continue;
      const votes = {};
      for (const [dc, dr] of dirs) {
        const nk = `${col + dc},${row + dr}`;
        if (cellSet.has(nk) && lookup.has(nk)) {
          const c = lookup.get(nk);
          votes[c] = (votes[c] ?? 0) + 1;
        }
      }
      const entries = Object.entries(votes);
      if (entries.length === 0) continue;
      // Fill if a single country holds a majority of assigned neighbors
      const total = entries.reduce((s, [, v]) => s + v, 0);
      const [best, count] = entries.sort((a, b) => b[1] - a[1])[0];
      if (count > total / 2) {
        lookup.set(key, best);
        changed = true;
      }
    }
  }
}

export function buildCountryLookup(rawCells) {
  const countries = feature(worldData, worldData.objects.countries).features;
  const lookup = new Map();

  for (const [col, row] of rawCells) {
    const key = `${col},${row}`;
    const [lon, lat] = cellToLonLat(col, row);
    for (const f of countries) {
      if (pointInGeometry(lon, lat, f.geometry)) {
        const id = Number(f.id);
        lookup.set(key, COUNTRY_NAMES[id] ?? `Country ${id}`);
        break;
      }
    }
  }

  // Remove geographically impossible Russia assignments BEFORE adjacency fill
  // so that Norway/Finland/Sweden cells win the majority vote in the border zone.
  // (1) Antimeridian artifact: eastern island polygons cause false positives in western hemisphere.
  // (2) Scandinavia bleed: Russia shouldn't appear west of 28°E above 60°N.
  //     (Kaliningrad is 20°E/54°N so stays; St. Petersburg is 30°E/60°N so stays.)
  const sanitize = () => {
    for (const [col, row] of rawCells) {
      const key = `${col},${row}`;
      if (lookup.get(key) !== "Russia") continue;
      const [lon, lat] = cellToLonLat(col, row);
      if (lon < -20 || (lon < 28 && lat > 60)) lookup.delete(key);
    }
  };
  sanitize();
  adjacencyFill(lookup, rawCells);

  // Post-fill: remove Norway east of 32°E (Norway's real easternmost point ~31°E).
  // Adjacency fill can bleed Norway into Russia's Kola Peninsula.
  for (const [col, row] of rawCells) {
    const key = `${col},${row}`;
    if (lookup.get(key) !== "Norway") continue;
    const [lon] = cellToLonLat(col, row);
    if (lon > 32) lookup.delete(key);
  }

  return lookup;
}
