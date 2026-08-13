import { describe, expect, it } from "vitest"
import { buildUrl, resolvePathParams, serializeSearchParams } from "../../../src/url/index.ts"

describe("resolvePathParams", () => {
	describe("required params", () => {
		it("replaces single param", () => {
			expect(resolvePathParams("/products/[id]", { id: "123" })).toBe("/products/123")
		})

		it("replaces multiple params", () => {
			expect(resolvePathParams("/[a]/[b]", { a: "x", b: "y" })).toBe("/x/y")
		})

		it("replaces params in complex path", () => {
			expect(
				resolvePathParams("/users/[userId]/posts/[postId]", {
					postId: "456",
					userId: "123",
				}),
			).toBe("/users/123/posts/456")
		})

		it("throws for missing required param", () => {
			expect(() => resolvePathParams("/products/[id]", {})).toThrow("Missing required param: id")
		})

		it("throws for array value on required param", () => {
			expect(() => resolvePathParams("/products/[id]", { id: ["1", "2"] })).toThrow(
				"Param id must be string, got array",
			)
		})
	})

	describe("required catch-all", () => {
		it("joins array with /", () => {
			expect(resolvePathParams("/docs/[...slug]", { slug: ["a", "b"] })).toBe("/docs/a/b")
		})

		it("handles deep nesting", () => {
			expect(resolvePathParams("/docs/[...slug]", { slug: ["api", "auth", "tokens"] })).toBe(
				"/docs/api/auth/tokens",
			)
		})

		it("throws for missing catch-all", () => {
			expect(() => resolvePathParams("/docs/[...slug]", {})).toThrow(
				"Missing required catch-all param: slug",
			)
		})

		it("throws for string value on catch-all", () => {
			expect(() => resolvePathParams("/docs/[...slug]", { slug: "single" })).toThrow(
				"Catch-all param slug must be an array, got string",
			)
		})

		it("throws for empty array on required catch-all", () => {
			expect(() => resolvePathParams("/docs/[...slug]", { slug: [] })).toThrow(
				"Required catch-all param slug must have at least one segment",
			)
		})
	})

	describe("optional catch-all", () => {
		it("joins array with /", () => {
			expect(resolvePathParams("/[[...slug]]", { slug: ["a", "b"] })).toBe("/a/b")
		})

		it("handles deep segments", () => {
			expect(resolvePathParams("/[[...slug]]", { slug: ["intro", "getting-started"] })).toBe(
				"/intro/getting-started",
			)
		})

		it("empty array becomes /", () => {
			expect(resolvePathParams("/[[...slug]]", { slug: [] })).toBe("/")
		})

		it("missing becomes /", () => {
			expect(resolvePathParams("/[[...slug]]", {})).toBe("/")
		})

		it("string value treated as single segment", () => {
			expect(resolvePathParams("/[[...slug]]", { slug: "about" })).toBe("/about")
		})

		it("mid-path empty optional catch-all does not produce double slashes", () => {
			expect(resolvePathParams("/prefix/[[...slug]]/suffix", {})).toBe("/prefix/suffix")
		})

		it("mid-path filled optional catch-all produces clean path", () => {
			expect(resolvePathParams("/prefix/[[...slug]]/suffix", { slug: ["a", "b"] })).toBe(
				"/prefix/a/b/suffix",
			)
		})

		it("preserves protocol double slashes in absolute URLs", () => {
			expect(resolvePathParams("https://example.com/[[...slug]]", {})).toBe("https://example.com/")
		})

		it("collapses double slashes at path start", () => {
			expect(resolvePathParams("//[[...slug]]/page", {})).toBe("/page")
		})
	})

	describe("optional single", () => {
		it("replaces when present", () => {
			expect(resolvePathParams("/[[locale]]/compare", { locale: "en" })).toBe("/en/compare")
		})

		it("removes segment when missing", () => {
			expect(resolvePathParams("/[[locale]]/compare", {})).toBe("/compare")
		})

		it("removes segment when undefined", () => {
			expect(resolvePathParams("/[[locale]]/compare", { locale: undefined })).toBe("/compare")
		})

		it("removes segment when empty string", () => {
			expect(resolvePathParams("/[[locale]]/compare", { locale: "" })).toBe("/compare")
		})

		it("handles at end of path", () => {
			expect(resolvePathParams("/[[locale]]", { locale: "en" })).toBe("/en")
		})

		it("handles at end missing", () => {
			expect(resolvePathParams("/[[locale]]", {})).toBe("/")
		})

		it("handles mid-path", () => {
			expect(resolvePathParams("/shop/[[category]]/products", { category: "electronics" })).toBe(
				"/shop/electronics/products",
			)
		})

		it("removes mid-path when missing", () => {
			expect(resolvePathParams("/shop/[[category]]/products", {})).toBe("/shop/products")
		})
	})

	describe("combined optional + required", () => {
		it("both present", () => {
			expect(resolvePathParams("/[[locale]]/products/[id]", { id: "123", locale: "en" })).toBe(
				"/en/products/123",
			)
		})

		it("optional missing, required present", () => {
			expect(resolvePathParams("/[[locale]]/products/[id]", { id: "123" })).toBe("/products/123")
		})
	})

	describe("encoding", () => {
		it("encodes single param", () => {
			expect(resolvePathParams("/[id]", { id: "hello world" })).toBe("/hello%20world")
		})

		it("encodes catch-all segments", () => {
			expect(resolvePathParams("/[...s]", { s: ["a/b", "c"] })).toBe("/a%2Fb/c")
		})

		it("encodes optional single", () => {
			expect(resolvePathParams("/[[locale]]/compare", { locale: "en US" })).toBe("/en%20US/compare")
		})

		it("encodes search query param", () => {
			expect(resolvePathParams("/search/[query]", { query: "hello world" })).toBe(
				"/search/hello%20world",
			)
		})

		it("encodes catch-all with spaces", () => {
			expect(resolvePathParams("/docs/[...slug]", { slug: ["hello world", "test"] })).toBe(
				"/docs/hello%20world/test",
			)
		})
	})

	it("ignores extra unused params", () => {
		expect(resolvePathParams("/products/[id]", { id: "123", unused: "x" })).toBe("/products/123")
	})

	it("returns static path unchanged", () => {
		expect(resolvePathParams("/about", {})).toBe("/about")
	})
})

describe("serializeSearchParams", () => {
	it("returns empty string for empty object", () => {
		expect(serializeSearchParams({})).toBe("")
	})

	it("serializes number and string", () => {
		expect(serializeSearchParams({ page: 1, sort: "name" })).toBe("page=1&sort=name")
	})

	it("sorts keys alphabetically", () => {
		expect(serializeSearchParams({ a: 1, b: 2 })).toBe("a=1&b=2")
	})

	it("skips null and undefined", () => {
		expect(serializeSearchParams({ x: null, y: undefined, z: 1 })).toBe("z=1")
	})

	it("expands arrays", () => {
		expect(serializeSearchParams({ tags: ["a", "b"] })).toBe("tags=a&tags=b")
	})

	it("includes false", () => {
		expect(serializeSearchParams({ enabled: false })).toBe("enabled=false")
	})

	it("includes true", () => {
		expect(serializeSearchParams({ enabled: true })).toBe("enabled=true")
	})

	it("includes empty string", () => {
		expect(serializeSearchParams({ q: "" })).toBe("q=")
	})

	it("converts number to string", () => {
		expect(serializeSearchParams({ page: 1 })).toBe("page=1")
	})

	it("encodes special characters", () => {
		expect(serializeSearchParams({ q: "hello world" })).toBe("q=hello%20world")
	})

	it("skips undefined in mixed", () => {
		expect(serializeSearchParams({ a: 1, b: undefined })).toBe("a=1")
	})

	it("skips null in mixed", () => {
		expect(serializeSearchParams({ a: 1, b: null })).toBe("a=1")
	})
})

describe("buildUrl", () => {
	describe("simple paths", () => {
		it("returns path as-is", () => {
			expect(buildUrl({ to: "/about" })).toBe("/about")
		})

		it("handles root", () => {
			expect(buildUrl({ to: "/" })).toBe("/")
		})
	})

	describe("with params", () => {
		it("resolves single param", () => {
			expect(buildUrl({ params: { id: "123" }, to: "/products/[id]" })).toBe("/products/123")
		})

		it("resolves multiple params", () => {
			expect(
				buildUrl({
					params: { postId: "456", userId: "123" },
					to: "/users/[userId]/posts/[postId]",
				}),
			).toBe("/users/123/posts/456")
		})

		it("resolves catch-all", () => {
			expect(buildUrl({ params: { slug: ["api", "auth"] }, to: "/docs/[...slug]" })).toBe(
				"/docs/api/auth",
			)
		})
	})

	describe("with search", () => {
		it("appends search params", () => {
			expect(buildUrl({ search: { page: 2, sort: "name" }, to: "/products" })).toBe(
				"/products?page=2&sort=name",
			)
		})

		it("appends to root", () => {
			expect(buildUrl({ search: { ref: "nav" }, to: "/" })).toBe("/?ref=nav")
		})

		it("omits ? for empty search", () => {
			expect(buildUrl({ search: {}, to: "/about" })).toBe("/about")
		})
	})

	describe("with hash", () => {
		it("appends hash", () => {
			expect(buildUrl({ hash: "reviews", params: { id: "123" }, to: "/products/[id]" })).toBe(
				"/products/123#reviews",
			)
		})

		it("normalizes leading #", () => {
			expect(buildUrl({ hash: "#section", to: "/about" })).toBe("/about#section")
		})

		it("without leading #", () => {
			expect(buildUrl({ hash: "section", to: "/about" })).toBe("/about#section")
		})

		it("hash on root", () => {
			expect(buildUrl({ hash: "top", to: "/" })).toBe("/#top")
		})
	})

	describe("combined", () => {
		it("params + search + hash", () => {
			expect(
				buildUrl({
					hash: "details",
					params: { id: "123" },
					search: { tab: "specs" },
					to: "/products/[id]",
				}),
			).toBe("/products/123?tab=specs#details")
		})
	})

	describe("optional params", () => {
		it("optional present", () => {
			expect(buildUrl({ params: { locale: "en" }, to: "/[[locale]]/compare" })).toBe("/en/compare")
		})

		it("optional missing", () => {
			expect(buildUrl({ to: "/[[locale]]/compare" })).toBe("/compare")
		})

		it("optional + search", () => {
			expect(
				buildUrl({
					params: { locale: "de" },
					search: { ref: "nav" },
					to: "/[[locale]]/compare",
				}),
			).toBe("/de/compare?ref=nav")
		})

		it("optional + required + hash", () => {
			expect(
				buildUrl({
					hash: "details",
					params: { id: "123", locale: "en" },
					to: "/[[locale]]/products/[id]",
				}),
			).toBe("/en/products/123#details")
		})

		it("optional missing + required", () => {
			expect(buildUrl({ params: { id: "123" }, to: "/[[locale]]/products/[id]" })).toBe(
				"/products/123",
			)
		})
	})

	describe("edge cases", () => {
		it("empty hash produces # suffix", () => {
			expect(buildUrl({ hash: "", to: "/about" })).toBe("/about#")
		})

		it("hash with # prefix deduplicated", () => {
			expect(buildUrl({ hash: "#top", to: "/" })).toBe("/#top")
		})

		it("unicode in path params", () => {
			expect(buildUrl({ params: { name: "café" }, to: "/users/[name]" })).toBe("/users/caf%C3%A9")
		})

		it("unicode in search params", () => {
			expect(buildUrl({ search: { q: "日本語" }, to: "/search" })).toBe(
				"/search?q=%E6%97%A5%E6%9C%AC%E8%AA%9E",
			)
		})

		it("special chars in search key", () => {
			expect(buildUrl({ search: { "key with space": "val" }, to: "/" })).toBe(
				"/?key%20with%20space=val",
			)
		})

		it("ampersand in search value", () => {
			expect(buildUrl({ search: { q: "a&b" }, to: "/" })).toBe("/?q=a%26b")
		})

		it("equals in search value", () => {
			expect(buildUrl({ search: { q: "a=b" }, to: "/" })).toBe("/?q=a%3Db")
		})

		it("empty object search omits ?", () => {
			expect(buildUrl({ search: {}, to: "/x" })).toBe("/x")
		})

		it("all-null search omits ?", () => {
			expect(buildUrl({ search: { a: null, b: undefined }, to: "/x" })).toBe("/x")
		})

		it("single-element catch-all", () => {
			expect(buildUrl({ params: { slug: ["only"] }, to: "/docs/[...slug]" })).toBe("/docs/only")
		})

		it("optional catch-all with single segment", () => {
			expect(buildUrl({ params: { slug: ["only"] }, to: "/[[...slug]]" })).toBe("/only")
		})

		it("optional catch-all filters undefined values from array", () => {
			const result = resolvePathParams("/docs/[[...slug]]", {
				slug: ["a", undefined as unknown as string, "b"],
			})
			expect(result).toBe("/docs/a/b")
			expect(result).not.toContain("undefined")
		})

		it("required catch-all filters undefined values from array", () => {
			const result = resolvePathParams("/docs/[...slug]", {
				slug: ["a", undefined as unknown as string, "b"],
			})
			expect(result).toBe("/docs/a/b")
			expect(result).not.toContain("undefined")
		})
	})
})
