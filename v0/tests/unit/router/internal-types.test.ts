/**
 * Internal Types Tests
 * Tests for createLocation helper and type guards.
 */

import { describe, expect, it } from "vitest"
import { createLocation } from "../../../src/router/_internal/types"

describe("_internal/types", () => {
	describe("createLocation", () => {
		it("creates location with all fields", () => {
			const url = new URL("https://example.com/products/123?page=2")
			const params = { id: "123" }

			const location = createLocation(url, params, "_root_/products/[id]", "/products/[id]")

			expect(location.pathname).toBe("/products/123")
			expect(location.params).toEqual({ id: "123" })
			expect(location.search).toEqual({ page: "2" })
			expect(location.url).toBe(url)
			expect(location.virtualPath).toBe("_root_/products/[id]")
			expect(location.variablePath).toBe("/products/[id]")
		})

		it("extracts search params from URL", () => {
			const url = new URL("https://example.com/test?foo=bar&baz=qux")

			const location = createLocation(url, {}, "_root_/test", "/test")

			expect(location.search).toEqual({ baz: "qux", foo: "bar" })
		})

		it("uses custom search when provided", () => {
			const url = new URL("https://example.com/test?foo=bar")
			const customSearch = { custom: "value", page: 1 }

			const location = createLocation(url, {}, "_root_/test", "/test", customSearch)

			expect(location.search).toEqual({ custom: "value", page: 1 })
		})

		it("handles empty search params", () => {
			const url = new URL("https://example.com/test")

			const location = createLocation(url, {}, "_root_/test", "/test")

			expect(location.search).toEqual({})
		})

		it("preserves complex params", () => {
			const url = new URL("https://example.com/users/john/posts/123")
			const params = { postId: "123", userId: "john" }

			const location = createLocation(
				url,
				params,
				"_root_/users/[userId]/posts/[postId]",
				"/users/[userId]/posts/[postId]",
			)

			expect(location.params).toEqual({ postId: "123", userId: "john" })
		})
	})
})
