import { describe, expect, it } from "vitest"
import type { RouteData } from "../../../src/router-primitives/index.ts"
import {
	createTreeNode,
	insertRoute,
	matchRoute,
	matchRoutePartial,
} from "../../../src/router-primitives/index.ts"

function route(virtualPath: string, variablePath: string): RouteData {
	return {
		e: "default",
		o: {},
		p: () => Promise.resolve({ default: null }),
		t: "r",
		v: variablePath,
		x: virtualPath,
	}
}

/* ── caseSensitive mode ──────────────────────────────────────────── */

describe("caseSensitive matching", () => {
	/* Note: insertRoute always lowercases static segments (by design).
	 * caseSensitive only affects matchNode — when true, the URL segment
	 * is NOT lowercased before lookup, so /About won't find the "about" key.
	 * Filesystem-based routes are always lowercase by convention. */

	it("caseSensitive=true: /About does NOT match inserted /about", () => {
		const tree = createTreeNode()
		insertRoute(tree, "/about", route("_root_/about", "/about"))
		expect(matchRoute(tree, "/About", true)).toBeNull()
	})

	it("caseSensitive=true: /about matches inserted /about", () => {
		const tree = createTreeNode()
		const r = route("_root_/about", "/about")
		insertRoute(tree, "/about", r)
		/* insertRoute lowercases to "about", match with "about" (no lowercase) → found */
		expect(matchRoute(tree, "/about", true)?.route).toBe(r)
	})

	it("caseSensitive=false (default): /About matches /about", () => {
		const tree = createTreeNode()
		const r = route("_root_/about", "/about")
		insertRoute(tree, "/about", r)
		expect(matchRoute(tree, "/About")?.route).toBe(r)
	})

	it("caseSensitive=true with params: static segment must be lowercase", () => {
		const tree = createTreeNode()
		const r = route("_root_/users/[id]", "/users/[id]")
		insertRoute(tree, "/users/[id]", r)
		/* caseSensitive=true: /users/JohnDoe matches (static "users" stored lowercase, match lowercase) */
		expect(matchRoute(tree, "/users/JohnDoe", true)?.params).toEqual({ id: "JohnDoe" })
		/* /Users/JohnDoe fails (static "Users" != stored "users") */
		expect(matchRoute(tree, "/Users/JohnDoe", true)).toBeNull()
	})

	it("caseSensitive=false with params: static segment case ignored", () => {
		const tree = createTreeNode()
		const r = route("_root_/users/[id]", "/users/[id]")
		insertRoute(tree, "/users/[id]", r)
		expect(matchRoute(tree, "/Users/JohnDoe")?.params).toEqual({ id: "JohnDoe" })
		expect(matchRoute(tree, "/USERS/JohnDoe")?.params).toEqual({ id: "JohnDoe" })
	})

	it("caseSensitive with matchRoutePartial", () => {
		const tree = createTreeNode()
		const r = route("_root_/products", "/products")
		insertRoute(tree, "/products", r)
		/* caseSensitive=true: /Products/123 tries "Products" which != stored "products" */
		expect(matchRoutePartial(tree, "/Products/123", true)).toBeNull()
		/* /products/123 → "products" matches stored "products" */
		expect(matchRoutePartial(tree, "/products/123", true)?.route).toBe(r)
	})

	it("caseSensitive with nested lowercase paths", () => {
		const tree = createTreeNode()
		const r = route("_root_/api/v2/users", "/api/v2/users")
		insertRoute(tree, "/api/v2/users", r)
		expect(matchRoute(tree, "/api/v2/users", true)?.route).toBe(r)
		expect(matchRoute(tree, "/API/v2/users", true)).toBeNull()
		expect(matchRoute(tree, "/api/V2/users", true)).toBeNull()
	})
})

/* ── Unicode and special characters in URLs ──────────────────────── */

describe("Unicode and special character URLs", () => {
	it("static route with Unicode characters", () => {
		const tree = createTreeNode()
		const r = route("_root_/caf\u00E9", "/caf\u00E9")
		insertRoute(tree, "/caf\u00E9", r)
		expect(matchRoute(tree, "/caf\u00E9")?.route).toBe(r)
	})

	it("param with CJK characters (percent-encoded)", () => {
		const tree = createTreeNode()
		insertRoute(tree, "/users/[name]", route("_root_/users/[name]", "/users/[name]"))
		const result = matchRoute(tree, "/users/%E6%97%A5%E6%9C%AC")
		expect(result?.params).toEqual({ name: "\u65E5\u672C" })
	})

	it("param with emoji (percent-encoded)", () => {
		const tree = createTreeNode()
		insertRoute(tree, "/tags/[tag]", route("_root_/tags/[tag]", "/tags/[tag]"))
		const result = matchRoute(tree, "/tags/%F0%9F%91%8D")
		expect(result?.params).toEqual({ tag: "\uD83D\uDC4D" })
	})

	it("catch-all with mixed encoded/unencoded segments", () => {
		const tree = createTreeNode()
		insertRoute(tree, "/files/[...path]", route("_root_/files/[...path]", "/files/[...path]"))
		const result = matchRoute(tree, "/files/docs/caf%C3%A9/notes")
		expect(result?.params).toEqual({ path: ["docs", "caf\u00E9", "notes"] })
	})

	it("double-encoded segment in param position", () => {
		const tree = createTreeNode()
		insertRoute(tree, "/items/[id]", route("_root_/items/[id]", "/items/[id]"))
		/* %2520 is double-encoded %20 (space) — first decode gives %20 */
		const result = matchRoute(tree, "/items/%2520")
		expect(result?.params).toEqual({ id: "%20" })
	})

	it("param with plus sign (not decoded as space)", () => {
		const tree = createTreeNode()
		insertRoute(tree, "/search/[query]", route("_root_/search/[query]", "/search/[query]"))
		const result = matchRoute(tree, "/search/hello+world")
		/* decodeURIComponent does NOT decode + as space (only query strings do) */
		expect(result?.params).toEqual({ query: "hello+world" })
	})
})

/* ── Empty and degenerate paths ──────────────────────────────────── */

describe("empty and degenerate paths", () => {
	it("multiple consecutive slashes filtered to single segments", () => {
		const tree = createTreeNode()
		const r = route("_root_/a/b", "/a/b")
		insertRoute(tree, "/a/b", r)
		expect(matchRoute(tree, "///a///b///")?.route).toBe(r)
	})

	it("path with only slashes matches root", () => {
		const tree = createTreeNode()
		const r = route("_root_", "/")
		insertRoute(tree, "/", r)
		expect(matchRoute(tree, "///")?.route).toBe(r)
	})

	it("single dot segment treated as literal (not normalized)", () => {
		const tree = createTreeNode()
		insertRoute(tree, "/a/[id]", route("_root_/a/[id]", "/a/[id]"))
		/* "." is treated as a regular segment, captured as param */
		const result = matchRoute(tree, "/a/.")
		expect(result?.params).toEqual({ id: "." })
	})

	it("double dot segment treated as literal param", () => {
		const tree = createTreeNode()
		insertRoute(tree, "/a/[id]", route("_root_/a/[id]", "/a/[id]"))
		/* ".." is treated as a regular segment, NOT parent directory */
		const result = matchRoute(tree, "/a/..")
		expect(result?.params).toEqual({ id: ".." })
	})

	it("empty string matches root if root registered", () => {
		const tree = createTreeNode()
		const r = route("_root_", "/")
		insertRoute(tree, "/", r)
		expect(matchRoute(tree, "")?.route).toBe(r)
	})

	it("very long path with many segments matches catch-all", () => {
		const tree = createTreeNode()
		const r = route("_root_/[...slug]", "/[...slug]")
		insertRoute(tree, "/[...slug]", r)
		const segments = Array.from({ length: 100 }, (_, i) => `seg${i}`)
		const result = matchRoute(tree, `/${segments.join("/")}`)
		expect(result?.params.slug).toHaveLength(100)
	})
})

/* ── Param backtracking ──────────────────────────────────────────── */

describe("param backtracking", () => {
	it("static match preferred over param when both could match", () => {
		const tree = createTreeNode()
		const staticR = route("_root_/users/me", "/users/me")
		const paramR = route("_root_/users/[id]", "/users/[id]")
		insertRoute(tree, "/users/me", staticR)
		insertRoute(tree, "/users/[id]", paramR)
		expect(matchRoute(tree, "/users/me")?.route).toBe(staticR)
		expect(matchRoute(tree, "/users/other")?.route).toBe(paramR)
	})

	it("backtrack from static dead end to param", () => {
		const tree = createTreeNode()
		/* /users/admin/dashboard exists */
		const dashboard = route("_root_/users/admin/dashboard", "/users/admin/dashboard")
		insertRoute(tree, "/users/admin/dashboard", dashboard)
		/* /users/[id]/profile exists */
		const profile = route("_root_/users/[id]/profile", "/users/[id]/profile")
		insertRoute(tree, "/users/[id]/profile", profile)

		/* /users/admin/profile: tries static "admin" first, no "profile" child,
		 * backtracks to param [id], finds profile */
		const result = matchRoute(tree, "/users/admin/profile")
		expect(result?.route).toBe(profile)
		expect(result?.params).toEqual({ id: "admin" })
	})

	it("backtrack cleans up params from failed branch", () => {
		const tree = createTreeNode()
		/* /[category]/[id]/details exists */
		const details = route("_root_/[category]/[id]/details", "/[category]/[id]/details")
		insertRoute(tree, "/[category]/[id]/details", details)
		/* /[category]/static-page exists */
		const staticPage = route("_root_/[category]/static-page", "/[category]/static-page")
		insertRoute(tree, "/[category]/static-page", staticPage)

		/* /electronics/static-page: param [category]=electronics, then static-page wins */
		const result = matchRoute(tree, "/electronics/static-page")
		expect(result?.route).toBe(staticPage)
		expect(result?.params).toEqual({ category: "electronics" })
		/* [id] should NOT be in params (cleaned up after backtrack) */
		expect("id" in (result?.params ?? {})).toBe(false)
	})
})

/* ── Optional catch-all edge cases ───────────────────────────────── */

describe("optional catch-all edge cases", () => {
	it("optional catch-all at terminal matches without segments", () => {
		const tree = createTreeNode()
		const r = route("_root_/docs/[[...slug]]", "/docs/[[...slug]]")
		insertRoute(tree, "/docs/[[...slug]]", r)
		const result = matchRoute(tree, "/docs")
		expect(result?.params).toEqual({ slug: [] })
	})

	it("optional catch-all takes precedence over missing route at terminal", () => {
		const tree = createTreeNode()
		/* No /docs route, only /docs/[[...slug]] */
		const r = route("_root_/docs/[[...slug]]", "/docs/[[...slug]]")
		insertRoute(tree, "/docs/[[...slug]]", r)
		/* /docs should match via optional catch-all with empty segments */
		expect(matchRoute(tree, "/docs")?.route).toBe(r)
	})

	it("optional catch-all with excess segments post-terminal", () => {
		const tree = createTreeNode()
		const r = route("_root_/[[...slug]]", "/[[...slug]]")
		insertRoute(tree, "/[[...slug]]", r)
		const result = matchRoute(tree, "/a/b/c/d/e")
		expect(result?.params).toEqual({ slug: ["a", "b", "c", "d", "e"] })
	})

	it("regular catch-all requires at least one segment", () => {
		const tree = createTreeNode()
		const opt = route("_root_/docs/[[...opt]]", "/docs/[[...opt]]")
		const req = route("_root_/files/[...req]", "/files/[...req]")
		insertRoute(tree, "/docs/[[...opt]]", opt)
		insertRoute(tree, "/files/[...req]", req)

		/* Optional: /docs matches with empty array */
		expect(matchRoute(tree, "/docs")?.route).toBe(opt)
		/* Required: /files does NOT match (no segments after /files) */
		expect(matchRoute(tree, "/files")).toBeNull()
	})
})

/* ── matchRoutePartial edge cases ────────────────────────────────── */

describe("matchRoutePartial edge cases", () => {
	it("single-segment path only tries root", () => {
		const tree = createTreeNode()
		const root = route("_root_", "/")
		insertRoute(tree, "/", root)
		insertRoute(tree, "/about", route("_root_/about", "/about"))
		/* /unknown has 1 segment, loop starts at len-1=0, skips loop, tries root */
		const result = matchRoutePartial(tree, "/unknown")
		expect(result?.route).toBe(root)
	})

	it("catches param route as prefix", () => {
		const tree = createTreeNode()
		const users = route("_root_/users/[id]", "/users/[id]")
		insertRoute(tree, "/users/[id]", users)
		/* /users/42/posts/1 → tries /users/42/posts, /users/42, /users, / */
		const result = matchRoutePartial(tree, "/users/42/posts/1")
		expect(result?.route).toBe(users)
		expect(result?.params).toEqual({ id: "42" })
	})

	it("empty tree returns null for any path", () => {
		const tree = createTreeNode()
		expect(matchRoutePartial(tree, "/a/b/c")).toBeNull()
	})

	it("root-only tree always returns root for multi-segment", () => {
		const tree = createTreeNode()
		const root = route("_root_", "/")
		insertRoute(tree, "/", root)
		expect(matchRoutePartial(tree, "/a/b/c/d/e")?.route).toBe(root)
	})

	it("with catch-all at deeper prefix", () => {
		const tree = createTreeNode()
		const docs = route("_root_/docs/[...slug]", "/docs/[...slug]")
		insertRoute(tree, "/docs/[...slug]", docs)
		/* /docs/a/b/c/nonexistent → first tries /docs/a/b/c,
		 * catch-all matches there! So partial returns catch-all match */
		const result = matchRoutePartial(tree, "/docs/a/b/c/nonexistent")
		expect(result?.route).toBe(docs)
	})
})

/* ── Tree structure edge cases ───────────────────────────────────── */

describe("tree structure edge cases", () => {
	it("inserting overlapping param and catch-all at same level", () => {
		const tree = createTreeNode()
		const paramR = route("_root_/[id]", "/[id]")
		const catchAllR = route("_root_/[...slug]", "/[...slug]")
		insertRoute(tree, "/[id]", paramR)
		insertRoute(tree, "/[...slug]", catchAllR)

		/* Single segment: param wins (tried first) */
		expect(matchRoute(tree, "/abc")?.route).toBe(paramR)
		/* Multiple segments: only catch-all can handle */
		expect(matchRoute(tree, "/a/b/c")?.route).toBe(catchAllR)
	})

	it("null-prototype static map prevents prototype pollution", () => {
		const tree = createTreeNode()
		/* Ensure Object.create(null) is used — no inherited properties */
		expect(Object.getPrototypeOf(tree.s)).toBeNull()
		/* toString, constructor etc are not accessible */
		expect(tree.s["toString"]).toBeUndefined()
		expect(tree.s["constructor"]).toBeUndefined()
		expect(tree.s["__proto__"]).toBeUndefined()
	})

	it("route at intermediate node + route at leaf", () => {
		const tree = createTreeNode()
		const docs = route("_root_/docs", "/docs")
		const docsGuide = route("_root_/docs/guide", "/docs/guide")
		insertRoute(tree, "/docs", docs)
		insertRoute(tree, "/docs/guide", docsGuide)

		expect(matchRoute(tree, "/docs")?.route).toBe(docs)
		expect(matchRoute(tree, "/docs/guide")?.route).toBe(docsGuide)
	})

	it("deep nesting: 10 levels of static segments", () => {
		const tree = createTreeNode()
		const path = "/a/b/c/d/e/f/g/h/i/j"
		const r = route("deep", path)
		insertRoute(tree, path, r)
		expect(matchRoute(tree, path)?.route).toBe(r)
		/* Partial paths should not match */
		expect(matchRoute(tree, "/a/b/c/d/e")).toBeNull()
	})
})

/* ── malformed URL edge cases ────────────────────────────────────── */

describe("malformed URL edge cases", () => {
	it("percent-encoded slash in param (%2F) treated as single segment value", () => {
		const tree = createTreeNode()
		insertRoute(tree, "/items/[id]", route("_root_/items/[id]", "/items/[id]"))
		/* %2F is decoded to "/" by decodeURIComponent, but the segment splitting
		 * happens BEFORE decoding. So /items/a%2Fb has segments ["items", "a%2Fb"] */
		const result = matchRoute(tree, "/items/a%2Fb")
		expect(result?.params).toEqual({ id: "a/b" })
	})

	it("bare percent at end of param value fails gracefully", () => {
		const tree = createTreeNode()
		insertRoute(tree, "/p/[id]", route("_root_/p/[id]", "/p/[id]"))
		/* % at end is malformed percent encoding */
		expect(matchRoute(tree, "/p/abc%")).toBeNull()
	})

	it("null bytes in URL segment", () => {
		const tree = createTreeNode()
		insertRoute(tree, "/p/[id]", route("_root_/p/[id]", "/p/[id]"))
		/* %00 decodes to null byte — should still match as valid param */
		const result = matchRoute(tree, "/p/%00")
		expect(result?.params).toEqual({ id: "\0" })
	})

	it("extremely long segment in param position", () => {
		const tree = createTreeNode()
		insertRoute(tree, "/p/[id]", route("_root_/p/[id]", "/p/[id]"))
		const longStr = "x".repeat(10_000)
		const result = matchRoute(tree, `/p/${longStr}`)
		expect(result?.params).toEqual({ id: longStr })
	})
})
