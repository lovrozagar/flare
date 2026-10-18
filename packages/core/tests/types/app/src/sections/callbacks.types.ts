// dx/types.md "What each callback receives", one case per callback, through the package entries against the register
// codegen wrote for this app. app.test.ts compiles this file; vitest never runs it (B96, plan 25 5.2).
import { createLayout, createPage, createPathSegment, createRootLayout } from "@lovrozagar/flare"
import { createServerFn } from "@lovrozagar/flare/server-fn"
import type { JSX } from "@solidjs/web"
import { expectTypeOf, it } from "vitest"

type Raw = Record<string, string | string[]>
type Keys<T> = keyof T

// Validators receive the raw values; later callbacks see the output.
it("callbacks prose", () => {
	void createPage("_root_/users/[id]")
		.input({
			params: (raw) => {
				expectTypeOf(raw).toEqualTypeOf<Raw>()
				return { id: Number(raw["id"]) }
			},
			searchParams: (raw) => {
				expectTypeOf(raw).toEqualTypeOf<Raw>()
				return { q: String(raw["q"]) }
			},
		})
		.loader((ctx) => {
			expectTypeOf(ctx.params).toEqualTypeOf<{ id: number }>()
			return {}
		})
		.render((props) => {
			// Render receives no `env` and no `serverContext`.
			expectTypeOf(props).not.toHaveProperty("env")
			return null
		})
})

it("authorize", () => {
	void createPage("_root_/about").authorize((ctx) => {
		expectTypeOf<Keys<typeof ctx>>().toEqualTypeOf<
			"auth" | "params" | "search" | "preloaderContext" | "env" | "request"
		>()
		expectTypeOf(ctx.preloaderContext).toEqualTypeOf<{ requestId: string }>()
		return true
	})
	void createRootLayout("_root_").authorize((ctx) => {
		expectTypeOf(ctx).not.toHaveProperty("preloaderContext")
		return true
	})
})

it("preloader", () => {
	void createPage("_root_/about").preloader((ctx) => {
		expectTypeOf<Keys<typeof ctx>>().toEqualTypeOf<
			"auth" | "params" | "search" | "preloaderContext" | "env" | "request"
		>()
		return { own: 1 }
	})
})

it("loader", () => {
	void createPage("_root_/about").loader((ctx) => {
		expectTypeOf<Keys<typeof ctx>>().toEqualTypeOf<
			"auth" | "params" | "search" | "preloaderContext" | "env" | "request" | "defer" | "queryClient"
		>()
		return {}
	})
})

it(".response()", () => {
	void createPage("_root_/about")
		.preloader(() => ({ own: 1 }))
		.response((ctx) => {
			expectTypeOf<Keys<typeof ctx>>().toEqualTypeOf<
				"auth" | "params" | "search" | "preloaderContext" | "env" | "request"
			>()
			expectTypeOf(ctx.preloaderContext.own).toEqualTypeOf<number>()
			return new Response()
		})
})

it("head", () => {
	void createPage("_root_/about").head((ctx) => {
		expectTypeOf<Keys<typeof ctx>>().toEqualTypeOf<"params" | "search" | "loaderData" | "preloaderContext">()
		expectTypeOf(ctx.loaderData).toEqualTypeOf<void>()
		return {}
	})
})

it("headers", () => {
	void createPage("_root_/about").headers((ctx) => {
		expectTypeOf<Keys<typeof ctx>>().toEqualTypeOf<"params" | "search" | "loaderData" | "preloaderContext">()
		return { "x-a": ["1", "2"], "x-b": undefined }
	})
	// @ts-expect-error a header value is a string, a list of strings, or undefined
	void createPage("_root_/about").headers(() => ({ "x-a": 1 }))
})

it("route .security()", () => {
	void createPage("_root_/about").security((ctx) => {
		expectTypeOf<Keys<typeof ctx>>().toEqualTypeOf<"params" | "search" | "loaderData" | "preloaderContext">()
		return {}
	})
})

it("page render", () => {
	void createPage("_root_/about").render((props) => {
		expectTypeOf<Keys<typeof props>>().toEqualTypeOf<"params" | "search" | "loaderData" | "preloaderContext">()
		return null
	})
})

it("layout and root render", () => {
	void createLayout("_root_/(blog)").render((props) => {
		expectTypeOf<Keys<typeof props>>().toEqualTypeOf<
			"params" | "search" | "loaderData" | "preloaderContext" | "children"
		>()
		return props.children
	})
	void createRootLayout("_root_").render((props) => {
		expectTypeOf(props).toHaveProperty("children")
		return props.children
	})
})

it("segment render", () => {
	const segment = createPathSegment("_root_/seg")
	expectTypeOf(segment.render).parameter(0).toEqualTypeOf<{ children?: JSX.Element }>()
})

it("errorRender", () => {
	void createPage("_root_/about")
		.render(() => null)
		.errorRender((props) => {
			expectTypeOf<Keys<typeof props>>().toEqualTypeOf<"error" | "params" | "search" | "reset">()
			expectTypeOf(props.error).toEqualTypeOf<Error>()
			expectTypeOf(props.reset).toEqualTypeOf<() => void>()
			return null
		})
})

it("notFoundRender", () => {
	void createPage("_root_/about")
		.render(() => null)
		.notFoundRender((props) => {
			expectTypeOf<Keys<typeof props>>().toEqualTypeOf<"params" | "search">()
			return null
		})
})

it("unauthenticatedRender, unauthorizedRender", () => {
	void createPage("_root_/about")
		.render(() => null)
		.unauthenticatedRender((props) => {
			expectTypeOf<Keys<typeof props>>().toEqualTypeOf<"error" | "params" | "search">()
			return null
		})
		.unauthorizedRender((props) => {
			expectTypeOf(props.error).toEqualTypeOf<Error>()
			return null
		})
})

it("loaderDeps", () => {
	void createPage("_root_/search").effects({
		loaderDeps: (ctx) => {
			expectTypeOf(ctx).toEqualTypeOf<{ search: Raw; params: Raw }>()
			return []
		},
	})
})

it("shouldRefetch", () => {
	void createPage("_root_/about").effects({
		shouldRefetch: (ctx) => {
			expectTypeOf<Keys<typeof ctx>>().toEqualTypeOf<"trigger" | "location" | "params" | "search">()
			// A place carries the raw query string, the top level the raw record.
			expectTypeOf(ctx.location.next.search).toEqualTypeOf<string>()
			expectTypeOf(ctx.search).toEqualTypeOf<Raw>()
			expectTypeOf(ctx.trigger).toEqualTypeOf<"initial" | "navigation" | "revalidation">()
			return true
		},
	})
})

it("server-fn handler", () => {
	void createServerFn().handler((ctx) => {
		expectTypeOf<Keys<typeof ctx>>().toEqualTypeOf<"input" | "auth" | "env" | "request" | "serverContext">()
	})
})

it("server-fn stream", () => {
	void createServerFn().stream(async function* (ctx) {
		expectTypeOf<Keys<typeof ctx>>().toEqualTypeOf<"input" | "auth" | "env" | "request" | "serverContext" | "signal">()
		yield 1
	})
})
