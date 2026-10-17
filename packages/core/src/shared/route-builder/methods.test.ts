import { expect, it } from "vitest"
import { CROSS_ORIGIN_RULE, crossOriginRefused, isMethodList, METHODS_RULE } from "./methods.ts"

// A `.response()` page's methods: a non-empty list of the methods it may declare, each once, uppercase. HEAD follows
// GET and is not declared (plan 21 13.5, BUGS.md 208).
it("method list", () => {
	for (const list of [["GET"], ["POST", "PUT", "PATCH", "DELETE", "OPTIONS"]]) expect(isMethodList(list)).toBe(true)
	for (const list of [[], ["get"], ["HEAD"], ["GET", "GET"], [1], "GET", undefined]) {
		expect([list, isMethodList(list)]).toEqual([list, false])
	}
	expect(METHODS_RULE).toContain("each once")
})

// A route may drop its Origin check only when it answers a method besides GET and OPTIONS and its chain carries no
// identity (B44, BUGS.md 273).
it("cross origin rule", () => {
	expect(crossOriginRefused(["POST"], false)).toBe(false)
	expect(crossOriginRefused(["GET", "PUT"], false)).toBe(false)
	expect(crossOriginRefused(["POST"], true)).toBe(true)
	expect(crossOriginRefused(undefined, false)).toBe(true)
	expect(crossOriginRefused(["GET", "OPTIONS"], false)).toBe(true)
	expect(CROSS_ORIGIN_RULE).toContain("its handler")
})
