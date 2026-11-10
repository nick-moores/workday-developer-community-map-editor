#!/usr/bin/env bash
# Build and serve the map without npm dependencies, for machines where
# `npm install` is blocked (e.g. corporate network policy returns 403).
#
#   preview_fallback.sh [port]        # default port 5299; run from the repo root
#   preview_fallback.sh --build-only  # build, print the output dir, and exit
#
# --build-only is for preview tools that can't read ~/Documents (macOS privacy
# protection): build from your shell, then serve the printed dir with
# `python3 -m http.server <port> --directory <dir>`.
#
# - Bundles src/main.jsx with any esbuild binary found on this machine.
# - react / react-dom / topojson-client load from esm.sh via an import map.
# - world-atlas is downloaded once from jsDelivr into ~/.cache/workday-map-skill.
# Then serves the result with python's http.server (stays in the foreground).
set -euo pipefail

PORT="${1:-5299}"
ROOT="$(pwd)"
[ -f "$ROOT/src/main.jsx" ] || { echo "Run from the map repo root (src/main.jsx not found)" >&2; exit 1; }

CACHE="$HOME/.cache/workday-map-skill"
OUT="${TMPDIR:-/tmp}/workday-map-preview"
mkdir -p "$CACHE/world-atlas" "$OUT"

# 1. Find esbuild.
ESBUILD=""
for c in "$ROOT/node_modules/.bin/esbuild" "$(command -v esbuild 2>/dev/null || true)"; do
  [ -n "$c" ] && [ -x "$c" ] && ESBUILD="$c" && break
done
if [ -z "$ESBUILD" ]; then
  ESBUILD="$(find "$HOME/Documents/GitHub" "$HOME/.npm/_npx" "$HOME/code" "$HOME/src" -maxdepth 7 \
    -path '*node_modules/esbuild/bin/esbuild' -type f 2>/dev/null | head -1 || true)"
fi
[ -n "$ESBUILD" ] || { echo "No esbuild binary found on this machine; cannot build a fallback preview." >&2; exit 1; }
echo "Using esbuild: $ESBUILD" >&2

# 2. world-atlas data (only the JSON the app imports).
ATLAS="$CACHE/world-atlas/countries-50m.json"
if [ ! -s "$ATLAS" ]; then
  curl -fsS -m 120 -o "$ATLAS" https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-50m.json
fi

# 3. Bundle.
"$ESBUILD" "$ROOT/src/main.jsx" --bundle --format=esm --jsx=automatic \
  --external:react --external:react-dom '--external:react-dom/*' '--external:react/*' \
  --external:topojson-client --alias:world-atlas="$CACHE/world-atlas" \
  --loader:.png=file --loader:.svg=file --outdir="$OUT" --log-level=warning

cat > "$OUT/index.html" <<'HTML'
<!doctype html><html><head><meta charset="UTF-8"><title>workday-map (fallback preview)</title>
<link rel="stylesheet" href="main.css">
<script type="importmap">{"imports":{
  "react":"https://esm.sh/react@19.2.0","react/":"https://esm.sh/react@19.2.0/",
  "react-dom":"https://esm.sh/react-dom@19.2.0","react-dom/":"https://esm.sh/react-dom@19.2.0/",
  "topojson-client":"https://esm.sh/topojson-client@3.1.0"}}</script>
</head><body><div id="root"></div><script type="module" src="main.js"></script></body></html>
HTML

if [ "$PORT" = "--build-only" ]; then echo "$OUT"; exit 0; fi
echo "Serving $OUT on http://localhost:$PORT" >&2
exec python3 -m http.server "$PORT" --directory "$OUT"
