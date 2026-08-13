/**
 * Server Build Configuration
 *
 * Builds SSR JSX components that render to HTML strings.
 * These components run on the server during SSR.
 *
 * Runs SECOND (clean: false), depends on shared config.
 */

import { solidPlugin } from "esbuild-plugin-solid"
import { defineConfig, type Options } from "tsup"

const shared: Partial<Options> = {
	dts: true,
	external: [
		"solid-js",
		"solid-js/web",
		"solid-js/store",
		/* Must be external so all modules share the same context instances */
		"@flare/v0/client/flare-context",
		"@flare/v0/router/outlet-context",
		"@flare/v0/router/outlet",
	],
	format: ["esm"],
	sourcemap: true,
	target: "es2022",
	treeshake: true,
}

const config: Options = {
	...shared,
	clean: false,
	entry: {
		/* Client - Types generated here, JS overwritten by client config */
		"client/hydrate": "src/client/hydrate.tsx",
		"client/provider": "src/client/provider.tsx",

		/* Components - SSR only */
		"components/app-root": "src/components/app-root.tsx",
		"components/await": "src/components/await/index.tsx",
		"components/head-content": "src/components/head-content.tsx",
		"components/scripts": "src/components/scripts.tsx",
		"components/ssr-context": "src/components/ssr-context.tsx",

		/* Router - SSR JSX components */
		"router/link": "src/router/link/index.tsx",
		"router/outlet": "src/router/outlet/index.tsx",
		"server/client-lazy": "src/client-lazy/index.tsx",

		/* Server handler with JSX */
		"server/handler/ssr": "src/server/handler/ssr.tsx",

		/* Lazy loading - SSR version (client version built by client config) */
		"server/lazy": "src/lazy/index.tsx",
	},
	/*
	 * SSR transform - generates string-rendering JSX.
	 * hydratable: true is REQUIRED for hydration keys to match client.
	 */
	esbuildPlugins: [solidPlugin({ solid: { generate: "ssr", hydratable: true } })],
	outDir: "dist",
	splitting: false,
}

export default defineConfig(config)
