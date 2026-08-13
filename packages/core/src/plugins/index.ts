import { existsSync, watch } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import type { Options as SolidPluginOptions } from "vite-plugin-solid"
import solid from "vite-plugin-solid"
import { runGenerate } from "../generators/index.ts"
import { EMPTY_OBJ } from "../internal/index.ts"
import type { LogLevel } from "../logger.ts"
import { createCssTransformPlugin } from "./css-transform.ts"
import { createDevCdnCachePlugin } from "./dev-cdn-cache.ts"
import { createDevDashboardPlugin } from "./dev-dashboard/plugin.ts"
import { createDevPrerenderPlugin } from "./dev-prerender.ts"
import { createDevServerPlugin, createPreviewServerPlugin } from "./dev-server.ts"
import { createImagePlugin } from "./image-plugin.ts"
import { createPrerenderPlugin, type PrerenderPluginConfig } from "./prerender-plugin.ts"
import {
	createPurgePlugin,
	createPurgeTestIdsPlugin,
	type PurgeConfig,
	resolvePurgeConfig,
} from "./purge.ts"
import { createServerFnPlugin } from "./server-fn.ts"
import {
	createServiceWorkerDisabledPlugin,
	createServiceWorkerPlugin,
	normalizeSwConfig,
	type ServiceWorkerConfig,
} from "./service-worker.ts"
import { createSxAstPlugin } from "./sx-ast/index.ts"
import type { SxAstOptions } from "./sx-ast/index.ts"
import type { ResolvedEntries, VitePlugin } from "./types.ts"
import { createVirtualPlugin } from "./virtual.ts"
import { resolveFlareOptions } from "./options.ts"

/* ── Re-exports ─────────────────────────────────────────────────────── */

export { createSxAstPlugin } from "./sx-ast/index.ts"
export type { SxAstOptions } from "./sx-ast/index.ts"
export { createCssTransformPlugin } from "./css-transform.ts"
export { createDevServerPlugin, createPreviewServerPlugin } from "./dev-server.ts"
export { createImagePlugin } from "./image-plugin.ts"
export { extractParenContent, findMatchingBraceSimple } from "./parse-utils.ts"
export type { PrerenderPluginConfig, SitemapPluginConfig } from "./prerender-plugin.ts"
export { createPrerenderPlugin } from "./prerender-plugin.ts"
export {
	createServerFnPlugin,
	generateServerFnMapSource,
	replaceServerFnConfigs,
	scanServerFnFiles,
	stripHandlerBodies,
	transformEnvFns,
} from "./server-fn.ts"
export type { ResolvedEntries, VitePlugin } from "./types.ts"
export { createVirtualPlugin } from "./virtual.ts"

/* ── Types ───────────────────────────────────────────────────────────── */

export interface FlareImageConfig {
	exclude?: RegExp
	quality?: number
	widths?: number[]
}

export interface CodegenConfig {
	fsVirtualPaths?: boolean
	routesFilePath?: string
	typesFilePath?: string
}

/* codegen is always on — only configures where/how, never disables */

export interface DevConfig {
	cdnCache?: boolean
	dashboard?: boolean
	serverTiming?: boolean
	staticCache?: boolean
}

export interface FlarePluginConfig {
	alias?: Record<string, string>
	/**
	 * URL prefix for built assets. Defaults to `"/assets"`.
	 * Must start with `"/"` and not end with `"/"` (except `"/"` which means root-relative).
	 * No query strings or hash fragments. Throws at plugin construction on bad input.
	 */
	assetsBase?: string
	codegen?: CodegenConfig
	dev?: DevConfig | boolean
	entry?: { client?: string; server?: string }
	ignorePrefix?: string
	image?: FlareImageConfig
	logLevel?: LogLevel
	port?: number
	prerender?: PrerenderPluginConfig | boolean
	purge?: PurgeConfig | boolean
	serviceWorker?: ServiceWorkerConfig | boolean
	solid?: Partial<SolidPluginOptions>
	sx?: SxAstOptions
}

/* ── Config resolvers ────────────────────────────────────────────────── */

export function resolveCodegenConfig(raw?: CodegenConfig): {
	fsVirtualPaths: boolean
	routesFilePath: string
	typesFilePath: string
} {
	return {
		fsVirtualPaths: raw?.fsVirtualPaths ?? true,
		routesFilePath: raw?.routesFilePath ?? "src/_gen/routes.gen.ts",
		typesFilePath: raw?.typesFilePath ?? "src/_gen/types.gen.d.ts",
	}
}

export function resolveDevConfig(raw?: DevConfig | boolean): {
	cdnCache: boolean
	dashboard: boolean
	serverTiming: boolean
	staticCache: boolean
} {
	if (raw === false)
		return { cdnCache: false, dashboard: false, serverTiming: false, staticCache: false }
	if (raw === undefined || raw === true)
		return { cdnCache: true, dashboard: true, serverTiming: true, staticCache: true }
	return {
		cdnCache: raw.cdnCache ?? true,
		dashboard: raw.dashboard ?? true,
		serverTiming: raw.serverTiming ?? true,
		staticCache: raw.staticCache ?? true,
	}
}

/* ── Module map ──────────────────────────────────────────────────────── */

const FLARE_PREFIX = "flare/"

const MODULE_MAP: Record<string, { client: string; ssr: string }> = {
	hydrate: { client: "dist/client/hydrate.js", ssr: "dist/ssr/hydrate.js" },
	link: { client: "dist/client/link.js", ssr: "dist/ssr/link.js" },
	outlet: { client: "dist/client/outlet.js", ssr: "dist/ssr/outlet.js" },
	ssr: { client: "dist/client/ssr.js", ssr: "dist/ssr/ssr.js" },
}

/* ── Conventions ─────────────────────────────────────────────────────── */

const ENTRY_EXTENSIONS = [".tsx", ".ts"]

function resolveEntry(root: string, base: string, override?: string): string {
	if (override) {
		if (!existsSync(join(root, override))) {
			throw new Error(`Flare: entry.${base} path "${override}" not found`)
		}
		return override
	}
	for (const ext of ENTRY_EXTENSIONS) {
		if (existsSync(join(root, `src/${base}${ext}`))) return `src/${base}${ext}`
	}
	throw new Error(`Flare: missing src/${base}.tsx or src/${base}.ts`)
}

/* ── Resolver ────────────────────────────────────────────────────────── */

function createResolverPlugin(): VitePlugin {
	const flareRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..")
	const hasDist = existsSync(join(flareRoot, "dist"))

	return {
		enforce: "pre",
		name: "flare:resolver",
		resolveId(this: { environment?: { name?: string } }, id: string): string | null {
			if (!hasDist) return null
			if (!id.startsWith(FLARE_PREFIX)) return null

			const subpath = id.slice(FLARE_PREFIX.length)
			const mapping = MODULE_MAP[subpath]
			if (!mapping) return null

			const env = this.environment?.name ?? "client"
			return env === "ssr" ? mapping.ssr : mapping.client
		},
	}
}

/* ── Generate ────────────────────────────────────────────────────────── */

const GEN_IGNORE_RE = /(_gen[/\\]|\.gen\.tsx?$)/

const FS_CODEGEN_SUFFIX_RE = /\.(page|layout|root-layout)\.(tsx?|jsx?)$/

function createGeneratePlugin(
	config: FlarePluginConfig,
	codegen: ReturnType<typeof resolveCodegenConfig>,
): VitePlugin {
	const ignorePrefix = config.ignorePrefix ?? "_"

	const generateOpts = {
		fsCodegen: codegen.fsVirtualPaths,
		ignorePrefix,
		outputPath: codegen.routesFilePath,
		rootDir: "",
		typesOutputPath: codegen.typesFilePath,
	}

	return {
		buildStart(this: { environment?: { config?: { root?: string } } }) {
			const root = this.environment?.config?.root ?? process.cwd()
			runGenerate({ ...generateOpts, rootDir: root })
		},
		configureServer(server: unknown) {
			const srv = server as {
				httpServer?: { on?: (event: string, fn: () => void) => void } | null
				config?: { root?: string }
			}
			const root = srv.config?.root ?? process.cwd()
			const srcDir = join(root, "src")
			let debounceTimer: ReturnType<typeof setTimeout> | undefined

			const watcher = watch(srcDir, { recursive: true }, (_event, filename) => {
				if (!filename) return
				const name = String(filename)
				if (GEN_IGNORE_RE.test(name)) return

				/* In fs-codegen mode, only trigger on route suffix files or file deletions */
				if (codegen.fsVirtualPaths && _event !== "rename" && !FS_CODEGEN_SUFFIX_RE.test(name))
					return

				clearTimeout(debounceTimer)
				debounceTimer = setTimeout(() => {
					try {
						runGenerate({ ...generateOpts, rootDir: root })
					} catch {
						/* validation errors logged by caller */
					}
				}, 100)
			})

			srv.httpServer?.on?.("close", () => {
				clearTimeout(debounceTimer)
				watcher.close()
			})
			return undefined
		},
		name: "flare:generate",
	}
}

/* ── SSR Build ───────────────────────────────────────────────────────── */

function createSsrBuildPlugin(
	entries: ResolvedEntries,
	config: FlarePluginConfig,
	assetsBase: string,
	assetsDir: string,
): VitePlugin {
	return {
		config() {
			return {
				appType: "custom",
				build: {
					assetsDir,
				},
				builder: {
					async buildApp(builder: {
						build: (env: unknown) => Promise<void>
						environments: Record<string, unknown>
					}) {
						await builder.build(builder.environments.client)
						await builder.build(builder.environments.ssr)
					},
					sharedPlugins: true,
				},
				environments: {
					client: {
						build: {
							manifest: true,
							outDir: "dist/client",
							rolldownOptions: {
								external: ["node:async_hooks"],
								input: entries.client,
								output: {
									assetFileNames: `${assetsDir}/[hash].[ext]`,
									chunkFileNames: `${assetsDir}/[hash].js`,
									entryFileNames: `${assetsDir}/client-[hash].js`,
								},
							},
						},
					},
					ssr: {
						build: {
							minify: true,
							outDir: "dist/server",
							rolldownOptions: {
								input: entries.server,
								output: {
									entryFileNames: "server.js",
								},
							},
						},
					},
				},
				optimizeDeps: {
					include: ["solid-js", "solid-js/web", "solid-js/store"],
				},
				resolve: {
					...(config.alias ? { alias: config.alias } : {}),
					dedupe: ["solid-js", "solid-js/web", "solid-js/store"],
				},
				server: {
					...(config.port ? { port: config.port } : {}),
					watch: {
						ignored: ["**/_gen/**", "**/*.gen.ts", "**/*.gen.tsx"],
					},
				},
				ssr: {
					noExternal: ["solid-js", "flare", "@repo/flare-ui", "@tanstack/solid-query"],
				},
			}
		},

		configResolved(resolved: unknown) {
			const r = resolved as { base: string; build?: { assetsDir?: string } }
			/*
			 * Flare does not set Vite `base` — asset paths are controlled via
			 * rolldown output.*FileNames. Guard against a consumer setting
			 * build.assetsDir that conflicts with the flare-derived dir.
			 */
			if (r.build?.assetsDir && r.build.assetsDir !== assetsDir) {
				throw new Error(
					`flare: vite "build.assetsDir" (${JSON.stringify(r.build.assetsDir)}) does not match assetsBase-derived dir (${JSON.stringify(assetsDir)}). Remove build.assetsDir from vite.config.ts.`,
				)
			}
		},

		name: "flare:ssr-build",
	}
}

/* ── CSS Scope Plugin ────────────────────────────────────────────────── */

const CSS_ATTR_RE = /css="([^"]*)"/g

function hashCSS(str: string): string {
	let h = 0x811c9dc5
	for (let i = 0; i < str.length; i++) {
		h = Math.imul(h ^ str.charCodeAt(i), 0x01000193)
	}
	h = Math.imul(h ^ (h >>> 16), 0x85ebca6b)
	return (h >>> 0).toString(36)
}

export function createCssScopePlugin(): VitePlugin {
	return {
		enforce: "pre",
		name: "flare:css-scope",
		transform(code: string, id: string): { code: string; map: null } | null {
			if (!id.endsWith(".tsx") && !id.endsWith(".jsx")) return null
			if (!CSS_ATTR_RE.test(code)) return null

			CSS_ATTR_RE.lastIndex = 0
			const transformed = code.replace(CSS_ATTR_RE, (_match, rawValue: string) => {
				const cssValue = rawValue.replace(/&quot;/g, '"')
				const hash = hashCSS(cssValue.trim())
				const escaped = cssValue.replace(/\\/g, "\\\\").replace(/"/g, '\\"')
				return `data-c={__flare_registerCSSByName__("${hash}", "${escaped}")}`
			})

			const importLine =
				'import { registerCSSByName as __flare_registerCSSByName__ } from "flare/styles"\n'
			return { code: `${importLine}${transformed}`, map: null }
		},
	}
}

/* ── tw= diagnostic plugin ───────────────────────────────────────────── */

/* Warn authors who still write tw="..." — the attribute was dropped in favour of class=. */
function createTwDeprecatedPlugin(): VitePlugin {
	return {
		enforce: "pre",
		name: "flare:tw-deprecated",
		transform(
			this: { warn: (msg: string) => void },
			code: string,
			id: string,
		): null {
			if (!id.endsWith(".tsx") && !id.endsWith(".jsx")) return null
			if (!code.includes("tw=")) return null
			this.warn(
				`[flare:tw] tw="..." attribute was dropped. Put Tailwind utilities in class="...". (${id})`,
			)
			return null
		},
	}
}

/* ── Main export ─────────────────────────────────────────────────────── */

export function flare(config: FlarePluginConfig = EMPTY_OBJ): VitePlugin[] {
	const root = process.cwd()
	const resolvedOptions = resolveFlareOptions(config)
	const resolvedCodegen = resolveCodegenConfig(config.codegen)
	const resolvedDev = resolveDevConfig(config.dev)
	const resolvedPurge = resolvePurgeConfig(config.purge)
	const entries: ResolvedEntries = {
		client: resolveEntry(root, "client", config.entry?.client),
		server: resolveEntry(root, "server", config.entry?.server),
	}

	const solidConfig = {
		extensions: [".tsx", ".jsx"],
		hydratable: true,
		ssr: true,
		...config.solid,
	}

	const resolvedSw = normalizeSwConfig(config.serviceWorker)

	/* TS 7: vite + vite-plugin-solid Plugin identities overflow. Keep this list on VitePlugin. */
	const plugins: VitePlugin[] = [
		createTwDeprecatedPlugin(),
		/* manifest: true always enabled so virtual:flare-sx-manifest is populated at SSR build time */
		...(config.sx
			? [createSxAstPlugin({ ...config.sx, manifest: true }, resolvedOptions.assetsBase) as unknown as VitePlugin]
			: []),
		createCssScopePlugin(),
		solid(solidConfig) as unknown as VitePlugin,
		createImagePlugin(config, resolvedOptions.assetsBase, resolvedOptions.assetsDir),
		createResolverPlugin(),
		createGeneratePlugin(config, resolvedCodegen),
		createSsrBuildPlugin(entries, config, resolvedOptions.assetsBase, resolvedOptions.assetsDir),
		createDevServerPlugin(entries, resolvedOptions.assetsBase),
		createPreviewServerPlugin(resolvedOptions.assetsBase),
		createVirtualPlugin(config, entries, resolvedCodegen),
		createServerFnPlugin(config),
		createCssTransformPlugin(),
		(resolvedSw
			? createServiceWorkerPlugin(resolvedSw, resolvedOptions.assetsBase)
			: createServiceWorkerDisabledPlugin()) as unknown as VitePlugin,
	]

	/* Purge plugins */
	if (resolvedPurge.console || resolvedPurge.debugger) {
		plugins.push(createPurgePlugin(resolvedPurge))
	}
	if (resolvedPurge.testIds) {
		plugins.push(createPurgeTestIdsPlugin(resolvedPurge.testIds))
	}

	if (config.prerender) {
		plugins.push(createPrerenderPlugin(config))
	}

	/* Dev-only plugins */
	if (resolvedDev.dashboard) {
		plugins.push(createDevDashboardPlugin(config))
	}
	if (resolvedDev.cdnCache) {
		plugins.push(createDevCdnCachePlugin())
	}
	if (resolvedDev.staticCache) {
		plugins.push(createDevPrerenderPlugin(config, entries))
	}

	return plugins
}
