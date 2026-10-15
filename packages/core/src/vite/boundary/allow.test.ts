import { expect, it } from "vitest"
import { cacheKeyKept, routeMethod } from "./allow.ts"

const KEPT = [
	"render",
	"errorRender",
	"notFoundRender",
	"unauthenticatedRender",
	"unauthorizedRender",
	"intercept",
	"effects",
]

const REMOVED = [
	"loader",
	"preloader",
	"authenticate",
	"authenticateOptional",
	"authorize",
	"headers",
	"head",
	"response",
	"input",
]

it("kept", () => {
	for (const method of KEPT) expect(routeMethod(method)).toBe("keep")
	// `.cache()` stays with its `client` field alone.
	expect(routeMethod("cache")).toBe("cache")
	expect(cacheKeyKept("client")).toBe(true)
})

it("removed", () => {
	for (const method of REMOVED) expect(routeMethod(method)).toBe("remove")
	for (const key of ["ssr", "ssg", "isr", "cdn"]) expect(cacheKeyKept(key)).toBe(false)
	// An unknown chain method has its own verdict, and an inherited object key is not a method.
	expect(routeMethod("middleware")).toBe("unknown")
	expect(routeMethod("constructor")).toBe("unknown")
})

// `.security()` is server policy, so the client graph drops it. Before, it was an unknown method and failed the build.
it("security removed", () => {
	expect(routeMethod("security")).toBe("remove")
})
