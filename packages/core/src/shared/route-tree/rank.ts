import { defined } from "../errors/defined.ts"
import { matchParams, partKey, patternSegments, staticKey, type MatchOptions, type RawParams } from "./match.ts"
import type { Segment } from "./segments.ts"

// Per segment, left to right: static, dynamic, optional, catch-all, optional catch-all.
function weight(segment: Segment): number {
	if (segment.kind === "static") return 0
	if (segment.kind === "dynamic") return segment.optional ? 2 : 1
	return segment.optional ? 4 : 3
}

type Candidate = { pattern: string; consumed: number[] }

export function pickRoute(patterns: readonly string[], path: string, options: MatchOptions = {}): string | undefined {
	const matched = patterns.flatMap((pattern): Candidate[] => {
		const params = matchParams(pattern, path, options)
		return params === undefined ? [] : [{ pattern, consumed: consumedWeights(pattern, params) }]
	})
	// `sort` on this fresh array: `toSorted` is Firefox 115, above the client's browser floor (decision B123).
	return matched.sort(compare)[0]?.pattern
}

// The weight of the segment that consumed each path segment, left to right (dx/routes.md rank). An optional param that
// matched nothing consumed nothing, so it does not count. A catch-all counts once per segment it took.
function consumedWeights(pattern: string, params: RawParams): number[] {
	return patternSegments(pattern).flatMap((segment) => {
		if (segment.kind === "static") return [0]
		const value = params[segment.name]
		const taken = value === undefined ? 0 : Array.isArray(value) ? value.length : 1
		return Array.from({ length: taken }, () => weight(segment))
	})
}

// The more specific consumer of the leftmost segment where two candidates differ wins. A tie falls back to the
// patterns: when one is a prefix of the other, the shorter one is more specific.
function compare(left: Candidate, right: Candidate): number {
	return lexical(left.consumed, right.consumed) || lexical(weights(left.pattern), weights(right.pattern))
}

function weights(pattern: string): number[] {
	return patternSegments(pattern).map(weight)
}

function lexical(a: readonly number[], b: readonly number[]): number {
	for (let index = 0; index < Math.min(a.length, b.length); index += 1) {
		const left = defined(a[index], "the left weight")
		const right = defined(b[index], "the right weight")
		if (left !== right) return left - right
	}
	return a.length - b.length
}

// pickRoute over fixed patterns, indexed once by their first segment: a path is compared only with the patterns whose
// first segment is its own first segment, as the matcher compares them, and with those that open with a param. The
// pick is pickRoute's; a router of many routes no longer walks every one per lookup (plan 21 15.4).
export function createPicker(
	patterns: readonly string[],
	options: MatchOptions = {},
): (path: string) => string | undefined {
	const sensitive = options.caseSensitive === true
	const byFirst = new Map<string, string[]>()
	const open: string[] = []
	for (const pattern of patterns) {
		const first = patternSegments(pattern)[0]
		if (first !== undefined && first.kind !== "static") open.push(pattern)
		else {
			const key = first === undefined ? "" : staticKey(first.text, sensitive)
			byFirst.set(key, [...(byFirst.get(key) ?? []), pattern])
		}
	}
	return (path) => {
		const part = path.split("/").find((segment) => segment !== "")
		const key = part === undefined ? "" : partKey(part, sensitive)
		return pickRoute([...(byFirst.get(key) ?? []), ...open], path, options)
	}
}
