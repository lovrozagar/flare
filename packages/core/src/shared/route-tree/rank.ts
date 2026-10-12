import { matchParams, patternSegments, type MatchOptions } from "./match.ts";
import type { Segment } from "./segments.ts";

// Per segment, left to right: static, dynamic, optional, catch-all, optional catch-all.
function weight(segment: Segment): number {
	if (segment.kind === "static") return 0;
	if (segment.kind === "dynamic") return segment.optional ? 2 : 1;
	return segment.optional ? 4 : 3;
}

export function pickRoute(patterns: readonly string[], path: string, options: MatchOptions = {}): string | undefined {
	const matched = patterns.filter((pattern) => matchParams(pattern, path, options) !== undefined);
	return matched.toSorted(compare)[0];
}

// When one pattern is a prefix of the other, the shorter one is more specific.
function compare(left: string, right: string): number {
	const a = patternSegments(left).map(weight);
	const b = patternSegments(right).map(weight);
	for (let index = 0; index < Math.min(a.length, b.length); index += 1) {
		if (a[index] !== b[index]) return a[index] - b[index];
	}
	return a.length - b.length;
}
