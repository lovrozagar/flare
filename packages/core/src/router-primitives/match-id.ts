import type { ComputeMatchIdOptions, ParsedMatchId } from "./types.ts"

function sortedParams(
	params: Record<string, string | string[]>,
): Record<string, string | string[]> {
	const sorted: Record<string, string | string[]> = {}
	for (const key of Object.keys(params).sort()) {
		sorted[key] = params[key]
	}
	return sorted
}

/**
 * JSON.stringify with sorted keys at every depth.
 * Ensures objects with identical content but different insertion order
 * produce the same string (avoids matchId cache misses).
 * Uses WeakSet to detect circular references — emits null for cycles.
 */
function stableStringify(value: unknown, seen?: WeakSet<object>): string {
	if (value === null || value === undefined) return JSON.stringify(value)
	if (typeof value !== "object") return JSON.stringify(value)
	const s = seen ?? new WeakSet()
	if (s.has(value)) return "null"
	s.add(value)
	if (Array.isArray(value)) {
		let arr = "["
		for (let i = 0; i < value.length; i++) {
			if (i > 0) arr += ","
			arr += stableStringify(value[i], s)
		}
		return `${arr}]`
	}
	const obj = value as Record<string, unknown>
	const keys = Object.keys(obj).sort()
	let result = "{"
	for (let i = 0; i < keys.length; i++) {
		if (i > 0) result += ","
		result += `${JSON.stringify(keys[i])}:${stableStringify(obj[keys[i]], s)}`
	}
	return `${result}}`
}

export function computeMatchId(options: ComputeMatchIdOptions): string {
	const params = sortedParams(options.params)
	const deps = options.loaderDeps ? options.loaderDeps({ search: options.search }) : []
	return `${options.routeId}:${JSON.stringify(params)}:${stableStringify(deps)}`
}

/**
 * Find matching closing brace in a JSON-like string, respecting
 * string literals and nested braces/brackets.
 */
function findClosingBrace(str: string, openPos: number): number {
	const openChar = str[openPos]
	const closeChar = openChar === "{" ? "}" : "]"
	let depth = 0
	let inString = false
	let escape = false

	for (let i = openPos; i < str.length; i++) {
		const ch = str[i]
		if (escape) {
			escape = false
			continue
		}
		if (inString) {
			if (ch === "\\") {
				escape = true
				continue
			}
			if (ch === '"') {
				inString = false
			}
			continue
		}
		if (ch === '"') {
			inString = true
			continue
		}
		if (ch === openChar) depth++
		if (ch === closeChar) {
			depth--
			if (depth === 0) return i
		}
	}
	return -1
}

export function parseMatchId(matchId: string): ParsedMatchId | null {
	/* Format: routeId:{params}:[deps] — use brace-depth scanning to handle ":[" in values */
	const firstBrace = matchId.indexOf(":{")
	if (firstBrace === -1) return null

	const routeId = matchId.slice(0, firstBrace)
	const paramsStart = firstBrace + 1
	const paramsEnd = findClosingBrace(matchId, paramsStart)
	if (paramsEnd === -1) return null

	const paramsStr = matchId.slice(paramsStart, paramsEnd + 1)

	/* Next char must be ":" separator, followed by "[" for deps array */
	if (matchId[paramsEnd + 1] !== ":" || matchId[paramsEnd + 2] !== "[") return null
	const depsStr = matchId.slice(paramsEnd + 2)

	try {
		const rawParams: unknown = JSON.parse(paramsStr)
		const rawDeps: unknown = JSON.parse(depsStr)
		if (typeof rawParams !== "object" || rawParams === null || !Array.isArray(rawDeps)) return null
		return { deps: rawDeps, params: rawParams as Record<string, string | string[]>, routeId }
	} catch {
		return null
	}
}
