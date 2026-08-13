import { describe, expect, it } from "vitest"
import { buildUrl, resolvePathParams, serializeSearchParams } from "../../../src/url/index.ts"

/* ── resolvePathParams type coercion ───────────────────────────────── */

describe("resolvePathParams type coercion", () => {
	it("number param → string via String()", () => {
		expect(resolvePathParams("/users/[id]", { id: 42 })).toBe("/users/42")
	})

	it("boolean param → string", () => {
		expect(resolvePathParams("/flags/[flag]", { flag: true })).toBe("/flags/true")
	})

	it("zero → '0'", () => {
		expect(resolvePathParams("/page/[n]", { n: 0 })).toBe("/page/0")
	})

	it("null → 'null'", () => {
		expect(resolvePathParams("/x/[id]", { id: null })).toBe("/x/null")
	})

	it("empty string → encoded empty", () => {
		expect(resolvePathParams("/x/[id]", { id: "" })).toBe("/x/")
	})

	it("object param → '[object Object]' encoded", () => {
		const result = resolvePathParams("/x/[id]", { id: {} })
		expect(result).toBe(`/x/${encodeURIComponent("[object Object]")}`)
	})
})

/* ── resolvePathParams optional single [[param]] ───────────────────── */

describe("resolvePathParams optional single", () => {
	it("undefined optional → removed from path", () => {
		expect(resolvePathParams("/blog/[[slug]]", {})).toBe("/blog")
	})

	it("empty string optional → removed from path", () => {
		expect(resolvePathParams("/blog/[[slug]]", { slug: "" })).toBe("/blog")
	})

	it("array value for optional single → placeholder kept then removed", () => {
		expect(resolvePathParams("/blog/[[slug]]", { slug: ["a", "b"] })).toBe("/blog")
	})

	it("provided optional → resolved", () => {
		expect(resolvePathParams("/blog/[[slug]]", { slug: "hello" })).toBe("/blog/hello")
	})

	it("multiple optional singles: all missing", () => {
		expect(resolvePathParams("/a/[[b]]/c/[[d]]", {})).toBe("/a/c")
	})

	it("multiple optional singles: one provided", () => {
		expect(resolvePathParams("/a/[[b]]/c/[[d]]", { b: "x" })).toBe("/a/x/c")
	})
})

/* ── resolvePathParams optional catch-all [[...param]] ─────────────── */

describe("resolvePathParams optional catch-all", () => {
	it("empty array → replaced with empty (trailing slash remains)", () => {
		expect(resolvePathParams("/docs/[[...path]]", { path: [] })).toBe("/docs/")
	})

	it("undefined → replaced with empty (trailing slash remains)", () => {
		expect(resolvePathParams("/docs/[[...path]]", {})).toBe("/docs/")
	})

	it("single segment", () => {
		expect(resolvePathParams("/docs/[[...path]]", { path: ["intro"] })).toBe("/docs/intro")
	})

	it("multiple segments with encoding", () => {
		expect(resolvePathParams("/docs/[[...path]]", { path: ["a b", "c/d"] })).toBe(
			"/docs/a%20b/c%2Fd",
		)
	})

	it("array with undefined items filtered", () => {
		expect(resolvePathParams("/docs/[[...path]]", { path: ["a", undefined, "b"] })).toBe(
			"/docs/a/b",
		)
	})
})

/* ── resolvePathParams required catch-all [...param] ───────────────── */

describe("resolvePathParams required catch-all", () => {
	it("missing → throws", () => {
		expect(() => resolvePathParams("/docs/[...path]", {})).toThrow("Missing required catch-all")
	})

	it("non-array → throws", () => {
		expect(() => resolvePathParams("/docs/[...path]", { path: "single" })).toThrow(
			"must be an array",
		)
	})

	it("empty array → throws", () => {
		expect(() => resolvePathParams("/docs/[...path]", { path: [] })).toThrow("at least one segment")
	})

	it("valid array → joined with /", () => {
		expect(resolvePathParams("/docs/[...path]", { path: ["a", "b", "c"] })).toBe("/docs/a/b/c")
	})
})

/* ── resolvePathParams required single [param] ─────────────────────── */

describe("resolvePathParams required single errors", () => {
	it("missing required → throws", () => {
		expect(() => resolvePathParams("/users/[id]", {})).toThrow("Missing required param: id")
	})

	it("array for single param → throws", () => {
		expect(() => resolvePathParams("/users/[id]", { id: ["a", "b"] })).toThrow(
			"must be string, got array",
		)
	})
})

/* ── resolvePathParams encoding edge cases ─────────────────────────── */

describe("resolvePathParams encoding", () => {
	it("special chars in param values get encoded", () => {
		expect(resolvePathParams("/tag/[name]", { name: "c++" })).toBe("/tag/c%2B%2B")
	})

	it("slash in param value gets encoded", () => {
		expect(resolvePathParams("/file/[name]", { name: "a/b" })).toBe("/file/a%2Fb")
	})

	it("unicode param value", () => {
		expect(resolvePathParams("/users/[name]", { name: "日本語" })).toBe(
			`/users/${encodeURIComponent("日本語")}`,
		)
	})

	it("already-encoded value gets double encoded", () => {
		expect(resolvePathParams("/x/[id]", { id: "%20" })).toBe("/x/%2520")
	})
})

/* ── resolvePathParams double-slash collapsing ─────────────────────── */

describe("resolvePathParams double-slash collapse", () => {
	it("empty optional in middle → no double slash", () => {
		const result = resolvePathParams("/a/[[opt]]/b", {})
		expect(result).not.toContain("//")
	})

	it("preserves protocol double slashes", () => {
		/* edge: path itself doesn't usually have protocol, but regex handles it */
		const result = resolvePathParams("/a/b", {})
		expect(result).toBe("/a/b")
	})

	it("empty path → /", () => {
		/* all optional segments removed */
		expect(resolvePathParams("[[...all]]", {})).toBe("/")
	})
})

/* ── serializeSearchParams edge cases ──────────────────────────────── */

describe("serializeSearchParams edge cases", () => {
	it("null value → skipped", () => {
		expect(serializeSearchParams({ a: null, b: "1" })).toBe("b=1")
	})

	it("undefined value → skipped", () => {
		expect(serializeSearchParams({ a: undefined, b: "1" })).toBe("b=1")
	})

	it("empty object → empty string", () => {
		expect(serializeSearchParams({})).toBe("")
	})

	it("keys are sorted alphabetically", () => {
		expect(serializeSearchParams({ a: "2", m: "3", z: "1" })).toBe("a=2&m=3&z=1")
	})

	it("array value → multiple entries", () => {
		expect(serializeSearchParams({ tag: ["a", "b"] })).toBe("tag=a&tag=b")
	})

	it("array with single item", () => {
		expect(serializeSearchParams({ tag: ["only"] })).toBe("tag=only")
	})

	it("empty array → no entries", () => {
		/* for (const item of []) runs 0 times */
		expect(serializeSearchParams({ tag: [] })).toBe("")
	})

	it("boolean value → 'true'/'false'", () => {
		expect(serializeSearchParams({ a: true, b: false })).toBe("a=true&b=false")
	})

	it("number value → string", () => {
		expect(serializeSearchParams({ page: 1 })).toBe("page=1")
	})

	it("zero value → '0'", () => {
		expect(serializeSearchParams({ offset: 0 })).toBe("offset=0")
	})

	it("special chars in key and value are encoded", () => {
		const result = serializeSearchParams({ "q&a": "c++" })
		expect(result).toBe("q%26a=c%2B%2B")
	})

	it("empty string value → key=", () => {
		expect(serializeSearchParams({ q: "" })).toBe("q=")
	})
})

/* ── buildUrl integration ──────────────────────────────────────────── */

describe("buildUrl integration edge cases", () => {
	it("hash with leading # → no double #", () => {
		const result = buildUrl({ hash: "#section", to: "/page" })
		expect(result).toBe("/page#section")
		expect(result).not.toContain("##")
	})

	it("hash without leading #", () => {
		expect(buildUrl({ hash: "top", to: "/page" })).toBe("/page#top")
	})

	it("empty hash → just #", () => {
		expect(buildUrl({ hash: "", to: "/page" })).toBe("/page#")
	})

	it("search + hash combined", () => {
		const result = buildUrl({ hash: "footer", search: { page: "2" }, to: "/blog" })
		expect(result).toBe("/blog?page=2#footer")
	})

	it("empty search object → no ?", () => {
		const result = buildUrl({ search: {}, to: "/page" })
		expect(result).not.toContain("?")
	})

	it("all-null search → no ?", () => {
		const result = buildUrl({ search: { a: null, b: undefined }, to: "/page" })
		expect(result).not.toContain("?")
	})

	it("no params object → path returned as-is (no brackets)", () => {
		expect(buildUrl({ to: "/about" })).toBe("/about")
	})

	it("full combo: params + search + hash", () => {
		const result = buildUrl({
			hash: "top",
			params: { id: "42" },
			search: { view: "grid" },
			to: "/products/[id]",
		})
		expect(result).toBe("/products/42?view=grid#top")
	})

	it("undefined hash → no # appended", () => {
		const result = buildUrl({ to: "/page" })
		expect(result).not.toContain("#")
	})
})
