// dx/types.md "Matrix", rows `param types` through `parent search hidden`: the params, `to`, and search targets, through the
// package entry against the register codegen wrote for this app. app.test.ts compiles this file; vitest never runs it
// (B96, plan 25 5.2).
import {
	buildUrl,
	createPage,
	Link,
	useLoaderData,
	useNavigate,
	useParams,
	useSearch,
	type FlareRegister,
} from "@lovrozagar/flare"
import { expectTypeOf, it } from "vitest"

const navigate = useNavigate()
const wide: string = "_root_/about"

it("param types", () => {
	expectTypeOf(useParams({ from: "_root_/users/[id]" }).id).toEqualTypeOf<string>()
	expectTypeOf(useParams({ from: "_root_/docs/[...path]" }).path).toEqualTypeOf<string[]>()
	expectTypeOf(useParams({ from: "_root_/opt/[[locale]]" }).locale).toEqualTypeOf<string | undefined>()
	expectTypeOf(useParams({ from: "_root_/files/[[...rest]]" }).rest).toEqualTypeOf<string[] | undefined>()
	// @ts-expect-error id is a string, not a number
	expectTypeOf(useParams({ from: "_root_/users/[id]" }).id).toEqualTypeOf<number>()
	// @ts-expect-error the optional key is present inside the object
	void Link({ to: "_root_/opt/[[locale]]", params: {}, children: "x" })
})

it("no params", () => {
	void Link({ to: "_root_/about", children: "x" })
	// @ts-expect-error a static page takes no params
	void Link({ to: "_root_/about", params: { id: "1" }, children: "x" })
})

it("optional param", () => {
	void Link({ to: "_root_/opt/[[locale]]", params: { locale: "en" }, children: "x" })
	void Link({ to: "_root_/opt/[[locale]]", params: { locale: undefined }, children: "x" })
	// @ts-expect-error params are required while the type has a key
	void Link({ to: "_root_/opt/[[locale]]", children: "x" })
	// @ts-expect-error the optional key is present inside the object
	void Link({ to: "_root_/opt/[[locale]]", params: {}, children: "x" })
})

it("catch-all", () => {
	void Link({ to: "_root_/docs/[...path]", params: { path: ["a", "b"] }, children: "x" })
	// @ts-expect-error a catch-all is an array
	void Link({ to: "_root_/docs/[...path]", params: { path: "a" }, children: "x" })
})

it("optional catch-all", () => {
	void Link({ to: "_root_/files/[[...rest]]", params: { rest: undefined }, children: "x" })
	// @ts-expect-error the rest key is required inside params
	void Link({ to: "_root_/files/[[...rest]]", params: {}, children: "x" })
})

it("literal brackets", () => {
	expectTypeOf(useParams({ from: "_root_/[_]id]" })).toEqualTypeOf<{}>()
	// @ts-expect-error `[_]id]` is a literal segment, not a param
	void useParams({ from: "_root_/[_]id]" }).id
})

it("group is not a param", () => {
	expectTypeOf(useParams({ from: "_root_/(blog)/post/[slug]" })).toEqualTypeOf<{ slug: string }>()
	// @ts-expect-error `(blog)` adds no key
	void useParams({ from: "_root_/(blog)/post/[slug]" }).blog
})

it("param before root", () => {
	expectTypeOf(useParams({ from: "[locale]/_root_/about" }).locale).toEqualTypeOf<string>()
	// @ts-expect-error locale stays in the URL, so it is required
	void Link({ to: "[locale]/_root_/about", children: "x" })
})

it("input params", () => {
	expectTypeOf(useParams({ from: "_root_/shaped/[id]" })).toEqualTypeOf<{ id: number }>()
	// @ts-expect-error the validator output is a number
	void useParams({ from: "_root_/shaped/[id]" }).id.toUpperCase()
	void Link({ to: "_root_/shaped/[id]", params: { id: 1 }, children: "x" })
	// @ts-expect-error the bracket string is not assigned back
	void Link({ to: "_root_/shaped/[id]", params: { id: "1" }, children: "x" })
})

it("input one side", () => {
	expectTypeOf(useSearch({ from: "_root_/shaped/[id]" })).toEqualTypeOf<Record<string, string | string[]>>()
	// @ts-expect-error search is not the params output
	const _typed: { id: number } = useSearch({ from: "_root_/shaped/[id]" })
})

it("input empty", () => {
	// @ts-expect-error an input names at least one side (plan 21 11.4)
	void createPage("_root_/static").input({})
})

it("missing param", () => {
	void Link({ to: "_root_/users/[id]", params: { id: "1" }, children: "x" })
	void navigate({ to: "_root_/users/[id]", params: { id: "1" } })
	// @ts-expect-error params are required
	void Link({ to: "_root_/users/[id]", children: "x" })
	// @ts-expect-error params are required
	void navigate({ to: "_root_/users/[id]" })
})

it("extra param", () => {
	void Link({ to: "_root_/users/[id]", params: { id: "1" }, children: "x" })
	// @ts-expect-error extra keys are rejected
	void Link({ to: "_root_/users/[id]", params: { id: "1", extra: "x" }, children: "x" })
})

it("unknown route", () => {
	void Link({ to: "_root_/static", children: "x" })
	// @ts-expect-error an unknown id
	void Link({ to: "nope", children: "x" })
	// @ts-expect-error a wide string is not a page id
	void Link({ to: wide, children: "x" })
})

it("layout to", () => {
	// @ts-expect-error a layout id is not a target
	void Link({ to: "_root_/(blog)", children: "x" })
})

it("segment to", () => {
	// @ts-expect-error a segment id is not a target
	void Link({ to: "_root_/seg", children: "x" })
})

it("response route id", () => {
	expectTypeOf(useLoaderData({ from: "_root_/raw" })).toBeVoid()
	void Link({ to: "_root_/raw", children: "x" })
	// @ts-expect-error a response page has no render URL in routes
	const _url: keyof FlareRegister["routes"] = "/raw"
})

it("hash not generic", () => {
	void Link({ to: "_root_/static", hash: "top", replace: true, children: "x" })
	const hash: string = "any-fragment"
	void Link({ to: "_root_/about", hash, children: "x" })
	// @ts-expect-error hash is a string, not a route-specific union
	void Link({ to: "_root_/about", hash: 1, children: "x" })
})

it("search raw", () => {
	void Link({ to: "_root_/static", search: { q: "a" }, children: "x" })
	void Link({ to: "_root_/static", search: { q: ["a", "b"] }, children: "x" })
	void Link({ to: "_root_/static", children: "x" })
	// @ts-expect-error a raw search value is a string
	void Link({ to: "_root_/static", search: { q: 1 }, children: "x" })
})

it("search validated", () => {
	expectTypeOf(useSearch({ from: "_root_/vsearch" }).page).toEqualTypeOf<number>()
	// @ts-expect-error page is a number
	const _page: string = useSearch({ from: "_root_/vsearch" }).page
})

it("imported input", () => {
	expectTypeOf(useParams({ from: "_root_/imported/[id]" })).toEqualTypeOf<{ id: number }>()
	expectTypeOf(useSearch({ from: "_root_/imported/[id]" })).toEqualTypeOf<{ tab: string }>()
	expectTypeOf(useParams({ from: "_root_/spaced/[id]" })).toEqualTypeOf<{ id: number }>()
	expectTypeOf(useSearch({ from: "_root_/aliased/[id]" })).toEqualTypeOf<{ tab: string }>()
	void Link({ to: "_root_/imported/[id]", params: { id: 1 }, search: { tab: "b" }, children: "x" })
	void navigate({ to: "_root_/spaced/[id]", params: { id: 1 }, search: { tab: "b" } })
	void buildUrl({ to: "_root_/aliased/[id]", params: { id: 1 }, search: { tab: "b" } })
	// @ts-expect-error the params output is a number
	void Link({ to: "_root_/imported/[id]", params: { id: "1" }, search: { tab: "b" }, children: "x" })
	// @ts-expect-error a required search key makes search required
	void navigate({ to: "_root_/spaced/[id]", params: { id: 1 } })
	// @ts-expect-error the params output is a number
	void buildUrl({ to: "_root_/aliased/[id]", params: { id: "1" }, search: { tab: "b" } })
})

it("factory input", () => {
	expectTypeOf(useParams({ from: "_root_/made/[id]" })).toEqualTypeOf<{ id: number }>()
	expectTypeOf(useSearch({ from: "_root_/made/[id]" })).toEqualTypeOf<{ page: number }>()
	void Link({ to: "_root_/made/[id]", params: { id: 2 }, search: { page: 3 }, children: "x" })
	// @ts-expect-error the params output is a number
	void Link({ to: "_root_/made/[id]", params: { id: "2" }, search: { page: 3 }, children: "x" })
	// @ts-expect-error the search output is a number
	void buildUrl({ to: "_root_/made/[id]", params: { id: 2 }, search: { page: "3" } })
})

it("never output", () => {
	expectTypeOf(useParams({ from: "_root_/void/[id]" })).toBeNever()
	// @ts-expect-error a bracket string is not the validator output
	void Link({ to: "_root_/void/[id]", params: { id: "1" }, children: "x" })
})

it("union output", () => {
	expectTypeOf(useParams({ from: "_root_/either/[id]" })).toEqualTypeOf<{ n: number } | { s: string }>()
	expectTypeOf(useSearch({ from: "_root_/either/[id]" })).toEqualTypeOf<{ a: string } | { b: string }>()
	void Link({ to: "_root_/either/[id]", params: { n: 1 }, search: { a: "x" }, children: "x" })
	void Link({ to: "_root_/either/[id]", params: { s: "x" }, search: { b: "y" }, children: "x" })
	// @ts-expect-error params are required
	void Link({ to: "_root_/either/[id]", search: { a: "x" }, children: "x" })
	// @ts-expect-error search is required
	void Link({ to: "_root_/either/[id]", params: { n: 1 }, children: "x" })
	// @ts-expect-error neither member's shape
	void Link({ to: "_root_/either/[id]", params: { n: 1 }, search: { c: "z" }, children: "x" })
})

it("search required key", () => {
	expectTypeOf(useSearch({ from: "_root_/search" })).toEqualTypeOf<{ q: string; page?: number }>()
	void Link({ to: "_root_/search", search: { q: "a" }, children: "x" })
	void Link({ to: "_root_/search", search: { q: "a", page: 2 }, children: "x" })
	// @ts-expect-error a required key makes search required
	void Link({ to: "_root_/search", children: "x" })
})

it("search optional keys", () => {
	expectTypeOf(useSearch({ from: "_root_/filter" })).toEqualTypeOf<{ tag?: string }>()
	void Link({ to: "_root_/filter", children: "x" })
	void Link({ to: "_root_/filter", search: {}, children: "x" })
	// @ts-expect-error extra search keys are rejected
	void Link({ to: "_root_/filter", search: { extra: "x" }, children: "x" })
})

it("search extra key", () => {
	void Link({ to: "_root_/search", search: { q: "a" }, children: "x" })
	// @ts-expect-error only validator keys are legal
	void Link({ to: "_root_/search", search: { q: "a", extra: "x" }, children: "x" })
})

it("search empty", () => {
	expectTypeOf(useSearch({ from: "_root_/nosrch" })).toEqualTypeOf<{}>()
	void Link({ to: "_root_/nosrch", children: "x" })
	// @ts-expect-error an empty validator output forbids a search object
	void Link({ to: "_root_/nosrch", search: {}, children: "x" })
})

it("parent search hidden", () => {
	expectTypeOf(useSearch({ from: "_root_/(blog)/post/[slug]" })).toEqualTypeOf<Record<string, string | string[]>>()
	void Link({ to: "_root_/(blog)/post/[slug]", params: { slug: "a" }, children: "x" })
	// @ts-expect-error the layout's validator does not apply to the page
	const _section: { section: string } = useSearch({ from: "_root_/(blog)/post/[slug]" })
})
