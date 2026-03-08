#!/usr/bin/env bash
# Build script for MCM Companion Chrome extension.
# Compiles TypeScript entry points to JavaScript using esbuild.
# Output is placed in-place (same directory as the source).
# Usage:
#   bash build.sh           # single build
#   bash build.sh --watch   # watch mode

set -euo pipefail

WATCH=""
if [[ "${1:-}" == "--watch" ]]; then
  WATCH="--watch"
fi

ESBUILD="./node_modules/.bin/esbuild"

# Build all entry points in parallel
"$ESBUILD" \
  background.ts \
  content.ts \
  popup/popup.ts \
  sidepanel/sidepanel.ts \
  --bundle \
  --format=esm \
  --platform=browser \
  --target=chrome120 \
  --outdir=. \
  --out-extension:.js=.js \
  --sourcemap=inline \
  --log-level=info \
  $WATCH

echo ""
echo "Build complete. Load the extension/ directory in chrome://extensions (Developer mode)."
