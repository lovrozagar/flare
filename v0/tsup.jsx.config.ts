import { defineConfig, type Options } from "tsup"

const shared: Partial<Options> = {
	dts: true,
	external: ["solid-js", "solid-js/web", "solid-js/store"],
	format: ["esm"],
	sourcemap: true,
	target: "es2022",
	treeshake: true,
}

/* JSX entries - preserve JSX for consumer's vite-plugin-solid */
/* Uses flat structure so ../router/outlet resolves to ../router/outlet.jsx */
const jsxConfig: Options = {
	...shared,
	clean: false,
	dts: true,
	entry: {
		"client/provider": "src/client/provider.tsx",
		"components/head-content": "src/components/head-content.tsx",
		"components/scripts": "src/components/scripts.tsx",
		"components/ssr-context": "src/components/ssr-context.tsx",
		"router/link": "src/router/link/index.tsx",
		"router/outlet": "src/router/outlet/index.tsx",
	},
	esbuildOptions(options) {
		options.jsx = "preserve"
	},
	/* Externalize shared context modules so they're not duplicated */
	external: [...(shared.external as string[]), "../router/outlet-context"],
	outExtension() {
		return { js: ".jsx" }
	},
	splitting: false,
}

export default defineConfig(jsxConfig)
