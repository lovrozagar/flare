import { expect, it } from "vitest"
import { isMethodList, METHODS_RULE } from "./methods.ts"

// A `.response()` page's methods: a non-empty list of the methods it may declare, each once, uppercase. HEAD follows
// GET and is not declared (plan 21 13.5, BUGS.md 208).
it("method list", () => {
	for (const list of [["GET"], ["POST", "PUT", "PATCH", "DELETE", "OPTIONS"]]) expect(isMethodList(list)).toBe(true)
	for (const list of [[], ["get"], ["HEAD"], ["GET", "GET"], [1], "GET", undefined]) {
		expect([list, isMethodList(list)]).toEqual([list, false])
	}
	expect(METHODS_RULE).toContain("each once")
})
