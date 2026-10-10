import { defineConfig } from "vite";
import { flare } from "@lovrozagar/flare/plugins";

export default defineConfig({
	server: {
		hmr: { overlay: false },
	},
	plugins: [
		flare({
			codegen: { fsVirtualPaths: false },
			dev: { cdnCache: false },
			prerender: true,
			purge: { console: true },
			sx: { tw: true },
		}),
	],
});
