export type FontEntry = [family: string, slug: string, camelName: string, category: string]

export interface ResolvedFont {
	camelName: string
	category: string
	family: string
	slug: string
}

function toSlug(input: string): string {
	return input.toLowerCase().replace(/\s+/g, "-")
}

function stripQuotes(input: string): string {
	const trimmed = input.trim()
	if (
		(trimmed.startsWith('"') && trimmed.endsWith('"')) ||
		(trimmed.startsWith("'") && trimmed.endsWith("'"))
	) {
		return trimmed.slice(1, -1)
	}
	return trimmed
}

function entryToResolved(entry: FontEntry): ResolvedFont {
	return {
		camelName: entry[2],
		category: entry[3],
		family: entry[0],
		slug: entry[1],
	}
}

export function resolveFont(input: string, registry: FontEntry[]): ResolvedFont | null {
	const cleaned = stripQuotes(input.trim())
	const lower = cleaned.toLowerCase()
	const slug = toSlug(cleaned)

	for (const entry of registry) {
		if (entry[1] === lower || entry[1] === slug) return entryToResolved(entry)
	}

	for (const entry of registry) {
		if (entry[0].toLowerCase() === lower) return entryToResolved(entry)
	}

	return null
}

export function resolveFonts(
	names: string[],
	registry: FontEntry[],
): { resolved: ResolvedFont[]; unresolved: string[] } {
	const resolved: ResolvedFont[] = []
	const unresolved: string[] = []
	const seen = new Set<string>()

	for (const name of names) {
		const result = resolveFont(name, registry)
		if (result) {
			if (!seen.has(result.slug)) {
				seen.add(result.slug)
				resolved.push(result)
			}
		} else {
			unresolved.push(name)
		}
	}

	return { resolved, unresolved }
}

export function fuzzyMatch(query: string, registry: FontEntry[], limit = 10): ResolvedFont[] {
	const lower = query.toLowerCase().trim()
	if (lower.length === 0) return []

	const scored: Array<{ font: ResolvedFont; score: number }> = []

	for (const entry of registry) {
		const familyLower = entry[0].toLowerCase()
		const category = entry[3]
		let score = 0

		if (familyLower === lower) {
			score = 100
		} else if (familyLower.includes(lower)) {
			score = 50
		} else if (category.includes(lower)) {
			score = 10
		}

		if (score > 0) {
			scored.push({ font: entryToResolved(entry), score })
		}
	}

	scored.sort((a, b) => b.score - a.score)
	return scored.slice(0, limit).map((s) => s.font)
}
