import { flare } from "@lovrozagar/flare/vite";
import { defineConfig } from "vite";

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
		: [];

// The real dev path, as minimal uses it, under the router's basePath.
export default defineConfig({
	cacheDir: process.env.FLARE_VITE_CACHE,
	server: { host: "127.0.0.1" },
	plugins: [...workers, flare()],
});
