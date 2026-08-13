import { describe, expect, it } from "vitest"
import { buildLocation } from "../../../src/router-primitives/index.ts"

describe("buildLocation", () => {
	it("builds from URL with defaults", () => {
		const url = new URL("http://x.com/products/1?tab=info#top")
		const loc = buildLocation(url, { id: "1" }, "_root_/products/[id]", "/products/[id]")
		expect(loc.pathname).toBe("/products/1")
		expect(loc.params).toEqual({ id: "1" })
		expect(loc.search).toEqual({ tab: "info" })
		expect(loc.hash).toBe("#top")
		expect(loc.virtualPath).toBe("_root_/products/[id]")
		expect(loc.variablePath).toBe("/products/[id]")
		expect(loc.url).toBe(url)
	})

	it("uses provided search over URL searchParams", () => {
		const url = new URL("http://x.com/about?ignored=true")
		const loc = buildLocation(url, {}, "_root_/about", "/about", { custom: "search" })
		expect(loc.search).toEqual({ custom: "search" })
	})

	it("uses provided hash over url.hash", () => {
		const url = new URL("http://x.com/about#ignored")
		const loc = buildLocation(url, {}, "_root_/about", "/about", undefined, "override")
		expect(loc.hash).toBe("override")
	})

	it("defaults search from empty searchParams", () => {
		const url = new URL("http://x.com/about")
		const loc = buildLocation(url, {}, "_root_/about", "/about")
		expect(loc.search).toEqual({})
	})

	it("defaults hash from url with no hash", () => {
		const url = new URL("http://x.com/about")
		const loc = buildLocation(url, {}, "_root_/about", "/about")
		expect(loc.hash).toBe("")
	})

	it("multi-value searchParams preserves all values", () => {
		const url = new URL("http://x.com/about?a=1&a=2")
		const loc = buildLocation(url, {}, "_root_/about", "/about")
		expect(loc.search).toEqual({ a: ["1", "2"] })
	})

	it("preserves catch-all params", () => {
		const url = new URL("http://x.com/docs/a/b/c")
		const loc = buildLocation(
			url,
			{ slug: ["a", "b", "c"] },
			"_root_/docs/[...slug]",
			"/docs/[...slug]",
		)
		expect(loc.params).toEqual({ slug: ["a", "b", "c"] })
	})
})
