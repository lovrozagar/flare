/**
 * Shared Build Configuration
 *
 * Two-phase build:
 * 1. SSR build: Server components with generate: "ssr"
 * 2. Client build: Client-only components with generate: "dom"
 *
 * This separation is critical - SSR compilation imports functions like
 * ssrStyleProperty that don't exist in browser builds of solid-js/web.
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
		/* Testing - optional peer dep */
		"@playwright/test",
	],
	format: ["esm"],
	sourcemap: true,
	target: "es2022",
	treeshake: true,
}

/* Client-only entry points - compile with generate: "dom" */
const clientEntries = {
	/* Client hydration - runs in browser only */
	"client/hydrate": "src/client/hydrate.tsx",

	/* Link component - needs DOM compilation for event handlers (onClick, onMouseEnter) */
	"client/link": "src/router/link/index.tsx",

	/* Dev error overlay - client-only, rendered after hydration */
	"components/dev-error-overlay": "src/components/dev-error-overlay/index.tsx",
}

/* SSR and shared entry points - compile with generate: "ssr" */
const ssrEntries = {
	/* Internal */
	"_internal/route-tree": "src/router/_route-tree/index.ts",

	/* Client lazy */
	"client-lazy": "src/client-lazy/index.tsx",
	"client/flare-context": "src/client/flare-context.ts",

	/* Client init (no JSX) */
	"client/index": "src/client/init.ts",

	/* Components (SSR) */
	"components/app-root": "src/components/app-root.tsx",
	"components/await": "src/components/await/index.tsx",
	"components/head-content": "src/components/head-content.tsx",
	"components/scripts": "src/components/scripts.tsx",

	/* Config */
	config: "src/config/index.ts",

	/* Errors */
	"errors/dev-error-store": "src/errors/dev-error-store.ts",
	"errors/index": "src/errors/index.ts",

	/* Generators (Node.js only) */
	generators: "src/generators/index.ts",

	/* JSX Runtime */
	"jsx-runtime": "src/jsx-runtime.ts",

	/* Lazy components */
	lazy: "src/lazy/index.tsx",

	/* Plugins (Vite build tools - Node.js only) */
	"plugins/index": "src/plugins/index.ts",

	/* Preload utility (non-JSX) */
	preload: "src/preload/index.ts",

	/* Query Client - Pure utilities */
	"query-client/create-query-client-getter/index":
		"src/query-client/create-query-client-getter/index.ts",
	"query-client/infinite-query-options/index": "src/query-client/infinite-query-options/index.ts",
	"query-client/is-restoring/index": "src/query-client/is-restoring/index.ts",

	/* Query Client - Singleton context (SSR transform for JSX) */
	"query-client/query-client-provider/index": "src/query-client/query-client-provider/index.tsx",
	"query-client/query-client/index": "src/query-client/query-client/index.ts",
	"query-client/query-options/index": "src/query-client/query-options/index.ts",
	"query-client/tracked-client": "src/query-client/tracked-client.ts",
	"query-client/use-base-query/index": "src/query-client/use-base-query/index.ts",
	"query-client/use-infinite-query/index": "src/query-client/use-infinite-query/index.ts",
	"query-client/use-is-fetching/index": "src/query-client/use-is-fetching/index.ts",
	"query-client/use-is-mutating/index": "src/query-client/use-is-mutating/index.ts",
	"query-client/use-mutation-state/index": "src/query-client/use-mutation-state/index.ts",
	"query-client/use-mutation/index": "src/query-client/use-mutation/index.ts",
	"query-client/use-queries/index": "src/query-client/use-queries/index.ts",
	"query-client/use-query/index": "src/query-client/use-query/index.ts",
	"query-client/use-suspense-infinite-query/index":
		"src/query-client/use-suspense-infinite-query/index.ts",
	"query-client/use-suspense-query/index": "src/query-client/use-suspense-query/index.ts",

	/* Convenience aliases for common imports */
	"reset-css": "src/styles/reset-css.tsx",

	/* Router - Pure utilities */
	"router/build-url": "src/router/build-url/index.ts",
	"router/create-layout": "src/router/create-layout/index.ts",
	"router/create-page": "src/router/create-page/index.ts",
	"router/create-root-layout": "src/router/create-root-layout/index.ts",
	"router/hooks": "src/router/hooks/index.ts",
	"router/link": "src/router/link/index.tsx",
	"router/navigation": "src/router/navigation/index.ts",

	/* Router - Singleton context */
	"router/outlet": "src/router/outlet/index.tsx",
	"router/outlet-context": "src/router/outlet-context.ts",
	"router/register": "src/router/register/index.ts",
	"router/router-context": "src/router/router-context/index.ts",
	"router/tree-types": "src/router/tree-types.ts",
	"router/use-loader-data": "src/router/use-loader-data/index.ts",
	"router/use-preloader-context": "src/router/use-preloader-context/index.ts",

	/* Scripts - Head components */
	"scripts/theme": "src/scripts/theme.tsx",

	"server/dedupe": "src/server/dedupe/index.ts",
	"server/handler": "src/server/handler/index.ts",

	/* Server - Non-JSX modules */
	"server/index": "src/server/index.ts",
	"server/middleware": "src/server/middleware/index.ts",
	"server/server-fn": "src/server/server-fn/index.ts",
	"server/server-fn/handler": "src/server/server-fn/handler.ts",

	/* Styles - Scoped CSS runtime */
	"styles/index": "src/styles/index.ts",
	"styles/registry": "src/styles/registry.ts",
	"styles/reset-css": "src/styles/reset-css.tsx",
	"styles/view-transition-css": "src/styles/view-transition-css.tsx",

	/* Testing utilities - Playwright e2e helpers */
	"testing/playwright/index": "src/testing/playwright/index.ts",
	"theme-script": "src/scripts/theme.tsx",
	"view-transition-css": "src/styles/view-transition-css.tsx",
}

/* SSR build - runs first with clean: true */
const ssrConfig: Options = {
	...shared,
	clean: true,
	entry: ssrEntries,
	esbuildPlugins: [solidPlugin({ solid: { generate: "ssr", hydratable: true } })],
	outDir: "dist",
	splitting: false,
}

/* Client build - runs second, generate: "dom" for browser-only code */
const clientConfig: Options = {
	...shared,
	clean: false,
	entry: clientEntries,
	esbuildPlugins: [solidPlugin({ solid: { generate: "dom", hydratable: true } })],
	outDir: "dist",
	splitting: false,
}

export default defineConfig([ssrConfig, clientConfig])
