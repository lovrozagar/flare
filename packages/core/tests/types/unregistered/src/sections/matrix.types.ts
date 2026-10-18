// dx/types.md "Matrix", row `unregistered fallback`: a fixture with no register file at all, so the package's own
// `FlareRegister` is empty and every route map falls back. app.test.ts compiles this file; vitest never runs it
// (B96, plan 25 5.2).
import { Link, type FlareRegister } from "@lovrozagar/flare"
import { expectTypeOf, it } from "vitest"

it("unregistered fallback", () => {
	// The negative program, the maps typed `any`: the empty register has no map at all.
	expectTypeOf<keyof FlareRegister>().toBeNever()
	// `to` is a plain string, so any id is accepted; `params` are not checked.
	void Link({ to: "_root_/child", children: "x" })
	void Link({ to: "not-a-page", children: "x" })
	void Link({ to: "_root_/child", params: { anything: 1 }, children: "x" })
	// The raw search record holds strings only.
	void Link({ to: "_root_/child", search: { q: "a" }, children: "x" })
	// @ts-expect-error the raw search record holds strings only
	void Link({ to: "_root_/child", search: { q: 1 }, children: "x" })
})
