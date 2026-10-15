import { expect, it } from "vitest"
import { classify, isServerFn } from "./classify.ts"

it("no param is a document", () => {
	expect(classify(new URL("http://localhost/"), "/")).toMatchObject({ status: 200, kind: "document" })
})

it("server fn path", () => {
	const url = new URL("http://localhost/_flare/fn/abc?_i=1&_flare=data")
	expect(classify(url, "/")).toEqual({ status: 200, kind: "document", url, stale: null })
	expect(isServerFn(url, "/")).toBe(true)
	expect(isServerFn(new URL("http://localhost/_flare/other"), "/")).toBe(false)
	expect(isServerFn(new URL("http://localhost/app/_flare/fn/abc"), "/app")).toBe(true)
	expect(isServerFn(url, "/app")).toBe(false)
})

it("data", () => {
	expect(classify(new URL("http://localhost/?_flare=data"), "/")).toMatchObject({ status: 200, kind: "data" })
})

it("prefetch", () => {
	expect(classify(new URL("http://localhost/?_flare=prefetch"), "/")).toMatchObject({ status: 200, kind: "prefetch" })
})

// The request that fills a stored page's `"stream"` holes is its own kind and its own URL (dx/defer.md).
it("fill kind", () => {
	expect(classify(new URL("http://localhost/?_flare=fill"), "/")).toMatchObject({ status: 200, kind: "fill" })
})
