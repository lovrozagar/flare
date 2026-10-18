import tailwindcss from "@tailwindcss/vite"
import { flare } from "@lovrozagar/flare/vite"
import { defineConfig } from "vite"

// The workers boots compose Cloudflare's plugin, as a Workers app does (B109); every other boot stays on Node. The
// import is lazy, so the config loads where the plugin is absent. Its inspector takes a port the OS assigns and its
// state stays in memory, so parallel boots neither race nor write into the app (BUGS.md 85).
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

// The dashboard (B146). Tailwind is the app's own plugin (B14), over flare's one reset.
export default defineConfig({
	cacheDir: process.env.FLARE_VITE_CACHE,
	server: { host: "127.0.0.1" },
	plugins: [...workers, tailwindcss(), flare({ css: { reset: true } })],
})
