/**
 * Shared Vite Plugin Config
 *
 * Common configuration used by both flare() and flareClient() plugins.
 * Build-time config is passed via FlareBuildConfig from createFlareBuild().
 */

import type { Plugin, UserConfig } from "vite"
import type { FlareBuildConfig } from "../../config"
import { cssScope } from "../css-scope"
import { stylesTransform } from "../css-transform"
import { flareServerFn } from "../server-fn"
import { tailwindTransform } from "../tailwind-transform"

/**
 * Common esbuild config for JSX
 */
export function createEsbuildConfig(jsxImportSource: string): UserConfig["esbuild"] {
	return {
		jsx: "automatic",
		jsxImportSource,
	}
}

/**
 * Manual chunks config - splits Solid into separate chunk
 */
export function createManualChunks(id: string): string | undefined {
	/* Keep solid-js as separate chunk (lazy load) */
	if (id.includes("node_modules/solid-js")) {
		return "solid"
	}
	/* Keep @tanstack/solid-query with Solid */
	if (id.includes("@tanstack/solid-query")) {
		return "solid"
	}
	return undefined
}

/**
 * Shared config plugin - esbuild JSX settings
 */
export function createConfigPlugin(jsxImportSource = "@flare/v0"): Plugin {
	return {
		config(): UserConfig {
			return {
				esbuild: createEsbuildConfig(jsxImportSource),
			}
		},
		name: "flare:config",
	}
}

/**
 * Get shared plugins used by both client and SSR builds
 */
export function getSharedPlugins(config: FlareBuildConfig): Plugin[] {
	const plugins: Plugin[] = [createConfigPlugin()]

	/* Add tailwind transform unless explicitly disabled (tw= → css=) */
	if (config.tailwind !== false) {
		const twConfig = config.tailwind ?? {}
		plugins.unshift(
			tailwindTransform({
				css: twConfig.filePath,
				strict: twConfig.strict,
			}),
		)
	}

	/* Add css scope transform (css= → data-c=) - runs after tw transform */
	plugins.push(cssScope())

	/* Add styles() function transform - validates unique names */
	plugins.push(stylesTransform())

	/* Add server function plugin unless explicitly disabled */
	if (config.serverFn !== false) {
		plugins.push(flareServerFn(config.serverFn ?? {}))
	}

	return plugins
}
