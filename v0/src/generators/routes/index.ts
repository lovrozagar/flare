/**
 * Flare Route Generator
 *
 * Scans source files for createPage/createLayout factory calls and generates route manifests.
 * Routes are defined by explicit path declarations in code, not file structure.
 *
 * Example:
 *   export const HomePage = createPage({ path: "/" })
 *   export const ProductPage = createPage({ path: "/products/[id]" })
 *   export const RootLayout = createLayout({ path: "/" })
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs"
import { dirname, join, relative } from "node:path"
import { type FlareBuildConfig, resolveBuildConfig } from "../../config"
import { isRootLayoutPath, toUrlPath, validatePath } from "../../router/path-types"
import { extractLayoutKey } from "../../router/tree-types"

/* ============================================================================
 * Types
 * ============================================================================ */

type BoundaryType = "error" | "forbidden" | "notFound" | "streaming" | "unauthorized"
type BoundaryTarget = "layout" | "page" | "route"

interface RouteInfo {
	exportName: string
	filePath: string
	options: Record<string, unknown>
	virtualPath: string
}

interface LayoutInfo {
	/** Named export variable (e.g., "RootLayout") */
	exportName: string
	filePath: string
	/** Layout key for matching (e.g., "/", "/account") */
	layoutKey: string
}

interface BoundaryInfo {
	/** Boundary type */
	boundaryType: BoundaryType
	/** Named export variable */
	exportName: string
	filePath: string
	/** Route path this boundary applies to */
	path: string
	/** Target: layout or page */
	target: BoundaryTarget
}

export interface GenerateRoutesOptions {
	/** Build-time config from flare.config.ts */
	buildConfig?: FlareBuildConfig
	/** Flare configuration */
	config?: FlareBuildConfig
	/** Project root directory */
	root: string
	/** Silent mode - no console output */
	silent?: boolean
}

export interface GenerateRoutesResult {
	routes: number
	layouts: number
	files: string[]
}

/* ============================================================================
 * Regex Patterns for Factory Function Extraction
 * ============================================================================ */

/* Match: export const SomeName = createPage({ virtualPath: "/..." }) */
const CREATE_PAGE_EXPORT_REGEX =
	/export\s+const\s+(\w+)\s*=\s*createPage\s*(?:<[^>]*>)?\s*\(\s*\{\s*virtualPath\s*:\s*["'`]([^"'`]+)["'`]/g

/* Match: export const SomeName = createLayout({ virtualPath: "/..." }) */
const CREATE_LAYOUT_EXPORT_REGEX =
	/export\s+const\s+(\w+)\s*=\s*createLayout\s*(?:<[^>]*>)?\s*\(\s*\{\s*virtualPath\s*:\s*["'`]([^"'`]+)["'`]/g

/* Match: export const SomeName = createRootLayout({ virtualPath: "_root_" }) */
const CREATE_ROOT_LAYOUT_EXPORT_REGEX =
	/export\s+const\s+(\w+)\s*=\s*createRootLayout\s*(?:<[^>]*>)?\s*\(\s*\{\s*virtualPath\s*:\s*["'`]([^"'`]+)["'`]/g

/**
 * Match: export default createPage or export default createLayout (to warn)
 */
const DEFAULT_EXPORT_REGEX =
	/export\s+default\s+(createPage|createLayout|createRootLayout|create\w+Boundary)/

/**
 * Boundary patterns (handle multiline with [\s\S])
 * Match: export const SomeName = createErrorBoundary({ path: "/...", target: "page" }, ...)
 * Groups: [1] = export name, [2] = path, [3] = target (optional)
 */
const CREATE_ERROR_BOUNDARY_REGEX =
	/export\s+const\s+(\w+)\s*=\s*createErrorBoundary\s*\([\s\S]*?\{\s*path\s*:\s*["'`]([^"'`]+)["'`](?:[\s\S]*?target\s*:\s*["'`]([^"'`]+)["'`])?[\s\S]*?\}/g

const CREATE_STREAMING_BOUNDARY_REGEX =
	/export\s+const\s+(\w+)\s*=\s*createStreamingBoundary\s*\([\s\S]*?\{\s*path\s*:\s*["'`]([^"'`]+)["'`](?:[\s\S]*?target\s*:\s*["'`]([^"'`]+)["'`])?[\s\S]*?\}/g

const CREATE_UNAUTHORIZED_BOUNDARY_REGEX =
	/export\s+const\s+(\w+)\s*=\s*createUnauthorizedBoundary\s*\([\s\S]*?\{\s*path\s*:\s*["'`]([^"'`]+)["'`](?:[\s\S]*?target\s*:\s*["'`]([^"'`]+)["'`])?[\s\S]*?\}/g

const CREATE_NOTFOUND_BOUNDARY_REGEX =
	/export\s+const\s+(\w+)\s*=\s*createNotFoundBoundary\s*\([\s\S]*?\{\s*path\s*:\s*["'`]([^"'`]+)["'`](?:[\s\S]*?target\s*:\s*["'`]([^"'`]+)["'`])?[\s\S]*?\}/g

const CREATE_FORBIDDEN_BOUNDARY_REGEX =
	/export\s+const\s+(\w+)\s*=\s*createForbiddenBoundary\s*\([\s\S]*?\{\s*path\s*:\s*["'`]([^"'`]+)["'`](?:[\s\S]*?target\s*:\s*["'`]([^"'`]+)["'`])?[\s\S]*?\}/g

/* ============================================================================
 * File Scanning
 * ============================================================================ */

interface ScanResult {
	boundaries: BoundaryInfo[]
	layouts: LayoutInfo[]
	pages: RouteInfo[]
	warnings: string[]
}

function scanDirectory(
	dir: string,
	basePath: string,
	ignorePrefix: string,
	pagesDir: string,
): ScanResult {
	const boundaries: BoundaryInfo[] = []
	const layouts: LayoutInfo[] = []
	const pages: RouteInfo[] = []
	const warnings: string[] = []

	if (!existsSync(dir)) return { boundaries, layouts, pages, warnings }

	const entries = readdirSync(dir)

	for (const entry of entries) {
		const fullPath = join(dir, entry)
		const stat = statSync(fullPath)

		if (stat.isDirectory()) {
			/* Only skip directories with ignore prefix (e.g., _components/) */
			if (entry.startsWith(ignorePrefix)) continue
			const nested = scanDirectory(fullPath, join(basePath, entry), ignorePrefix, pagesDir)
			boundaries.push(...nested.boundaries)
			layouts.push(...nested.layouts)
			pages.push(...nested.pages)
			warnings.push(...nested.warnings)
		} else if (entry.endsWith(".tsx") || entry.endsWith(".ts")) {
			/* Scan ALL .tsx/.ts files for createPage/createLayout calls - don't skip based on name */

			const relativePath = basePath ? join(basePath, entry) : entry
			const content = readFileSync(fullPath, "utf-8")

			/* Warn about default exports */
			if (DEFAULT_EXPORT_REGEX.test(content)) {
				warnings.push(
					`${relativePath}: 'export default' is ignored. Use named export: 'export const MyComponent = create...()'`,
				)
			}

			/* Extract createPage exports */
			CREATE_PAGE_EXPORT_REGEX.lastIndex = 0
			let match: RegExpExecArray | null = null
			while ((match = CREATE_PAGE_EXPORT_REGEX.exec(content)) !== null) {
				const exportName = match[1]
				const virtualPath = match[2]
				if (!exportName || !virtualPath) continue
				const error = validatePath(virtualPath)
				if (error) {
					warnings.push(`${relativePath}: Invalid virtualPath "${virtualPath}" - ${error.message}`)
					continue
				}
				const duplicateError = validateNoDuplicateParams(virtualPath)
				if (duplicateError) {
					warnings.push(`${relativePath}: ${duplicateError}`)
					continue
				}
				const options = extractOptions(content)

				pages.push({
					exportName,
					filePath: relativePath,
					options,
					virtualPath,
				})
			}

			/* Extract createLayout exports */
			CREATE_LAYOUT_EXPORT_REGEX.lastIndex = 0
			while ((match = CREATE_LAYOUT_EXPORT_REGEX.exec(content)) !== null) {
				const exportName = match[1]
				const virtualPath = match[2]
				if (!exportName || !virtualPath) continue
				const error = validatePath(virtualPath)
				if (error) {
					warnings.push(`${relativePath}: Invalid virtualPath "${virtualPath}" - ${error.message}`)
					continue
				}
				const duplicateError = validateNoDuplicateParams(virtualPath)
				if (duplicateError) {
					warnings.push(`${relativePath}: ${duplicateError}`)
					continue
				}

				layouts.push({
					exportName,
					filePath: relativePath,
					layoutKey: extractLayoutKey(virtualPath),
				})
			}

			/* Extract createRootLayout exports */
			CREATE_ROOT_LAYOUT_EXPORT_REGEX.lastIndex = 0
			while ((match = CREATE_ROOT_LAYOUT_EXPORT_REGEX.exec(content)) !== null) {
				const exportName = match[1]
				const virtualPath = match[2]
				if (!exportName || !virtualPath) continue

				/* Root layouts use _name_ pattern, validate it */
				if (!isRootLayoutPath(virtualPath)) {
					warnings.push(
						`${relativePath}: Invalid root layout virtualPath "${virtualPath}" - must match "_name_" pattern`,
					)
					continue
				}

				layouts.push({
					exportName,
					filePath: relativePath,
					layoutKey: extractLayoutKey(virtualPath),
				})
			}

			/* Extract boundary components */
			const boundaryPatterns: Array<{ regex: RegExp; type: BoundaryType }> = [
				{ regex: CREATE_ERROR_BOUNDARY_REGEX, type: "error" },
				{ regex: CREATE_FORBIDDEN_BOUNDARY_REGEX, type: "forbidden" },
				{ regex: CREATE_NOTFOUND_BOUNDARY_REGEX, type: "notFound" },
				{ regex: CREATE_STREAMING_BOUNDARY_REGEX, type: "streaming" },
				{ regex: CREATE_UNAUTHORIZED_BOUNDARY_REGEX, type: "unauthorized" },
			]

			for (const { regex, type } of boundaryPatterns) {
				regex.lastIndex = 0
				while ((match = regex.exec(content)) !== null) {
					const exportName = match[1]
					const path = match[2]
					if (!exportName || !path) continue
					const target = (match[3] as BoundaryTarget) || "page"
					const error = validatePath(path)
					if (error) {
						warnings.push(`${relativePath}: Invalid path "${path}" - ${error.message}`)
						continue
					}

					boundaries.push({
						boundaryType: type,
						exportName,
						filePath: relativePath,
						path,
						target,
					})
				}
			}
		}
	}

	return { boundaries, layouts, pages, warnings }
}

/* ============================================================================
 * Path Helpers
 * ============================================================================ */

/**
 * Extract params from path (e.g., "/products/[id]" → ["id"])
 */
function extractParams(path: string): string[] {
	const params: string[] = []
	const segments = path.split("/").filter(Boolean)

	for (const segment of segments) {
		/* Optional catch-all [[...slug]] */
		if (segment.startsWith("[[...") && segment.endsWith("]]")) {
			params.push(segment.slice(5, -2))
		} else if (segment.startsWith("[...") && segment.endsWith("]")) {
			/* Catch-all [...slug] */
			params.push(segment.slice(4, -1))
		} else if (segment.startsWith("[") && segment.endsWith("]")) {
			/* Dynamic param [id] */
			params.push(segment.slice(1, -1))
		}
	}

	return params
}

/**
 * Validate that path has no duplicate param names
 * Returns error message if duplicates found, null otherwise
 *
 * @example
 * validateNoDuplicateParams("/[id]/users/[id]") → "Duplicate param name \"id\" in path"
 * validateNoDuplicateParams("/[userId]/posts/[postId]") → null
 */
function validateNoDuplicateParams(path: string): string | null {
	const params = extractParams(path)
	const seen = new Set<string>()

	for (const param of params) {
		if (seen.has(param)) {
			return `Duplicate param name "${param}" in path. Each param must have a unique name. If you have the same param in layout hierarchy and URL path, use different names (e.g., [layoutOrgId] and [orgId]).`
		}
		seen.add(param)
	}

	return null
}

/* Calculate route priority (more specific = higher priority) */
function calculatePriority(virtualPath: string): number {
	const segments = virtualPath.split("/").filter(Boolean)
	let priority = segments.length * 1000

	for (const segment of segments) {
		if (segment.startsWith("[...")) {
			priority -= 100 /* Catch-all is lowest priority */
		} else if (segment.startsWith("[")) {
			priority -= 10 /* Dynamic param */
		}
	}

	return priority
}

/* ============================================================================
 * Options Extraction
 * ============================================================================ */

function parseOptionsString(optStr: string): Record<string, unknown> {
	try {
		let parsed = optStr
			.replace(/(\w+):/g, '"$1":')
			.replace(/'/g, '"')
			.replace(/,(\s*})/g, "$1")
			.replace(/"(\w+)":/g, (_, key) => `"${key}":`)
		parsed = parsed.replace(/""(\w+)":/g, '"$1":')
		return JSON.parse(parsed)
	} catch {
		return {}
	}
}

function extractOptions(content: string): Record<string, unknown> {
	/* Pattern: .options({ authenticate: true, prefetch: "hover" }) */
	const pattern = content.match(/\.options\s*\(\s*(\{[^}]+\})\s*\)/)
	if (pattern?.[1]) {
		return parseOptionsString(pattern[1])
	}
	return {}
}

/* ============================================================================
 * Route Meta Pre-merging
 * ============================================================================ */

/**
 * Convert glob pattern to regex for matching
 */
function globToRegex(pattern: string): RegExp {
	const regex = pattern
		.replace(/\*\*/g, "___DOUBLE_STAR___")
		.replace(/\*/g, "[^/]+")
		.replace(/___DOUBLE_STAR___/g, ".*")
		.replace(/\[([^\]]+)\]/g, "[^/]+")
	return new RegExp(`^${regex}$`)
}

/**
 * Find matching pattern from globalOptionsPatterns for a route path
 */
function matchPatternMeta(
	pathname: string,
	patterns: Record<string, Record<string, unknown>> | undefined,
): Record<string, unknown> | null {
	if (!patterns) return null
	for (const [pattern, meta] of Object.entries(patterns)) {
		const regex = globToRegex(pattern)
		if (regex.test(pathname)) {
			return meta
		}
	}
	return null
}

/* Pre-merge route options with build config at generation time */
function preMergeRouteOptions(
	route: RouteInfo,
	buildConfig: FlareBuildConfig | undefined,
): Record<string, unknown> {
	const baseOptions = { ...route.options }
	const globalOptions = buildConfig?.globalOptions ?? {}
	const variablePath = toUrlPath(route.virtualPath)
	const patternMeta = buildConfig
		? matchPatternMeta(variablePath, buildConfig.globalOptionsPatterns)
		: null

	/* Filter out authenticate: false from baseOptions since RouteMeta only accepts true | "optional" */
	if (baseOptions.authenticate === false) {
		delete baseOptions.authenticate
	}

	return {
		...globalOptions,
		...patternMeta,
		...baseOptions,
	}
}

/* ============================================================================
 * Radix Tree Building
 * ============================================================================ */

interface TreeBuildNode {
	static: Map<string, TreeBuildNode>
	param: TreeBuildNode | null
	catchAll: TreeBuildNode | null
	optionalCatchAll: TreeBuildNode | null
	route: { routeKey: string; paramName?: string } | null
	paramName?: string
}

function createTreeBuildNode(paramName?: string): TreeBuildNode {
	return {
		catchAll: null,
		optionalCatchAll: null,
		param: null,
		paramName,
		route: null,
		static: new Map(),
	}
}

function insertRouteIntoTree(root: TreeBuildNode, urlPath: string, routeKey: string): void {
	const segments = urlPath.split("/").filter(Boolean)
	let node = root

	for (const segment of segments) {
		if (segment.startsWith("[[...") && segment.endsWith("]]")) {
			/* Optional catch-all [[...slug]] */
			const paramName = segment.slice(5, -2)
			if (!node.optionalCatchAll) {
				node.optionalCatchAll = createTreeBuildNode(paramName)
			}
			node = node.optionalCatchAll
		} else if (segment.startsWith("[...") && segment.endsWith("]")) {
			/* Catch-all [...slug] */
			const paramName = segment.slice(4, -1)
			if (!node.catchAll) {
				node.catchAll = createTreeBuildNode(paramName)
			}
			node = node.catchAll
		} else if (segment.startsWith("[") && segment.endsWith("]")) {
			/* Dynamic param [id] */
			const paramName = segment.slice(1, -1)
			if (!node.param) {
				node.param = createTreeBuildNode(paramName)
			}
			node = node.param
		} else {
			/* Static segment */
			if (!node.static.has(segment)) {
				node.static.set(segment, createTreeBuildNode())
			}
			const child = node.static.get(segment)
			if (child) node = child
		}
	}

	node.route = { routeKey }
}

/**
 * Serialize tree node with short names and omit nulls
 * s=static, p=param, c=catchAll, o=optionalCatchAll, r=route, n=paramName
 */
function serializeTreeNode(node: TreeBuildNode, indent: string): string {
	const parts: string[] = []

	/* s: static children - use E for empty */
	if (node.static.size > 0) {
		const staticEntries = Array.from(node.static.entries())
			.map(([key, child]) => `${indent}\t["${key}", ${serializeTreeNode(child, `${indent}\t`)}]`)
			.join(",\n")
		parts.push(`s: new Map([\n${staticEntries}\n${indent}])`)
	} else {
		parts.push("s: E")
	}

	/* p: param child - omit if null */
	if (node.param) {
		parts.push(`p: ${serializeTreeNode(node.param, indent)}`)
	}

	/* c: catch-all child - omit if null */
	if (node.catchAll) {
		parts.push(`c: ${serializeTreeNode(node.catchAll, indent)}`)
	}

	/* o: optional catch-all child - omit if null */
	if (node.optionalCatchAll) {
		parts.push(`o: ${serializeTreeNode(node.optionalCatchAll, indent)}`)
	}

	/* r: route data reference - omit if null */
	if (node.route) {
		parts.push(`r: ${node.route.routeKey}`)
	}

	/* n: param name for extraction - omit if not present */
	if (node.paramName) {
		parts.push(`n: "${node.paramName}"`)
	}

	return `{ ${parts.join(", ")} }`
}

function generateRoutesFile(
	routes: RouteInfo[],
	layouts: LayoutInfo[],
	boundaries: BoundaryInfo[],
	outputPath: string,
	pagesDir: string,
	buildConfig?: FlareBuildConfig,
	resolvedConfig?: { clientEntryFilePath: string },
): string {
	const outputDir = dirname(outputPath)
	const relToPages = relative(outputDir, pagesDir)
	const prefix = relToPages.startsWith(".") ? relToPages : `./${relToPages}`

	const routeOptionsMap = new Map<RouteInfo, Record<string, unknown>>()
	const uniqueOptions = new Map<string, { options: Record<string, unknown>; key: string }>()
	let optIdx = 0

	for (const route of routes) {
		const merged = preMergeRouteOptions(route, buildConfig)
		routeOptionsMap.set(route, merged)
		const sortedKey = JSON.stringify(merged, Object.keys(merged).sort())
		if (!uniqueOptions.has(sortedKey)) {
			uniqueOptions.set(sortedKey, { key: `O${optIdx++}`, options: merged })
		}
	}

	const optionsDefs = Array.from(uniqueOptions.values())
		.map(({ key, options }) => `const ${key}: RouteMeta = ${JSON.stringify(options)}`)
		.join("\n")

	const routeDataDefs: string[] = []
	const routeKeyMap = new Map<RouteInfo, string>()

	/* Generate route data with short names: e=exportName, o=options, p=page, v=variablePath, x=virtualPath */
	routes.forEach((route, idx) => {
		const routeKey = `R${idx}`
		routeKeyMap.set(route, routeKey)

		const merged = routeOptionsMap.get(route) ?? {}
		const sortedKey = JSON.stringify(merged, Object.keys(merged).sort())
		const optionsKey = uniqueOptions.get(sortedKey)?.key ?? "O0"
		const importPath = `${prefix}/${route.filePath.replace(/\.react\.tsx$/, ".react").replace(/\.tsx?$/, "")}`
		const variablePath = toUrlPath(route.virtualPath)
		const pageLoader = `() => import("${importPath}").then(m => ({ default: m.${route.exportName} }))`

		routeDataDefs.push(
			`const ${routeKey}: FlareRouteData = { e: "${route.exportName}", o: ${optionsKey}, p: ${pageLoader}, v: "${variablePath}", x: "${route.virtualPath}" }`,
		)
	})

	const treeRoot = createTreeBuildNode()
	for (const route of routes) {
		const variablePath = toUrlPath(route.virtualPath)
		const routeKey = routeKeyMap.get(route) ?? "R0"
		insertRouteIntoTree(treeRoot, variablePath, routeKey)
	}

	const layoutEntries = layouts.map((layout) => {
		const importPath = `${prefix}/${layout.filePath.replace(/\.react\.tsx$/, ".react").replace(/\.tsx?$/, "")}`
		return `	"${layout.layoutKey}": () => import("${importPath}").then(m => ({ default: m.${layout.exportName} }))`
	})

	const boundaryEntries = boundaries.map((boundary) => {
		const importPath = `${prefix}/${boundary.filePath.replace(/\.react\.tsx$/, ".react").replace(/\.tsx?$/, "")}`
		return `	{
		boundaryType: "${boundary.boundaryType}",
		component: () => import("${importPath}").then(m => ({ default: m.${boundary.exportName} })),
		exportName: "${boundary.exportName}",
		path: "${boundary.path}",
		target: "${boundary.target}",
	}`
	})

	const clientEntryPath = resolvedConfig?.clientEntryFilePath
		? `/${resolvedConfig.clientEntryFilePath}`
		: "/src/client.ts"

	/*
	 * CRITICAL: Types are inlined here instead of importing from @flare/v0/server
	 *
	 * DO NOT change this to: import type { GeneratedBoundary, LayoutModule } from "@flare/v0/server"
	 *
	 * WHY: This file (routes.gen.ts) is imported by the CLIENT entry (entry-client.tsx).
	 * Even though "import type" should be erased at runtime, Vite's dev server still
	 * resolves the module path for HMR dependency tracking. The server module imports
	 * AsyncLocalStorage from "node:async_hooks", which is a Node.js-only API.
	 *
	 * When Vite sees the client bundle trying to resolve a path that leads to node:async_hooks,
	 * it externalizes it with a warning and the browser fails with:
	 *   "Module 'node:async_hooks' has been externalized for browser compatibility"
	 *
	 * By inlining these simple interface definitions, we completely avoid any connection
	 * to the server module from client code, preventing the cascade of module resolution.
	 *
	 * This is a Vite dev mode behavior - production builds with proper tree-shaking
	 * would not have this issue, but dev mode MUST work.
	 */
	return `/**
 * Auto-generated route manifest - DO NOT EDIT
 *
 * FlareRouteData (D): e=exportName o=options p=page v=variablePath x=virtualPath
 * FlareTreeNode (N): s=static p=param c=catchAll o=optionalCatchAll r=route n=paramName
 */

import type { RouteMeta } from "@flare/v0/router/create-page"
import type { FlareRouteData, FlareTreeNode } from "@flare/v0/router/tree-types"

/*
 * INLINED TYPES - DO NOT IMPORT FROM SERVER
 *
 * These types are intentionally duplicated here instead of importing from
 * @flare/v0/server to prevent node:async_hooks from leaking into
 * the client bundle during Vite dev mode. See generator source for details.
 */
interface GeneratedBoundary {
	boundaryType: "error" | "forbidden" | "notFound" | "streaming" | "unauthorized"
	component: () => Promise<{ default: unknown }>
	exportName: string
	path: string
	target: "layout" | "page"
}

interface LayoutModule {
	default: unknown
}

const E: Map<string, FlareTreeNode> = new Map()

${optionsDefs}

${routeDataDefs.join("\n\n")}

export const clientEntryPath = "${clientEntryPath}"

export const layouts: Record<string, () => Promise<LayoutModule>> = {${layoutEntries.length ? `\n${layoutEntries.join(",\n")}\n` : ""}}

export const routeTree: FlareTreeNode = ${serializeTreeNode(treeRoot, "")}

export const boundaries: GeneratedBoundary[] = ${boundaryEntries.length ? `[\n${boundaryEntries.join(",\n")}\n]` : "[]"}
`
}

/* ============================================================================
 * Main Generator
 * ============================================================================ */

export function generateRoutes(options: GenerateRoutesOptions): GenerateRoutesResult {
	const { buildConfig, root, silent = false } = options
	const cfg = resolveBuildConfig(options.config)

	const pagesDir = join(root, "src")
	const ignorePrefix = cfg.ignorePrefix

	const log = silent ? () => {} : console.log.bind(console)
	/* Always show warnings even in silent mode */
	const warn = console.warn.bind(console)

	log("Flare Route Generator")
	log("─".repeat(40))
	log(`Scanning: ${pagesDir}`)
	log("")

	/* Scan for createPage/createLayout factory calls */
	const { boundaries, layouts, pages, warnings } = scanDirectory(
		pagesDir,
		"",
		ignorePrefix,
		pagesDir,
	)

	/* Print warnings */
	for (const warning of warnings) {
		warn(`\x1b[33m[flare] WARNING: ${warning}\x1b[0m`)
	}

	/* Expand "route" boundaries into layout + page entries */
	const expandedBoundaries: BoundaryInfo[] = []
	for (const boundary of boundaries) {
		if (boundary.target === "route") {
			expandedBoundaries.push({ ...boundary, target: "layout" })
			expandedBoundaries.push({ ...boundary, target: "page" })
		} else {
			expandedBoundaries.push(boundary)
		}
	}

	/* Detect boundary overlaps */
	const boundaryMap = new Map<string, BoundaryInfo>()
	for (const boundary of expandedBoundaries) {
		const key = `${boundary.path}:${boundary.boundaryType}:${boundary.target}`
		const existing = boundaryMap.get(key)
		if (existing) {
			warn(
				`\x1b[33m[flare] WARNING: Boundary overlap at path "${boundary.path}" for ${boundary.boundaryType} (${boundary.target})\x1b[0m`,
			)
			warn(`\x1b[33m  - ${existing.exportName} in ${existing.filePath}\x1b[0m`)
			warn(`\x1b[33m  - ${boundary.exportName} in ${boundary.filePath}\x1b[0m`)
		} else {
			boundaryMap.set(key, boundary)
		}
	}

	/* Use deduplicated boundaries (last wins, but warning was shown) */
	const finalBoundaries = Array.from(boundaryMap.values())

	log(`Found ${pages.length} pages, ${layouts.length} layouts, ${boundaries.length} boundaries\n`)

	/* Log layouts */
	if (layouts.length > 0 && !silent) {
		log("Layouts:")
		for (const layout of layouts) {
			log(`  ${layout.exportName} → ${layout.layoutKey} (${layout.filePath})`)
		}
		log("")
	}

	/* Log pages */
	if (!silent) {
		log("Pages:")
		for (const page of pages) {
			log(`  ${page.exportName} → ${page.virtualPath} (${page.filePath})`)
		}
		log("")
	}

	/* Log boundaries */
	if (finalBoundaries.length > 0 && !silent) {
		log("Boundaries:")
		for (const boundary of finalBoundaries) {
			const targetNote = boundary.target !== "page" ? ` [${boundary.target}]` : ""
			log(`  ${boundary.exportName} → ${boundary.path} (${boundary.boundaryType}${targetNote})`)
		}
	}

	/* Sort routes by priority (more specific paths first) */
	const sortedRoutes = [...pages].sort((a, b) => {
		const priorityA = calculatePriority(a.virtualPath)
		const priorityB = calculatePriority(b.virtualPath)
		if (priorityA !== priorityB) return priorityB - priorityA
		return a.virtualPath.localeCompare(b.virtualPath)
	})

	/* Write files */
	const files: string[] = []

	const routesFile = join(root, cfg.generated.routesFilePath)
	mkdirSync(dirname(routesFile), { recursive: true })
	writeFileSync(
		routesFile,
		generateRoutesFile(
			sortedRoutes,
			layouts,
			finalBoundaries,
			routesFile,
			pagesDir,
			buildConfig,
			cfg,
		),
	)
	files.push(routesFile)

	log(`\n${"─".repeat(40)}`)
	log(`Generated: ${routesFile}`)
	log(`Total routes: ${pages.length}`)

	return { files, layouts: layouts.length, routes: pages.length }
}
