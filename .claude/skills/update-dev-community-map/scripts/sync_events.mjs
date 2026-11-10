#!/usr/bin/env node
// Reconcile src/data/locations.json with a list of events.
//
//   node sync_events.mjs <events.json> [repo-root] [--partial] [--today YYYY-MM-DD] [--apply]
//
// <events.json> is an array you write from the user's message:
//   [{ "city": "Mumbai", "country": "India", "lat": 19.08, "lon": 72.88,
//      "title": "Meetup: hands-on agent building", "start": "2026-12-02",
//      "end": "2026-12-02", "type": "meetup", "attendees": 40 },
//    { "virtual": true, "title": "EMEA Virtual Test Drive", "start": "2026-12-09", "attendees": 20 }]
// Optional per entry: "name" (pin label; default "City, Country", or the city
// when it equals the country), "end", "type", "attendees".
// lat/lon are only needed for a city that isn't on the map yet.
//
// Default mode treats the list as the COMPLETE set of upcoming events: an
// upcoming event on the map (ends today or later) that is missing from the list
// is planned for removal. --partial only adds and updates. Past events and
// pins with no events (earlier 2026 events) are never touched.
//
// Without --apply it only prints the plan. With --apply it writes the file in
// the repo's existing compact style. Run check_map.mjs afterwards either way.

import { readFileSync, writeFileSync } from "fs";
import { join, resolve } from "path";

const args = process.argv.slice(2);
const take = (f) => { const i = args.indexOf(f); return i >= 0 ? args.splice(i, 2)[1] : undefined; };
const has = (f) => { const i = args.indexOf(f); return i >= 0 ? (args.splice(i, 1), true) : false; };
const today = take("--today") ?? new Date().toISOString().slice(0, 10);
const partial = has("--partial");
const apply = has("--apply");
const [listPath, rootArg] = args;
if (!listPath) { console.error("usage: sync_events.mjs <events.json> [repo-root] [--partial] [--today YYYY-MM-DD] [--apply]"); process.exit(2); }
const root = resolve(rootArg ?? process.cwd());
const dataPath = join(root, "src", "data", "locations.json");
const data = JSON.parse(readFileSync(dataPath, "utf8"));
const wanted = JSON.parse(readFileSync(listPath, "utf8"));

const norm = (s) => String(s ?? "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, " ").trim();
const cityOf = (loc) => norm(loc.name.split(",")[0]);
const isUpcoming = (e) => (e.end ?? e.start) >= today;
// Find the existing event a listed one refers to: exact title+start, then same
// start (renamed), then same title with a different date (moved) — but only
// when that title is unambiguous on both sides, so a recurring series (two
// "EMEA Virtual Test Drive" sessions) is never collapsed into one.
function findMatch(existing, w, matched, siblings) {
  const free = existing.filter(e => !matched.has(e));
  const t = norm(w.title);
  const exact = free.find(e => e.start === w.start && norm(e.title) === t);
  if (exact) return exact;
  const sameStart = free.filter(e => e.start === w.start);
  if (sameStart.length === 1 && !siblings.some(o => o !== w && o.start === w.start)) return sameStart[0];
  const sameTitle = existing.filter(e => norm(e.title) === t && isUpcoming(e));
  const listedSameTitle = siblings.filter(o => norm(o.title) === t);
  if (sameTitle.length === 1 && listedSameTitle.length === 1 && !matched.has(sameTitle[0])) return sameTitle[0];
  return undefined;
}
const eventFields = (w) => {
  const e = { title: w.title, start: w.start };
  if (w.end && w.end !== w.start) e.end = w.end;
  if (w.type) e.type = w.type;
  if (w.attendees != null) e.attendees = w.attendees;
  return e;
};
const describe = (e) => `${e.title} ${e.start}${e.end ? "–" + e.end : ""}${e.attendees != null ? ` (${e.attendees})` : ""}`;

const plan = []; // { action, where, detail }
const matched = new Set(); // event objects from data that the list accounts for
data.virtualEvents ??= [];

for (const w of wanted) {
  if (!w.title || !w.start) { plan.push({ action: "ERROR", where: w.city ?? "?", detail: "entry needs title and start" }); continue; }
  const next = eventFields(w);
  if (w.virtual) {
    // Virtual sessions recur under one title, so only exact title+start matches.
    const hit = data.virtualEvents.find(e => !matched.has(e) && e.start === w.start && norm(e.title) === norm(w.title));
    if (hit) {
      matched.add(hit);
      if (JSON.stringify(eventFields(hit)) !== JSON.stringify(next)) { plan.push({ action: "update", where: "virtual (no pin)", detail: `${describe(hit)} → ${describe(next)}` }); Object.keys(hit).forEach(k => delete hit[k]); Object.assign(hit, next); }
      else plan.push({ action: "unchanged", where: "virtual (no pin)", detail: describe(hit) });
    } else {
      data.virtualEvents.push(next); matched.add(next);
      plan.push({ action: "add", where: "virtual (no pin)", detail: describe(next) });
    }
    continue;
  }
  if (!w.city) { plan.push({ action: "ERROR", where: "?", detail: `${w.title}: needs city (or "virtual": true)` }); continue; }
  let loc = data.locations.find(l => (w.name && l.name === w.name) || cityOf(l) === norm(w.city));
  if (!loc) {
    if (w.lat == null || w.lon == null || !w.country) { plan.push({ action: "ERROR", where: w.city, detail: "new city needs country, lat and lon" }); continue; }
    const name = w.name ?? (norm(w.city) === norm(w.country) ? w.city : `${w.city}, ${w.country}`);
    loc = { name, country: w.country, lat: w.lat, lon: w.lon, events: [] };
    data.locations.push(loc);
    plan.push({ action: "new pin", where: name, detail: `${w.country} (${w.lat}, ${w.lon})` });
  }
  const siblings = wanted.filter(o => !o.virtual && o.city && norm(o.city) === norm(w.city));
  const hit = findMatch(loc.events, w, matched, siblings);
  if (hit) {
    matched.add(hit);
    const merged = { ...eventFields({ ...hit, ...w, end: w.end ?? (w.start === hit.start ? hit.end : undefined), type: w.type ?? hit.type, attendees: w.attendees ?? hit.attendees }) };
    if (JSON.stringify(eventFields(hit)) !== JSON.stringify(merged)) {
      plan.push({ action: "update", where: loc.name, detail: `${describe(hit)} → ${describe(merged)}` });
      Object.keys(hit).forEach(k => delete hit[k]); Object.assign(hit, merged);
    } else plan.push({ action: "unchanged", where: loc.name, detail: describe(hit) });
  } else {
    loc.events.push(next); matched.add(next);
    plan.push({ action: "add event", where: loc.name, detail: describe(next) });
  }
}

if (!partial) {
  for (const loc of [...data.locations]) {
    const gone = loc.events.filter(e => isUpcoming(e) && !matched.has(e));
    if (!gone.length) continue;
    loc.events = loc.events.filter(e => !gone.includes(e));
    for (const e of gone) plan.push({ action: "remove event", where: loc.name, detail: `${describe(e)} (not in the list)` });
    if (loc.events.length === 0) {
      data.locations.splice(data.locations.indexOf(loc), 1);
      plan.push({ action: "remove pin", where: loc.name, detail: "no events left" });
    }
  }
  const goneV = data.virtualEvents.filter(e => isUpcoming(e) && !matched.has(e));
  data.virtualEvents = data.virtualEvents.filter(e => !goneV.includes(e));
  for (const e of goneV) plan.push({ action: "remove event", where: "virtual (no pin)", detail: `${describe(e)} (not in the list)` });
}
for (const loc of data.locations) loc.events.sort((a, b) => a.start.localeCompare(b.start));
data.virtualEvents.sort((a, b) => a.start.localeCompare(b.start));

// ── Report ───────────────────────────────────────────────────────────────────
const order = ["ERROR", "new pin", "add event", "update", "remove event", "remove pin", "unchanged"];
plan.sort((a, b) => order.indexOf(a.action) - order.indexOf(b.action));
console.log(`Sync plan (${partial ? "partial: add/update only" : "list = all upcoming events"}; today = ${today})\n`);
console.log("Action".padEnd(14) + "Where".padEnd(26) + "Detail");
for (const p of plan) console.log(p.action.padEnd(14) + p.where.padEnd(26) + p.detail);
const errors = plan.filter(p => p.action === "ERROR").length;
const changes = plan.filter(p => !["unchanged", "ERROR"].includes(p.action)).length;
console.log(`\n${changes} change(s), ${errors} error(s).`);

// ── Write (compact style matching the hand-edited file) ─────────────────────
function format(d) {
  const j = (v) => JSON.stringify(v);
  const ev = (e) => `{ ${Object.entries(e).map(([k, v]) => `${j(k)}: ${j(v)}`).join(", ")} }`;
  // One event per line; a list of one stays inline.
  const evList = (list, ind) => list.length === 0 ? "[]" : list.length === 1 ? `[${ev(list[0])}]` : `[\n${list.map(e => `${ind}  ${ev(e)}`).join(",\n")}\n${ind}]`;
  const locs = d.locations.map(l => {
    // Key order: name, country, lat/lon, any others (nudge, labelSide), events.
    const lines = [`      ${j("name")}: ${j(l.name)}`];
    if ("country" in l) lines.push(`      ${j("country")}: ${j(l.country)}`);
    lines.push(`      ${j("lat")}: ${j(l.lat)}, ${j("lon")}: ${j(l.lon)}`);
    for (const [k, v] of Object.entries(l)) {
      if (["name", "country", "lat", "lon", "events"].includes(k)) continue;
      lines.push(`      ${j(k)}: ${typeof v === "object" ? `{ ${Object.entries(v).map(([a, b]) => `${j(a)}: ${j(b)}`).join(", ")} }` : j(v)}`);
    }
    lines.push(`      ${j("events")}: ${evList(l.events, "      ")}`);
    return `    {\n${lines.join(",\n")}\n    }`;
  });
  const top = Object.entries(d).filter(([k]) => !["locations", "virtualEvents"].includes(k))
    .map(([k, v]) => `  ${j(k)}: ${JSON.stringify(v, null, 2).replace(/\n/g, "\n  ")}`);
  return `{\n${[...top, `  "locations": [\n${locs.join(",\n")}\n  ]`, `  "virtualEvents": ${evList(d.virtualEvents, "  ")}`].join(",\n")}\n}\n`;
}
if (apply) {
  if (errors) { console.error("Not writing: fix the errors above first."); process.exit(1); }
  writeFileSync(dataPath, format(data));
  console.log(`Wrote ${dataPath}. Now run check_map.mjs.`);
} else {
  console.log("Dry run — nothing written. Re-run with --apply once the user agrees.");
}
