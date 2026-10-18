// dx/types.md "Merge", the two rules about a register codegen never writes, through the package entry against the
// hand-written register beside this file. app.test.ts compiles this fixture; vitest never runs it (plan 25 5.2).
import { createPage } from "@lovrozagar/flare"
import { expectTypeOf, it } from "vitest"

it("a missing parent module", () => {
	// The listed parent `_root_/gone` has no module, so the context is `never`, not `{}`.
	void createPage("_root_/child").preloader((ctx) => {
		expectTypeOf(ctx.preloaderContext).toBeNever()
		return {}
	})
})

it("omitted auth", () => {
	// With no `auth` in the register, the session type is `null`, even on `.authenticate()`.
	void createPage("_root_/child")
		.authenticate()
		.loader((ctx) => {
			expectTypeOf(ctx.auth).toBeNull()
			// @ts-expect-error there is no session until the app augments `auth`
			void ctx.auth.userId
			return {}
		})
})
