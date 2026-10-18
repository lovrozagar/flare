import { PAGE_SIZE, type Dir, type ProjectQuery, type Sort, type Status } from "./db.ts"

// The projects table's search, validated from the URL's raw record (dx/link.md URL values): a number, a list, and two
// dates. A value that does not parse takes its default, so a hand-edited URL never fails the page.
type Raw = Record<string, string | string[]>

const SORTS: readonly Sort[] = ["name", "updated", "budget"]
const DIRS: readonly Dir[] = ["asc", "desc"]
export const STATUSES: readonly Status[] = ["active", "paused", "archived"]

export const DEFAULT_SEARCH: ProjectQuery = { sort: "updated", dir: "desc", page: 1 }

function first(value: string | string[] | undefined): string | undefined {
	return Array.isArray(value) ? value[0] : value
}

function listed<T extends string>(allowed: readonly T[], value: string | undefined): T | undefined {
	return allowed.find((item) => item === value)
}

// An ISO date or date-time; anything else is no bound.
function dateOf(value: string | undefined): Date | undefined {
	if (value === undefined || !/^\d{4}-\d{2}-\d{2}/.test(value)) return undefined
	const date = new Date(value)
	return Number.isNaN(date.getTime()) ? undefined : date
}

export function projectSearch(raw: Raw): ProjectQuery {
	const q = first(raw["q"])?.trim()
	const statuses = [raw["status"] ?? []].flat().flatMap((value) => listed(STATUSES, value) ?? [])
	const page = Number(first(raw["page"]))
	const from = dateOf(first(raw["from"]))
	const to = dateOf(first(raw["to"]))
	return {
		...(q === undefined || q === "" ? {} : { q }),
		...(statuses.length === 0 ? {} : { status: [...new Set(statuses)] }),
		sort: listed(SORTS, first(raw["sort"])) ?? DEFAULT_SEARCH.sort,
		dir: listed(DIRS, first(raw["dir"])) ?? DEFAULT_SEARCH.dir,
		page: Number.isInteger(page) && page >= 1 ? page : 1,
		...(from === undefined ? {} : { from }),
		...(to === undefined ? {} : { to }),
	}
}

// The same value checked again where it arrives as a server function's input, which the client built.
export function checkedQuery(value: ProjectQuery): ProjectQuery {
	return {
		...(typeof value.q === "string" && value.q !== "" ? { q: value.q } : {}),
		...(Array.isArray(value.status) ? { status: value.status.filter((s) => STATUSES.includes(s)) } : {}),
		sort: listed(SORTS, value.sort) ?? DEFAULT_SEARCH.sort,
		dir: listed(DIRS, value.dir) ?? DEFAULT_SEARCH.dir,
		page: Number.isInteger(value.page) && value.page >= 1 ? value.page : 1,
		...(value.from instanceof Date ? { from: value.from } : {}),
		...(value.to instanceof Date ? { to: value.to } : {}),
	}
}

// The query key of one table state: plain text, so two equal searches share one cache entry.
export function queryKey(search: ProjectQuery): readonly unknown[] {
	return [
		"projects",
		search.q ?? "",
		(search.status ?? []).join(","),
		search.sort,
		search.dir,
		search.page,
		search.from?.toISOString() ?? "",
		search.to?.toISOString() ?? "",
	]
}

export { PAGE_SIZE }
