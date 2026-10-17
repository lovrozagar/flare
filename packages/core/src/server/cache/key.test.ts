import { expect, expectTypeOf, it, vi } from "vitest"
import * as keys from "./key.ts"
import { createPage } from "../../shared/route-builder/page.ts"
import { createRootLayout } from "../../shared/route-builder/root-layout.ts"
import { createRouter } from "../../shared/router/create-router.ts"
import { buildId, routeKey, storeKey, type KeyInput } from "./key.ts"

// The policy class and the search change nothing: the key has no slot for either (B32, B73).

const info = vi.hoisted(() => ({ id: "dev" }))
vi.mock("../lifecycle/build-info.ts", () => ({
	get buildId() {
		return info.id
	},
	clientEntry: undefined,
}))

it("shape", () => {
	expect(storeKey({ build: "b", route: "home", pattern: "/[id]", params: { id: "042" }, class: "anonymous" })).toBe(
		"static:b:home:042",
	)
	expect(storeKey({ build: "b", route: "_root_/about", pattern: "/about", params: {}, class: "anonymous" })).toBe(
		"static:b:_root_/about",
	)
	expectTypeOf<KeyInput>().not.toHaveProperty("search")
	// Route-order values join with `/`.
	expect(
		storeKey({ build: "b", route: "r", pattern: "/[a]/[b]", params: { a: "1", b: "2" }, class: "anonymous" }),
	).toBe("static:b:r:1&2")
})

it("catch all", () => {
	expect(
		storeKey({
			build: "b",
			route: "docs",
			pattern: "/docs/[...path]",
			params: { path: ["a", "b"] },
			class: "anonymous",
		}),
	).toBe("static:b:docs:a/b")
})

it("encode", () => {
	expect(storeKey({ build: "b", route: "r", pattern: "/[id]", params: { id: "a/b%c" }, class: "anonymous" })).toBe(
		"static:b:r:a%2Fb%25c",
	)
	expect(
		storeKey({ build: "b", route: "r", pattern: "/[...path]", params: { path: ["x/y", "z"] }, class: "anonymous" }),
	).toBe("static:b:r:x%2Fy/z")
})

// A required chain is never stored (B27), so it has no key.
it("required", () => {
	expect(() => storeKey({ build: "b", route: "r", pattern: "/", params: {}, class: "required" })).toThrow(/required/)
})

// The framework builds the key. Nothing the module exports takes one from the author (B32): routeKey derives it from a
// route and its params.
it("no callback", () => {
	expect(Object.keys(keys).toSorted()).toEqual(["buildId", "routeKey", "storeKey"])
	expectTypeOf<KeyInput>().not.toHaveProperty("key")
})

// `flare()` writes the build id into build-info.ts. Without the plugin it is `dev` (dx/plugin.md).
it("build id", () => {
	expect(buildId()).toBe("dev")
	info.id = "abc123"
	expect(buildId()).toBe("abc123")
	info.id = "dev"
})

// The order is the route's declared params, never the record's: the matcher builds the record innermost first.
it("route order", () => {
	expect(
		storeKey({ build: "b", route: "r", pattern: "/[a]/[b]", params: { b: "two", a: "one" }, class: "anonymous" }),
	).toBe("static:b:r:one&two")
})

const optionals = (params: Record<string, string | string[] | undefined>): string =>
	storeKey({ build: "b", route: "r", pattern: "/[[a]]/static/[[b]]", params, class: "anonymous" })

// Every declared param keeps its slot. An absent optional, or an undefined value, is the empty string.
it("absent optional", () => {
	expect(optionals({ b: "x" })).toBe("static:b:r:&x")
	expect(optionals({ a: "x" })).toBe("static:b:r:x&")
	expect(optionals({ a: undefined, b: "x" })).toBe("static:b:r:&x")
	expect(optionals({})).toBe("static:b:r:&")
	expect(storeKey({ build: "b", route: "r", pattern: "/[[...rest]]", params: {}, class: "anonymous" })).toBe(
		"static:b:r:",
	)
})

// The key a request stores under, from what buildUrl takes: under a base path and `trailingSlash: "always"` too, with
// an optional param left out, and the raw params percent-encoded as a request's are. A layout id or an id with no page throws (plan 21 4.5).
it("route key", () => {
	const page = createPage("_root_/docs/[[lang]]/[slug]").render(() => "doc")
	const index = createPage("_root_/").render(() => "home")
	const router = createRouter({
		basePath: "/app",
		trailingSlash: "always",
		layouts: { _root_: createRootLayout("_root_").render(() => "root") },
		routeTree: [
			{ id: "_root_/docs/[[lang]]/[slug]", path: "/docs/[[lang]]/[slug]", module: page },
			{ id: "_root_/", path: "/", module: index },
		],
	})
	const docs = "_root_/docs/[[lang]]/[slug]"
	expect(routeKey(router, { to: docs, params: { slug: "a b" } })).toBe(`static:dev:${docs}:&a%2520b`)
	expect(routeKey(router, { to: docs, params: { lang: "hr", slug: "x" } })).toBe(`static:dev:${docs}:hr&x`)
	expect(routeKey(router, { to: "_root_/" })).toBe("static:dev:_root_/")
	expect(() => routeKey(router, { to: "_root_" })).toThrow("cache.key: _root_ is not a page")
	expect(() => routeKey(router, { to: "_root_/missing" })).toThrow("cache.key: _root_/missing is not a page")
})
