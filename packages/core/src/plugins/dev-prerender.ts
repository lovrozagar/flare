import { watch } from "node:fs"
import { join } from "node:path"
import type { RouteDefinition } from "../generators/index.ts"
import { scanSourceFiles } from "../generators/index.ts"
import type { PrerenderRoute } from "../prerender/index.ts"
import { prerender } from "../prerender/index.ts"
import type { ServerHandler } from "../server-handler/index.ts"
import type { FlareStore } from "../store/index.ts"
import { createFileSystemStore } from "../store/filesystem.ts"
import type { FlarePluginConfig, VitePlugin } from "./index.ts"
import type { ResolvedEntries } from "./types.ts"

/**
 * Convert virtual path to URL pathname.
 * `_root_/about` → `/about`, `_root_/blog/[slug]` → `/blog/[slug]`
 */
function virtualPathToPathname(virtualPath: string): string {
	const parts = virtualPath.split("/")
	const rootIdx = parts.findIndex((p) => p.startsWith("_") && p.endsWith("_") && p.length >= 3)
	const urlParts: string[] = []

	for (let i = 0; i < parts.length; i++) {
		const part = parts[i] ?? ""
		if (rootIdx >= 0 && i <= rootIdx) continue
		if (part.startsWith("(") && part.endsWith(")")) continue
		if (part === "") continue
		urlParts.push(part)
	}

	return `/${urlParts.join("/")}`
}

/**
 * Filter route definitions to only static (SSG) non-dynamic routes
 * suitable for dev-mode prerendering. Dynamic routes and ISR routes
 * are excluded — dynamic requires params, ISR has its own serving path.
 */
export function filterDevPrerenderRoutes(defs: RouteDefinition[]): PrerenderRoute[] {
	const routes: PrerenderRoute[] = []

	for (const def of defs) {
		if (def.type !== "page") continue
		if (def.responseRoute) continue
		if (!def.cache.ssg) continue

		const pathname = virtualPathToPathname(def.virtualPath)

		/* skip dynamic routes — they need params we don't have at dev time */
		if (pathname.includes("[")) continue

		routes.push({ mode: "static", pathname })
	}

	return routes
}

interface SsrEnvironment {
	runner?: { import: (id: string) => Promise<Record<string, unknown>> }
}

interface DevPrerenderServer {
	config?: { root?: string }
	environments?: Record<string, SsrEnvironment>
	httpServer?: { on?: (event: string, fn: () => void) => void } | null
}

/**
 * Vite plugin that pre-renders SSG routes on dev server start,
 * writes entries to FileSystemStore, and invalidates on HMR.
 */
export function createDevPrerenderPlugin(
	config: FlarePluginConfig,
	entries: ResolvedEntries,
): VitePlugin {
	const ignorePrefix = config.ignorePrefix ?? "_"
	let store: FlareStore
	let root: string
	let debounceTimer: ReturnType<typeof setTimeout> | undefined

	function getRoutes(): PrerenderRoute[] {
		const defs = scanSourceFiles({ ignorePrefix, rootDir: root })
		return filterDevPrerenderRoutes(defs)
	}

	async function prerenderRoutes(
		routes: PrerenderRoute[],
		ssrRunner: SsrEnvironment["runner"],
	): Promise<void> {
		if (routes.length === 0 || !ssrRunner) return

		try {
			const mod = await ssrRunner.import(`./${entries.server}`)
			const defaultExport = mod["default"] as Record<string, unknown> | undefined
			const handler = (mod["handler"] ?? defaultExport?.["handler"]) as ServerHandler | undefined
			if (!handler) return

			const result = await prerender({
				handler,
				origin: "http://localhost",
				routes,
			})

			/* Write entries to store */
			for (const entry of result.entries) {
				await store.set(`static:${entry.pathname}`, {
					data: {
						headers: entry.headers,
						html: entry.html,
						ndjson: entry.ndjson,
					},
					storedAt: Date.now(),
				})
			}

			if (result.entries.length > 0) {
				process.stderr.write(
					`[flare:dev-prerender] Pre-rendered ${result.entries.length} SSG route(s)\n`,
				)
			}

			for (const err of result.errors) {
				process.stderr.write(`[flare:dev-prerender] Error ${err.pathname}: ${err.message}\n`)
			}
		} catch (e: unknown) {
			const msg = e instanceof Error ? e.message : String(e)
			process.stderr.write(`[flare:dev-prerender] Failed: ${msg}\n`)
		}
	}

	return {
		configureServer(server: unknown) {
			const vite = server as DevPrerenderServer
			root = vite.config?.root ?? process.cwd()
			store = createFileSystemStore({ cacheDir: join(root, ".flare/cache") })

			const ssrEnv = vite.environments?.ssr
			if (!ssrEnv?.runner) return undefined

			/* Pre-render on server start */
			vite.httpServer?.on?.("listening", () => {
				const routes = getRoutes()
				prerenderRoutes(routes, ssrEnv.runner).catch(() => {
					/* swallow — logged internally */
				})
			})

			/* HMR invalidation — watch route files for changes */
			const srcRoutes = join(root, "src/routes")
			const routeWatcher = watch(srcRoutes, { recursive: true }, (_event, filename) => {
				if (!filename) return
				const name = String(filename)
				if (!name.endsWith(".tsx") && !name.endsWith(".ts")) return

				clearTimeout(debounceTimer)
				debounceTimer = setTimeout(() => {
					const routes = getRoutes()

					/* Delete stale entries then re-prerender */
					const deleteKeys = routes.map((r) => `static:${r.pathname}`)
					if (store.deleteByKeys && deleteKeys.length > 0) {
						store.deleteByKeys(deleteKeys).catch(() => {})
					}
					prerenderRoutes(routes, ssrEnv.runner).catch(() => {})
				}, 200)
			})

			vite.httpServer?.on?.("close", () => {
				clearTimeout(debounceTimer)
				routeWatcher.close()
			})

			return undefined
		},
		name: "flare:dev-prerender",
	}
}
