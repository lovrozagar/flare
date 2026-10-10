import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { flare } from "@lovrozagar/flare/plugins";

/* Same app with sx.strict on. FLARE_STRICT_ALLOW (comma-separated) lists tokens to let through. */
const allow = (process.env.FLARE_STRICT_ALLOW ?? "").split(",").filter(Boolean);

export default defineConfig({
	plugins: [
		flare({
			codegen: { fsVirtualPaths: false },
			dev: false,
			prerender: false,
			sx: {
				strict: { allow },
				tw: true,
				twCssPath: fileURLToPath(new URL("./src/theme.css", import.meta.url)),
			},
		}),
	],
});
