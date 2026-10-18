// dx/types.md "Matrix", rows 81 to 98 and the prose under the table, through the package entries against the register
// codegen wrote for this app. app.test.ts compiles this file; vitest never runs it (plan 25 5.2).
import { createPage, createPathSegment, redirect, type FlareRegister } from "@lovrozagar/flare"
import type { JSX } from "@solidjs/web"
import { expectTypeOf, it } from "vitest"

type Raw = Record<string, string | string[]>
type Keys<T> = keyof T
type Parent = FlareRegister["routeParents"][keyof FlareRegister["routeParents"]][number]

// Validators and callbacks that capture nothing sit at module scope (lint consistent-function-scoping).
function userParams(raw: Raw): { id: number } {
	return { id: Number(raw["id"]) }
}

function slugParams(raw: Raw): { slug: number } {
	return { slug: Number(raw["slug"]) }
}

function pageSearch(raw: Raw): { page: number } {
	return { page: Number(raw["page"]) }
}

const nothing = (): null => null
const preload = () => ({ n: 1 })
const load = () => ({ title: "post" })
function badHeaders() {
	return { "x-count": 1 }
}

// A validated param and search under the blog layout, so the layout's preloader and loader are on its path.
function post() {
	return createPage("_root_/(blog)/post/[slug]")
		.input({ params: slugParams, searchParams: pageSearch })
		.preloader(preload)
		.loader(load)
}

// A page with a validated param and search, and no parent loader of its own.
function user() {
	return createPage("_root_/users/[id]").input({ params: userParams, searchParams: pageSearch })
}

it("head loader", () => {
	void post().head((ctx) => {
		expectTypeOf(ctx.params).toEqualTypeOf<{ slug: number }>()
		expectTypeOf(ctx.search).toEqualTypeOf<{ page: number }>()
		expectTypeOf(ctx.loaderData).toEqualTypeOf<{ title: string }>()
		expectTypeOf<Keys<typeof ctx.preloaderContext>>().toEqualTypeOf<"requestId" | "role" | "n">()
		// @ts-expect-error the head reads no auth
		void ctx.auth
		// @ts-expect-error the layout's loader data is not the page's
		void ctx.loaderData.section
		// @ts-expect-error there is no parent head to read
		void ctx.parentHead
		return {}
	})
})

it("headers record", () => {
	// @ts-expect-error a header value is a string, a list of strings, or undefined
	void post().headers(badHeaders)
	void post().headers((ctx) => {
		expectTypeOf<Keys<typeof ctx>>().toEqualTypeOf<"params" | "search" | "loaderData" | "preloaderContext">()
		// @ts-expect-error there are no parent headers to keep
		void ctx.parentHeaders
		// @ts-expect-error the headers read no auth
		void ctx.auth
		return { "x-a": ["a", "b"], "x-b": undefined, "x-c": "c" }
	})
})

it("security no nonce", () => {
	void post().security((ctx) => {
		expectTypeOf<Keys<typeof ctx>>().toEqualTypeOf<"params" | "search" | "loaderData" | "preloaderContext">()
		// @ts-expect-error the policy sets the nonce, so the callback has none
		void ctx.nonce
		return { "Content-Security-Policy": "default-src 'self'" }
	})
})

it("loader deps raw", () => {
	void user().effects({
		loaderDeps: (ctx) => {
			expectTypeOf(ctx.search).toEqualTypeOf<Raw>()
			expectTypeOf(ctx.params).toEqualTypeOf<Raw>()
			// @ts-expect-error the raw search holds strings, not the validator's number
			const _page: number = ctx.search["page"]
			return [ctx.search["page"]]
		},
	})
})

it("should refetch raw", () => {
	void user().effects({
		shouldRefetch: (ctx) => {
			expectTypeOf(ctx.search).toEqualTypeOf<Raw>()
			expectTypeOf(ctx.location.current.search).toEqualTypeOf<string>()
			// @ts-expect-error the raw search is not the validator output
			const _page: number = ctx.search["page"]
			return ctx.location.current.search.length > 0
		},
	})
})

it("error boundary", () => {
	void user()
		.render(nothing)
		.errorRender((props) => {
			expectTypeOf(props.error).toEqualTypeOf<Error>()
			expectTypeOf(props.params).toEqualTypeOf<{ id: number }>()
			expectTypeOf(props.search).toEqualTypeOf<{ page: number }>()
			expectTypeOf(props.reset).toEqualTypeOf<() => void>()
			// @ts-expect-error the error is an Error, not a string
			const _message: string = props.error
			// @ts-expect-error the error boundary has no auth
			void props.auth
			return null
		})
})

it("not found boundary", () => {
	void user()
		.render(nothing)
		.notFoundRender((props) => {
			expectTypeOf(props.params).toEqualTypeOf<{ id: number }>()
			expectTypeOf(props.search).toEqualTypeOf<{ page: number }>()
			// @ts-expect-error a not-found boundary gets no error
			void props.error
			return null
		})
})

it("auth boundary", () => {
	void user()
		.render(nothing)
		.unauthenticatedRender((props) => {
			expectTypeOf(props.error).toEqualTypeOf<Error>()
			// @ts-expect-error the auth boundary gets no reset
			void props.reset
			return null
		})
})

it("method order", () => {
	void createPage("_root_/about")
		.loader(load)
		// @ts-expect-error `.cache()` runs before `.loader()`, so the loader removes it from the type
		.cache({ cdn: { maxAge: "1m" } })
})

it("boundary remains", () => {
	const once = createPage("_root_/about").render(nothing).errorRender(nothing)
	expectTypeOf(once).toHaveProperty("notFoundRender")
	// @ts-expect-error the error boundary is set once
	void once.errorRender(nothing)
})

it("boundaries done", () => {
	const done = createPage("_root_/about")
		.render(nothing)
		.errorRender(nothing)
		.notFoundRender(nothing)
		.unauthenticatedRender(nothing)
		.unauthorizedRender(nothing)
	// @ts-expect-error every boundary is set, so none remains
	void done.errorRender(nothing)
	// @ts-expect-error every boundary is set, so none remains
	void done.notFoundRender(nothing)
	// @ts-expect-error every boundary is set, so none remains
	void done.unauthenticatedRender(nothing)
	// @ts-expect-error every boundary is set, so none remains
	void done.unauthorizedRender(nothing)
})

it("intercept remains", () => {
	const intercepted = createPage("_root_/about").intercept({ from: ["_root_/about"], render: "modal" })
	expectTypeOf(intercepted).toHaveProperty("cache")
	// @ts-expect-error the intercept is set once
	void intercepted.intercept({ from: ["_root_/about"], render: "again" })
})

it("segment no data", () => {
	const seg = createPathSegment("_root_/seg")
	expectTypeOf(seg._type).toEqualTypeOf<"segment">()
	expectTypeOf<Parameters<typeof seg.render>[0]>().toEqualTypeOf<{ children?: JSX.Element }>()
	expectTypeOf<FlareRegister["routeModules"]["_root_/seg"]["_type"]>().toEqualTypeOf<"segment">()
	// @ts-expect-error a segment has no loader
	void seg.loader
	// @ts-expect-error a segment has no preloader
	void seg.preloader
	// @ts-expect-error a segment has no authenticate
	void seg.authenticate
	// @ts-expect-error a segment has no input
	void seg.input
	// @ts-expect-error a segment has no head
	void seg.head
})

it("segment parent", () => {
	expectTypeOf<"_root_/seg">().not.toExtend<Parent>()
	// @ts-expect-error a segment id listed as a parent would fail this check
	expectTypeOf<"_root_/seg">().toExtend<Parent>()
})

it("parents closed", () => {
	expectTypeOf<Parent>().toExtend<keyof FlareRegister["routeModules"]>()
	// @ts-expect-error a parent id with no module is not a key of routeModules
	expectTypeOf<"_root_/gone">().toExtend<keyof FlareRegister["routeModules"]>()
})

it("keyed by route id", () => {
	expectTypeOf<"_root_/(blog)">().toExtend<keyof FlareRegister["routeParams"]>()
	expectTypeOf<"_root_/aliased/[id]">().toExtend<keyof FlareRegister["routeSearchParams"]>()
	// @ts-expect-error the post page has no search entry of its own, so it does not carry the layout's output
	type _PostSearch = FlareRegister["routeSearchParams"]["_root_/(blog)/post/[slug]"]
	// @ts-expect-error a public URL is not a key
	type _PublicKey = FlareRegister["routeParams"]["/aliased/[id]"]
})

it("no virtual", () => {
	type Modules = FlareRegister["routeModules"][keyof FlareRegister["routeModules"]]
	expectTypeOf<Modules>().not.toBeAny()
	// @ts-expect-error the app declares no virtual module
	type _Virtual = typeof import("virtual:flare/worker")
})

it("no phantom", () => {
	// The app's augmentation supplies these three fields; the generated register adds none of them.
	expectTypeOf<FlareRegister["auth"]>().toEqualTypeOf<{ userId: string }>()
	expectTypeOf<FlareRegister["env"]>().toEqualTypeOf<{ site: string }>()
	expectTypeOf<FlareRegister["serverContext"]>().toEqualTypeOf<{ requestId: string }>()
	expectTypeOf<FlareRegister>().not.toHaveProperty("~flare")
	// @ts-expect-error the `~flare` field is not written
	type _Phantom = FlareRegister["~flare"]
})

it("matrix prose", () => {
	// `redirect()` returns `never`.
	expectTypeOf(redirect).returns.toBeNever()
	// `to` on `redirect` follows the matrix: a page id is legal, and a route with a bracket param needs its params.
	void redirect({ to: "_root_/about" })
	// @ts-expect-error the route `_root_/users/[id]` needs its params
	void redirect({ to: "_root_/users/[id]" })
	// @ts-expect-error `nope` is not a route id
	void redirect({ to: "nope" })
	// The `href` form takes any string.
	void redirect({ href: "/relative" })
	// @ts-expect-error the `href` form rejects `params`
	void redirect({ href: "https://example.com", params: {} })
	// @ts-expect-error the `href` form rejects `search`
	void redirect({ href: "https://example.com", search: {} })
	// @ts-expect-error the `href` form rejects `to`
	void redirect({ href: "https://example.com", to: "_root_/about" })
	// @ts-expect-error the `href` form rejects `hash`
	void redirect({ href: "https://example.com", hash: "top" })
})
