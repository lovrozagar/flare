import { expect, it } from "vitest"
import { pickRoute } from "./rank.ts"

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
