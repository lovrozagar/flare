import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";
import { flare } from "@lovrozagar/flare/plugins";

export default defineConfig({
	plugins: [
		flare({
			alias: { "@": "/src" },
			codegen: { fsVirtualPaths: false },
			prerender: true,
			purge: true,
			sx: { tw: true },
		}),
		cloudflare({
			configPath: "./wrangler.jsonc",
			inspectorPort: 9231,
			viteEnvironment: { name: "ssr" },
		}),
	],
});
