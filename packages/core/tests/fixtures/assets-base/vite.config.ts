import solid from "@solidjs/vite-plugin";
import { createSxAstPlugin } from "../../../src/plugins/sx-ast/index.ts";
import { createImagePlugin } from "../../../src/plugins/image-plugin.ts";
import { createServiceWorkerPlugin, normalizeSwConfig } from "../../../src/plugins/service-worker.ts";
import { resolveFlareOptions } from "../../../src/plugins/options.ts";
import type { FlarePluginConfig } from "../../../src/plugins/index.ts";

const assetsBaseEnv = process.env.FLARE_ASSETS_BASE_TEST;

const config = (assetsBaseEnv ? { assetsBase: assetsBaseEnv } : {}) as FlarePluginConfig;

const resolvedOptions = resolveFlareOptions(config);
const resolvedSw = normalizeSwConfig(true);

/*
 * viteBase: Vite requires base to end with "/" — assetsBase does not.
 * HTML refs become `${base}${filename}`, so with base="/app/assets/" and
 * assetsDir="" the refs land at "/app/assets/client-hash.js" exactly.
 */
const viteBase = resolvedOptions.assetsBase === "" ? "/" : `${resolvedOptions.assetsBase}/`;

export default {
	base: viteBase,
	build: {
		/*
		 * assetsDir "" means CSS/images go to the root of outDir.
		 * Combined with base="/app/assets/", HTML refs become "/app/assets/hash.css".
		 * The image plugin uses assetsDir from resolvedOptions for emitFile paths —
		 * keep those consistent with the on-disk location.
		 */
		assetsDir: "",
		manifest: true,
		outDir: "dist/client",
		rollupOptions: {
			input: new URL("index.html", import.meta.url).pathname,
			output: {
				assetFileNames: "[name]-[hash][extname]",
				chunkFileNames: "[hash].js",
				entryFileNames: "client-[hash].js",
			},
		},
	},
	plugins: [
		createSxAstPlugin({ manifest: true, tw: true }, resolvedOptions.assetsBase),
		solid({ extensions: [".tsx", ".jsx"], ssr: true }),
		/* assetsDir="" for image emitFile to match the build.assetsDir above */
		createImagePlugin(config, resolvedOptions.assetsBase, ""),
		resolvedSw ? createServiceWorkerPlugin(resolvedSw, resolvedOptions.assetsBase) : null,
	],
	root: new URL(".", import.meta.url).pathname,
};
