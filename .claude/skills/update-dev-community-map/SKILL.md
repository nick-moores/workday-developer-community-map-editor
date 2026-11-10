---
name: update-dev-community-map
description: Add, update, move, rename, cancel or remove event cities and countries on the Workday developer community map (workday-map.vercel.app, repo nick-moores/workday-developer-community-map-editor), sync it to a list of upcoming developer events, and deploy it. Use this whenever someone mentions the developer community map or event map, names cities or countries to add to or take off the map, pastes a list of upcoming events (meetups, Test Drives, Innovation Days, Experience Days, conferences, WeAreDevelopers) to put on it, says an event was cancelled or moved, or asks why a country isn't lit up or has the wrong color — even if they don't say "map" explicitly.
compatibility: Claude Code (or another coding agent with a shell) and Node 22+, with GitHub access to nick-moores/workday-developer-community-map-editor. The PNG export needs Google Chrome; works where npm is blocked.
---

# Update the developer community map

The live map at https://workday-map.vercel.app is the editor app in this repo, deployed by Vercel from `main`. All map content lives in **`src/data/locations.json`**: pins (`locations`), events, countries to light without a pin (`litCountries`), forced colors (`countryColors`, normally empty) and `virtualEvents`. Everything visible is derived from it in the browser:

- **Pins** sit on the grid cell computed from `lat`/`lon` (plus an optional `nudge`).
- **Pin color** is Pink while any of its events hasn't ended, Blue once all have ("Held in 2026").
- **Countries** light up automatically: every pin's `country`, plus `litCountries`, is painted over its real boundaries, with colors picked so bordering countries never match. You do not choose colors unless the user asks for a specific one.

The README's "Updating locations" section documents every field. The person asking is usually the map's owner: they want the map accurate (no invented events, nothing they didn't agree to) and looking right (countries lit, labels readable). Pushing `main` changes a public page, so it only happens when they say so.

## 1. Get the repo
Use `~/Documents/GitHub/workday-developer-community-map-editor` if it exists (`git pull`), otherwise `gh repo clone nick-moores/workday-developer-community-map-editor` there. Read `src/data/locations.json`. Run every command below **from the map repo root**.

`$SKILL` below means the folder holding this SKILL.md, wherever it was installed: `.claude/skills/update-dev-community-map` inside the map repo, the team skills folder in PMK OS, or `~/.claude/skills/update-dev-community-map`. The scripts take the map repo root as an argument (`.`), so they work from any of those.

## 2. Work out the change — two kinds of request

### A. Direct edits ("add Dublin", "take Kolkata off", "light up Germany", "remove Japan")
Edit `locations.json` by hand:
- **Add a city**: new entry with `name` ("City, Country", or "City, ST" for US cities, matching existing pins), `country` (exact name from `COUNTRY_NAMES` in `src/countryLookup.js`, e.g. "United Kingdom", "United States"), `lat`/`lon` (city centre, two decimals), `events`. If the city is already on the map, add the event to its `events` instead of a second pin.
- **Remove a city / cancel an event**: take the event out of `events`. If that leaves the location with no events, delete the whole location — an empty `events` list means "held earlier this year", so a leftover shell turns a cancelled pin into a fake held one. Pins that already have empty `events` are legacy earlier-2026 events; leave them unless the user names them.
- **Light a country with no pin**: add its name to `litCountries`. **Stop lighting it**: remove it from `litCountries`; a country with pins stays lit until its pins are removed (say so if the user asks to un-light one).
- **Force a color** only if the user asks: `countryColors: { "Japan": "#FC5B05" }`, a hex from the App.jsx palette.

### B. A list of upcoming events ("here's what's coming up", pasted agenda, spreadsheet rows)
Use the sync script so nothing is missed or double-entered:
1. Write the list as JSON (in a temp file, not the repo): one object per event — `city`, `title` (the user's wording), `start`, `end` if multi-day, `type` (meetup | conference | test-drive | …), `attendees` if given. Add `country`, `lat`, `lon` for any city not already on the map. Virtual events: `{"virtual": true, "title", "start", ...}` with no city. If a line is ambiguous (unclear city, year, or whether it's virtual), ask rather than guess.
2. Dry run: `node $SKILL/scripts/sync_events.mjs <list.json> .`
   By default the list is treated as **all** upcoming events, so upcoming events on the map that aren't in it are planned for removal. If the user's list is clearly partial ("add these", "a few more"), pass `--partial` (adds and updates only). Past events are never touched. Matching: same title+date is the same event; a changed date counts as a move only when the title is unique for that city; virtual sessions match only on title+date, because they recur under one title.
3. Show the user the plan (new pins, added/updated/removed events, removed pins) and get their OK — removals especially. Then rerun with `--apply`.

### Confirming
Before editing, show the change as a short table (city, country, status it will show, what changes) and get agreement. If the user already said "go ahead", or the request is one unambiguous edit, edit straight away and show the table with the result instead. Never invent event titles, dates or attendee counts; if something is missing, leave it out and say so.

## 3. Check
```bash
node $SKILL/scripts/check_map.mjs . [--today YYYY-MM-DD]
```
It runs the app's own code and prints every pin's cell, status and country color, the lit countries, then PROBLEMS (exit 1) and warnings. Fix and rerun until "No problems found.":
- **pin on a sea cell** or **two pins share a cell** — the lat/lon→grid projection is approximate; add `"nudge": { "col": ±1, "row": ±1 }` to an adjacent land cell (e.g. Mumbai lands on Pune's cell).
- **label runs over a pin / labels overlap** — `"labelSide": "left"` on the pin whose label points into the crowd, or a nudge. India and Australia are the crowded spots.
- **country has no grid cells** — the name doesn't match `COUNTRY_NAMES`; fix the spelling.
- **bordering countries share a color / pin same color as its country** — only possible with a forced `countryColors` entry; change or remove it.

## 4. Look at it
Preview the map, clear `localStorage` first (cached editor state), and show the user a screenshot zoomed into what changed (set the map `<svg>`'s `viewBox` via the browser tool).
- **Normal path:** `npm install`, then the `workday-map` launch config (`npm run dev -- --port 5199`).
- **If npm returns 403s** (Workday-managed Macs block the npm registry entirely): from the repo root run `bash $SKILL/scripts/preview_fallback.sh --build-only`. It bundles with any esbuild on the machine, takes react from esm.sh, and prints an output dir in `$TMPDIR`; serve it with `python3 -m http.server 5299 --directory <dir>`. (Running it with a port builds and serves in one step — the map repo's `workday-map-fallback` launch config — but some preview launchers can't read `~/Documents` and fail with "Operation not permitted"; serving the `$TMPDIR` dir avoids that.)

Say what you couldn't verify (e.g. no lint because oxlint couldn't install).

## 5. Export the SVG and the 1920×1080 PNGs — every time
The user wants image files of the updated map at the end of every change (for slides and posts), so produce them even if they don't ask:
```bash
node $SKILL/scripts/export_map.mjs .
```
It renders from the same app code with headless Chrome and writes to `exports/` (gitignored — never commit these):
- `workday-map.svg`: identical to the editor's "Export SVG", with a transparent background, labels and legend.
- `workday-map-1920x1080-022043.png`: the map centred on the deck navy `#022043`.
- `workday-map-1920x1080-transparent.png`: the same with a transparent background, for dropping onto any slide colour.

For a different background, pass `--bg "#rrggbb,transparent"` (any comma-separated mix). Look at the navy PNG yourself (a quick check that the map reads well), then hand all three files to the user: with a file-sending tool (e.g. `SendUserFile`) if you have one, otherwise give the absolute paths. If the map changed again later in the conversation, re-export.

## 6. Commit and push — only when the user says so
Pushing `main` redeploys the public site. Before committing, the repo-local git email must be the GitHub no-reply address, or Vercel blocks the deploy ("GitHub couldn't verify an account for the commit"):
```bash
git config user.email   # expect 98558139+nick-moores@users.noreply.github.com
git config user.email 98558139+nick-moores@users.noreply.github.com   # if not
```
Commit only the files you changed, with a message naming the cities/countries added, changed or removed. After pushing, confirm the deploy (Vercel team: nick-moores-projects):
```bash
gh api repos/nick-moores/workday-developer-community-map-editor/commits/<sha>/statuses --jq '.[0] | "\(.state) \(.description)"'
```
Poll until it is not `pending`; `success Deployment has completed` means it's live. Then re-export (step 5) if anything changed since, and tell the user in plain terms what changed on the map (pins added/removed, countries newly lit and their colors) and anything left open (events missing details, items you asked about).

## Things that bite
- `attendees` is recorded for reference only; nothing on the map or in the exports shows it. Don't hold up a change because a count is missing.
- Pins flip from upcoming to held by themselves when events end (computed in the visitor's browser), so `events` need real dates.
- The app caches editor state in localStorage under a key that includes a hash of `locations.json`, so any data edit reaches visitors. Don't replace that with a fixed key.
- Country colors are assigned in order of first appearance; adding a country never recolors existing ones, but removing one can shift colors of countries listed after it. Mention it if colors change.
- Don't paint countries via `RAW_CELLS` in App.jsx — those colors are only boundary hints for the US/Canada split.
- If the user keeps a PowerPoint copy of the map, remind them to "Export SVG" from the editor after a change.
