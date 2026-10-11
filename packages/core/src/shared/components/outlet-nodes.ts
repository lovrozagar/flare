export function chooseNodes(
	matched: ReadonlySet<string>,
	page: string,
	layouts: readonly string[],
): { page?: string; layouts: string[] } {
	return {
		page: matched.has(page) ? page : undefined,
		layouts: layouts.filter((id) => matched.has(id)),
	};
}
