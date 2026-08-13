/**
 * Path Types - Compile-time validation for Flare route paths
 *
 * Patterns:
 * - Root layout: `_name_` (e.g., "_root_", "_docs_")
 * - Layout group: `(name)` (e.g., "(auth)", "(dashboard)")
 * - Static: `/segment` (e.g., "/blog", "/products")
 * - Dynamic param: `[param]` (e.g., "[id]", "[slug]")
 * - Catch-all: `[...slug]` (requires at least 1 segment)
 * - Optional catch-all: `[[...slug]]` (can be empty)
 *
 * @example
 * ExtractParams<"_root_/products/[id]">      // { id: string }
 * ExtractParams<"_root_/docs/[...slug]">     // { slug: string[] }
 * ExtractParams<"_root_/[[...path]]">        // { path?: string[] }
 */

/* ============================================================================
 * Root Layout Path Types
 * ============================================================================ */

/**
 * Root layout path must match `_${string}_` pattern
 * Used for root layouts that render `<html>`
 *
 * @example
 * "_root_"   // Main app root
 * "_docs_"   // Docs section root
 * "_admin_"  // Admin section root
 */
export type RootLayoutPath = `_${string}_`

/**
 * Validate root layout path - rejects empty names like "__"
 *
 * @example
 * ValidateRootPath<"_root_">  // "_root_" (valid)
 * ValidateRootPath<"__">      // never (empty name)
 * ValidateRootPath<"root">    // never (no underscores)
 */
export type ValidateRootPath<T extends string> = T extends `_${infer Name}_`
	? Name extends ""
		? never
		: T
	: never

/**
 * Check if path is a root layout path at type level
 */
export type IsRootLayoutPath<T extends string> = T extends `_${string}_` ? true : false

/**
 * Extract root name from path
 *
 * @example
 * ExtractRootName<"_docs_">  // "docs"
 * ExtractRootName<"_root_">  // "root"
 */
export type ExtractRootName<T extends RootLayoutPath> = T extends `_${infer Name}_` ? Name : never

/* ============================================================================
 * Virtual Path Types (Root + URL path)
 * ============================================================================ */

/**
 * Virtual path - must start with root layout segment
 * Used for layouts and pages
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
 * Returns never if root pattern `_name_` found mid-path
 *
 * @example
 * ValidateNoMidPathRoot<"_root_/products">      // valid
 * ValidateNoMidPathRoot<"_root_/_admin_/users"> // never (root mid-path)
 */
export type ValidateNoMidPathRoot<T extends string> = T extends `${RootLayoutPath}/${infer Rest}`
	? Rest extends `${string}_${string}_${string}`
		? never
		: T
	: T

/* ============================================================================
 * Layout Group Validation
 * ============================================================================ */

/**
 * Check if path contains at least one valid non-empty group
 * Recursively checks all segments
 */
type HasNonEmptyGroup<T extends string> = T extends `(${infer Inner})${infer Rest}`
	? Inner extends ""
		? HasNonEmptyGroup<Rest>
		: true
	: T extends `${string}/(${infer Inner})${infer Rest}`
		? Inner extends ""
			? HasNonEmptyGroup<Rest>
			: true
		: false

/**
 * Validate that layout path contains a group segment (name)
 * Layouts must have at least one non-empty group for proper nesting
 *
 * @example
 * ValidateLayoutHasGroup<"_root_/(auth)/login">  // valid
 * ValidateLayoutHasGroup<"_root_/login">         // never (no group)
 * ValidateLayoutHasGroup<"_root_/()/login">      // never (empty group)
 */
export type ValidateLayoutHasGroup<T extends string> = T extends `${RootLayoutPath}/${infer Rest}`
	? HasNonEmptyGroup<Rest> extends true
		? T
		: never
	: never

/* ============================================================================
 * Path Extraction Types
 * ============================================================================ */

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
 * ExtractUrlPath<"_root_/blog/[slug]">   // "/blog/[slug]"
 * ExtractUrlPath<"_docs_/(sidebar)/api"> // "/api"
 * ExtractUrlPath<"_root_">               // "/"
 */
export type ExtractUrlPath<T extends VirtualPath> = T extends RootLayoutPath
	? "/"
	: T extends `${RootLayoutPath}/${infer Rest}`
		? `/${Rest}`
		: never

/* ============================================================================
 * Parameter Extraction Types
 * ============================================================================ */

/**
 * Extract optional catch-all param: [[...name]] -> { name?: string[] }
 */
type ExtractOptionalCatchAllParam<T extends string> = T extends `[[...${infer P}]]`
	? { [K in P]?: string[] }
	: never

/**
 * Extract required catch-all param: [...name] -> { name: string[] }
 */
type ExtractCatchAllParam<T extends string> = T extends `[...${infer P}]`
	? { [K in P]: string[] }
	: never

/**
 * Extract single dynamic param: [name] -> { name: string }
 */
type ExtractSingleParam<T extends string> = T extends `[${infer P}]` ? { [K in P]: string } : never

/**
 * Extract params from a single path segment
 * Priority: [[...]] > [...] > []
 */
type ExtractSegmentParams<T extends string> = T extends `[[...${string}]]`
	? ExtractOptionalCatchAllParam<T>
	: T extends `[...${string}]`
		? ExtractCatchAllParam<T>
		: T extends `[${string}]`
			? ExtractSingleParam<T>
			: Record<string, never>

/**
 * Recursively extract params from path segments
 */
type ExtractParamsRecursive<T extends string> = T extends `${infer Segment}/${infer Rest}`
	? ExtractSegmentParams<Segment> & ExtractParamsRecursive<Rest>
	: ExtractSegmentParams<T>

/**
 * Strip root and virtual segments (groups) from path for param extraction
 *
 * @example
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

/**
 * Extract all params from a path
 *
 * @example
 * ExtractParams<"_root_/products/[id]">           // { id: string }
 * ExtractParams<"_root_/docs/[...slug]">          // { slug: string[] }
 * ExtractParams<"_root_/[[...path]]">             // { path?: string[] }
 * ExtractParams<"_root_/users/[id]/posts/[postId]"> // { id: string; postId: string }
 * ExtractParams<"_root_/(auth)/users/[id]">       // { id: string }
 */
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
 * Runtime Utilities
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
	/* Name must not be empty and must not start/end with underscore */
	return name.length > 0 && !name.startsWith("_") && !name.endsWith("_")
}

/**
 * Extract root name from path at runtime
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
 * Extract root segment from virtual path at runtime
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
 * Strip group segments from path
 *
 * @example
 * stripGroups("/(auth)/login")            // "/login"
 * stripGroups("/(admin)/(dashboard)/users") // "/users"
 * stripGroups("/dashboard")                 // "/dashboard"
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

/**
 * Check if path contains a non-empty group at runtime
 */
export function hasGroup(path: string): boolean {
	const match = path.match(/\(([^)]+)\)/)
	return match !== null && match[1] !== undefined && match[1].length > 0
}

/* ============================================================================
 * Path Validation
 * ============================================================================ */

export interface PathValidationError {
	column?: number
	line?: number
	message: string
	path: string
}

/**
 * Validate root layout path at runtime
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
			message: `Invalid root layout name "${name}". Must start with letter, alphanumeric + hyphen only`,
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

/**
 * Validate any path format
 */
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

	/* Detect alternative syntaxes */
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
					message: `Invalid group name "${groupName}". Must start with letter`,
					path,
				}
			}
			continue
		}

		/* Optional catch-all [[...name]] */
		if (segment.startsWith("[[") && segment.endsWith("]]")) {
			const inner = segment.slice(2, -2)
			if (!inner.startsWith("...")) {
				return { message: 'Optional catch-all must use "[[...paramName]]"', path }
			}
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
			continue
		}

		/* Dynamic param or catch-all */
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
			/* Static segment - alphanumeric, hyphen, underscore */
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

/**
 * Assert path is valid, throw if not
 */
export function assertValidPath(path: string, file?: string, line?: number): void {
	const error = validatePath(path)
	if (error) {
		const location = file ? ` in ${file}${line ? `:${line}` : ""}` : ""
		throw new Error(`Invalid path "${path}"${location}: ${error.message}`)
	}
}

/**
 * Extract param names from path at runtime
 *
 * @example
 * extractParamNames("/users/[id]/posts/[postId]")  // ["id", "postId"]
 * extractParamNames("/docs/[...slug]")             // ["slug"]
 * extractParamNames("/[[...path]]")                // ["path"]
 */
export function extractParamNames(path: string): string[] {
	const params: string[] = []
	const regex = /\[\[?(?:\.\.\.)?([^\]]+)\]?\]/g
	let match: RegExpExecArray | null = null
	while ((match = regex.exec(path)) !== null) {
		if (match[1]) params.push(match[1])
	}
	return params
}
