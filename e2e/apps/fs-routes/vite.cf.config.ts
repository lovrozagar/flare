import { cloudflare } from "@cloudflare/vite-plugin";
import { flare } from "@lovrozagar/flare/plugins";
import { defineConfig } from "vite";

export default defineConfig({
	plugins: [
		flare({
			codegen: { fsVirtualPaths: true },
		}),
		cloudflare({
			configPath: "./wrangler.jsonc",
			viteEnvironment: { name: "ssr" },
		}),
	],
});
