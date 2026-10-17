// Validators defined away from the pages that use them: imported by name, through a namespace, through the app's
// `@/` path alias, or by default, or made by a factory. Each page's params and search are read from its own route
// type, so where its `.input()` object comes from does not matter (BUGS.md 349).
type Raw = Record<string, string | string[]>

export const tabbed = {
	params: (raw: Raw) => ({ id: Number(raw["id"]) }),
	searchParams: (raw: Raw) => ({ tab: String(raw["tab"] ?? "a") }),
}

export function paged<T>(search: (raw: Raw) => T) {
	return { params: (raw: Raw) => ({ id: Number(raw["id"]) }), searchParams: search }
}

// Search only, as a default export: the page's params stay its brackets.
export default {
	searchParams: (raw: Raw) => ({ sort: raw["sort"] === "desc" ? ("desc" as const) : ("asc" as const) }),
}
