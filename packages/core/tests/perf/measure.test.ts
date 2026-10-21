import { expect, it } from "vitest"
import { dataRequest, HOME, median, stateTag } from "./measure.ts"

// Each side's navigation data request: v1's `_flare=data` query, v0.9.23's headers on the page URL.
it("data request", () => {
	expect(dataRequest("v1", "http://a.test", "/p").url).toBe("http://a.test/p?_flare=data")
	const old = dataRequest("v0", "http://a.test", "/p")
	expect(old.url).toBe("http://a.test/p")
	expect(old.headers.get("flare-data")).toBe("1")
	expect(old.headers.get("accept")).toBe("application/x-ndjson")
})

// The state script's whole tag, in either side's form; none is the empty string.
it("state tag", () => {
	const v1 = '<p>x</p><script id="flare-state" type="application/json">{"a":1}</script><p>y</p>'
	expect(stateTag(v1)).toBe('<script id="flare-state" type="application/json">{"a":1}</script>')
	const v0 = '<script nonce="n">self.flare = {"a":1}</script>'
	expect(stateTag(v0)).toBe(v0)
	expect(stateTag("<p>none</p>")).toBe("")
})

it("median", () => {
	expect(median([3, 1, 2])).toBe(2)
	expect(median([4, 1, 3, 2])).toBe(2.5)
	expect(median([])).toBe(0)
})

// The list page each side serves: v0.9.23's `_root_/index` at /index, v1's home at /.
it("home", () => {
	expect(HOME).toEqual({ v0: "/index", v1: "/" })
})
