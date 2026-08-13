/**
 * Path Types - Type utilities for extracting params from route paths
 *
 * @example
 * ExtractParams<"/products/[id]">             // { id: string }
 * ExtractParams<"/docs/[...slug]">            // { slug: string[] }
 * ExtractParams<"/users/[id]/posts/[postId]"> // { id: string; postId: string }
 * ExtractParams<"/[[locale]]/compare">        // { locale?: string }
 * ExtractParams<"/docs/[[...slug]]">          // { slug?: string[] }
 */

/* ============================================================================
 * Root Layout Path Types
 * ============================================================================ */

/**
 * Root layout path must match `_${string}_` pattern
 *
 * @example
 * "_root_"   // Main app root
 * "_docs_"   // Docs section root
 * "_admin_"  // Admin section root
 */
export type RootLayoutPath = `_${string}_`

/**
 * Validate root layout path at compile time
 * Rejects empty names like "__"
 */
export type ValidateRootPath<T extends string> = T extends `_${infer Name}_`
	? Name extends ""
		? never
		: T
	: never

/**
 * Extract root name from path
 *
 * @example
 * ExtractRootName<"_docs_">  // "docs"
 * ExtractRootName<"_root_">  // "root"
 */
export type ExtractRootName<T extends RootLayoutPath> = T extends `_${infer Name}_` ? Name : never

/**
 * Check if path is a root layout path
 */
export type IsRootLayoutPath<T extends string> = T extends `_${string}_` ? true : false

/**
 * Virtual path - must start with root layout segment
 *
 * @example
 * "_root_"                        // Root only
 * "_root_/blog"                   // Root + path
 * "_root_/blog/[slug]"            // Root + dynamic path
 * "_docs_/(sidebar)/api"          // Root + virtual layout + path
 */
export type VirtualPath = RootLayoutPath | `${RootLayoutPath}/${string}`

/**
 * Validate that root layout pattern only appears at start of path
 * Returns never if root pattern found mid-path
 */
export type ValidateNoMidPathRoot<T extends string> = T extends `${RootLayoutPath}/${infer Rest}`
	? Rest extends `${string}_${string}_${string}`
		? never
		: T
	: T

/* ============================================================================
 * Layout Path Validation Types
 * ============================================================================ */

/**
 * Check if path ends with a layout segment (layoutName)
 * Layouts MUST end with (layoutName) pattern
 */
type EndsWithLayoutSegment<T extends string> = T extends `${string}/(${infer Name})`
	? Name extends ""
		? false
		: true
	: false

/**
 * Validate that layout path ends with (layoutName)
 * createLayout paths MUST end with a layout segment
 *
 * @example
 * "_root_/(auth)" ✓
 * "_root_/(layout-tests)" ✓
 * "_root_/(layout-tests)/products/(detail)" ✓
 * "_root_/products" ✗ (ends with URL segment)
 * "_root_/products/[id]" ✗ (ends with param)
 */
export type ValidateLayoutPath<T extends string> = T extends `${RootLayoutPath}/${infer _Rest}`
	? EndsWithLayoutSegment<T> extends true
		? T
		: never
	: never

/**
 * Check if path ends with a page segment (URL segment or param)
 * Pages MUST end with: segment, [param], [...param], or [[...param]]
 */
type EndsWithPageSegment<T extends string> = T extends `${string}/(${string})`
	? false
	: T extends `${string}/[[...${string}]]`
		? true
		: T extends `${string}/[...${string}]`
			? true
			: T extends `${string}/[${string}]`
				? true
				: T extends `${string}/${infer Last}`
					? Last extends `(${string})`
						? false
						: Last extends ""
							? false
							: true
					: false

/**
 * Validate that page path ends with URL segment or param
 * createPage paths MUST end with a non-layout segment
 *
 * @example
 * "_root_/products" ✓
 * "_root_/products/[id]" ✓
 * "_root_/(auth)/login" ✓
 * "_root_/docs/[...slug]" ✓
 * "_root_/(auth)" ✗ (ends with layout segment)
 */
export type ValidatePagePath<T extends string> = T extends RootLayoutPath
	? T
	: T extends `${infer _Root extends RootLayoutPath}/`
		? T /* Index page: _root_/ */
		: T extends `${RootLayoutPath}/${infer _Rest}`
			? EndsWithPageSegment<T> extends true
				? T
				: never
			: never

/**
 * Extract root segment from virtual path
 *
 * @example
 * ExtractRootFromPath<"_root_/blog/[slug]">  // "_root_"
 * ExtractRootFromPath<"_docs_/(sidebar)/api"> // "_docs_"
 */
export type ExtractRootFromPath<T extends VirtualPath> = T extends `${infer Root}/${string}`
	? Root extends RootLayoutPath
		? Root
		: never
	: T extends RootLayoutPath
		? T
		: never

/**
 * Extract URL path from virtual path (strips root and virtual segments)
 *
 * @example
 * "_root_/blog/[slug]"           -> "/blog/[slug]"
 * "_docs_/(sidebar)/api"         -> "/api"
 * "_root_"                       -> "/"
 */
export type ExtractUrlPath<T extends VirtualPath> = T extends RootLayoutPath
	? "/"
	: T extends `${RootLayoutPath}/${infer Rest}`
		? `/${Rest}`
		: never

/**
 * Extract optional catch-all param: [[...slug]] → { slug?: string[] }
 */
type ExtractOptionalCatchAllParam<T extends string> = T extends `[[...${infer P}]]`
	? { [K in P]?: string[] }
	: never

/**
 * Extract optional single param: [[locale]] → { locale?: string }
 */
type ExtractOptionalSingleParam<T extends string> = T extends `[[${infer P}]]`
	? P extends `...${string}`
		? never
		: { [K in P]?: string }
	: never

/**
 * Extract required catch-all param: [...slug] → { slug: string[] }
 */
type ExtractCatchAllParam<T extends string> = T extends `[...${infer P}]`
	? { [K in P]: string[] }
	: never

/**
 * Extract required single param: [id] → { id: string }
 */
type ExtractSingleParam<T extends string> = T extends `[${infer P}]` ? { [K in P]: string } : never

/**
 * Extract params from a single path segment.
 * Order matters: check optional catch-all first, then optional single, then required variants.
 *
 * @example
 * ExtractSegmentParams<"[[...slug]]">  // { slug?: string[] }
 * ExtractSegmentParams<"[[locale]]">   // { locale?: string }
 * ExtractSegmentParams<"[...slug]">    // { slug: string[] }
 * ExtractSegmentParams<"[id]">         // { id: string }
 * ExtractSegmentParams<"products">     // Record<string, never>
 */
type ExtractSegmentParams<T extends string> = T extends `[[...${string}]]`
	? ExtractOptionalCatchAllParam<T>
	: T extends `[[${string}]]`
		? ExtractOptionalSingleParam<T>
		: T extends `[...${string}]`
			? ExtractCatchAllParam<T>
			: T extends `[${string}]`
				? ExtractSingleParam<T>
				: Record<string, never>

type ExtractParamsRecursive<T extends string> = T extends `${infer Segment}/${infer Rest}`
	? ExtractSegmentParams<Segment> & ExtractParamsRecursive<Rest>
	: ExtractSegmentParams<T>

/**
 * Strip root and virtual segments from path for param extraction
 * "_root_/blog/[slug]" -> "/blog/[slug]"
 * "_root_/(auth)/login" -> "/login"
 */
type StripVirtualSegments<T extends string> = T extends `${RootLayoutPath}/${infer Rest}`
	? Rest extends `(${string})/${infer After}`
		? StripVirtualSegments<`/${After}`>
		: `/${Rest}`
	: T extends `(${string})/${infer After}`
		? StripVirtualSegments<`/${After}`>
		: T

export type ExtractParams<T extends string> = T extends RootLayoutPath
	? Record<string, never>
	: T extends `${RootLayoutPath}/${string}`
		? ExtractParamsRecursive<StripVirtualSegments<T>> extends infer R
			? { [K in keyof R]: R[K] }
			: never
		: ExtractParamsRecursive<T> extends infer R
			? { [K in keyof R]: R[K] }
			: never

/* ============================================================================
 * Root Layout Path Runtime Utilities
 * ============================================================================ */

/**
 * Check if path is a root layout path at runtime
 *
 * @example
 * isRootLayoutPath("_root_")     // true
 * isRootLayoutPath("_docs_")     // true
 * isRootLayoutPath("/blog")      // false
 * isRootLayoutPath("__")         // false (empty name)
 */
export function isRootLayoutPath(path: string): path is RootLayoutPath {
	if (!path.startsWith("_") || !path.endsWith("_")) return false
	if (path.length < 3) return false /* At least "_x_" */
	const name = path.slice(1, -1)
	/* Name must not be empty and must not contain underscore (to avoid "__" being valid) */
	return name.length > 0 && !name.startsWith("_") && !name.endsWith("_")
}

/**
 * Extract root name from path
 *
 * @example
 * extractRootName("_docs_")  // "docs"
 * extractRootName("_root_")  // "root"
 * extractRootName("/blog")   // null
 */
export function extractRootName(path: string): string | null {
	if (!isRootLayoutPath(path)) return null
	return path.slice(1, -1)
}

/**
 * Extract root segment from virtual path
 *
 * @example
 * extractRootFromPath("_root_/blog/[slug]")   // "_root_"
 * extractRootFromPath("_docs_/(sidebar)/api") // "_docs_"
 * extractRootFromPath("_root_")               // "_root_"
 */
export function extractRootFromPath(virtualPath: string): string | null {
	const firstSlash = virtualPath.indexOf("/")
	const rootSegment = firstSlash === -1 ? virtualPath : virtualPath.slice(0, firstSlash)
	return isRootLayoutPath(rootSegment) ? rootSegment : null
}

/**
 * Convert virtual path to URL path (strips root and virtual segments)
 *
 * @example
 * toUrlPath("_root_/blog/[slug]")           // "/blog/[slug]"
 * toUrlPath("_docs_/(sidebar)/api")         // "/api"
 * toUrlPath("_root_/(auth)/login")          // "/login"
 * toUrlPath("_root_")                       // "/"
 */
export function toUrlPath(virtualPath: string): string {
	/* Remove root segment */
	const rootSegment = extractRootFromPath(virtualPath)
	if (!rootSegment) return virtualPath

	let path = virtualPath.slice(rootSegment.length)

	/* Remove virtual segments (parentheses) */
	path = path.replace(/\/\([^)]+\)/g, "")

	/* Ensure starts with / */
	if (!path.startsWith("/")) path = `/${path}`

	/* Handle empty path */
	if (path === "/") return "/"

	/* Remove trailing slash */
	if (path.endsWith("/")) path = path.slice(0, -1)

	return path || "/"
}

/**
 * Convert URL path + root to virtual path
 *
 * @example
 * toVirtualPath("/blog/[slug]", "_root_")   // "_root_/blog/[slug]"
 * toVirtualPath("/api", "_docs_")           // "_docs_/api"
 * toVirtualPath("/", "_root_")              // "_root_"
 */
export function toVirtualPath(urlPath: string, root: RootLayoutPath): string {
	if (urlPath === "/" || urlPath === "") return root
	const cleanPath = urlPath.startsWith("/") ? urlPath.slice(1) : urlPath
	return `${root}/${cleanPath}`
}

/**
 * Strip group segments from path
 * "/(auth)/login" -> "/login"
 * "/(admin)/(dashboard)/users" -> "/users"
 * "/dashboard" -> "/dashboard"
 */
export function stripGroups(path: string): string {
	if (isRootLayoutPath(path)) return path
	const stripped = path.replace(/\/\([^)]+\)/g, "")
	return stripped === "" ? "/" : stripped
}

/**
 * Check if path segment is a group (e.g., "(auth)")
 */
export function isGroupSegment(segment: string): boolean {
	return segment.startsWith("(") && segment.endsWith(")")
}

export interface PathValidationError {
	column?: number
	line?: number
	message: string
	path: string
}

/**
 * Validate root layout path
 */
export function validateRootLayoutPath(path: string): PathValidationError | null {
	if (!path.startsWith("_") || !path.endsWith("_")) {
		return { message: `Root layout path must match "_name_" pattern`, path }
	}

	if (path.length < 3) {
		return { message: `Root layout name cannot be empty. Use "_root_" or "_name_"`, path }
	}

	const name = path.slice(1, -1)
	if (name.length === 0 || name.startsWith("_") || name.endsWith("_")) {
		return {
			message: "Root layout name cannot be empty or have leading/trailing underscores",
			path,
		}
	}

	if (!/^[a-zA-Z][a-zA-Z0-9-]*$/.test(name)) {
		return {
			message: `Invalid root layout name "${name}". Use alphanumeric starting with letter`,
			path,
		}
	}

	return null
}

/**
 * Validate virtual path (for layouts and pages)
 */
export function validateVirtualPath(path: string): PathValidationError | null {
	const rootSegment = extractRootFromPath(path)
	if (!rootSegment) {
		return {
			message: `Virtual path must start with root segment like "_root_/". Got "${path}"`,
			path,
		}
	}

	const rootError = validateRootLayoutPath(rootSegment)
	if (rootError) return rootError

	/* Validate rest of path */
	const rest = path.slice(rootSegment.length)
	if (rest === "") return null /* Just root is valid */

	return validatePath(rest)
}

export function validatePath(path: string): PathValidationError | null {
	/* Handle root layout paths */
	if (isRootLayoutPath(path)) {
		return validateRootLayoutPath(path)
	}

	/* Handle virtual paths starting with root segment */
	if (path.startsWith("_") && path.includes("_/")) {
		return validateVirtualPath(path)
	}

	if (!path.startsWith("/")) {
		return { message: `Path must start with "/". Use "/${path}"`, path }
	}

	if (path !== "/" && path.endsWith("/")) {
		return { message: `Path must not end with "/". Use "${path.slice(0, -1)}"`, path }
	}

	if (path.includes("//")) {
		return { message: "Path contains double slash", path }
	}

	const expressMatch = path.match(/:(\w+)/)
	if (expressMatch) {
		return {
			message: `Express-style ":${expressMatch[1]}" not supported. Use "[${expressMatch[1]}]"`,
			path,
		}
	}

	const curlyMatch = path.match(/\{(\w+)\}/)
	if (curlyMatch) {
		return {
			message: `Curly brace "{${curlyMatch[1]}}" not supported. Use "[${curlyMatch[1]}]"`,
			path,
		}
	}

	const angleMatch = path.match(/<(\w+)>/)
	if (angleMatch) {
		return {
			message: `Angle bracket "<${angleMatch[1]}>" not supported. Use "[${angleMatch[1]}]"`,
			path,
		}
	}

	const segments = path.split("/").filter(Boolean)
	let foundCatchAll = false

	for (const segment of segments) {
		if (foundCatchAll) {
			return { message: "Catch-all must be the last segment", path }
		}

		if (segment.includes(" ")) {
			return { message: `Path segment contains space: "${segment}"`, path }
		}

		/* Group segments like (auth) - valid for layout grouping */
		if (segment.startsWith("(") && segment.endsWith(")")) {
			const groupName = segment.slice(1, -1)
			if (groupName === "") {
				return { message: 'Empty group name. Use "(groupName)"', path }
			}
			if (!/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(groupName)) {
				return {
					message: `Invalid group name "${groupName}". Use alphanumeric starting with letter`,
					path,
				}
			}
			continue
		}

		/* Optional params [[...name]] or [[name]] */
		if (segment.startsWith("[[") && segment.endsWith("]]")) {
			const inner = segment.slice(2, -2)

			if (inner === "") {
				return {
					message: 'Empty optional param name. Use "[[paramName]]" or "[[...paramName]]"',
					path,
				}
			}

			if (inner.startsWith("...")) {
				/* Optional catch-all [[...name]] */
				const name = inner.slice(3)
				if (name === "") {
					return { message: 'Empty optional catch-all name. Use "[[...paramName]]"', path }
				}
				if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(name)) {
					return {
						message: `Invalid optional catch-all name "${name}". Use camelCase starting with letter`,
						path,
					}
				}
				foundCatchAll = true
			} else if (inner.startsWith("..")) {
				return {
					message: `Invalid optional param. Use "[[...${inner.slice(2)}]]" (three dots)`,
					path,
				}
			} else {
				/* Optional single param [[name]] */
				if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(inner)) {
					if (/^\d/.test(inner)) {
						return {
							message: `Param name cannot start with number. Use "[[${inner.replace(/^\d+/, "")}]]" or rename`,
							path,
						}
					}
					if (inner.includes("-")) {
						const camelCase = inner.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase())
						return {
							message: `Param name contains invalid character "-". Use camelCase "[[${camelCase}]]"`,
							path,
						}
					}
					return {
						message: `Invalid optional param name "${inner}". Use camelCase starting with letter`,
						path,
					}
				}
			}
			continue
		}

		if (segment.startsWith("[")) {
			if (!segment.endsWith("]")) {
				return { message: 'Unclosed bracket "[". Add closing "]"', path }
			}

			const inner = segment.slice(1, -1)

			if (inner === "") {
				return { message: 'Empty param name. Use "[paramName]"', path }
			}

			if (inner.startsWith("...")) {
				foundCatchAll = true
				const name = inner.slice(3)

				if (name === "") {
					return { message: 'Empty catch-all name. Use "[...paramName]"', path }
				}

				if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(name)) {
					return {
						message: `Invalid catch-all name "${name}". Use camelCase starting with letter`,
						path,
					}
				}
			} else if (inner.startsWith("..")) {
				return { message: `Invalid catch-all. Use "[...${inner.slice(2)}]" (three dots)`, path }
			} else {
				if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(inner)) {
					if (/^\d/.test(inner)) {
						return {
							message: `Param name cannot start with number. Use "[${inner.replace(/^\d+/, "")}]" or rename`,
							path,
						}
					}
					if (inner.includes("-")) {
						const camelCase = inner.replace(/-([a-z])/g, (_, c) => c.toUpperCase())
						return {
							message: `Param name contains invalid character "-". Use camelCase "[${camelCase}]"`,
							path,
						}
					}
					return {
						message: `Invalid param name "${inner}". Use camelCase starting with letter`,
						path,
					}
				}
			}
		} else if (segment.includes("]")) {
			return { message: 'Unexpected "]" without opening "["', path }
		} else if (segment.includes("[")) {
			return {
				message: `Invalid segment "${segment}". Param must be entire segment: "[paramName]"`,
				path,
			}
		} else if (segment.includes(")")) {
			return { message: 'Unexpected ")" without opening "("', path }
		} else if (segment.includes("(")) {
			return {
				message: `Invalid segment "${segment}". Group must be entire segment: "(groupName)"`,
				path,
			}
		} else {
			if (!/^[a-zA-Z0-9_-]+$/.test(segment)) {
				return {
					message: `Invalid segment "${segment}". Use alphanumeric, underscore, or hyphen`,
					path,
				}
			}
		}
	}

	return null
}

export function assertValidPath(path: string, file?: string, line?: number): void {
	const error = validatePath(path)
	if (error) {
		const location = file ? ` in ${file}${line ? `:${line}` : ""}` : ""
		throw new Error(`Invalid path "${path}"${location}: ${error.message}`)
	}
}

export type RouteTarget = "layout" | "page" | "root-layout"

/**
 * Convert path to regex for matching
 * For virtual paths, converts to URL path first
 *
 * @example
 * pathToRegex("/products/[id]")        // matches /products/123
 * pathToRegex("/[[locale]]/compare")   // matches /compare AND /en/compare
 * pathToRegex("/docs/[...slug]")       // matches /docs/a/b/c
 */
export function pathToRegex(path: string): RegExp {
	/* Root layout paths match empty string */
	if (isRootLayoutPath(path)) return /^$/

	/* Virtual paths - convert to URL path first */
	let urlPath = path
	if (path.startsWith("_") && path.includes("_/")) {
		urlPath = toUrlPath(path)
	}

	/*
	 * Replace params BEFORE escaping to preserve [...] patterns.
	 * Order matters: optional catch-all first, then optional single, then required variants.
	 *
	 * For optional single [[param]], we need to make the entire /segment optional.
	 * We mark the preceding / as part of the optional group.
	 */
	const pattern = urlPath
		/* Optional catch-all: [[...slug]] → matches empty or /a/b/c */
		.replace(/\/\[\[\.\.\.([^\]]+)\]\]/g, "__SLASH_OPTIONAL_CATCHALL__")
		.replace(/\[\[\.\.\.([^\]]+)\]\]/g, "__OPTIONAL_CATCHALL__")
		/* Optional single: [[locale]] → matches empty or /en */
		.replace(/\/\[\[([^\]]+)\]\]/g, "__SLASH_OPTIONAL_SINGLE__")
		.replace(/\[\[([^\]]+)\]\]/g, "__OPTIONAL_SINGLE__")
		/* Required catch-all: [...slug] → matches /a/b/c (at least one) */
		.replace(/\[\.\.\.([^\]]+)\]/g, "__REQUIRED_CATCHALL__")
		/* Required single: [id] → matches /123 */
		.replace(/\[([^\]]+)\]/g, "__PARAM__")
		/* Escape special regex chars */
		.replace(/[.+?^${}()|\\]/g, "\\$&")
		/* Replace placeholders with actual patterns */
		.replace(/__SLASH_OPTIONAL_CATCHALL__/g, "(?:/(.*))?")
		.replace(/__OPTIONAL_CATCHALL__/g, "(.*)")
		/* Use [^/]* (zero or more) so /[[locale]] matches both / and /en */
		.replace(/__SLASH_OPTIONAL_SINGLE__/g, "(?:/([^/]*))?")
		.replace(/__OPTIONAL_SINGLE__/g, "([^/]*)?")
		.replace(/__REQUIRED_CATCHALL__/g, "(.+)")
		.replace(/__PARAM__/g, "([^/]+)")

	return new RegExp(`^${pattern}$`)
}

/**
 * Extract param names from a path pattern.
 * Handles all param types: [param], [...param], [[param]], [[...param]]
 *
 * @example
 * extractParamNames("/products/[id]")           // ["id"]
 * extractParamNames("/[[locale]]/compare")      // ["locale"]
 * extractParamNames("/docs/[...slug]")          // ["slug"]
 * extractParamNames("/[[locale]]/products/[id]") // ["locale", "id"]
 */
export function extractParamNames(path: string): string[] {
	const params: string[] = []
	/* Match [[...name]], [[name]], [...name], or [name] */
	const regex = /\[\[(?:\.\.\.)?([^\]]+)\]\]|\[(?:\.\.\.)?([^\]]+)\]/g
	let match: RegExpExecArray | null = null
	while ((match = regex.exec(path)) !== null) {
		const name = match[1] ?? match[2]
		if (name) params.push(name)
	}

	return params
}

/**
 * Check if prefix is a parent of path in the virtual path hierarchy
 */
export function isPathPrefix(prefix: string, path: string): boolean {
	/* Root layout is prefix of all paths with same root */
	if (isRootLayoutPath(prefix)) {
		return path === prefix || path.startsWith(`${prefix}/`)
	}
	if (prefix === "/") return true
	if (prefix === path) return false
	return path.startsWith(`${prefix}/`) || path === prefix
}

/**
 * Find parent layouts for a page path
 * Returns layouts in order from root to most specific
 */
export function findParentLayouts(pagePath: string, layoutPaths: string[]): string[] {
	return layoutPaths
		.filter((layoutPath) => isPathPrefix(layoutPath, pagePath))
		.sort((a, b) => {
			/* Root layouts come first */
			const aIsRoot = isRootLayoutPath(a)
			const bIsRoot = isRootLayoutPath(b)
			if (aIsRoot && !bIsRoot) return -1
			if (!aIsRoot && bIsRoot) return 1
			/* Then sort by path length (shorter = more general) */
			return a.length - b.length
		})
}
