// dx/types.md "What the app writes", each field when the app omits it, through the package entries against the
// hand-written register beside this file, which declares none of the three. app.test.ts compiles this fixture; vitest
// never runs it (plan 25 5.2).
import { createPage } from "@lovrozagar/flare"
import { serverCtx } from "@lovrozagar/flare/server"
import { expectTypeOf, it } from "vitest"

it("auth", () => {
	// A required route's session is this field: `null` until the app declares it.
	void createPage("_root_/child")
		.authenticate()
		.preloader((ctx) => {
			expectTypeOf(ctx.auth).toBeNull()
			return {}
		})
})

it("env", () => {
	void createPage("_root_/child").loader((ctx) => {
		expectTypeOf(ctx.env).toBeUnknown()
		return {}
	})
})

it("serverContext", () => {
	expectTypeOf(serverCtx()).toEqualTypeOf<Record<string, unknown>>()
})
