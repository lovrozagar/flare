import { cloudflare } from "@cloudflare/vite-plugin"
import { defineConfig } from "vite"
import { flare } from "flare/plugins"

export default defineConfig(() => ({
	plugins: [
		flare({
			alias: { "@": "/src" },
			codegen: { fsVirtualPaths: false },
			port: 3000,
			prerender: true,
			purge: true,
			serviceWorker: { offlineFallback: "/offline" },
			tailwind: true,
		}),
		cloudflare({ inspectorPort: 9231, viteEnvironment: { name: "ssr" } }),
	],
}))
