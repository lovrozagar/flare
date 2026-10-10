#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
MONOREPO="$(cd "$ROOT/../.." && pwd)"
PIDS=()
MODE="${1:---dev}"

cleanup() {
  echo ""
  echo "Stopping servers..."
  for pid in "${PIDS[@]}"; do
    kill "$pid" 2>/dev/null || true
  done
  wait 2>/dev/null || true
  echo "Done."
}
trap cleanup EXIT

wait_for_port() {
  local port=$1
  local name=$2
  local max_wait=60
  local waited=0
  echo "  Waiting for $name on port $port..."
  while ! curl -sf "http://localhost:$port/" > /dev/null 2>&1; do
    sleep 1
    waited=$((waited + 1))
    if [ "$waited" -ge "$max_wait" ]; then
      echo "  ERROR: $name did not start within ${max_wait}s"
      return 1
    fi
  done
  echo "  $name ready (${waited}s)"
}

if [ "$MODE" = "--prod" ]; then
  echo "=== Framework Wire Format Comparison (PRODUCTION) ==="
  echo ""
  echo "NOTE: All frameworks built and served in production mode."
  echo "      JS is minified, debug info stripped, bundles optimized."
  echo ""
else
  echo "=== Framework Wire Format Comparison ==="
  echo ""
  echo "NOTE: All frameworks run in development mode."
  echo "      Wire protocol structure is identical in dev/prod."
  echo "      JS sizes are unminified. Next.js includes debug-info lines."
  echo ""
fi

# --- Install dependencies ---
echo "1. Installing dependencies..."

echo "  [Monorepo] (workspace install)"
cd "$MONOREPO" && bun install --silent 2>&1 | tail -1 || true

echo "  [Next.js]"
cd "$ROOT/nextjs" && npm install --silent 2>&1 | tail -1 || true

echo "  [TanStack Start]"
cd "$ROOT/tanstack" && npm install --silent 2>&1 | tail -1 || true

echo "  [Capture]"
cd "$ROOT/capture" && npm install --silent 2>&1 | tail -1 || true
npx playwright install chromium 2>&1 | tail -1 || true

echo ""

if [ "$MODE" = "--prod" ]; then
  # --- Clean + Build all frameworks ---
  echo "2. Building frameworks..."

  echo "  [Flare]"
  rm -rf "$ROOT/flare/dist"
  cd "$ROOT/flare" && npx vite build 2>&1 | tail -5

  echo "  [Next.js]"
  rm -rf "$ROOT/nextjs/.next"
  cd "$ROOT/nextjs" && npx next build 2>&1 | tail -5

  echo "  [TanStack Start]"
  rm -rf "$ROOT/tanstack/.output"
  cd "$ROOT/tanstack" && npx vite build 2>&1 | tail -5

  echo ""

  # --- Start production servers ---
  echo "3. Starting production servers..."

  cd "$ROOT/flare" && npx vite preview --port 4001 > /tmp/flare-bench-server.log 2>&1 &
  PIDS+=($!)

  cd "$ROOT/nextjs" && npx next start --port 4002 > /tmp/nextjs-bench-server.log 2>&1 &
  PIDS+=($!)

  cd "$ROOT/tanstack" && PORT=4003 node .output/server/index.mjs > /tmp/tanstack-bench-server.log 2>&1 &
  PIDS+=($!)

  echo ""
  echo "4. Waiting for servers..."
  wait_for_port 4001 "Flare"
  wait_for_port 4002 "Next.js"
  wait_for_port 4003 "TanStack Start"
else
  # --- Start dev servers ---
  echo "2. Starting dev servers..."

  cd "$ROOT/flare" && npx vite dev --port 4001 > /tmp/flare-bench-server.log 2>&1 &
  PIDS+=($!)

  cd "$ROOT/nextjs" && npx next dev --port 4002 > /tmp/nextjs-bench-server.log 2>&1 &
  PIDS+=($!)

  cd "$ROOT/tanstack" && npx vite dev --port 4003 > /tmp/tanstack-bench-server.log 2>&1 &
  PIDS+=($!)

  echo ""
  echo "3. Waiting for servers..."
  wait_for_port 4001 "Flare"
  wait_for_port 4002 "Next.js"
  wait_for_port 4003 "TanStack Start"
fi

echo ""

# --- Run capture ---
echo "5. Running capture script..."
cd "$ROOT/capture" && npx tsx capture.ts "$MODE"

echo ""

# --- Generate report ---
echo "6. Generating report..."
cd "$ROOT/capture" && npx tsx report.ts

echo ""
echo "=== Complete ==="
echo "Results: $ROOT/RESULTS.md"
