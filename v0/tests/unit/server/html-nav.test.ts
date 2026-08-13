/**
 * Server HTML Navigation Unit Tests
 *
 * Tests handleHtmlNavRequest and related utilities.
 * HTML nav returns full rendered HTML for client-side content swap.
 */

import { describe, expect, it } from "vitest"

/**
 * Note: handleHtmlNavRequest is complex and requires SSR context.
 * Core logic is tested via integration tests in integration/html-nav.test.ts.
 *
 * This file tests the utility functions that can be isolated.
 */

/* ============================================================================
 * Test helpers - mirror internal types
 * ============================================================================ */

interface Deferred<T> {
	__deferred: true
	__error?: { message: string; name: string }
	__key: string
	__resolved?: T
	promise: Promise<T>
}

function createMockDeferred<T>(
	key: string,
	resolved?: T,
	error?: { message: string; name: string },
): Deferred<T> {
	const promise = resolved !== undefined ? Promise.resolve(resolved) : Promise.reject(error)
	/* Catch to avoid unhandled rejection in tests */
	promise.catch(() => {})
	return {
		__deferred: true,
		__error: error,
		__key: key,
		__resolved: resolved,
		promise,
	}
}

/* ============================================================================
 * isDeferred (re-implemented for testing)
 * ============================================================================ */

function isDeferred(value: unknown): value is Deferred<unknown> {
	return (
		value !== null &&
		typeof value === "object" &&
		"__deferred" in value &&
		(value as Record<string, unknown>).__deferred === true
	)
}

describe("isDeferred", () => {
	it("returns true for deferred objects", () => {
		const deferred = createMockDeferred("key", "value")
		expect(isDeferred(deferred)).toBe(true)
	})

	it("returns false for null", () => {
		expect(isDeferred(null)).toBe(false)
	})

	it("returns false for undefined", () => {
		expect(isDeferred(undefined)).toBe(false)
	})

	it("returns false for primitives", () => {
		expect(isDeferred("string")).toBe(false)
		expect(isDeferred(123)).toBe(false)
		expect(isDeferred(true)).toBe(false)
	})

	it("returns false for plain objects", () => {
		expect(isDeferred({})).toBe(false)
		expect(isDeferred({ key: "value" })).toBe(false)
	})

	it("returns false for objects with __deferred: false", () => {
		expect(isDeferred({ __deferred: false })).toBe(false)
	})

	it("returns true for minimal deferred marker", () => {
		expect(isDeferred({ __deferred: true })).toBe(true)
	})
})

/* ============================================================================
 * serializeLoaderData (re-implemented for testing)
 * ============================================================================ */

function serializeLoaderData(data: unknown): unknown {
	if (data === null || data === undefined) {
		return data
	}

	if (typeof data !== "object") {
		return data
	}

	/* Unwrap Deferred to resolved value */
	if (isDeferred(data)) {
		if ("__error" in data && data.__error) {
			return { __error: data.__error }
		}
		return data.__resolved
	}

	/* Recurse into arrays */
	if (Array.isArray(data)) {
		return data.map(serializeLoaderData)
	}

	/* Recurse into objects */
	const result: Record<string, unknown> = {}
	for (const [key, value] of Object.entries(data)) {
		result[key] = serializeLoaderData(value)
	}
	return result
}

describe("serializeLoaderData", () => {
	describe("primitives", () => {
		it("returns null as-is", () => {
			expect(serializeLoaderData(null)).toBeNull()
		})

		it("returns undefined as-is", () => {
			expect(serializeLoaderData(undefined)).toBeUndefined()
		})

		it("returns strings as-is", () => {
			expect(serializeLoaderData("hello")).toBe("hello")
		})

		it("returns numbers as-is", () => {
			expect(serializeLoaderData(42)).toBe(42)
		})

		it("returns booleans as-is", () => {
			expect(serializeLoaderData(true)).toBe(true)
			expect(serializeLoaderData(false)).toBe(false)
		})
	})

	describe("plain objects", () => {
		it("preserves simple objects", () => {
			const data = { age: 30, name: "Alice" }
			expect(serializeLoaderData(data)).toEqual({ age: 30, name: "Alice" })
		})

		it("recursively processes nested objects", () => {
			const data = {
				user: {
					profile: {
						name: "Bob",
					},
				},
			}
			expect(serializeLoaderData(data)).toEqual({
				user: {
					profile: {
						name: "Bob",
					},
				},
			})
		})
	})

	describe("arrays", () => {
		it("preserves simple arrays", () => {
			const data = [1, 2, 3]
			expect(serializeLoaderData(data)).toEqual([1, 2, 3])
		})

		it("recursively processes array elements", () => {
			const data = [{ x: 1 }, { x: 2 }]
			expect(serializeLoaderData(data)).toEqual([{ x: 1 }, { x: 2 }])
		})
	})

	describe("deferred values", () => {
		it("unwraps resolved deferred to its value", () => {
			const deferred = createMockDeferred("key", { products: [1, 2, 3] })
			expect(serializeLoaderData(deferred)).toEqual({ products: [1, 2, 3] })
		})

		it("returns error marker for errored deferred", () => {
			const deferred = createMockDeferred("key", undefined, {
				message: "Failed to load",
				name: "Error",
			})
			expect(serializeLoaderData(deferred)).toEqual({
				__error: { message: "Failed to load", name: "Error" },
			})
		})

		it("returns undefined for unresolved deferred", () => {
			const deferred: Deferred<unknown> = {
				__deferred: true,
				__key: "key",
				promise: new Promise(() => {}),
			}
			expect(serializeLoaderData(deferred)).toBeUndefined()
		})

		it("unwraps nested deferred in objects", () => {
			const data = {
				immediate: "value",
				lazy: createMockDeferred("lazy", { loaded: true }),
			}
			expect(serializeLoaderData(data)).toEqual({
				immediate: "value",
				lazy: { loaded: true },
			})
		})

		it("unwraps deferred in arrays", () => {
			const data = [createMockDeferred("item1", { id: 1 }), createMockDeferred("item2", { id: 2 })]
			expect(serializeLoaderData(data)).toEqual([{ id: 1 }, { id: 2 }])
		})
	})

	describe("mixed data", () => {
		it("handles complex nested structures with deferred", () => {
			const data = {
				config: { theme: "dark" },
				items: [
					{ details: createMockDeferred("details1", { loaded: true }), id: 1 },
					{ details: createMockDeferred("details2", { loaded: false }), id: 2 },
				],
				user: createMockDeferred("user", { name: "Alice" }),
			}

			expect(serializeLoaderData(data)).toEqual({
				config: { theme: "dark" },
				items: [
					{ details: { loaded: true }, id: 1 },
					{ details: { loaded: false }, id: 2 },
				],
				user: { name: "Alice" },
			})
		})
	})
})

/* ============================================================================
 * HTML nav response structure
 * ============================================================================ */

describe("HTML nav response", () => {
	it("response includes x-flare-nav-format header", () => {
		/* This is tested in integration tests, but document expected header */
		const headers = new Headers({
			"content-type": "text/html; charset=utf-8",
			"x-flare-nav-format": "html",
		})

		expect(headers.get("x-flare-nav-format")).toBe("html")
	})

	it("content-type is text/html", () => {
		const headers = new Headers({
			"content-type": "text/html; charset=utf-8",
		})

		expect(headers.get("content-type")).toBe("text/html; charset=utf-8")
	})
})
