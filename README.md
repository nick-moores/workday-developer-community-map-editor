# Workday Developer Community Map

Live at https://workday-map.vercel.app (deploys from `main` via Vercel).

## Updating locations

Pins come from [`src/data/locations.json`](src/data/locations.json), one entry per city:

```json
{
  "name": "Sydney, Australia",
  "country": "Australia",
  "lat": -33.87, "lon": 151.21,
  "events": [{ "title": "Innovation Days Sydney", "start": "2026-11-12", "end": "2026-11-13", "type": "test-drive", "attendees": 20 }]
}
```

- **Grid cell** is computed from `lat`/`lon` (see `lonLatToCell` in `src/locations.js`). Add `"nudge": { "col": -1, "row": 0 }` to shift a pin by whole cells. Pins must land on a land cell.
- **Status / color** is derived in the browser from event dates: *Upcoming* (pink) while any event hasn't ended, otherwise *Held in 2026* (blue). An empty `events` list means held.
- **Countries light up automatically.** Every pin's `country` (a name from `COUNTRY_NAMES` in `src/countryLookup.js`) is painted across all of its grid cells, using real boundaries. Colors are assigned automatically (`assignCountryColors` in `src/locations.js`) so bordering countries never share a color or a look-alike color, and nearby ones (e.g. Australia and New Zealand) differ when possible. Pink, Blue and Ice Blue are never used for countries, so pins always stand out. Countries too small to own cells (e.g. Singapore) light the land cells around the pin.
  - `litCountries`: names to light up with no pin.
  - `countryColors`: optional `{ "Country": "#hex" }` to force a palette color.
  - Colors are assigned in order of first appearance, so adding a country never recolors existing ones.
- The `RAW_CELLS` colors in `App.jsx` are only used as US/Canada boundary hints by `countryLookup.js`; they are not displayed.
- **Label side**: add `"labelSide": "left"` when a label would run over a neighbouring pin.
- **Virtual events** have no location; record them under `virtualEvents` (no pin).
- Editor state is cached in each browser's localStorage under a key that includes a hash of `locations.json`, so any data change automatically supersedes cached editor sessions.

---

## React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and Oxlint's TypeScript related rules in your project.
