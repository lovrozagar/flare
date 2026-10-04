import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { flare } from "@lovrozagar/flare/plugins";

/* Same app with theme values kept as var() references (live theme editing). */
export default defineConfig({
	plugins: [
		flare({
			codegen: { fsVirtualPaths: false },
			dev: false,
			prerender: false,
			sx: {
				themeVars: "reference",
				tw: true,
				twCssPath: fileURLToPath(new URL("./src/theme.css", import.meta.url)),
			},
		}),
	],
});
