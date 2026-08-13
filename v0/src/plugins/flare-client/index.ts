/**
 * Flare Client Build Plugin (Legacy)
 *
 * Standalone client build plugin. Not needed when using Cloudflare Vite plugin
 * since flare() handles both client and SSR configuration.
 */

import type { Plugin, ResolvedConfig, UserConfig } from "vite"
import type { FlareBuildConfig } from "../../config"
import { generateRoutes } from "../../generators/routes"
import { flareGenerated } from "../flare-generated"
import { createManualChunks, getSharedPlugins } from "../shared"

/**
 * Client build config plugin
 */
function createClientBuildPlugin(config: FlareBuildConfig): Plugin {
	const clientEntry = config.clientEntryFilePath ?? "src/client.ts"

	return {
		config(): UserConfig {
			return {
				build: {
					manifest: true,
					outDir: "dist/client",
					rollupOptions: {
						input: {
							client: clientEntry,
						},
						output: {
							assetFileNames: "assets/[hash].[ext]",
							chunkFileNames: "assets/[hash].js",
							entryFileNames: "assets/[name]-[hash].js",
							manualChunks: createManualChunks,
						},
					},
				},
			}
		},
		name: "flare:client-build",
	}
}

/**
 * Code generation plugin (no watch - client builds only)
 */
function createClientGeneratePlugin(buildConfig: FlareBuildConfig): Plugin {
	let viteConfig: ResolvedConfig

	return {
		buildStart() {
			/* Run route generator on build start */
			generateRoutes({ config: buildConfig, root: viteConfig.root })
		},
		configResolved(resolvedConfig) {
			viteConfig = resolvedConfig
		},
		name: "flare:generate",
	}
}

/**
 * Flare plugin for client builds
 *
 * All config is passed via FlareBuildConfig from createFlareBuild().
 *
 * @example
 * ```ts
 * import { flareClient } from "@flare/v0/plugins"
 * import build from "./flare.build"
 *
 * export default defineConfig({
 *   plugins: [
 *     flareClient(build),
 *   ],
 *   publicDir: false,
 * })
 * ```
 */
export function flareClient(config: FlareBuildConfig): Plugin[] {
	return [
		...getSharedPlugins(config),
		createClientGeneratePlugin(config),
		createClientBuildPlugin(config),
		flareGenerated(config),
	]
}
