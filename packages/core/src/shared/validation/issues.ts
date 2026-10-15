export type Issue = { message: string; path: readonly string[] }

export function shapeIssues(issues: readonly Issue[]): {
	issues: readonly Issue[]
	fieldErrors: Record<string, string[]>
} {
	const fieldErrors: Record<string, string[]> = {}
	for (const issue of issues) {
		const head = issue.path[0]
		if (head === undefined) continue
		const list = fieldErrors[head] ?? []
		list.push(issue.message)
		fieldErrors[head] = list
	}
	return { issues, fieldErrors }
}
