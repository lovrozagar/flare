// dx/types.md "Graph", one case per row, read through the package entries from the register codegen wrote for this
// app. app.test.ts compiles this file; vitest never runs it (B96, plan 25 5.2).
import {
	createLayout,
	createPage,
	Link,
	useLoaderData,
	useLocation,
	useParams,
	usePreloaderContext,
	useSearch,
} from "@lovrozagar/flare"
import { createServer, serverCtx } from "@lovrozagar/flare/server"
import { createServerFn } from "@lovrozagar/flare/server-fn"
import { expectTypeOf, it } from "vitest"

type Raw = Record<string, string | string[]>

// `createServer({ authenticate })` reads `ctx.env` as the app's `env` and answers its `auth` (the augmentation row).
const authenticate: NonNullable<Parameters<typeof createServer>[0]["authenticate"]> = (ctx) => {
	expectTypeOf(ctx.env).toEqualTypeOf<{ site: string }>()
	return { userId: "u" }
}

it("brackets in the route id", () => {
	expectTypeOf(useParams({ from: "_root_/users/[id]" })).toEqualTypeOf<{ id: string }>()
	expectTypeOf(useParams({ from: "_root_/docs/[...path]" })).toEqualTypeOf<{ path: string[] }>()
	void createPage("_root_/users/[id]").render((props) => {
		expectTypeOf(props.params).toEqualTypeOf<{ id: string }>()
		return null
	})
})

it(".input({ params }) on that file", () => {
	// The validator's output replaces the whole bracket type for that id.
	expectTypeOf(useParams({ from: "_root_/imported/[id]" })).toEqualTypeOf<{ id: number }>()
	void Link({ to: "_root_/imported/[id]", params: { id: 1 }, search: { tab: "a" }, children: "x" })
	// @ts-expect-error the bracket string is gone
	void Link({ to: "_root_/imported/[id]", params: { id: "1" }, search: { tab: "a" }, children: "x" })
})

it(".input({ searchParams }) on that file", () => {
	expectTypeOf(useSearch({ from: "_root_/search" })).toEqualTypeOf<{ q: string; page?: number }>()
	void createPage("_root_/search")
		.input({ searchParams: (raw: Raw) => ({ q: String(raw["q"]) }) })
		.render((props) => {
			expectTypeOf(props.search).toEqualTypeOf<{ q: string }>()
			return null
		})
})

it("no search validator on that file", () => {
	expectTypeOf(useSearch({ from: "_root_/about" })).toEqualTypeOf<Raw>()
	expectTypeOf(useLocation().search).toEqualTypeOf<Raw>()
	void Link({ to: "_root_/about", search: { q: ["a", "b"] }, children: "x" })
	void createPage("_root_/about").effects({
		loaderDeps: (ctx) => {
			expectTypeOf(ctx.search).toEqualTypeOf<Raw>()
			return []
		},
		shouldRefetch: (ctx) => {
			expectTypeOf(ctx.search).toEqualTypeOf<Raw>()
			return true
		},
	})
})

it("the loader return", () => {
	expectTypeOf(useLoaderData({ from: "_root_/about" })).toEqualTypeOf<{ title: string }>()
	// `Awaited` of the return, with no JSON reshaping, on render, head, headers, and security.
	void createPage("_root_/about")
		.loader(async () => ({ at: new Date(), big: 1n, seen: new Set<string>(), gone: undefined }))
		.head((ctx) => {
			expectTypeOf(ctx.loaderData.at).toEqualTypeOf<Date>()
			expectTypeOf(ctx.loaderData.big).toEqualTypeOf<bigint>()
			return {}
		})
		.headers((ctx) => {
			expectTypeOf(ctx.loaderData.seen).toEqualTypeOf<Set<string>>()
			return {}
		})
		.security((ctx) => {
			expectTypeOf(ctx.loaderData.gone).toEqualTypeOf<undefined>()
			return {}
		})
		.render((props) => {
			expectTypeOf(props.loaderData.at).toEqualTypeOf<Date>()
			return null
		})
})

it("each preloader return", () => {
	// The root's `requestId`, then the blog layout's role, narrowed by the post's own return.
	expectTypeOf(usePreloaderContext({ from: "_root_/(blog)/post/[slug]" })).toEqualTypeOf<{
		requestId: string
		role: "admin"
	}>()
	void createPage("_root_/(blog)/post/[slug]").loader((ctx) => {
		expectTypeOf(ctx.preloaderContext.role).toEqualTypeOf<"admin" | "editor">()
		return {}
	})
})

it(".authenticate(), .authenticateOptional(), and the parent walk", () => {
	// The blog layout requires auth, so a page under it reads the session, never null.
	void createPage("_root_/(blog)/post/[slug]").loader((ctx) => {
		expectTypeOf(ctx.auth).toEqualTypeOf<{ userId: string }>()
		return {}
	})
	void createPage("_root_/guest")
		.authenticateOptional()
		.preloader((ctx) => {
			expectTypeOf(ctx.auth).toEqualTypeOf<{ userId: string } | null>()
			return {}
		})
	void createLayout("_root_/(blog)")
		.authenticate()
		.authorize((ctx) => {
			expectTypeOf(ctx.auth).toEqualTypeOf<{ userId: string }>()
			return true
		})
})

it("the app's augmentation", () => {
	expectTypeOf(serverCtx()).toEqualTypeOf<{ requestId: string }>()
	void authenticate
	void createPage("_root_/about").loader((ctx) => {
		expectTypeOf(ctx.env).toEqualTypeOf<{ site: string }>()
		return {}
	})
	void createServerFn().handler((ctx) => {
		expectTypeOf(ctx.serverContext).toEqualTypeOf<{ requestId: string }>()
	})
})

it("an import of @lovrozagar/flare/query", () => {
	void createPage("_root_/about")
		.loader((ctx) => {
			expectTypeOf(ctx).toHaveProperty("queryClient")
			return {}
		})
		.render((props) => {
			expectTypeOf(props).not.toHaveProperty("queryClient")
			return null
		})
})

it("typeof the route export", () => {
	// `from` is any key of `routeModules`; `to` is a page id, a `.response()` page included.
	expectTypeOf(useLoaderData({ from: "_root_/(blog)" })).toEqualTypeOf<{ section: string }>()
	void Link({ to: "_root_/raw", children: "x" })
	// @ts-expect-error a layout is not a target
	void Link({ to: "_root_/(blog)", children: "x" })
	// @ts-expect-error an unknown id is not a source
	void useLoaderData({ from: "_root_/nowhere" })
})

// The section's prose: codegen reads only that a chain calls `.input()`, so where its argument comes from does not
// matter; the target-only flags are not generic on the route.
it("graph prose", () => {
	expectTypeOf(useParams({ from: "_root_/made/[id]" }).id).toEqualTypeOf<number>()
	expectTypeOf(useSearch({ from: "_root_/sorted/[id]" })).toHaveProperty("sort")
	void Link({ to: "_root_/about", hash: "top", replace: true, scroll: false, prefetch: "intent", children: "x" })
})
