/**
 * buildUrl Unit Tests
 *
 * Tests URL construction from path patterns with params, search, and hash.
 * Converts variablePath (/products/[id]) to URL (/products/123).
 */

import { describe, expect, it } from "vitest"
import { buildUrl, resolvePathParams, serializeSearchParams } from "../../../src/router/build-url"

describe("buildUrl", () => {
	describe("resolvePathParams", () => {
		it("returns path unchanged when no params", () => {
			expect(resolvePathParams("/about", {})).toBe("/about")
		})

		it("replaces [param] with value", () => {
			expect(resolvePathParams("/products/[id]", { id: "123" })).toBe("/products/123")
		})

		it("replaces multiple params", () => {
			expect(
				resolvePathParams("/users/[userId]/posts/[postId]", { postId: "456", userId: "123" }),
			).toBe("/users/123/posts/456")
		})

		it("handles catch-all [...slug]", () => {
			expect(resolvePathParams("/docs/[...slug]", { slug: ["api", "auth", "tokens"] })).toBe(
				"/docs/api/auth/tokens",
			)
		})

		it("handles optional catch-all [[...slug]]", () => {
			expect(resolvePathParams("/[[...slug]]", { slug: ["intro", "getting-started"] })).toBe(
				"/intro/getting-started",
			)
		})

		it("handles empty optional catch-all", () => {
			expect(resolvePathParams("/[[...slug]]", { slug: [] })).toBe("/")
			expect(resolvePathParams("/[[...slug]]", {})).toBe("/")
		})

		it("handles optional single param [[locale]] with value", () => {
			expect(resolvePathParams("/[[locale]]/compare", { locale: "en" })).toBe("/en/compare")
		})

		it("handles optional single param [[locale]] without value", () => {
			expect(resolvePathParams("/[[locale]]/compare", {})).toBe("/compare")
			expect(resolvePathParams("/[[locale]]/compare", { locale: undefined })).toBe("/compare")
		})

		it("handles optional single param [[locale]] with empty string", () => {
			expect(resolvePathParams("/[[locale]]/compare", { locale: "" })).toBe("/compare")
		})

		it("handles optional single param at start only", () => {
			expect(resolvePathParams("/[[locale]]", { locale: "en" })).toBe("/en")
			expect(resolvePathParams("/[[locale]]", {})).toBe("/")
		})

		it("handles optional single param mid-path", () => {
			expect(resolvePathParams("/shop/[[category]]/products", { category: "electronics" })).toBe(
				"/shop/electronics/products",
			)
			expect(resolvePathParams("/shop/[[category]]/products", {})).toBe("/shop/products")
		})

		it("handles combined optional single and required params", () => {
			expect(resolvePathParams("/[[locale]]/products/[id]", { id: "123", locale: "en" })).toBe(
				"/en/products/123",
			)
			expect(resolvePathParams("/[[locale]]/products/[id]", { id: "123" })).toBe("/products/123")
		})

		it("encodes optional single param values", () => {
			expect(resolvePathParams("/[[locale]]/compare", { locale: "en US" })).toBe("/en%20US/compare")
		})

		it("preserves leading slash", () => {
			expect(resolvePathParams("/blog/[slug]", { slug: "hello" })).toBe("/blog/hello")
		})

		it("throws for missing required param", () => {
			expect(() => resolvePathParams("/products/[id]", {})).toThrow()
		})

		it("encodes param values", () => {
			expect(resolvePathParams("/search/[query]", { query: "hello world" })).toBe(
				"/search/hello%20world",
			)
		})

		it("encodes catch-all segments", () => {
			expect(resolvePathParams("/docs/[...slug]", { slug: ["hello world", "test"] })).toBe(
				"/docs/hello%20world/test",
			)
		})
	})

	describe("serializeSearchParams", () => {
		it("returns empty string for empty object", () => {
			expect(serializeSearchParams({})).toBe("")
		})

		it("serializes single param", () => {
			expect(serializeSearchParams({ page: 1 })).toBe("page=1")
		})

		it("serializes multiple params alphabetically", () => {
			expect(serializeSearchParams({ page: 1, sort: "name" })).toBe("page=1&sort=name")
		})

		it("serializes arrays", () => {
			expect(serializeSearchParams({ tags: ["a", "b"] })).toBe("tags=a&tags=b")
		})

		it("encodes special characters", () => {
			expect(serializeSearchParams({ q: "hello world" })).toBe("q=hello%20world")
		})

		it("omits undefined values", () => {
			expect(serializeSearchParams({ a: 1, b: undefined })).toBe("a=1")
		})

		it("omits null values", () => {
			expect(serializeSearchParams({ a: 1, b: null })).toBe("a=1")
		})

		it("includes false values", () => {
			expect(serializeSearchParams({ enabled: false })).toBe("enabled=false")
		})

		it("includes empty string values", () => {
			expect(serializeSearchParams({ q: "" })).toBe("q=")
		})
	})

	describe("buildUrl", () => {
		it("builds simple path", () => {
			expect(buildUrl({ to: "/about" })).toBe("/about")
		})

		it("builds path with single param", () => {
			expect(buildUrl({ params: { id: "123" }, to: "/products/[id]" })).toBe("/products/123")
		})

		it("builds path with multiple params", () => {
			expect(
				buildUrl({
					params: { postId: "456", userId: "123" },
					to: "/users/[userId]/posts/[postId]",
				}),
			).toBe("/users/123/posts/456")
		})

		it("builds path with catch-all", () => {
			expect(
				buildUrl({
					params: { slug: ["api", "auth"] },
					to: "/docs/[...slug]",
				}),
			).toBe("/docs/api/auth")
		})

		it("builds path with search params", () => {
			expect(
				buildUrl({
					search: { page: 2, sort: "name" },
					to: "/products",
				}),
			).toBe("/products?page=2&sort=name")
		})

		it("builds path with hash", () => {
			expect(buildUrl({ hash: "reviews", params: { id: "123" }, to: "/products/[id]" })).toBe(
				"/products/123#reviews",
			)
		})

		it("builds path with search and hash", () => {
			expect(
				buildUrl({
					hash: "details",
					params: { id: "123" },
					search: { tab: "specs" },
					to: "/products/[id]",
				}),
			).toBe("/products/123?tab=specs#details")
		})

		it("normalizes hash (removes leading #)", () => {
			expect(buildUrl({ hash: "#section", to: "/about" })).toBe("/about#section")
		})

		it("handles root path", () => {
			expect(buildUrl({ to: "/" })).toBe("/")
		})

		it("handles root with search", () => {
			expect(buildUrl({ search: { ref: "nav" }, to: "/" })).toBe("/?ref=nav")
		})

		it("handles root with hash", () => {
			expect(buildUrl({ hash: "top", to: "/" })).toBe("/#top")
		})

		it("builds path with optional single param provided", () => {
			expect(
				buildUrl({
					params: { locale: "en" },
					to: "/[[locale]]/compare",
				}),
			).toBe("/en/compare")
		})

		it("builds path with optional single param omitted", () => {
			expect(buildUrl({ to: "/[[locale]]/compare" })).toBe("/compare")
		})

		it("builds path with optional single param and search", () => {
			expect(
				buildUrl({
					params: { locale: "de" },
					search: { ref: "nav" },
					to: "/[[locale]]/compare",
				}),
			).toBe("/de/compare?ref=nav")
		})

		it("builds path with optional single param, required param, and hash", () => {
			expect(
				buildUrl({
					hash: "details",
					params: { id: "123", locale: "en" },
					to: "/[[locale]]/products/[id]",
				}),
			).toBe("/en/products/123#details")
		})

		it("builds path with optional single param undefined and required param", () => {
			expect(
				buildUrl({
					params: { id: "123" },
					to: "/[[locale]]/products/[id]",
				}),
			).toBe("/products/123")
		})
	})
})
