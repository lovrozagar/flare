import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";
import { flare } from "@lovrozagar/flare/plugins";

export default defineConfig({
	plugins: [
		flare({
			codegen: { fsVirtualPaths: false },
			dev: { cdnCache: false },
			purge: { console: true },
			serviceWorker: { offlineFallback: "/offline" },
			sx: { tw: true },
		}),
		cloudflare({
			configPath: "./wrangler.jsonc",
			viteEnvironment: { name: "ssr" },
		}),
	],
	server: {
		hmr: { overlay: false },
	},
});
