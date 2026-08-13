/**
 * Route Types Generator
 *
 * Generates typed createPage/createLayout wrappers with app-specific Env/Auth types.
 * Extracts loader data and context types from route definitions for auto-inference.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs"
import { dirname, join, relative } from "node:path"
import { type FlareBuildConfig, resolveBuildConfig } from "../../config"
import {
	extractRootFromPath,
	findParentLayouts as findParentLayoutPaths,
	isRootLayoutPath,
	toUrlPath,
	validatePath,
} from "../../router/path-types"

export interface RouteTypesConfig extends FlareBuildConfig {
	/** Whether app has QueryClient configured @default auto-detected from server entry */
	hasQueryClient?: boolean
}

export interface GenerateRouteTypesOptions {
	config?: RouteTypesConfig
	root: string
	silent?: boolean
}

/**
 * Detect if queryClientGetter is configured in server entry
 */
function detectQueryClientGetter(serverEntryPath: string): boolean {
	if (!existsSync(serverEntryPath)) return false

	const content = readFileSync(serverEntryPath, "utf-8")
	const withoutSingleLineComments = content.replace(/\/\/.*$/gm, "")
	const withoutComments = withoutSingleLineComments.replace(/\/\*[\s\S]*?\*\//g, "")

	return /queryClientGetter\s*:\s*(?:\w+|[\w.]+|\([^)]*\)\s*=>)/.test(withoutComments)
}

/**
 * Detect if authenticateFn is exported from server entry
 */
function detectAuthenticateFn(serverEntryPath: string): boolean {
	if (!existsSync(serverEntryPath)) return false

	const content = readFileSync(serverEntryPath, "utf-8")
	const withoutSingleLineComments = content.replace(/\/\/.*$/gm, "")
	const withoutComments = withoutSingleLineComments.replace(/\/\*[\s\S]*?\*\//g, "")

	return /export\s+(?:const|function|async\s+function)\s+authenticateFn/.test(withoutComments)
}

type AuthenticateMode = true | "optional" | false | undefined

interface ExtractedRoute {
	authenticateMode: AuthenticateMode
	exportName: string
	filePath: string
	isRoot: boolean
	target: "layout" | "page"
	virtualPath: string
}

const CREATE_PAGE_REGEX =
	/export\s+const\s+(\w+)\s*=\s*createPage\s*(?:<[^>]*>)?\s*\(\s*\{\s*virtualPath\s*:\s*["'`]([^"'`]+)["'`]/g
const CREATE_LAYOUT_REGEX =
	/export\s+const\s+(\w+)\s*=\s*createLayout\s*(?:<[^>]*>)?\s*\(\s*\{\s*virtualPath\s*:\s*["'`]([^"'`]+)["'`]/g
const CREATE_ROOT_LAYOUT_REGEX =
	/export\s+const\s+(\w+)\s*=\s*createRootLayout\s*(?:<[^>]*>)?\s*\(\s*\{\s*virtualPath\s*:\s*["'`]([^"'`]+)["'`]/g

/**
 * Extract authenticate mode from route file content.
 * Looks for .options({ authenticate: true|false|"optional" }) pattern.
 */
function extractAuthenticateMode(content: string, exportName: string): AuthenticateMode {
	/* Match .options({ authenticate: value }) after the export */
	const exportPattern = new RegExp(
		`export\\s+const\\s+${exportName}[\\s\\S]*?\\.options\\s*\\(\\s*\\{[^}]*authenticate\\s*:\\s*(true|false|"optional"|'optional')`,
	)
	const match = exportPattern.exec(content)
	if (!match || !match[1]) return undefined

	const value = match[1]
	if (value === "true") return true
	if (value === "false") return false
	if (value === '"optional"' || value === "'optional'") return "optional"
	return undefined
}

function scanForRoutes(dir: string, basePath: string, ignorePrefix: string): ExtractedRoute[] {
	const routes: ExtractedRoute[] = []

	if (!existsSync(dir)) return routes

	const entries = readdirSync(dir)

	for (const entry of entries) {
		const fullPath = join(dir, entry)
		const stat = statSync(fullPath)

		if (stat.isDirectory()) {
			if (entry.startsWith(ignorePrefix)) continue
			routes.push(...scanForRoutes(fullPath, join(basePath, entry), ignorePrefix))
		} else if (entry.endsWith(".tsx") || entry.endsWith(".ts")) {
			const content = readFileSync(fullPath, "utf-8")
			const relativePath = join(basePath, entry)

			CREATE_PAGE_REGEX.lastIndex = 0
			for (
				let match = CREATE_PAGE_REGEX.exec(content);
				match !== null;
				match = CREATE_PAGE_REGEX.exec(content)
			) {
				const exportName = match[1]
				const virtualPath = match[2]
				if (!exportName || !virtualPath) continue
				const error = validatePath(virtualPath)
				if (error) {
					console.warn(
						`[flare] Invalid virtualPath "${virtualPath}" in ${relativePath}: ${error.message}`,
					)
					continue
				}
				routes.push({
					authenticateMode: extractAuthenticateMode(content, exportName),
					exportName,
					filePath: relativePath,
					isRoot: false,
					target: "page",
					virtualPath,
				})
			}

			CREATE_LAYOUT_REGEX.lastIndex = 0
			for (
				let match = CREATE_LAYOUT_REGEX.exec(content);
				match !== null;
				match = CREATE_LAYOUT_REGEX.exec(content)
			) {
				const exportName = match[1]
				const virtualPath = match[2]
				if (!exportName || !virtualPath) continue
				const error = validatePath(virtualPath)
				if (error) {
					console.warn(
						`[flare] Invalid virtualPath "${virtualPath}" in ${relativePath}: ${error.message}`,
					)
					continue
				}
				routes.push({
					authenticateMode: extractAuthenticateMode(content, exportName),
					exportName,
					filePath: relativePath,
					isRoot: false,
					target: "layout",
					virtualPath,
				})
			}

			CREATE_ROOT_LAYOUT_REGEX.lastIndex = 0
			for (
				let match = CREATE_ROOT_LAYOUT_REGEX.exec(content);
				match !== null;
				match = CREATE_ROOT_LAYOUT_REGEX.exec(content)
			) {
				const exportName = match[1]
				const virtualPath = match[2]
				if (!exportName || !virtualPath) continue

				/* Validate root layout virtualPath pattern */
				if (!isRootLayoutPath(virtualPath)) {
					console.warn(
						`[flare] Invalid root layout virtualPath "${virtualPath}" in ${relativePath}: must match "__name__" pattern`,
					)
					continue
				}

				routes.push({
					authenticateMode: extractAuthenticateMode(content, exportName),
					exportName,
					filePath: relativePath,
					isRoot: true,
					target: "layout",
					virtualPath,
				})
			}
		}
	}

	return routes
}

/**
 * Validate auth options for redundancy/conflicts with parent layouts.
 * Emits warnings when a route has auth options that conflict with inherited auth.
 */
function validateAuthInheritance(routes: ExtractedRoute[], layouts: ExtractedRoute[]): void {
	const layoutMap = new Map<string, ExtractedRoute>()
	for (const layout of layouts) {
		layoutMap.set(layout.virtualPath, layout)
	}

	for (const route of routes) {
		if (route.authenticateMode === undefined) continue

		const parentLayouts = findParentLayouts(route.virtualPath, layouts)
		const parentWithAuth = parentLayouts.find((l) => l.authenticateMode === true)

		if (parentWithAuth) {
			/* Parent requires auth - check for conflicts */
			if (route.authenticateMode === false) {
				console.warn(
					`[flare] Auth conflict: "${route.exportName}" in ${route.filePath} has authenticate: false, ` +
						`but parent layout "${parentWithAuth.exportName}" already requires authentication. ` +
						"The false option has no effect - auth is inherited from parent.",
				)
			} else if (route.authenticateMode === "optional") {
				console.warn(
					`[flare] Auth conflict: "${route.exportName}" in ${route.filePath} has authenticate: "optional", ` +
						`but parent layout "${parentWithAuth.exportName}" already requires authentication. ` +
						`Auth will always be present due to parent - "optional" has no effect.`,
				)
			} else if (route.authenticateMode === true && route.target !== "layout") {
				/* Only warn for pages, layouts might intentionally re-declare for documentation */
				console.warn(
					`[flare] Auth redundant: "${route.exportName}" in ${route.filePath} has authenticate: true, ` +
						`but parent layout "${parentWithAuth.exportName}" already requires authentication. ` +
						"This option is redundant and can be removed.",
				)
			}
		}
	}
}

/**
 * Find all parent layouts for a given path
 * Returns layouts sorted from root to nearest parent
 */
function findParentLayouts(path: string, layouts: ExtractedRoute[]): ExtractedRoute[] {
	const layoutPaths = layouts.map((l) => l.virtualPath)
	const parentPaths = findParentLayoutPaths(path, layoutPaths)

	/* Map back to extracted routes, preserving order */
	return parentPaths
		.map((p) => layouts.find((l) => l.virtualPath === p))
		.filter((l): l is ExtractedRoute => l !== undefined && l.virtualPath !== path)
}

interface RouteConflict {
	message: string
	routes: Array<{ exportName: string; filePath: string; virtualPath: string }>
	urlPath: string
}

/**
 * Validate that different root layouts don't resolve to the same URL path
 */
function validateNoUrlPathConflicts(routes: ExtractedRoute[]): RouteConflict[] {
	const conflicts: RouteConflict[] = []

	/* Group routes by their resolved URL path */
	const urlPathMap = new Map<string, ExtractedRoute[]>()

	for (const route of routes) {
		if (route.target !== "page") continue /* Only check pages for URL conflicts */

		const urlPath = toUrlPath(route.virtualPath)
		const existing = urlPathMap.get(urlPath) ?? []
		existing.push(route)
		urlPathMap.set(urlPath, existing)
	}

	/* Check for conflicts (same URL from different roots) */
	for (const [urlPath, matchingRoutes] of urlPathMap) {
		if (matchingRoutes.length <= 1) continue

		/* Get unique roots */
		const roots = new Set(matchingRoutes.map((r) => extractRootFromPath(r.virtualPath)))
		if (roots.size > 1) {
			conflicts.push({
				message: `Multiple root layouts define pages for URL "${urlPath}"`,
				routes: matchingRoutes.map((r) => ({
					exportName: r.exportName,
					filePath: r.filePath,
					virtualPath: r.virtualPath,
				})),
				urlPath,
			})
		}
	}

	return conflicts
}

interface VirtualPathConflict {
	message: string
	routes: Array<{ exportName: string; filePath: string; target: "layout" | "page" }>
	virtualPath: string
}

/**
 * Validate that no two routes share the same virtualPath.
 * Each virtualPath must be unique across all layouts and pages.
 */
function validateNoVirtualPathConflicts(routes: ExtractedRoute[]): VirtualPathConflict[] {
	const conflicts: VirtualPathConflict[] = []
	const virtualPathMap = new Map<string, ExtractedRoute[]>()

	for (const route of routes) {
		const existing = virtualPathMap.get(route.virtualPath) ?? []
		existing.push(route)
		virtualPathMap.set(route.virtualPath, existing)
	}

	for (const [virtualPath, matchingRoutes] of virtualPathMap) {
		if (matchingRoutes.length <= 1) continue

		conflicts.push({
			message: `Multiple routes define virtualPath "${virtualPath}"`,
			routes: matchingRoutes.map((r) => ({
				exportName: r.exportName,
				filePath: r.filePath,
				target: r.target,
			})),
			virtualPath,
		})
	}

	return conflicts
}

interface ExtractedParam {
	isCatchAll: boolean
	isOptional: boolean
	name: string
}

/**
 * Extract dynamic param names from a path pattern
 * e.g., "/products/[id]/[slug]" → [{ name: "id", isCatchAll: false }, { name: "slug", isCatchAll: false }]
 * e.g., "/docs/[...rest]" → [{ name: "rest", isCatchAll: true }]
 * e.g., "/files/[[...virtualPath]]" → [{ name: "path", isCatchAll: true, isOptional: true }]
 */
function extractParamsFromPath(path: string): ExtractedParam[] {
	const params: ExtractedParam[] = []
	/* Match [[...name]] (optional catch-all), [...name] (catch-all), or [name] (single) */
	const regex = /\[\[\.\.\.([^\]]+)\]\]|\[\.\.\.([^\]]+)\]|\[([^\]]+)\]/g
	for (const match of path.matchAll(regex)) {
		if (match[1]) {
			/* Optional catch-all [[...name]] */
			params.push({ isCatchAll: true, isOptional: true, name: match[1] })
		} else if (match[2]) {
			/* Required catch-all [...name] */
			params.push({ isCatchAll: true, isOptional: false, name: match[2] })
		} else if (match[3]) {
			/* Single param [name] */
			params.push({ isCatchAll: false, isOptional: false, name: match[3] })
		}
	}
	return params
}

/**
 * Generate flare.gen.d.ts module augmentation file
 *
 * This file augments @flare/v0 with app-specific types:
 * - Route register (preloaderContext, loaderData, auth)
 * - QueryClient registry (if configured)
 */
function generateDeclarationFile(
	routes: ExtractedRoute[],
	outputPath: string,
	pagesDir: string,
	serverEntryPath: string,
	hasAuthenticateFn: boolean,
	hasQueryClient: boolean,
): string {
	const outputDir = dirname(outputPath)

	function relativize(importPath: string): string {
		const rel = relative(outputDir, importPath)
		const normalized = rel.replace(/\.tsx?$/, "")
		return normalized.startsWith(".") ? normalized : `./${normalized}`
	}

	const serverPath = relativize(serverEntryPath)
	const layouts = routes.filter((r) => r.target === "layout")
	const pages = routes.filter((r) => r.target === "page")

	/* Validate auth inheritance and emit warnings for conflicts/redundancies */
	validateAuthInheritance(routes, layouts)

	/* Build route import path map */
	const routeImportPaths = new Map<ExtractedRoute, string>()
	for (const route of routes) {
		routeImportPaths.set(route, relativize(join(pagesDir, route.filePath)))
	}

	/* Helper to get typeof import() expression */
	const typeofImport = (route: ExtractedRoute): string => {
		const importPath = routeImportPaths.get(route)
		return `typeof import("${importPath}").${route.exportName}`
	}

	/* Build all unique paths */
	const allRoutePaths = [
		...new Set([...layouts.map((l) => l.virtualPath), ...pages.map((p) => p.virtualPath)]),
	]

	/* Build path → layout map */
	const pathLayouts = new Map<string, ExtractedRoute>()
	for (const layout of layouts) {
		pathLayouts.set(layout.virtualPath, layout)
	}

	/* Build route map for quick lookup */
	const routeMap = new Map<string, ExtractedRoute>()
	for (const route of routes) {
		routeMap.set(route.virtualPath, route)
	}

	/**
	 * Generate parentPreloaderContext entries - ONLY parent layouts' preloader data.
	 * Used by builders (createPage, createLayout) to avoid circular dependency.
	 * Does NOT include self - self would cause: Page → ResolvedParentPreloaderContext → Page
	 */
	const parentContextEntries: string[] = []
	for (const routePath of allRoutePaths.sort()) {
		const parentLayouts = findParentLayouts(routePath, layouts)

		if (parentLayouts.length === 0) {
			parentContextEntries.push(`\t\t"${routePath}": Record<string, never>`)
		} else {
			const contextTypes = parentLayouts.map((l) => `ExtractPreloaderData<${typeofImport(l)}>`)
			parentContextEntries.push(`\t\t"${routePath}": ${contextTypes.join(" & ")}`)
		}
	}

	/**
	 * Generate preloaderContext entries - FULL accumulated preloader data (parents + self).
	 * Used by hooks (usePreloaderContext) - safe because hooks read at runtime, not definition.
	 * This is what usePreloaderContext returns.
	 */
	const contextEntries: string[] = []
	for (const routePath of allRoutePaths.sort()) {
		const parentLayouts = findParentLayouts(routePath, layouts)
		const selfRoute = routeMap.get(routePath)

		/* Accumulate: parent layouts + self */
		const contextTypes = parentLayouts.map((l) => `ExtractPreloaderData<${typeofImport(l)}>`)

		/* Include self's preloader (both layouts and pages) */
		if (selfRoute) {
			contextTypes.push(`ExtractPreloaderData<${typeofImport(selfRoute)}>`)
		}

		if (contextTypes.length === 0) {
			contextEntries.push(`\t\t"${routePath}": Record<string, never>`)
		} else {
			contextEntries.push(`\t\t"${routePath}": ${contextTypes.join(" & ")}`)
		}
	}

	/**
	 * Generate authContext entries (PARENT layouts only, not self)
	 *
	 * Auth propagates DOWN the tree:
	 * - If parent layout has authenticate: true → children inherit Auth
	 * - If route has authenticate: "optional" → Auth | null
	 * - If no auth in chain → null
	 *
	 * Including self would cause circular dependency:
	 * - AboutPage needs ResolvedAuth<"_root_/about">
	 * - ResolvedAuth needs FlareRegister.authContext["_root_/about"]
	 * - That would reference AboutPage → cycle!
	 *
	 * Self's authenticate option is handled by the builder pattern when
	 * .options({ authenticate }) is called.
	 */
	const authContextEntries: string[] = []

	for (const routePath of allRoutePaths.sort()) {
		const parentLayouts = findParentLayouts(routePath, layouts)

		/* Only parent layouts, not self - avoids circular dependency */
		if (parentLayouts.length === 0) {
			authContextEntries.push(`\t\t"${routePath}": null`)
		} else {
			const authModes = parentLayouts.map((r) => `ExtractAuthMode<${typeofImport(r)}>`)
			authContextEntries.push(`\t\t"${routePath}": ResolveAuthChain<[${authModes.join(", ")}]>`)
		}
	}

	/**
	 * Generate loaderData entries - each virtualPath maps to ONE route's loader data.
	 * Each route (layout or page) has a unique virtualPath.
	 */
	const loaderDataEntries: string[] = []
	for (const route of routes) {
		loaderDataEntries.push(`\t\t"${route.virtualPath}": ExtractLoaderData<${typeofImport(route)}>`)
	}

	/* Generate routeInfo entries (URL path → type info for Link/buildUrl) */
	const routeInfoEntries: string[] = []
	for (const page of pages) {
		const urlPath = toUrlPath(page.virtualPath)
		const params = extractParamsFromPath(urlPath)

		const paramsType =
			params.length > 0
				? `{ ${params
						.map((p) => {
							const type = p.isCatchAll ? "string[]" : "string"
							const optional = p.isOptional ? "?" : ""
							return `${p.name}${optional}: ${type}`
						})
						.join("; ")} }`
				: "{}"

		routeInfoEntries.push(
			`\t\t"${urlPath}": { params: ${paramsType} & ExtractParams<${typeofImport(page)}>; searchParams: ExtractSearchParams<${typeofImport(page)}>; virtualPath: "${page.virtualPath}" }`,
		)
	}

	const queryClientAugmentation = hasQueryClient
		? `
declare module "@flare/v0/query-client/registry" {
	interface FlareQueryClientRegistry {
		queryClient: import("@tanstack/query-core").QueryClient
	}
}
`
		: ""

	/* Auth type: derived from authenticateFn return type if exported, otherwise null */
	const authType = hasAuthenticateFn
		? `Awaited<ReturnType<typeof import("${serverPath}").authenticateFn>>`
		: "null"

	return `/// <reference types="@flare/v0/globals" />
/**
 * Flare Module Augmentation
 * Auto-generated - DO NOT EDIT
 *
 * This file augments @flare/v0 with your app's types.
 */

import type { ExtractAuthMode, ExtractLoaderData, ExtractParams, ExtractPreloaderData, ExtractSearchParams, ResolveAuthChain } from "@flare/v0/router/register"

declare module "@flare/v0/router/register" {
	interface FlareRegister {
		auth: ${authType}

		authContext: {
${authContextEntries.join("\n")}
		}

		parentPreloaderContext: {
${parentContextEntries.join("\n")}
		}

		preloaderContext: {
${contextEntries.join("\n")}
		}

		loaderData: {
${loaderDataEntries.join("\n")}
		}

		routeInfo: {
${routeInfoEntries.join("\n")}
		}
	}
}
${queryClientAugmentation}
export {}
`
}

export function generateRouteTypes(options: GenerateRouteTypesOptions): {
	files: string[]
	routes: number
} {
	const { root, silent = false } = options

	if (!options.config) {
		throw new Error(
			"[flare] generateRouteTypes requires config. Pass the flare.build.ts config:\n" +
				"  import config from './flare.build.ts'\n" +
				"  generateRouteTypes({ root: process.cwd(), config })",
		)
	}

	const cfg = resolveBuildConfig(options.config)

	const serverEntryPath = join(root, cfg.serverEntryFilePath)
	const pagesDir = join(root, "src")
	const ignorePrefix = cfg.ignorePrefix

	const log = silent ? () => {} : console.log.bind(console)

	log("Flare Route Types Generator")
	log("-".repeat(40))
	log(`Scanning: ${pagesDir}`)

	const routes = scanForRoutes(pagesDir, "", ignorePrefix)
	log(`Found ${routes.length} route declarations`)

	if (!silent && routes.length > 0) {
		log("\nRoutes:")
		for (const route of routes) {
			const rootIndicator = route.isRoot ? " [ROOT]" : ""
			log(`  ${route.exportName} → ${route.virtualPath} [${route.target}]${rootIndicator}`)
		}
	}

	/* Warn on duplicate virtualPaths - first found wins */
	const virtualPathConflicts = validateNoVirtualPathConflicts(routes)
	if (virtualPathConflicts.length > 0) {
		console.warn("\n⚠️  Duplicate virtualPath detected:")
		for (const conflict of virtualPathConflicts) {
			console.warn(`\n  virtualPath "${conflict.virtualPath}" is defined by multiple routes:`)
			for (const route of conflict.routes) {
				console.warn(`    - ${route.exportName} [${route.target}] in ${route.filePath}`)
			}
		}
		console.warn("\n  This is a bug - each virtualPath must be unique.")
		console.warn("  First found route will be used. Fix this before deploying.\n")
	}

	/* Filter duplicates - keep first occurrence of each virtualPath */
	const seenVirtualPaths = new Set<string>()
	const deduplicatedRoutes = routes.filter((route) => {
		if (seenVirtualPaths.has(route.virtualPath)) return false
		seenVirtualPaths.add(route.virtualPath)
		return true
	})

	/* Validate no URL path conflicts between different roots */
	const urlConflicts = validateNoUrlPathConflicts(deduplicatedRoutes)
	if (urlConflicts.length > 0) {
		log("\n⚠️  Route conflicts detected:")
		for (const conflict of urlConflicts) {
			log(`\n  URL "${conflict.urlPath}" is defined by multiple roots:`)
			for (const route of conflict.routes) {
				log(`    - ${route.exportName} (path: "${route.virtualPath}") in ${route.filePath}`)
			}
		}
		throw new Error(
			`Route generation failed: ${urlConflicts.length} URL path conflict(s) detected. ` +
				"Different root layouts cannot define pages for the same URL path.",
		)
	}

	/* Detect authorizeFn and QueryClient from server entry */
	const hasAuthenticateFn = detectAuthenticateFn(serverEntryPath)
	const hasQueryClient = options.config?.hasQueryClient ?? detectQueryClientGetter(serverEntryPath)

	/* Generate flare-types.d.ts (module augmentation) */
	const typesPath = join(root, cfg.generated.typesFilePath)
	mkdirSync(dirname(typesPath), { recursive: true })

	const typesContent = generateDeclarationFile(
		deduplicatedRoutes,
		typesPath,
		pagesDir,
		serverEntryPath,
		hasAuthenticateFn,
		hasQueryClient,
	)
	writeFileSync(typesPath, typesContent)

	log(
		`\nGenerated: ${typesPath}${hasAuthenticateFn ? " (Authentication: enabled)" : ""}${hasQueryClient ? " (QueryClient: enabled)" : ""}`,
	)
	log(`${"─".repeat(40)}`)

	return { files: [typesPath], routes: deduplicatedRoutes.length }
}
