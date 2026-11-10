# Workday Developer Community Map

Live at https://workday-map.vercel.app (deploys from `main` via Vercel).

## Updating locations

Pins come from [`src/data/locations.json`](src/data/locations.json), one entry per city:

```json
{
  "name": "Sydney, Australia",
  "lat": -33.87, "lon": 151.21,
  "events": [
    { "title": "Innovation Days Sydney", "start": "2026-11-12", "end": "2026-11-13", "type": "test-drive", "attendees": 20 }
  ]
}
```

- **Grid cell** is computed from `lat`/`lon` (see `lonLatToCell` in `src/locations.js`). Add `"nudge": { "col": -1, "row": 0 }` to shift a pin by whole cells. Pins must land on a land cell.
- **Status / color** is derived in the browser from event dates: *Upcoming* (pink) while any event hasn't ended, otherwise *Held in 2026* (blue). An empty `events` list means held.
- **Country highlight**: set `"country"` (a name from `src/countryLookup.js`) and list that country in top-level `countryColors` with a palette hex to light up all its grid cells. Countries too small to own cells (e.g. Singapore) light the land cells around the pin. Neighbouring countries should get different colors, and the country color should contrast with its pin color. Spain, Poland, India, Japan, the US and Canada are hand-painted in `RAW_CELLS` instead.
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
