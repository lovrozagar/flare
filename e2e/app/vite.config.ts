import { defineConfig } from "vite"
import { flare } from "flare/plugins"

export default defineConfig({
	server: {
		hmr: { overlay: false },
	},
	plugins: [
		flare({
			codegen: { fsVirtualPaths: false },
			prerender: true,
			serviceWorker: { offlineFallback: "/offline" },
			sx: { tw: true },
		}),
	],
})
