/**
 * Client Build Configuration
 *
 * Builds DOM JSX components that hydrate SSR output in the browser.
 * These components run on the client and must match SSR structure for hydration.
 *
 * Runs THIRD (clean: false), depends on shared config.
 */

import { solidPlugin } from "esbuild-plugin-solid"
import { defineConfig, type Options } from "tsup"

const shared: Partial<Options> = {
	dts: false, // Types come from shared/server configs
	external: [
		"solid-js",
		"solid-js/web",
		"solid-js/store",
		/* Must be external so all modules share the same context instances */
		"@flare/v0/client/flare-context",
		"@flare/v0/router/outlet-context",
	],
	format: ["esm"],
	sourcemap: true,
	target: "es2022",
	treeshake: true,
}

/*
 * Plugin to externalize shared modules with correct paths.
 *
 * outlet-context: Both outlet and provider need same context instance.
 *   - outlet/index.tsx imports "../outlet-context"
 *   - provider.tsx imports "../router/outlet-context"
 *   - Both resolve to dist/router/outlet-context.js
 *
 * link: Provider needs to share linkRouter state with Link component.
 *   - provider.tsx imports "../router/link"
 *   - Should resolve to dist/client/link.js (same directory, client version)
 */
const sharedModulesPlugin = {
	name: "shared-modules-resolver",
	setup(build: {
		onResolve: (
			opts: { filter: RegExp },
			cb: (args: { path: string; importer: string }) => { path: string; external: true } | null,
		) => void
	}) {
		/* Externalize outlet-context to shared module */
		build.onResolve({ filter: /outlet-context/ }, (args) => {
			if (args.path === "../outlet-context" || args.path === "../router/outlet-context") {
				return { external: true, path: "../router/outlet-context.js" }
			}
			return null
		})
		/* Externalize link so provider shares linkRouter with Link component */
		build.onResolve({ filter: /\/link$/ }, (args) => {
			if (args.path === "../router/link") {
				/* Use package path so vite can resolve to SSR/client version */
				return { external: true, path: "@flare/v0/router/link" }
			}
			return null
		})
		/* Externalize outlet for hydrate.tsx */
		build.onResolve({ filter: /\/outlet$/ }, (args) => {
			if (args.path === "../router/outlet") {
				/* Use package path so vite can resolve to SSR/client version */
				return { external: true, path: "@flare/v0/router/outlet" }
			}
			return null
		})
		/* Externalize provider for hydrate.tsx */
		build.onResolve({ filter: /\.\/provider$/ }, (args) => {
			if (args.path === "./provider") {
				/* Use package path so vite can resolve to SSR/client version */
				return { external: true, path: "@flare/v0/client/provider" }
			}
			return null
		})
	},
}

const config: Options = {
	...shared,
	clean: false,
	entry: {
		"client-lazy": "src/client-lazy/index.tsx",

		/* Hydrate - Main client entry point */
		"client/hydrate": "src/client/hydrate.tsx",
		/* Router - Client JSX components (hydrate SSR output) */
		"client/link": "src/router/link/index.tsx",
		"client/outlet": "src/router/outlet/index.tsx",

		/* Provider - Client hydration wrapper */
		"client/provider": "src/client/provider.tsx",

		/* Lazy loading - separate exports */
		lazy: "src/lazy/index.tsx",
	},
	/*
	 * DOM transform - generates hydrating JSX.
	 * hydratable: true is REQUIRED - without it, hydrate() creates new DOM
	 * instead of reusing SSR output.
	 */
	esbuildPlugins: [
		sharedModulesPlugin,
		solidPlugin({ solid: { generate: "dom", hydratable: true } }),
	],
	outDir: "dist",
	splitting: false,
}

export default defineConfig(config)
