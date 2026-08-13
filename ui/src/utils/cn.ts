/** Accepted input shapes for `cn()`. Superset of JSX `ClassValue` — adds object maps. */
export type CnValue = string | false | null | undefined | Record<string, boolean> | CnValue[]

/** Merge class names, filter falsy, deduplicate per-token. Matches clsx semantics. */
export function cn(...inputs: CnValue[]): string {
	const seen = new Set<string>()
	const out: string[] = []
	for (const input of inputs) collectClasses(input, seen, out)
	return out.join(" ")
}

function collectClasses(input: CnValue, seen: Set<string>, out: string[]): void {
	if (!input) return
	if (typeof input === "string") {
		for (const token of input.trim().split(/\s+/)) {
			if (token && !seen.has(token)) {
				seen.add(token)
				out.push(token)
			}
		}
		return
	}
	if (Array.isArray(input)) {
		for (const item of input) collectClasses(item, seen, out)
		return
	}
	if (typeof input === "object") {
		for (const [key, active] of Object.entries(input)) {
			if (active && !seen.has(key)) {
				seen.add(key)
				out.push(key)
			}
		}
	}
}
