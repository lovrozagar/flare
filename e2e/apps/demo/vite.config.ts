import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig, type PluginOption } from "vite";
import { flare } from "@lovrozagar/flare/plugins";

export default defineConfig({
	plugins: [
		...(flare({
			alias: { "@": "/src" },
			codegen: { fsVirtualPaths: false },
			prerender: true,
			purge: true,
			serviceWorker: { offlineFallback: "/offline" },
			sx: { tw: true },
		}) as PluginOption[]),
		cloudflare({
			configPath: "./wrangler.jsonc",
			inspectorPort: 9231,
			viteEnvironment: { name: "ssr" },
		}),
	],
});
