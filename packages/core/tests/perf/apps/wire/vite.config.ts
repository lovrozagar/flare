import { flare } from "@lovrozagar/flare/vite"
import { defineConfig } from "vite"

// v0.9.23's benchmark app, ported 1:1, for the performance baseline (plan 21 15.6, tests/perf/BASELINE.md). It is
// outside the e2e grid: the nightly and tests/perf/measure.ts build it.
export default defineConfig({
	cacheDir: process.env.FLARE_VITE_CACHE,
	server: { host: "127.0.0.1" },
	plugins: [flare()],
})
