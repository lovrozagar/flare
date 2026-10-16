export type Issue = { message: string; path: readonly string[] }

// `fieldErrors` keys each issue by its first path segment. The lists grow in a Map, so a key named like an
// Object.prototype member, `constructor` or `__proto__`, is an own field like any other (plan 21 8.10).
export function shapeIssues(issues: readonly Issue[]): {
	issues: readonly Issue[]
	fieldErrors: Record<string, string[]>
} {
	const fields = new Map<string, string[]>()
	for (const issue of issues) {
		const head = issue.path[0]
		if (head === undefined) continue
		const list = fields.get(head) ?? []
		list.push(issue.message)
		fields.set(head, list)
	}
	return { issues, fieldErrors: Object.fromEntries(fields) }
}
