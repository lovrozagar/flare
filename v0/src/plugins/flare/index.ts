/**
 * Flare SSR/Dev Plugin
 *
 * Complete Vite plugin for Flare v2 SSR builds and dev server.
 * Handles:
 * - Code generation (routes, types) on build start + watch in dev
 * - Environment-aware Solid transforms (SSR vs client)
 * - @flare/v0 path resolution based on environment
 * - Virtual modules for generated config
 * - Vite config (environments, aliases, dedupes)
 */

import type { FSWatcher } from "node:fs"
import { existsSync, readFileSync, watch } from "node:fs"
import { createRequire } from "node:module"
import { resolve } from "node:path"
import solid from "vite-plugin-solid"

const moduleRequire = createRequire(import.meta.url)

import type { Plugin, ResolvedConfig, UserConfig } from "vite"
import type { FlareBuildConfig } from "../../config"
import { resolveBuildConfig } from "../../config"
import { generateRouteTypes } from "../../generators/route-types"
import { generateRoutes } from "../../generators/routes"
import { type ClientManifestOptions, clientManifest } from "../client-manifest"
import { minifyCssRaw } from "../minify-css-raw"
import { createManualChunks, getSharedPlugins } from "../shared"

/**
 * Transform Tailwind v4 @theme blocks to :root CSS custom properties
 */
function transformThemeToRoot(css: string): string {
	let result = css.replace(/@layer\s+[\w\s,]+;/g, "")
	result = result.replace(/@theme\s*\{/g, ":root {")
	return result
}

/**
 * Minify CSS string
 */
function minifyCss(css: string): string {
	return css
		.replace(/\/\*[\s\S]*?\*\//g, "")
		.replace(/\s+/g, " ")
		.replace(/\s*([{}:;,>+~])\s*/g, "$1")
		.replace(/;}/g, "}")
		.trim()
}

/**
 * Generate theme inline script
 */
function generateThemeScript(theme: FlareBuildConfig["theme"]): string {
	if (!theme) return ""
	const attr = theme.attribute ?? "data-theme"
	const defaultTheme = theme.defaultTheme ?? "system"
	const storageKey = theme.storageKey ?? "flare.theme"
	return `((k,d,a)=>{const e=document.documentElement;let t;try{t=localStorage.getItem(k)||d}catch{t=d}if(t==="system")t=matchMedia("(prefers-color-scheme:dark)").matches?"dark":"light";e.setAttribute(a,t);e.style.colorScheme=t})("${storageKey}","${defaultTheme}","${attr}")`
}

/**
 * Generate direction inline script
 */
function generateDirectionScript(direction: FlareBuildConfig["direction"]): string {
	if (!direction?.enabled) return ""
	const attr = direction.attribute ?? "data-dir"
	const defaultDir = direction.defaultDir ?? "ltr"
	const storageKey = direction.storageKey ?? "flare.dir"
	return `((k,d,a)=>{const e=document.documentElement;let t;try{t=localStorage.getItem(k)}catch{}if(!t)t=e.getAttribute("dir")||d;e.setAttribute(a,t);e.setAttribute("dir",t)})("${storageKey}","${defaultDir}","${attr}")`
}

/**
 * Run all generators
 */
function runGenerators(root: string, config: FlareBuildConfig, silent = false): void {
	generateRoutes({ buildConfig: config, config, root, silent })
	generateRouteTypes({ config, root, silent })
}

/**
 * Flare Vite plugin for SSR builds and dev server
 *
 * Handles ALL complexity internally - consumer just needs:
 * ```ts
 * import { flare } from "@flare/v0/plugins"
 * import { cloudflare } from "@cloudflare/vite-plugin"
 * import build from "./flare.build"
 *
 * export default defineConfig({
 *   plugins: [
 *     flare(build),
 *     cloudflare({ configPath: "./wrangler.jsonc", viteEnvironment: { name: "ssr" } }),
 *   ],
 * })
 * ```
 */
export function flare(config: FlareBuildConfig = {}): Plugin[] {
	const resolvedConfig = resolveBuildConfig(config)
	const themeScript = generateThemeScript(config.theme)
	const directionScript = generateDirectionScript(config.direction)

	/**
	 * Solid.js JSX transform - single plugin following solid-start approach
	 *
	 * Uses ONE solid plugin with ssr: true and hydratable: true.
	 * The plugin uses options.ssr from transform hooks to determine output type.
	 * This approach generates consistent hydration keys between SSR and client.
	 */
	const solidPlugin = solid({
		extensions: [".tsx", ".jsx"],
		solid: { hydratable: true },
		ssr: true,
	})

	/**
	 * Resolve @flare/v0 router components to pre-built dist based on environment
	 * SSR needs server-rendered components, client needs hydratable DOM components
	 */
	let flarePackagePath: string | null = null

	const flareResolverPlugin: Plugin = {
		configResolved(viteConfig) {
			try {
				const flarePackageJson = moduleRequire.resolve("@flare/v0/package.json")
				flarePackagePath = resolve(flarePackageJson, "..")
			} catch {
				flarePackagePath = resolve(viteConfig.root, "../../packages/flare")
			}
		},
		enforce: "pre",
		name: "flare:resolver",
		resolveId(source, _importer, options) {
			if (!flarePackagePath) return null

			const isSSR =
				options?.ssr === true ||
				(this as unknown as { environment?: { name?: string } }).environment?.name === "ssr"

			const ssrPaths: Record<string, string> = {
				"@flare/v0/client/hydrate": resolve(flarePackagePath, "dist/client/hydrate.js"),
				"@flare/v0/client/provider": resolve(flarePackagePath, "dist/client/provider.js"),
				"@flare/v0/router/link": resolve(flarePackagePath, "dist/router/link.js"),
				"@flare/v0/router/outlet": resolve(flarePackagePath, "dist/router/outlet.js"),
				"@flare/v0/router/outlet-context": resolve(
					flarePackagePath,
					"dist/router/outlet-context.js",
				),
			}

			const clientPaths: Record<string, string> = {
				"@flare/v0/client/provider": resolve(flarePackagePath, "dist/client/provider.js"),
				/* Link needs DOM compilation for onClick/onMouseEnter event handlers */
				"@flare/v0/router/link": resolve(flarePackagePath, "dist/client/link.js"),
				"@flare/v0/router/outlet-context": resolve(
					flarePackagePath,
					"dist/router/outlet-context.js",
				),
			}

			const paths = isSSR ? ssrPaths : clientPaths
			if (source in paths) {
				return paths[source]
			}
			return null
		},
	}

	/**
	 * Generate routes on build start + watch in dev
	 */
	const generatePlugin: Plugin = {
		buildStart() {
			const root =
				(this as unknown as { environment?: { config?: { root?: string } } }).environment?.config
					?.root ?? process.cwd()
			runGenerators(root, config)
		},

		config(): UserConfig {
			return {
				build: {
					rollupOptions: {
						output: {
							assetFileNames: "assets/[hash].[ext]",
							chunkFileNames: "assets/[hash].[ext]",
							entryFileNames: (chunkInfo) =>
								chunkInfo.name === "client" ? "assets/client.js" : "assets/[name]-[hash].js",
						},
					},
				},
				environments: {
					client: {
						build: {
							outDir: "dist/client",
							rollupOptions: {
								output: {
									assetFileNames: "assets/[hash].[ext]",
									chunkFileNames: "assets/[hash].js",
									entryFileNames: "assets/client.js",
								},
							},
						},
						resolve: {
							dedupe: ["solid-js", "solid-js/web", "solid-js/store"],
						},
					},
					ssr: {
						build: {
							outDir: "dist/ssr",
						},
						optimizeDeps: {
							exclude: ["solid-js", "solid-js/web", "solid-js/store", "solid-js/h"],
							noDiscovery: true,
						},
						resolve: {
							dedupe: ["solid-js", "solid-js/web", "solid-js/store"],
						},
					},
				},
				/* Pre-bundle solid-js and query-client-provider for consistent module resolution */
				optimizeDeps: {
					include: [
						"solid-js",
						"solid-js/web",
						"solid-js/store",
						"@flare/v0/query-client/query-client-provider",
					],
				},
				resolve: {
					alias: {
						"@": resolve(process.cwd(), "src"),
					},
					/* Dedupe solid-js for SSR context propagation via sharedConfig */
					dedupe: ["solid-js", "solid-js/web", "solid-js/store"],
				},
				server: {
					watch: {
						ignored: ["**/_gen/**", "**/*.gen.ts", "**/*.gen.tsx"],
					},
				},
				ssr: {
					noExternal: [
						"solid-js",
						"solid-js/web",
						"solid-js/store",
						"@flare/v0",
						/^@repo\/flare\//,
					],
				},
			}
		},

		configureServer(server) {
			const pagesDir = resolve(server.config.root, "src")
			const watchers: FSWatcher[] = []
			let debounceTimer: ReturnType<typeof setTimeout> | null = null

			const debounce = (fn: () => void | Promise<void>, ms: number) => {
				if (debounceTimer) clearTimeout(debounceTimer)
				debounceTimer = setTimeout(() => {
					Promise.resolve(fn()).catch(() => {})
				}, ms)
			}

			const regenerate = (label: string) => {
				console.log(`\n[flare] ${label}`)
				generateRoutes({
					buildConfig: config,
					config,
					root: server.config.root,
					silent: true,
				})
				generateRouteTypes({ config, root: server.config.root, silent: true })
				console.log("[flare] Done.\n")
			}

			const handleRouteChange = () => {
				debounce(() => regenerate("Regenerating routes..."), 100)
			}

			const serverEntryFilename = resolvedConfig.serverEntryFilePath.replace(/^src\//, "")

			try {
				const pagesWatcher = watch(pagesDir, { recursive: true }, (_event, filename) => {
					if (!filename) return
					if (
						filename.includes("_gen") ||
						filename.endsWith(".gen.ts") ||
						filename.endsWith(".gen.tsx")
					)
						return
					if (filename.endsWith(".tsx") || filename.endsWith(".ts")) {
						/* Server entry changes trigger regeneration (for authorizeFn/queryClient detection) */
						if (filename === serverEntryFilename || filename.endsWith(`/${serverEntryFilename}`)) {
							debounce(() => regenerate("Server entry changed, regenerating..."), 100)
						} else {
							handleRouteChange()
						}
					}
				})
				watchers.push(pagesWatcher)
			} catch {
				/* Directory might not exist */
			}

			console.log("[flare] Watching for changes...")

			server.httpServer?.on("close", () => {
				for (const w of watchers) w.close()
				if (debounceTimer) clearTimeout(debounceTimer)
			})
		},

		name: "flare:generate",
	}

	/**
	 * SSR build config
	 */
	const ssrBuildPlugin: Plugin = {
		config(): UserConfig {
			const clientEntry = config.clientEntryFilePath ?? "src/client.ts"
			return {
				build: {
					cssMinify: true,
					minify: true,
					rollupOptions: {
						input: { client: clientEntry },
						output: {
							assetFileNames: "assets/[hash].[ext]",
							chunkFileNames: "assets/[hash].js",
							entryFileNames: "assets/[name]-[hash].js",
							manualChunks: createManualChunks,
						},
					},
					ssr: true,
				},
			}
		},
		name: "flare:ssr-build",
	}

	/**
	 * Virtual modules for generated config
	 */
	let storedViteConfig: ResolvedConfig | null = null

	const generatedPlugin: Plugin = {
		configResolved(viteConfig) {
			storedViteConfig = viteConfig
		},

		load(id) {
			if (id !== "\0virtual:flare-generated" && id !== "\0virtual:flare-route-loader") return null

			if (!storedViteConfig) {
				throw new Error("[flare] configResolved not called before load")
			}
			const viteConfig = storedViteConfig

			function absPath(genPath: string): string {
				const full = resolve(viteConfig.root, genPath)
				return full.replace(/\.ts$/, "")
			}

			const routesPath = absPath(resolvedConfig.generated.routesFilePath)

			/* Handle virtual:flare-route-loader */
			if (id === "\0virtual:flare-route-loader") {
				const srcDir = resolve(viteConfig.root, "src")
				const routesGenPath = resolve(viteConfig.root, resolvedConfig.generated.routesFilePath)

				try {
					const routesContent = readFileSync(routesGenPath, "utf-8")

					const routeMatches = routesContent.matchAll(
						/exportName:\s*"([^"]+)"[\s\S]*?filePath:\s*"([^"]+)"/g,
					)
					const moduleEntries: string[] = []
					for (const match of routeMatches) {
						const exportName = match[1]
						const filePath = match[2]
						if (!exportName || !filePath) continue
						const modulePath = `./${filePath.replace(/\.tsx?$/, "")}`
						const importPath = resolve(srcDir, filePath.replace(/\.tsx?$/, ""))
						const moduleKey = `${modulePath}:${exportName}`
						moduleEntries.push(
							`\t"${moduleKey}": () => import("${importPath}").then(m => ({ default: m.${exportName} }))`,
						)
					}

					const layoutMatches = routesContent.matchAll(
						/"([^"]+)":\s*\(\)\s*=>\s*import\("([^"]+)"\)\.then\(m\s*=>\s*\(\{\s*default:\s*m\.(\w+)\s*\}\)\)/g,
					)
					const layoutEntries: string[] = []
					for (const match of layoutMatches) {
						const layoutKey = match[1]
						const importPath = match[2]
						const exportName = match[3]
						if (!layoutKey || !importPath || !exportName) continue
						const absPathResolved = resolve(viteConfig.root, "src/_gen", importPath)
						layoutEntries.push(
							`\t"${layoutKey}": () => import("${absPathResolved}").then(m => ({ default: m.${exportName} }))`,
						)
					}

					return `/**
 * Minimal route loader for zero-manifest hydration
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
			const boundaries = config.globalBoundaries
			const boundaryImports = boundaries
				? `
export const GLOBAL_BOUNDARIES = {
	${boundaries.error ? `error: () => import("${resolve(viteConfig.root, "src", boundaries.error)}"),` : ""}
	${boundaries.notFound ? `notFound: () => import("${resolve(viteConfig.root, "src", boundaries.notFound)}"),` : ""}
	${boundaries.streaming ? `streaming: () => import("${resolve(viteConfig.root, "src", boundaries.streaming)}"),` : ""}
	${boundaries.unauthorized ? `unauthorized: () => import("${resolve(viteConfig.root, "src", boundaries.unauthorized)}"),` : ""}
}
`
				: "export const GLOBAL_BOUNDARIES = {}"

			const cssConfig = config.css

			let globalCssValue = ""
			if (cssConfig && typeof cssConfig === "object" && cssConfig.filePath) {
				const cssPath = resolve(viteConfig.root, cssConfig.filePath)
				if (existsSync(cssPath)) {
					let rawCss = readFileSync(cssPath, "utf-8")
					rawCss = rawCss.replace(/@import\s+["']tailwindcss["']\s*;?/g, "")
					globalCssValue = minifyCss(transformThemeToRoot(rawCss))
				}
			}

			return `export { routeTree, layouts, boundaries } from "${routesPath}"

export const THEME_SCRIPT = ${JSON.stringify(themeScript)}
export const THEME_CONFIG = ${JSON.stringify(config.theme ?? null)}
export const DIRECTION_SCRIPT = ${JSON.stringify(directionScript)}
export const GLOBAL_OPTIONS = ${JSON.stringify(config.globalOptions ?? {})}
export const GLOBAL_OPTIONS_PATTERNS = ${JSON.stringify(config.globalOptionsPatterns ?? {})}
export const PROGRESS_CONFIG = ${JSON.stringify(config.progress ?? false)}
export const VIEW_TRANSITIONS_CONFIG = ${JSON.stringify(config.viewTransitions ?? false)}
export const GLOBAL_CSS = ${JSON.stringify(globalCssValue)}
${boundaryImports}
`
		},
		name: "flare:generated",

		resolveId(id) {
			if (id === "virtual:flare-generated") return "\0virtual:flare-generated"
			if (id === "virtual:flare-route-loader") return "\0virtual:flare-route-loader"
			return null
		},
	}

	/**
	 * Redirect solid-js imports to server version in SSR environment
	 */
	const solidSsrResolvePlugin: Plugin = {
		enforce: "pre",

		load(id, options) {
			if (!options?.ssr) return null

			if (id.includes(".vite/deps/solid-js_web.js") || id.includes("solid-js_web.js")) {
				const serverPath = moduleRequire.resolve("solid-js/web/dist/server.js")
				return readFileSync(serverPath, "utf-8")
			}
			if (id.includes(".vite/deps/solid-js_store.js") || id.includes("solid-js_store.js")) {
				const serverPath = moduleRequire.resolve("solid-js/store/dist/server.js")
				return readFileSync(serverPath, "utf-8")
			}
			if (
				(id.includes(".vite/deps/solid-js.js") || id.endsWith("solid-js.js")) &&
				!id.includes("solid-js_")
			) {
				const serverPath = moduleRequire.resolve("solid-js/dist/server.js")
				return readFileSync(serverPath, "utf-8")
			}
			return null
		},
		name: "flare:solid-ssr-resolve",

		resolveId(source, _importer, options) {
			if (!options?.ssr) return null

			if (source === "solid-js" || source === "solid-js/dist/server.js") {
				return { external: false, id: moduleRequire.resolve("solid-js/dist/server.js") }
			}
			if (source === "solid-js/web" || source === "solid-js/web/dist/server.js") {
				return { external: false, id: moduleRequire.resolve("solid-js/web/dist/server.js") }
			}
			if (source === "solid-js/store" || source === "solid-js/store/dist/server.js") {
				return { external: false, id: moduleRequire.resolve("solid-js/store/dist/server.js") }
			}
			if (source === "solid-js/h" || source === "solid-js/h/dist/server.js") {
				return { external: false, id: moduleRequire.resolve("solid-js/h/dist/server.js") }
			}

			if (source.includes(".vite/deps/solid-js_web.js") || source.includes("/solid-js_web.js")) {
				return { external: false, id: moduleRequire.resolve("solid-js/web/dist/server.js") }
			}
			if (
				source.includes(".vite/deps/solid-js_store.js") ||
				source.includes("/solid-js_store.js")
			) {
				return { external: false, id: moduleRequire.resolve("solid-js/store/dist/server.js") }
			}
			if (
				(source.includes(".vite/deps/solid-js.js") || source.endsWith("/solid-js.js")) &&
				!source.includes("solid-js_")
			) {
				return { external: false, id: moduleRequire.resolve("solid-js/dist/server.js") }
			}

			return null
		},
	}

	/**
	 * Post-transform to rewrite prebundle imports in SSR
	 */
	const solidSsrPostTransformPlugin: Plugin = {
		enforce: "post",
		name: "flare:solid-ssr-post-transform",

		transform(code, _id, options) {
			if (!options?.ssr) return null
			if (!code.includes(".vite/deps/solid-js") && !code.includes("/node_modules/.vite/"))
				return null

			const solidPath = moduleRequire.resolve("solid-js/dist/server.js")
			const solidWebPath = moduleRequire.resolve("solid-js/web/dist/server.js")
			const solidStorePath = moduleRequire.resolve("solid-js/store/dist/server.js")

			let transformed = code
			transformed = transformed.replace(
				/from\s*["'][^"']*\.vite\/deps\/solid-js_web\.js[^"']*["']/g,
				`from "${solidWebPath}"`,
			)
			transformed = transformed.replace(
				/from\s*["'][^"']*\.vite\/deps\/solid-js_store\.js[^"']*["']/g,
				`from "${solidStorePath}"`,
			)
			transformed = transformed.replace(
				/from\s*["'][^"']*\.vite\/deps\/solid-js\.js[^"']*["']/g,
				`from "${solidPath}"`,
			)

			if (transformed !== code) {
				return { code: transformed, map: null }
			}
			return null
		},
	}

	const manifestOptions: ClientManifestOptions = {
		clientEntryPath: config.clientEntryFilePath,
	}

	return [
		/* Shared plugins (tailwind, css scope, server fn) - MUST run before Solid JSX transform */
		...getSharedPlugins(config),
		/* Solid JSX transform - single plugin handles both SSR and client */
		solidPlugin,
		solidSsrResolvePlugin,
		/* Flare path resolution */
		flareResolverPlugin,
		/* Route generation */
		generatePlugin,
		/* Build config */
		ssrBuildPlugin,
		/* Virtual modules */
		generatedPlugin,
		/* Client manifest */
		clientManifest(manifestOptions),
		/* CSS minification */
		minifyCssRaw(),
		/* Post-transform SSR cleanup */
		solidSsrPostTransformPlugin,
	]
}
