// dx/types.md "Matrix", the loader and preloader rows from `loader deep` through `root preloader`, through the package
// entries against the register codegen wrote for this app. The `missing parent` row is in the hand-written fixture's
// matrix.types.ts. app.test.ts compiles this file; vitest never runs it (B96, plan 25 5.2).
import { createPage, createRootLayout, useLoaderData, usePreloaderContext } from "@lovrozagar/flare"
import { expectTypeOf, it } from "vitest"

it("loader deep", () => {
	const data = useLoaderData({ from: "_root_/users/[id]" })
	expectTypeOf(data.user.name).toEqualTypeOf<string>()
	// @ts-expect-error age is not on the loader data
	void data.user.age
	// @ts-expect-error neither is a top-level field
	void data.missing
})

it("loader primitive", () => {
	void createPage("_root_/static")
		.loader(() => ({ n: 1 }))
		.render((props) => {
			expectTypeOf(props.loaderData).toEqualTypeOf<{ n: number }>()
			return null
		})
	// @ts-expect-error a loader returns an object, not a string
	void createPage("_root_/static").loader(() => "text")
	// @ts-expect-error a loader returns an object, not a number
	void createPage("_root_/static").loader(() => 1)
})

it("loader awaited", () => {
	void createPage("_root_/static")
		.loader(async () => ({ n: 1 }))
		.render((props) => {
			expectTypeOf(props.loaderData).toEqualTypeOf<{ n: number }>()
			// @ts-expect-error the Promise is unwrapped
			const _promise: Promise<{ n: number }> = props.loaderData
			return null
		})
})

it("loader absent", () => {
	void createPage("_root_/static").render((props) => {
		expectTypeOf(props.loaderData).toBeVoid()
		// @ts-expect-error there is no field without a loader
		void props.loaderData.title
		return null
	})
	expectTypeOf(useLoaderData({ from: "_root_/static" })).toBeVoid()
})

it("loader void", () => {
	void createPage("_root_/static")
		.loader(() => {})
		.render((props) => {
			expectTypeOf(props.loaderData).toBeVoid()
			return null
		})
	void createPage("_root_/static")
		.loader(async () => {})
		.render((props) => {
			expectTypeOf(props.loaderData).toBeVoid()
			return null
		})
	void createPage("_root_/static")
		.loader(() => undefined)
		.render((props) => {
			expectTypeOf(props.loaderData).toEqualTypeOf<undefined>()
			return null
		})
	// @ts-expect-error a loader that returns a number is not a void loader
	void createPage("_root_/static").loader(() => 1)
})

it("parent loader hidden", () => {
	expectTypeOf(useLoaderData({ from: "_root_/(blog)/post/[slug]" }).title).toEqualTypeOf<string>()
	// @ts-expect-error the layout's field is a second call with its own id
	void useLoaderData({ from: "_root_/(blog)/post/[slug]" }).section
})

it("layout data", () => {
	expectTypeOf(useLoaderData({ from: "_root_/(blog)" }).section).toEqualTypeOf<string>()
	// @ts-expect-error the page's field is not on the layout
	void useLoaderData({ from: "_root_/(blog)" }).title
})

it("preloader accumulate", () => {
	void createPage("_root_/(blog)/post/[slug]")
		.preloader((): { n: 1 } => ({ n: 1 }))
		.render((props) => {
			expectTypeOf(props.preloaderContext).toEqualTypeOf<{ requestId: string; role: "admin" | "editor"; n: 1 }>()
			// @ts-expect-error a parent key is not erased
			const _missing: typeof props.preloaderContext = { role: "admin", n: 1 }
			return null
		})
	const context = usePreloaderContext({ from: "_root_/(blog)/post/[slug]" })
	expectTypeOf(context.requestId).toEqualTypeOf<string>()
	expectTypeOf(context.role).toEqualTypeOf<"admin">()
})

it("preloader narrow", () => {
	void createPage("_root_/(blog)/post/[slug]")
		.preloader((): { role: "admin" } => ({ role: "admin" }))
		.loader((ctx) => {
			expectTypeOf(ctx.preloaderContext.role).toEqualTypeOf<"admin">()
			// @ts-expect-error the wider parent member does not survive
			const _editor: typeof ctx.preloaderContext.role = "editor"
			return {}
		})
})

it("preloader clash", () => {
	void createPage("_root_/(blog)/viewer")
		.preloader((): { role: "viewer" } => ({ role: "viewer" }))
		.loader((ctx) => {
			expectTypeOf(ctx.preloaderContext.role).toBeNever()
			expectTypeOf(ctx.preloaderContext.requestId).toEqualTypeOf<string>()
			// @ts-expect-error the clashing key is never, so no value is assignable
			const _role: typeof ctx.preloaderContext.role = "viewer"
			return {}
		})
})

it("preloader empty keeps", () => {
	void createPage("_root_/about")
		.preloader((): {} => ({}))
		.loader((ctx) => {
			expectTypeOf(ctx.preloaderContext).toEqualTypeOf<{ requestId: string }>()
			// @ts-expect-error requestId is not erased by an empty own return
			expectTypeOf(ctx.preloaderContext).toEqualTypeOf<{}>()
			return {}
		})
})

it("preloader parents only", () => {
	void createPage("_root_/(blog)/post/[slug]")
		.authorize((ctx) => {
			expectTypeOf(ctx.preloaderContext).toEqualTypeOf<{ requestId: string; role: "admin" | "editor" }>()
			// @ts-expect-error the route's own n is not in authorize's context
			void ctx.preloaderContext.n
			return true
		})
		.preloader((ctx) => {
			expectTypeOf(ctx.preloaderContext).toEqualTypeOf<{ requestId: string; role: "admin" | "editor" }>()
			// @ts-expect-error the route's own n is not in its preloader's context
			void ctx.preloaderContext.n
			return { n: 1 }
		})
})

it("root preloader", () => {
	void createRootLayout("_root_")
		.preloader((ctx) => {
			expectTypeOf(ctx).not.toHaveProperty("preloaderContext")
			// @ts-expect-error the root preloader has no context
			void ctx.preloaderContext
			return { requestId: "r" }
		})
		.loader((ctx) => {
			const requestId: string = ctx.preloaderContext.requestId
			// @ts-expect-error a root has no parent key
			void ctx.preloaderContext.role
			return { requestId }
		})
})
