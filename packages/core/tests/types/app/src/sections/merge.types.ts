// dx/types.md "Merge", the params, search, loader data, and preloader rules, one case per rule, through the package
// entries against the register codegen wrote for this app; merge-auth.types.ts has the auth rules. The two rules about a register codegen never writes, a missing parent module and an omitted `auth`, are in the
// hand-written fixture's merge.types.ts. app.test.ts compiles this file; vitest never runs it (B96, plan 25 5.2).
import {
	buildUrl,
	createPage,
	createRootLayout,
	Link,
	redirect,
	useLoaderData,
	useNavigate,
	useParams,
	usePreloaderContext,
	useSearch,
} from "@lovrozagar/flare"
import { useDeferred } from "@lovrozagar/flare"
import { expectTypeOf, it } from "vitest"

type Raw = Record<string, string | string[]>
const navigate = useNavigate()
const children = "x"

it("params before .input()", () => {
	expectTypeOf(useParams({ from: "_root_/users/[id]" })).toEqualTypeOf<{ id: string }>()
	expectTypeOf(useParams({ from: "_root_/docs/[...path]" })).toEqualTypeOf<{ path: string[] }>()
	expectTypeOf(useParams({ from: "_root_/opt/[[locale]]" })).toEqualTypeOf<{ locale: string | undefined }>()
	expectTypeOf(useParams({ from: "_root_/files/[[...rest]]" })).toEqualTypeOf<{ rest: string[] | undefined }>()
	// An escaped bracket and a group add no key; the root's params are not a record of strings.
	expectTypeOf(useParams({ from: "_root_/[_]id]" })).toEqualTypeOf<{}>()
	expectTypeOf(useParams({ from: "_root_/(blog)" })).toEqualTypeOf<{}>()
	void createRootLayout("_root_").render((props) => {
		expectTypeOf(props.params).toEqualTypeOf<{}>()
		return props.children
	})
})

it(".input({ params })", () => {
	expectTypeOf(useParams({ from: "_root_/imported/[id]" })).toEqualTypeOf<{ id: number }>()
	void createPage("_root_/users/[id]")
		.input({ params: (raw: Raw) => ({ n: Number(raw["id"]) }) })
		.render((props) => {
			expectTypeOf(props.params).toEqualTypeOf<{ n: number }>()
			return null
		})
})

it(".input({ searchParams })", () => {
	// The other side keeps its default.
	void createPage("_root_/users/[id]")
		.input({ searchParams: (): { q: string } => ({ q: "" }) })
		.render((props) => {
			expectTypeOf(props.search).toEqualTypeOf<{ q: string }>()
			expectTypeOf(props.params).toEqualTypeOf<{ id: string }>()
			return null
		})
})

it(".input({})", () => {
	// @ts-expect-error at least one side is required
	void createPage("_root_/about").input({})
})

it("search with no validator", () => {
	expectTypeOf(useSearch({ from: "_root_/about" })).toEqualTypeOf<Raw>()
	void Link({ to: "_root_/about", children })
	void Link({ to: "_root_/about", search: { q: "a", tags: ["a", "b"] }, children })
	// @ts-expect-error a value is a string or a list of strings
	void Link({ to: "_root_/about", search: { q: 1 }, children })
})

it("search validator output has a required key", () => {
	void Link({ to: "_root_/search", search: { q: "a" }, children })
	void buildUrl({ to: "_root_/search", search: { q: "a" } })
	void navigate({ to: "_root_/search", search: { q: "a" } })
	// @ts-expect-error search is required
	void Link({ to: "_root_/search", children })
	// @ts-expect-error search is required
	void buildUrl({ to: "_root_/search" })
	void createPage("_root_/about").loader(() => {
		// @ts-expect-error search is required
		redirect({ to: "_root_/search" })
	})
})

it("every search key is optional", () => {
	void Link({ to: "_root_/filter", children })
	void Link({ to: "_root_/filter", search: { tag: "a" }, children })
	// @ts-expect-error a passed object is still checked
	void Link({ to: "_root_/filter", search: { tag: 1 }, children })
})

it("validator output is {}", () => {
	void Link({ to: "_root_/nosrch", children })
	// @ts-expect-error an empty output takes no search
	void Link({ to: "_root_/nosrch", search: {}, children })
	// @ts-expect-error a page with no params takes no params
	void Link({ to: "_root_/about", params: {}, children })
})

it("a parent .input()", () => {
	// The blog layout validates `section`; the post page under it keeps the raw search.
	expectTypeOf(useSearch({ from: "_root_/(blog)" })).toEqualTypeOf<{ section: string }>()
	expectTypeOf(useSearch({ from: "_root_/(blog)/post/[slug]" })).toEqualTypeOf<Raw>()
})

it("params object", () => {
	void Link({ to: "_root_/users/[id]", params: { id: "1" }, children })
	void Link({ to: "_root_/opt/[[locale]]", params: { locale: undefined }, children })
	// @ts-expect-error params are required when the type has a key
	void Link({ to: "_root_/users/[id]", children })
	// @ts-expect-error an optional bracket's key is still required
	void Link({ to: "_root_/opt/[[locale]]", children })
})

it("[[id]] inside the object", () => {
	void buildUrl({ to: "_root_/opt/[[locale]]", params: { locale: "en" } })
	// @ts-expect-error the key is present, its value may be undefined
	void buildUrl({ to: "_root_/opt/[[locale]]", params: {} })
})

it("loader data", () => {
	expectTypeOf(useLoaderData({ from: "_root_/(blog)/post/[slug]" })).toEqualTypeOf<{ title: string }>()
	// A parent loader is its own hook; no loader is `void`.
	expectTypeOf(useLoaderData({ from: "_root_/(blog)" })).toEqualTypeOf<{ section: string }>()
	expectTypeOf(useLoaderData({ from: "_root_/static" })).toBeVoid()
})

it("Promise<{ n: number }>", () => {
	expectTypeOf(useLoaderData({ from: "_root_/users/[id]" })).toEqualTypeOf<{ user: { name: string } }>()
})

it("Deferred<T>", () => {
	{
		const quote = useLoaderData({ from: "_root_/reviews" }).reviews
		expectTypeOf(quote.promise).toEqualTypeOf<Promise<{ quote: string }>>()
		expectTypeOf(quote).not.toHaveProperty("then")
		expectTypeOf<Awaited<typeof quote>>().toEqualTypeOf(quote)
		expectTypeOf(useDeferred(() => quote)()).toEqualTypeOf<{ quote: string }>()
		// @ts-expect-error a plain Deferred is not its value
		const _value: { quote: string } = quote
	}
})

it("preloader", () => {
	// Parents outside-in, self excluded on the preloader and authorize, then the route's own return after.
	void createPage("_root_/(blog)/post/[slug]")
		.preloader((ctx) => {
			expectTypeOf(ctx.preloaderContext).toEqualTypeOf<{ requestId: string; role: "admin" | "editor" }>()
			return { own: 1 }
		})
		.loader((ctx) => {
			expectTypeOf(ctx.preloaderContext.own).toEqualTypeOf<number>()
			return {}
		})
})

it("the same preloader key", () => {
	expectTypeOf(usePreloaderContext({ from: "_root_/(blog)/post/[slug]" }).role).toEqualTypeOf<"admin">()
})

it("incompatible preloader types", () => {
	// The viewer page's own `role: "viewer"` meets the layout's `"admin" | "editor"`; its sibling key stays.
	expectTypeOf(usePreloaderContext({ from: "_root_/(blog)/viewer" }).role).toBeNever()
	expectTypeOf(usePreloaderContext({ from: "_root_/(blog)/viewer" }).requestId).toEqualTypeOf<string>()
})

it("a preloader that returns a union", () => {
	void createPage("_root_/about")
		.preloader((): { kind: "a"; a: number } | { kind: "b"; b?: string } => ({ kind: "a", a: 1 }))
		.loader((ctx) => {
			const context = ctx.preloaderContext
			if (context.kind === "a") expectTypeOf(context.a).toEqualTypeOf<number>()
			else expectTypeOf(context.b).toEqualTypeOf<string | undefined>()
			return {}
		})
})

it("root preloader callback", () => {
	void createRootLayout("_root_")
		.preloader((ctx) => {
			expectTypeOf(ctx).not.toHaveProperty("preloaderContext")
			return { requestId: "r" }
		})
		.loader((ctx) => {
			expectTypeOf(ctx.preloaderContext).toEqualTypeOf<{ requestId: string }>()
			return {}
		})
})
