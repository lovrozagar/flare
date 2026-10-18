// The dx/types.md `app` rows for where a route's validated params and search come from: each route whose chain calls
// `.input()` has them read from its own type, whatever the argument is, a literal, an import, or a factory's result
// (BUGS.md 349). See checks.ts.
import { buildUrl, Link, useLoaderData, useNavigate, useParams, useSearch } from "@lovrozagar/flare"

const navigate = useNavigate()

// imported input: an `.input()` object imported by name, through a namespace, or through a `paths` alias
{
	for (const from of ["_root_/imported/[id]", "_root_/spaced/[id]", "_root_/aliased/[id]"] as const) {
		const id: number = useParams({ from }).id
		const tab: string = useSearch({ from }).tab
		void [id, tab]
		// @ts-expect-error the search output has no such key
		void useSearch({ from }).other
	}
	void Link({ to: "_root_/imported/[id]", params: { id: 1 }, search: { tab: "b" }, children: "x" })
	void navigate({ to: "_root_/spaced/[id]", params: { id: 1 }, search: { tab: "b" } })
	void buildUrl({ to: "_root_/aliased/[id]", params: { id: 1 }, search: { tab: "b" } })
	// @ts-expect-error the params output is a number
	void Link({ to: "_root_/imported/[id]", params: { id: "1" }, search: { tab: "b" }, children: "x" })
	// @ts-expect-error a required search key makes search required
	void navigate({ to: "_root_/spaced/[id]", params: { id: 1 } })
	// @ts-expect-error the params output is a number
	void buildUrl({ to: "_root_/aliased/[id]", params: { id: "1" }, search: { tab: "b" } })
}

// default import input: a search-only config keeps the page's bracket params
{
	const id: string = useParams({ from: "_root_/sorted/[id]" }).id
	const sort: "asc" | "desc" = useSearch({ from: "_root_/sorted/[id]" }).sort
	void [id, sort]
	void Link({ to: "_root_/sorted/[id]", params: { id: "1" }, search: { sort: "desc" }, children: "x" })
	// @ts-expect-error the params are the bracket string
	void Link({ to: "_root_/sorted/[id]", params: { id: 1 }, search: { sort: "desc" }, children: "x" })
	// @ts-expect-error the search output is a literal union
	void Link({ to: "_root_/sorted/[id]", params: { id: "1" }, search: { sort: "up" }, children: "x" })
}

// factory input: an `.input()` object a factory returns
{
	const id: number = useParams({ from: "_root_/made/[id]" }).id
	const page: number = useSearch({ from: "_root_/made/[id]" }).page
	void [id, page]
	void Link({ to: "_root_/made/[id]", params: { id: 2 }, search: { page: 3 }, children: "x" })
	// @ts-expect-error the params output is a number
	void Link({ to: "_root_/made/[id]", params: { id: "2" }, search: { page: 3 }, children: "x" })
	// @ts-expect-error the search output is a number
	void buildUrl({ to: "_root_/made/[id]", params: { id: 2 }, search: { page: "3" } })
}

// never output: a params validator whose output is `never` keeps it, never the bracket params
{
	const params: never = useParams({ from: "_root_/void/[id]" })
	void params
	// @ts-expect-error a bracket string is not the validator output
	void Link({ to: "_root_/void/[id]", params: { id: "1" }, children: "x" })
}

// redirect to a validating route: a loader that redirects with params to a route that validates them, its own route
// included, annotates its return, and its data and the target's params stay typed (BUGS.md 350)
{
	const canon: number = useLoaderData({ from: "_root_/canon/[id]" }).n
	const ping: number = useLoaderData({ from: "_root_/vping/[id]" }).n
	void [canon, ping]
	void Link({ to: "_root_/vpong/[id]", params: { id: 1 }, children: "x" })
	// @ts-expect-error the loader data is a number, not `any` from a loop
	const _pong: string = useLoaderData({ from: "_root_/vpong/[id]" }).n
	// @ts-expect-error the params output is a number
	void Link({ to: "_root_/canon/[id]", params: { id: "1" }, children: "x" })
}
