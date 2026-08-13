/**
 * Flare buildUrl
 * Constructs URLs from path patterns with params, search, and hash.
 */

interface BuildUrlOptions {
	hash?: string
	params?: Record<string, string | string[] | undefined>
	search?: Record<string, unknown>
	to: string
}

/**
 * Resolves path params in a route pattern
 *
 * @example
 * resolvePathParams("/products/[id]", { id: "123" })
 * // → "/products/123"
 *
 * resolvePathParams("/[[locale]]/compare", { locale: "en" })
 * // → "/en/compare"
 *
 * resolvePathParams("/[[locale]]/compare", {})
 * // → "/compare"
 *
 * resolvePathParams("/docs/[...slug]", { slug: ["a", "b"] })
 * // → "/docs/a/b"
 */
function resolvePathParams(
	path: string,
	params: Record<string, string | string[] | undefined>,
): string {
	let resolved = path

	/* 1. Optional catch-all [[...param]] - remove segment if empty/missing */
	const optionalCatchAllMatch = resolved.match(/\[\[\.\.\.(\w+)\]\]/)
	if (optionalCatchAllMatch) {
		const paramName = optionalCatchAllMatch[1]
		const value = params[paramName as keyof typeof params]
		if (Array.isArray(value) && value.length > 0) {
			const encoded = value.map((s) => encodeURIComponent(s)).join("/")
			resolved = resolved.replace(`[[...${paramName}]]`, encoded)
		} else {
			resolved = resolved.replace(`/[[...${paramName}]]`, "")
			if (resolved === "") resolved = "/"
		}
	}

	/* 2. Optional single [[param]] - remove segment if empty/missing */
	/* Note: regex uses negative lookahead to NOT match [[...param]] catch-all */
	const optionalSingleMatches = [...resolved.matchAll(/\[\[(?!\.\.\.)([\w]+)\]\]/g)]
	for (const match of optionalSingleMatches) {
		const paramName = match[1]
		const value = params[paramName as keyof typeof params]
		if (typeof value === "string" && value !== "") {
			resolved = resolved.replace(`[[${paramName}]]`, encodeURIComponent(value))
		} else {
			/* Remove the /[[param]] segment entirely */
			resolved = resolved.replace(`/[[${paramName}]]`, "")
			/* Handle case where [[param]] is at the start without preceding / */
			resolved = resolved.replace(`[[${paramName}]]`, "")
			if (resolved === "") resolved = "/"
		}
	}

	/* 3. Required catch-all [...param] - must be array */
	const catchAllMatch = resolved.match(/\[\.\.\.(\w+)\]/)
	if (catchAllMatch) {
		const paramName = catchAllMatch[1]
		const value = params[paramName as keyof typeof params]
		if (!Array.isArray(value)) {
			throw new Error(`Missing required catch-all param: ${paramName}`)
		}
		const encoded = value.map((s) => encodeURIComponent(s)).join("/")
		resolved = resolved.replace(`[...${paramName}]`, encoded)
	}

	/* 4. Required single [param] - must be string */
	const paramMatches = resolved.matchAll(/\[(\w+)\]/g)
	for (const match of paramMatches) {
		const paramName = match[1]
		const value = params[paramName as keyof typeof params]
		if (value === undefined) {
			throw new Error(`Missing required param: ${paramName}`)
		}
		if (typeof value !== "string") {
			throw new Error(`Param ${paramName} must be string, got array`)
		}
		resolved = resolved.replace(`[${paramName}]`, encodeURIComponent(value))
	}

	return resolved
}

/**
 * Serializes search params to query string
 * { page: 1, sort: "name" } → "page=1&sort=name"
 */
function serializeSearchParams(search: Record<string, unknown>): string {
	const pairs: string[] = []
	const keys = Object.keys(search).sort()

	for (const key of keys) {
		const value = search[key]
		if (value === undefined || value === null) continue

		if (Array.isArray(value)) {
			for (const item of value) {
				pairs.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(item))}`)
			}
		} else {
			pairs.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
		}
	}

	return pairs.join("&")
}

/**
 * Builds a URL from path pattern, params, search, and hash
 */
function buildUrl(options: BuildUrlOptions): string {
	const { hash, params = {}, search = {}, to } = options

	let url = resolvePathParams(to, params)

	const queryString = serializeSearchParams(search)
	if (queryString) {
		url += `?${queryString}`
	}

	if (hash) {
		const normalizedHash = hash.startsWith("#") ? hash.slice(1) : hash
		url += `#${normalizedHash}`
	}

	return url
}

export type { BuildUrlOptions }

export { buildUrl, resolvePathParams, serializeSearchParams }
