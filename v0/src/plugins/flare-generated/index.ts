/**
 * Vite Plugin: Flare Generated
 *
 * Provides virtual modules:
 * - "virtual:flare-generated" - re-exports routes, layouts, etc.
 * - "virtual:flare-route-loader" - minimal loaders for zero-manifest hydration
 */

import { readFileSync } from "node:fs"
import { join, resolve } from "node:path"
import type { Plugin, ResolvedConfig } from "vite"
import { type FlareBuildConfig, resolveBuildConfig } from "../../config"

const VIRTUAL_GENERATED = "virtual:flare-generated"
const RESOLVED_GENERATED = `\0${VIRTUAL_GENERATED}`
const VIRTUAL_LOADER = "virtual:flare-route-loader"
const RESOLVED_LOADER = `\0${VIRTUAL_LOADER}`

export function flareGenerated(config?: FlareBuildConfig): Plugin {
	let viteConfig: ResolvedConfig
	const cfg = resolveBuildConfig(config)

	return {
		configResolved(resolvedConfig) {
			viteConfig = resolvedConfig
		},

		load(id) {
			if (id !== RESOLVED_GENERATED && id !== RESOLVED_LOADER) return null

			function absPath(genPath: string): string {
				const full = join(viteConfig.root, genPath)
				return full.replace(/\.ts$/, "")
			}

			const routesPath = absPath(cfg.generated.routesFilePath)

			/* Handle virtual:flare-route-loader - minimal loaders for zero-manifest hydration */
			if (id === RESOLVED_LOADER) {
				const srcDir = resolve(viteConfig.root, "src")
				const routesGenPath = resolve(viteConfig.root, cfg.generated.routesFilePath)

				try {
					const routesContent = readFileSync(routesGenPath, "utf-8")

					/* Extract route file paths and export names */
					const routeMatches = routesContent.matchAll(
						/exportName:\s*"([^"]+)"[\s\S]*?filePath:\s*"([^"]+)"/g,
					)
					const moduleEntries: string[] = []
					for (const match of routeMatches) {
						const exportName = match[1]
						const filePath = match[2]
						if (exportName === undefined || filePath === undefined) continue
						const modulePath = `./${filePath.replace(/\.tsx?$/, "")}`
						const importPath = resolve(srcDir, filePath.replace(/\.tsx?$/, ""))
						moduleEntries.push(
							`\t"${modulePath}": () => import("${importPath}").then(m => ({ default: m.${exportName} }))`,
						)
					}

					/* Extract layout keys and paths */
					const layoutMatches = routesContent.matchAll(
						/"([^"]+)":\s*\(\)\s*=>\s*import\("([^"]+)"\)\.then\(m\s*=>\s*\(\{\s*default:\s*m\.(\w+)\s*\}\)\)/g,
					)
					const layoutEntries: string[] = []
					for (const match of layoutMatches) {
						const layoutKey = match[1]
						const importPath = match[2]
						const exportName = match[3]
						if (layoutKey === undefined || importPath === undefined || exportName === undefined)
							continue
						const absImportPath = resolve(viteConfig.root, "src/_gen", importPath)
						layoutEntries.push(
							`\t"${layoutKey}": () => import("${absImportPath}").then(m => ({ default: m.${exportName} }))`,
						)
					}

					return `/**
 * Minimal route loader for zero-manifest hydration
 * Re-exports createComponent from app's solid-js to ensure consistent hydration keys
 */

export { createComponent } from "solid-js"

const moduleLoaders = {
${moduleEntries.join(",\n")}
}

const layoutLoaders = {
${layoutEntries.join(",\n")}
}

export function loadModule(modulePath) {
	const loader = moduleLoaders[modulePath]
	return loader ? loader() : Promise.resolve(null)
}

export function loadLayout(layoutKey) {
	const loader = layoutLoaders[layoutKey]
	return loader ? loader() : Promise.resolve(null)
}
`
				} catch (e) {
					console.warn("[flare] Failed to parse routes for loader generation:", e)
					return `
export { createComponent } from "solid-js"
export function loadModule() { return Promise.resolve(null) }
export function loadLayout() { return Promise.resolve(null) }
`
				}
			}

			/* Handle virtual:flare-generated */
			return `export { routeTree, layouts, boundaries } from "${routesPath}"
`
		},
		name: "flare:generated",

		resolveId(id) {
			if (id === VIRTUAL_GENERATED) return RESOLVED_GENERATED
			if (id === VIRTUAL_LOADER) return RESOLVED_LOADER
			return null
		},
	}
}
