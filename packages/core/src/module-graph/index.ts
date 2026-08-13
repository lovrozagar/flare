/**
 * Vite manifest walker for module preloading.
 *
 * Walks the Vite client build manifest to collect the full transitive
 * dependency graph (JS + CSS) for a given entry point or set of route
 * modules. Used to emit `<link rel="modulepreload">` tags in SSR HTML,
 * eliminating the sequential module discovery waterfall.
 */

export interface ModulePreloads {
	css: string[]
	js: string[]
}

export interface ViteManifestEntry {
	css?: string[]
	dynamicImports?: string[]
	file: string
	imports?: string[]
	isDynamicEntry?: boolean
	isEntry?: boolean
	name?: string
	src?: string
}

export type ViteManifest = Record<string, ViteManifestEntry>

/**
 * Walk Vite manifest from an entry key, collecting all transitive
 * static imports (JS files) and CSS files.
 *
 * Only follows `imports` (static), not `dynamicImports` (lazy routes).
 * Returns deduplicated, ordered arrays of asset paths.
 */
function ensureLeadingSlash(path: string): string {
	return path.startsWith("/") ? path : `/${path}`
}

export function resolveModulePreloads(manifest: ViteManifest, entryKey: string): ModulePreloads {
	const js: string[] = []
	const css: string[] = []
	const visited = new Set<string>()
	const cssVisited = new Set<string>()

	function walk(key: string) {
		if (visited.has(key)) return
		visited.add(key)

		const entry = manifest[key]
		if (!entry) return

		js.push(ensureLeadingSlash(entry.file))

		if (entry.css) {
			for (const href of entry.css) {
				const path = ensureLeadingSlash(href)
				if (!cssVisited.has(path)) {
					cssVisited.add(path)
					css.push(path)
				}
			}
		}

		if (entry.imports) {
			for (const dep of entry.imports) {
				walk(dep)
			}
		}
	}

	walk(entryKey)

	return { css, js }
}

/**
 * Resolve route-specific chunk preloads from manifest.
 *
 * Given a set of matched route module IDs (source paths like
 * `src/routes/index.tsx`), collects all their chunks + transitive
 * static imports, excluding any chunks already covered by the entry.
 *
 * Returns only the NEW chunks the route needs beyond the entry graph.
 */
export function resolveRoutePreloads(
	manifest: ViteManifest,
	routeModuleIds: string[],
	entryPreloads?: ModulePreloads,
): ModulePreloads {
	const entryJs = new Set(entryPreloads?.js)
	const entryCss = new Set(entryPreloads?.css)

	const js: string[] = []
	const css: string[] = []
	const visited = new Set<string>()
	const cssVisited = new Set(entryCss)

	function walk(key: string) {
		if (visited.has(key)) return
		visited.add(key)

		const entry = manifest[key]
		if (!entry) return

		const file = ensureLeadingSlash(entry.file)
		if (!entryJs.has(file)) {
			js.push(file)
		}

		if (entry.css) {
			for (const href of entry.css) {
				const cssFile = ensureLeadingSlash(href)
				if (!cssVisited.has(cssFile)) {
					cssVisited.add(cssFile)
					css.push(cssFile)
				}
			}
		}

		if (entry.imports) {
			for (const dep of entry.imports) {
				walk(dep)
			}
		}
	}

	for (const moduleId of routeModuleIds) {
		walk(moduleId)
	}

	return { css, js }
}

/**
 * Find the entry key in a Vite manifest (the chunk with isEntry: true).
 */
export function findEntryKey(manifest: ViteManifest): string | undefined {
	for (const [key, entry] of Object.entries(manifest)) {
		if (entry.isEntry) return key
	}
	return undefined
}

/**
 * Merge two ModulePreloads, deduplicating.
 */
export function mergePreloads(a: ModulePreloads, b: ModulePreloads): ModulePreloads {
	const jsSet = new Set(a.js)
	const cssSet = new Set(a.css)

	const js = [...a.js]
	const css = [...a.css]

	for (const href of b.js) {
		if (!jsSet.has(href)) {
			js.push(href)
			jsSet.add(href)
		}
	}

	for (const href of b.css) {
		if (!cssSet.has(href)) {
			css.push(href)
			cssSet.add(href)
		}
	}

	return { css, js }
}
