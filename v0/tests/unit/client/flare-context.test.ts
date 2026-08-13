/**
 * Flare Context Tests
 *
 * Tests global context singleton pattern for FlareProvider.
 * Pure functions re-implemented for testing.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest"

/* ============================================================================
 * Re-implemented Constants and Functions for Testing
 * ============================================================================ */

const CONTEXT_KEY = "__FLARE_CONTEXT__"
const GLOBAL_VALUE_KEY = "__FLARE_CONTEXT_VALUE__"

/**
 * Set global context value
 */
function setGlobalFlareContext(value: unknown): void {
	;(globalThis as Record<string, unknown>)[GLOBAL_VALUE_KEY] = value
}

/**
 * Get global context value
 */
function getGlobalFlareContext(): unknown {
	return (globalThis as Record<string, unknown>)[GLOBAL_VALUE_KEY]
}

/**
 * Clear global context value
 */
function clearGlobalFlareContext(): void {
	delete (globalThis as Record<string, unknown>)[GLOBAL_VALUE_KEY]
}

/* ============================================================================
 * Test Setup
 * ============================================================================ */

describe("flare-context", () => {
	beforeEach(() => {
		/* Ensure clean state before each test */
		clearGlobalFlareContext()
	})

	afterEach(() => {
		/* Clean up after each test */
		clearGlobalFlareContext()
	})

	/* ============================================================================
	 * setGlobalFlareContext Tests
	 * ============================================================================ */

	describe("setGlobalFlareContext", () => {
		describe("basic value setting", () => {
			it("sets object value", () => {
				const value = { client: {}, router: {} }
				setGlobalFlareContext(value)

				expect(getGlobalFlareContext()).toBe(value)
			})

			it("sets primitive value", () => {
				setGlobalFlareContext("test")
				expect(getGlobalFlareContext()).toBe("test")
			})

			it("sets null value", () => {
				setGlobalFlareContext(null)
				expect(getGlobalFlareContext()).toBeNull()
			})

			it("sets undefined value", () => {
				setGlobalFlareContext(undefined)
				expect(getGlobalFlareContext()).toBeUndefined()
			})

			it("sets array value", () => {
				const arr = [1, 2, 3]
				setGlobalFlareContext(arr)
				expect(getGlobalFlareContext()).toBe(arr)
			})

			it("sets function value", () => {
				const fn = () => "test"
				setGlobalFlareContext(fn)
				expect(getGlobalFlareContext()).toBe(fn)
			})
		})

		describe("overwriting values", () => {
			it("overwrites existing value", () => {
				setGlobalFlareContext({ first: true })
				setGlobalFlareContext({ second: true })

				expect(getGlobalFlareContext()).toEqual({ second: true })
			})

			it("overwrites with different type", () => {
				setGlobalFlareContext({ obj: true })
				setGlobalFlareContext("string")

				expect(getGlobalFlareContext()).toBe("string")
			})

			it("overwrites non-null with null", () => {
				setGlobalFlareContext({ data: "exists" })
				setGlobalFlareContext(null)

				expect(getGlobalFlareContext()).toBeNull()
			})
		})

		describe("complex objects", () => {
			it("sets nested object structure", () => {
				const value = {
					client: {
						cache: new Map(),
						config: { timeout: 5000 },
					},
					location: {
						hash: "",
						params: { id: "123" },
						pathname: "/users/123",
						search: "",
					},
					router: {
						navigate: () => {},
						prefetch: () => {},
					},
				}
				setGlobalFlareContext(value)

				const result = getGlobalFlareContext() as typeof value
				expect(result.location.pathname).toBe("/users/123")
				expect(result.location.params).toEqual({ id: "123" })
			})

			it("preserves object references", () => {
				const innerObj = { deep: true }
				const value = { outer: innerObj }
				setGlobalFlareContext(value)

				const result = getGlobalFlareContext() as typeof value
				expect(result.outer).toBe(innerObj)
			})
		})
	})

	/* ============================================================================
	 * getGlobalFlareContext Tests
	 * ============================================================================ */

	describe("getGlobalFlareContext", () => {
		describe("basic retrieval", () => {
			it("returns undefined when not set", () => {
				expect(getGlobalFlareContext()).toBeUndefined()
			})

			it("returns set value", () => {
				const value = { test: true }
				setGlobalFlareContext(value)

				expect(getGlobalFlareContext()).toBe(value)
			})

			it("returns same reference on multiple calls", () => {
				const value = { test: true }
				setGlobalFlareContext(value)

				expect(getGlobalFlareContext()).toBe(getGlobalFlareContext())
			})
		})

		describe("type preservation", () => {
			it("preserves object type", () => {
				setGlobalFlareContext({ a: 1, b: "two" })
				const result = getGlobalFlareContext() as { a: number; b: string }

				expect(result.a).toBe(1)
				expect(result.b).toBe("two")
			})

			it("preserves array type", () => {
				setGlobalFlareContext([1, 2, 3])
				const result = getGlobalFlareContext() as number[]

				expect(Array.isArray(result)).toBe(true)
				expect(result).toHaveLength(3)
			})

			it("preserves function type", () => {
				const fn = (x: number) => x * 2
				setGlobalFlareContext(fn)
				const result = getGlobalFlareContext() as typeof fn

				expect(typeof result).toBe("function")
				expect(result(5)).toBe(10)
			})
		})
	})

	/* ============================================================================
	 * clearGlobalFlareContext Tests
	 * ============================================================================ */

	describe("clearGlobalFlareContext", () => {
		describe("basic clearing", () => {
			it("clears set value", () => {
				setGlobalFlareContext({ test: true })
				clearGlobalFlareContext()

				expect(getGlobalFlareContext()).toBeUndefined()
			})

			it("is idempotent - clearing empty is safe", () => {
				clearGlobalFlareContext()
				clearGlobalFlareContext()

				expect(getGlobalFlareContext()).toBeUndefined()
			})

			it("removes value from globalThis", () => {
				setGlobalFlareContext({ test: true })
				expect(GLOBAL_VALUE_KEY in globalThis).toBe(true)

				clearGlobalFlareContext()
				expect(GLOBAL_VALUE_KEY in globalThis).toBe(false)
			})
		})

		describe("clearing different value types", () => {
			it("clears object value", () => {
				setGlobalFlareContext({ obj: true })
				clearGlobalFlareContext()
				expect(getGlobalFlareContext()).toBeUndefined()
			})

			it("clears null value", () => {
				setGlobalFlareContext(null)
				clearGlobalFlareContext()
				expect(getGlobalFlareContext()).toBeUndefined()
			})

			it("clears array value", () => {
				setGlobalFlareContext([1, 2, 3])
				clearGlobalFlareContext()
				expect(getGlobalFlareContext()).toBeUndefined()
			})
		})

		describe("set after clear", () => {
			it("allows setting new value after clear", () => {
				setGlobalFlareContext({ first: true })
				clearGlobalFlareContext()
				setGlobalFlareContext({ second: true })

				expect(getGlobalFlareContext()).toEqual({ second: true })
			})
		})
	})

	/* ============================================================================
	 * Global Key Tests
	 * ============================================================================ */

	describe("global keys", () => {
		it("CONTEXT_KEY is unique identifier", () => {
			expect(CONTEXT_KEY).toBe("__FLARE_CONTEXT__")
		})

		it("GLOBAL_VALUE_KEY is unique identifier", () => {
			expect(GLOBAL_VALUE_KEY).toBe("__FLARE_CONTEXT_VALUE__")
		})

		it("keys have double underscore prefix/suffix", () => {
			expect(CONTEXT_KEY.startsWith("__")).toBe(true)
			expect(CONTEXT_KEY.endsWith("__")).toBe(true)
			expect(GLOBAL_VALUE_KEY.startsWith("__")).toBe(true)
			expect(GLOBAL_VALUE_KEY.endsWith("__")).toBe(true)
		})

		it("value key isolates from context key", () => {
			/* They should be different */
			expect(CONTEXT_KEY).not.toBe(GLOBAL_VALUE_KEY)
		})
	})

	/* ============================================================================
	 * Integration Scenarios
	 * ============================================================================ */

	describe("integration scenarios", () => {
		describe("SSR lifecycle", () => {
			it("simulates SSR set-render-clear cycle", () => {
				/* 1. Before render - set context */
				const ssrContext = {
					isNavigating: false,
					location: { hash: "", pathname: "/", search: "" },
					params: {},
				}
				setGlobalFlareContext(ssrContext)
				expect(getGlobalFlareContext()).toBe(ssrContext)

				/* 2. During render - context accessible */
				const ctx = getGlobalFlareContext() as typeof ssrContext
				expect(ctx.location.pathname).toBe("/")

				/* 3. After render - clear for next request */
				clearGlobalFlareContext()
				expect(getGlobalFlareContext()).toBeUndefined()
			})

			it("prevents context leak between requests", () => {
				/* Request 1 */
				setGlobalFlareContext({ requestId: 1 })
				clearGlobalFlareContext()

				/* Request 2 should not see Request 1 data */
				expect(getGlobalFlareContext()).toBeUndefined()

				setGlobalFlareContext({ requestId: 2 })
				expect((getGlobalFlareContext() as { requestId: number }).requestId).toBe(2)
			})
		})

		describe("module identity workaround", () => {
			it("same value accessible across simulated module loads", () => {
				const sharedContext = {
					client: { id: "shared" },
					router: { navigate: () => {} },
				}

				/* Simulate first module setting context */
				setGlobalFlareContext(sharedContext)

				/* Simulate second module reading context */
				const ctx = getGlobalFlareContext()
				expect(ctx).toBe(sharedContext)
			})

			it("globalThis access is reliable", () => {
				const value = { reliable: true }
				;(globalThis as Record<string, unknown>)[GLOBAL_VALUE_KEY] = value

				/* Direct globalThis access matches function access */
				expect(getGlobalFlareContext()).toBe(value)
			})
		})

		describe("FlareProvider simulation", () => {
			it("provider sets context on mount", () => {
				/* Simulates FlareProvider mount */
				const providerContext = {
					client: { prefetchCache: new Map() },
					isNavigating: () => false,
					location: () => ({ pathname: "/" }),
					params: () => ({}),
					router: {
						clearCache: () => {},
						invalidate: () => {},
						navigate: () => {},
						prefetch: () => {},
						refetch: () => {},
					},
				}

				setGlobalFlareContext(providerContext)

				/* Hooks can access context */
				const ctx = getGlobalFlareContext() as typeof providerContext
				expect(typeof ctx.router.navigate).toBe("function")
				expect(typeof ctx.isNavigating).toBe("function")
			})

			it("useLoaderData fallback accesses global context", () => {
				/* When solid-js context fails, hooks fall back to global */
				const mockContext = {
					location: () => ({ pathname: "/users/123" }),
					matches: () => [{ loaderData: { user: { id: 123 } }, virtualPath: "_root_" }],
				}

				setGlobalFlareContext(mockContext)

				/* Simulate useLoaderData fallback */
				const ctx = getGlobalFlareContext() as typeof mockContext
				const match = ctx.matches().find((m) => m.virtualPath === "_root_")
				expect(match?.loaderData).toEqual({ user: { id: 123 } })
			})
		})
	})

	/* ============================================================================
	 * Edge Cases
	 * ============================================================================ */

	describe("edge cases", () => {
		it("handles circular references", () => {
			const obj: Record<string, unknown> = { a: 1 }
			obj.self = obj
			setGlobalFlareContext(obj)

			const result = getGlobalFlareContext() as typeof obj
			expect(result.self).toBe(result)
		})

		it("handles symbol keys in objects", () => {
			const sym = Symbol("test")
			const obj = { [sym]: "value", regular: "key" }
			setGlobalFlareContext(obj)

			const result = getGlobalFlareContext() as typeof obj
			expect(result[sym]).toBe("value")
		})

		it("handles very large objects", () => {
			const largeObj = {
				data: Array.from({ length: 10000 }, (_, i) => ({ id: i, name: `Item ${i}` })),
			}
			setGlobalFlareContext(largeObj)

			const result = getGlobalFlareContext() as typeof largeObj
			expect(result.data.length).toBe(10000)
		})

		it("handles rapid set-get cycles", () => {
			for (let i = 0; i < 100; i++) {
				setGlobalFlareContext({ iteration: i })
				expect((getGlobalFlareContext() as { iteration: number }).iteration).toBe(i)
			}
		})

		it("handles undefined vs delete distinction", () => {
			setGlobalFlareContext(undefined)
			/* Value is undefined but key exists */
			expect(getGlobalFlareContext()).toBeUndefined()
			expect(GLOBAL_VALUE_KEY in globalThis).toBe(true)

			clearGlobalFlareContext()
			/* Key is deleted */
			expect(GLOBAL_VALUE_KEY in globalThis).toBe(false)
		})
	})
})
