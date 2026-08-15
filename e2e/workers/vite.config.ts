import { cloudflare } from "@cloudflare/vite-plugin";
import { flare } from "@lovrozagar/flare/plugins";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const appRoot = fileURLToPath(new URL("../app", import.meta.url));

export default defineConfig({
	plugins: [
		flare({
			codegen: { fsVirtualPaths: false },
			serviceWorker: { offlineFallback: "/offline" },
			sx: { tw: true },
		}),
		cloudflare({ viteEnvironment: { name: "ssr" } }),
	],
	root: appRoot,
	server: {
		hmr: { overlay: false },
	},
});
