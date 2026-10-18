// dx/types.md "Matrix", the rows only a hand-written register reaches, through the package entry against the register
// beside this file: it declares no `auth`, `env`, `serverContext`, or `hasQueryClient`, and lists `_root_/gone` as a
// parent with no module. app.test.ts compiles this fixture; vitest never runs it (B96, plan 25 5.2).
import { createPage } from "@lovrozagar/flare"
import { expectTypeOf, it } from "vitest"

it("missing parent", () => {
	void createPage("_root_/child").preloader((ctx) => {
		expectTypeOf(ctx.preloaderContext).toBeNever()
		// @ts-expect-error the context is never, not {}
		expectTypeOf(ctx.preloaderContext).toEqualTypeOf<{}>()
		return {}
	})
})

it("auth unaugmented", () => {
	// With no `auth` augmentation the session is `null`, even under `.authenticate()`.
	void createPage("_root_/child")
		.authenticate()
		.loader((ctx) => {
			expectTypeOf(ctx.auth).toBeNull()
			// @ts-expect-error there is no session field until the app augments `auth`
			void ctx.auth.userId
			return {}
		})
})

it("query client absent", () => {
	void createPage("_root_/child").loader((ctx) => {
		expectTypeOf(ctx).not.toHaveProperty("queryClient")
		// @ts-expect-error the ctx has no queryClient without a query entry import
		void ctx.queryClient
		return { n: 1 }
	})
})
