import { expect, it } from "vitest"
import { createPicker, pickRoute } from "./rank.ts"

it("static wins", () => {
	expect(pickRoute(["/users/[id]", "/users/new"], "/users/new")).toBe("/users/new")
	expect(pickRoute(["/users/[id]", "/users/new"], "/users/42")).toBe("/users/[id]")
})

it("dynamic wins over optional", () => {
	expect(pickRoute(["/x/[[locale]]", "/x/[id]"], "/x/a")).toBe("/x/[id]")
})

it("dynamic wins over catch-all", () => {
	expect(pickRoute(["/files/[...rest]", "/files/[id]"], "/files/a")).toBe("/files/[id]")
})

it("catch-all wins over optional catch-all", () => {
	expect(pickRoute(["/docs/[[...rest]]", "/docs/[...rest]"], "/docs/a")).toBe("/docs/[...rest]")
	expect(pickRoute(["/docs", "/docs/[[...rest]]"], "/docs")).toBe("/docs")
	expect(pickRoute(["/docs"], "/other")).toBeUndefined()
})

it("leftmost segment decides", () => {
	expect(pickRoute(["/a/[id]/c", "/a/b/[...rest]"], "/a/b/c")).toBe("/a/b/[...rest]")
})

// Rank reads the segment that consumed each path segment. An optional param that consumed nothing does not count.
it("optional absent", () => {
	const patterns = ["/[[locale]]", "/[[locale]]/pricing"]
	expect(pickRoute(patterns, "/pricing")).toBe("/[[locale]]/pricing")
	expect(pickRoute(patterns, "/hr/pricing")).toBe("/[[locale]]/pricing")
	expect(pickRoute(patterns, "/hr")).toBe("/[[locale]]")
	expect(pickRoute(["/[[...rest]]", "/[[locale]]/docs"], "/docs")).toBe("/[[locale]]/docs")
})

// A picker indexes the patterns by their first segment once, so a path is compared only with the patterns whose first
// segment is its own word, any case when matching ignores case, or a param; it picks what pickRoute picks (plan 21
// 15.4).
it("picker", () => {
	const patterns = ["/", "/users/[id]", "/users/new", "/Docs/[[...rest]]", "/[[locale]]/pricing", "/files/[...rest]"]
	const paths = ["/", "/users/new", "/users/7", "/docs/a/b", "/DOCS", "/hr/pricing", "/pricing", "/files/a/b", "/nope"]
	for (const caseSensitive of [false, true]) {
		const pick = createPicker(patterns, { caseSensitive })
		for (const path of paths) expect(pick(path)).toBe(pickRoute(patterns, path, { caseSensitive }))
	}
	const tried: string[] = []
	const pick = createPicker(["/a/[x]", "/b/[y]", "/[z]/c"], { accepts: (name) => (tried.push(name), true) })
	expect(pick("/a/1")).toBe("/a/[x]")
	expect(tried).toEqual(["x", "z"])
})
