import { flare } from "@lovrozagar/flare/vite"
import { defineConfig } from "vite"

// The workers boots compose Cloudflare's plugin, as a Workers app does (B109); every other boot stays on Node. The
// import is lazy, so an app staged with only the packed flare (bits/14) loads this config. Its inspector takes a port
// the OS assigns and its state stays in memory, so parallel boots neither race nor write into the app (BUGS.md 85).
const workers =
	process.env["FLARE_E2E_RUNTIME"] === "workers"
		? [
				(await import("@cloudflare/vite-plugin")).cloudflare({
					viteEnvironment: { name: "ssr" },
					inspectorPort: 0,
					persistState: false,
				}),
			]
		: []

// With FLARE_E2E_TRACE=1 the boot names the e2e request trace (tests/e2e/trace.ts), which goes first so it sees every
// request (BUGS.md 453). The name is a URL, so a staged app loads it too.
const traceUrl = process.env["FLARE_E2E_TRACE_PLUGIN"]
const trace = traceUrl === undefined ? [] : [((await import(traceUrl)) as typeof import("../../trace.ts")).trace()]

// The real dev path, as minimal uses it, under the router's basePath.
export default defineConfig({
	cacheDir: process.env.FLARE_VITE_CACHE,
	server: { host: "127.0.0.1" },
	plugins: [...trace, ...workers, flare()],
})
