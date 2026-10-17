// One positive program and one @ts-expect-error per `app` row of the dx/types.md matrix, against the generated
// register (B74). Nothing here runs: tsc checks it. This file holds the target rows: params, `to`, and search.
// `checks-data.ts` holds loaders, preloaders, and auth, and `checks-fns.ts` the hooks, server functions, and the
// segment. The query rows are at the end of this file.
import {
	buildUrl,
	createPage,
	createRouter,
	Link,
	useLoaderData,
	useNavigate,
	useParams,
	useSearch,
	type FlareRegister,
} from "@lovrozagar/flare"
import { createServerFn } from "@lovrozagar/flare/server-fn"
import { serverFnMutationOptions, serverFnQueryOptions } from "@lovrozagar/flare/query"
import type { QueryClient } from "@tanstack/solid-query"
import { echo } from "./fns/echo.ts"

const navigate = useNavigate()
const wide: string = "_root_/about"

// param types
{
	const docs: string[] = useParams({ from: "_root_/docs/[...path]" }).path
	const locale: string | undefined = useParams({ from: "_root_/opt/[[locale]]" }).locale
	const rest: string[] | undefined = useParams({ from: "_root_/files/[[...rest]]" }).rest
	const id: string = useParams({ from: "_root_/users/[id]" }).id
	void [docs, locale, rest, id]
	// @ts-expect-error id is a string
	const _number: number = useParams({ from: "_root_/users/[id]" }).id
	// @ts-expect-error the optional key is present inside the object
	void Link({ to: "_root_/opt/[[locale]]", params: {}, children: "x" })
}

// no params
{
	void Link({ to: "_root_/about", children: "x" })
	// @ts-expect-error a static page takes no params
	void Link({ to: "_root_/about", params: { id: "1" }, children: "x" })
}

// optional param
{
	void Link({ to: "_root_/opt/[[locale]]", params: { locale: "en" }, children: "x" })
	void Link({ to: "_root_/opt/[[locale]]", params: { locale: undefined }, children: "x" })
	// @ts-expect-error params are required while the type has a key
	void Link({ to: "_root_/opt/[[locale]]", children: "x" })
}

// catch-all
{
	void Link({ to: "_root_/docs/[...path]", params: { path: ["a", "b"] }, children: "x" })
	// @ts-expect-error a catch-all is an array
	void Link({ to: "_root_/docs/[...path]", params: { path: "a" }, children: "x" })
}

// optional catch-all
{
	void Link({ to: "_root_/files/[[...rest]]", params: { rest: undefined }, children: "x" })
	// @ts-expect-error the rest key is required inside params
	void Link({ to: "_root_/files/[[...rest]]", params: {}, children: "x" })
}

// literal brackets
{
	const params: {} = useParams({ from: "_root_/[_]id]" })
	void params
	// @ts-expect-error `[_]id]` is a literal segment, not a param
	void useParams({ from: "_root_/[_]id]" }).id
}

// group is not a param
{
	const slug: string = useParams({ from: "_root_/(blog)/post/[slug]" }).slug
	void slug
	// @ts-expect-error `(blog)` adds no key
	void useParams({ from: "_root_/(blog)/post/[slug]" }).blog
}

// param before root
{
	const locale: string = useParams({ from: "[locale]/_root_/about" }).locale
	void locale
	// @ts-expect-error locale stays in the URL, so it is required
	void Link({ to: "[locale]/_root_/about", children: "x" })
}

// input params
{
	const id: number = useParams({ from: "_root_/shaped/[id]" }).id
	void id.toFixed(0)
	void Link({ to: "_root_/shaped/[id]", params: { id: 1 }, children: "x" })
	// @ts-expect-error the validator output is a number
	void useParams({ from: "_root_/shaped/[id]" }).id.toUpperCase()
	// @ts-expect-error the bracket string is not assigned back
	void Link({ to: "_root_/shaped/[id]", params: { id: "1" }, children: "x" })
}

// input one side
{
	const search: Record<string, string | string[]> = useSearch({ from: "_root_/shaped/[id]" })
	void search
	// @ts-expect-error search is not the params output
	const _typed: { id: number } = useSearch({ from: "_root_/shaped/[id]" })
}

// missing param
{
	void Link({ to: "_root_/users/[id]", params: { id: "1" }, children: "x" })
	void navigate({ to: "_root_/users/[id]", params: { id: "1" } })
	// @ts-expect-error params are required
	void Link({ to: "_root_/users/[id]", children: "x" })
	// @ts-expect-error params are required
	void navigate({ to: "_root_/users/[id]" })
}

// buildUrl: the same target as `navigate`, without `replace`, and a path back (dx/types.md)
{
	const path: string = buildUrl({ to: "_root_/users/[id]", params: { id: "1" }, hash: "top" })
	void path
	// @ts-expect-error params are required
	void buildUrl({ to: "_root_/users/[id]" })
	// @ts-expect-error an unknown id is rejected
	void buildUrl({ to: "_root_/nope" })
	// @ts-expect-error replace is a navigation option, not part of a URL
	void buildUrl({ to: "_root_/about", replace: true })
}

// extra param
{
	// @ts-expect-error extra keys are rejected
	void Link({ to: "_root_/users/[id]", params: { id: "1", extra: "x" }, children: "x" })
}

// unknown route
{
	void Link({ to: "_root_/static", children: "x" })
	// @ts-expect-error an unknown id
	void Link({ to: "nope", children: "x" })
	// @ts-expect-error a wide string is not a page id
	void Link({ to: wide, children: "x" })
}

// layout to
{
	// @ts-expect-error a layout id is not a target
	void Link({ to: "_root_/(blog)", children: "x" })
}

// segment to
{
	// @ts-expect-error a segment id is not a target
	void Link({ to: "_root_/seg", children: "x" })
}

// response route id
{
	void Link({ to: "_root_/raw", children: "x" })
	const data: void = useLoaderData({ from: "_root_/raw" })
	const module: keyof FlareRegister["routeModules"] = "_root_/raw"
	void [data, module]
	// @ts-expect-error a response page has no render URL in routes
	const _url: keyof FlareRegister["routes"] = "/raw"
}

// prefetch: a trigger or one per field on a Link and a route; `modules: "all"` is the router's alone (dx/link.md)
{
	void Link({ to: "_root_/static", prefetch: "intent", children: "x" })
	void Link({ to: "_root_/static", prefetch: { data: "viewport", modules: "render" }, children: "x" })
	void Link({ to: "_root_/static", prefetch: false, children: "x" })
	void createPage("_root_/static").cache({ client: { prefetch: { modules: "viewport" } } })
	void createRouter({ layouts: {}, routeTree: [], prefetch: { modules: "all" } })
	// @ts-expect-error a link cannot say modules: "all"
	void Link({ to: "_root_/static", prefetch: { modules: "all" }, children: "x" })
	// @ts-expect-error "all" is not a trigger
	void Link({ to: "_root_/static", prefetch: "all", children: "x" })
	// @ts-expect-error a route cannot say modules: "all"
	void createPage("_root_/static").cache({ client: { prefetch: { modules: "all" } } })
}

// search raw
{
	void Link({ to: "_root_/static", search: { q: "a" }, children: "x" })
	void Link({ to: "_root_/static", search: { q: ["a", "b"] }, children: "x" })
	void Link({ to: "_root_/static", children: "x" })
	// @ts-expect-error a raw search value is a string
	void Link({ to: "_root_/static", search: { q: 1 }, children: "x" })
}

// search validated
{
	const page: number | undefined = useSearch({ from: "_root_/search" }).page
	const q: string = useSearch({ from: "_root_/search" }).q
	void [page, q]
	// @ts-expect-error page is a number
	const _page: string | undefined = useSearch({ from: "_root_/search" }).page
}

// search required key
{
	void Link({ to: "_root_/search", search: { q: "a" }, children: "x" })
	void Link({ to: "_root_/search", search: { q: "a", page: 2 }, children: "x" })
	// @ts-expect-error a required key makes search required
	void Link({ to: "_root_/search", children: "x" })
}

// search optional keys
{
	void Link({ to: "_root_/filter", children: "x" })
	void Link({ to: "_root_/filter", search: {}, children: "x" })
	// @ts-expect-error extra search keys are rejected
	void Link({ to: "_root_/filter", search: { extra: "x" }, children: "x" })
}

// search extra key
{
	// @ts-expect-error only validator keys are legal
	void Link({ to: "_root_/search", search: { q: "a", extra: "x" }, children: "x" })
}

// search empty
{
	void Link({ to: "_root_/nosrch", children: "x" })
	// @ts-expect-error an empty validator output forbids a search object
	void Link({ to: "_root_/nosrch", search: {}, children: "x" })
}

// parent search hidden
{
	const search: Record<string, string | string[]> = useSearch({ from: "_root_/(blog)/post/[slug]" })
	void Link({ to: "_root_/(blog)/post/[slug]", params: { slug: "a" }, children: "x" })
	void search
	// @ts-expect-error the layout's validator does not apply to the page
	const _section: { section: string } = useSearch({ from: "_root_/(blog)/post/[slug]" })
}

// query options input
{
	const options = serverFnQueryOptions(echo, { queryKey: ["echo"], input: { q: "a" } })
	const queryFn: () => Promise<{ q: string; secret: string }> = options.queryFn
	void queryFn
	// @ts-expect-error the input is required
	void serverFnQueryOptions(echo, { queryKey: ["echo"] })
	// @ts-expect-error a fresh extra key
	void serverFnQueryOptions(echo, { queryKey: ["echo"], input: { q: "a", extra: 1 } })
}

// query options void
{
	const now = createServerFn().handler(() => 1)
	const queryFn: () => Promise<number> = serverFnQueryOptions(now, { queryKey: ["now"] }).queryFn
	void queryFn
	// @ts-expect-error a void input is not passed
	void serverFnQueryOptions(now, { queryKey: ["now"], input: 1 })
}

// mutation options
{
	const keyed = serverFnMutationOptions(echo, { mutationKey: ["echo"] })
	const mutate: (input: { q: string }) => Promise<{ q: string; secret: string }> = keyed.mutationFn
	void mutate
	keyed.onSuccess({ q: "a", secret: "s" })
	// @ts-expect-error onSuccess takes the handler's return, not the envelope
	keyed.onSuccess({ ok: true, data: { q: "a", secret: "s" } })
	// @ts-expect-error with no mutationKey there is no onSuccess
	void serverFnMutationOptions(echo).onSuccess
}

// query client present
{
	void createPage("_root_/public").loader((ctx) => {
		const client: QueryClient = ctx.queryClient
		void client
		return {}
	})
	void createPage("_root_/public").render((props) => {
		// @ts-expect-error a render has no query client
		void props.queryClient
		return "x"
	})
}
