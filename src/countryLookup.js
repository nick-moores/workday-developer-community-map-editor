import { feature } from "topojson-client";
import worldData from "world-atlas/countries-110m.json";

// Grid constants (must match App.jsx)
const STEP  = 28.54;
const VIEW_W = 3900;
const VIEW_H = 1845.02;

// Convert grid col/row → approximate lon/lat (equirectangular)
function cellToLonLat(col, row) {
  const lon = (col * STEP / VIEW_W) * 360 - 180;
  const lat = 90 - (row * STEP / VIEW_H) * 180;
  return [lon, lat];
}

// Ray-casting point-in-polygon for a single ring [[lon,lat],...]
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

// Test a point against a GeoJSON geometry (Polygon or MultiPolygon)
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

// Country numeric ID → name (ISO 3166-1 numeric, from world-atlas)
// Only the subset we care about for labeling; unlisted ones get their numeric id as fallback
const COUNTRY_NAMES = {
  4: "Afghanistan", 8: "Albania", 12: "Algeria", 24: "Angola", 32: "Argentina",
  36: "Australia", 40: "Austria", 50: "Bangladesh", 56: "Belgium", 64: "Bhutan",
  68: "Bolivia", 76: "Brazil", 100: "Bulgaria", 116: "Cambodia", 120: "Cameroon",
  124: "Canada", 152: "Chile", 156: "China", 170: "Colombia", 178: "Congo",
  188: "Costa Rica", 191: "Croatia", 192: "Cuba", 196: "Cyprus", 203: "Czech Republic",
  208: "Denmark", 231: "Ethiopia", 246: "Finland", 250: "France", 276: "Germany",
  288: "Ghana", 300: "Greece", 320: "Guatemala", 332: "Haiti", 340: "Honduras",
  348: "Hungary", 356: "India", 360: "Indonesia", 364: "Iran", 368: "Iraq",
  372: "Ireland", 376: "Israel", 380: "Italy", 388: "Jamaica", 392: "Japan",
  400: "Jordan", 398: "Kazakhstan", 404: "Kenya", 408: "North Korea", 410: "South Korea",
  414: "Kuwait", 418: "Laos", 422: "Lebanon", 426: "Lesotho", 434: "Libya",
  440: "Lithuania", 458: "Malaysia", 484: "Mexico", 504: "Morocco", 508: "Mozambique",
  516: "Namibia", 524: "Nepal", 528: "Netherlands", 554: "New Zealand", 558: "Nicaragua",
  566: "Nigeria", 578: "Norway", 586: "Pakistan", 591: "Panama", 600: "Paraguay",
  604: "Peru", 608: "Philippines", 616: "Poland", 620: "Portugal", 630: "Puerto Rico",
  634: "Qatar", 642: "Romania", 643: "Russia", 682: "Saudi Arabia", 706: "Somalia",
  710: "South Africa", 724: "Spain", 144: "Sri Lanka", 736: "Sudan", 752: "Sweden",
  756: "Switzerland", 760: "Syria", 158: "Taiwan", 764: "Thailand", 800: "Uganda",
  804: "Ukraine", 784: "United Arab Emirates", 826: "United Kingdom",
  840: "United States", 858: "Uruguay", 860: "Uzbekistan", 862: "Venezuela",
  704: "Vietnam", 887: "Yemen", 894: "Zambia", 716: "Zimbabwe",
  180: "DR Congo", 729: "South Sudan", 686: "Senegal", 466: "Mali",
  562: "Niger", 854: "Burkina Faso", 384: "Ivory Coast", 324: "Guinea",
  480: "Mauritius", 450: "Madagascar", 630: "Puerto Rico", 218: "Ecuador",
  214: "Dominican Republic", 222: "El Salvador", 662: "Saint Lucia",
};

// Build and export the lookup map: "col,row" → country name
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

  return lookup;
}
