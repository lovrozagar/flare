import { defineConfig } from "vite";
import { flare } from "@lovrozagar/flare/plugins";

export default defineConfig({
	plugins: [
		flare({
			codegen: { fsVirtualPaths: false },
			dev: false,
			prerender: false,
			sx: { tw: true },
		}),
	],
});
