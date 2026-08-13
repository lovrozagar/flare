/**
 * Outlet Context Tests
 *
 * Tests outlet context creation, validation, and child match access.
 * Pure functions re-implemented for testing.
 */

import { describe, expect, it } from "vitest"

/* ============================================================================
 * Re-implemented Types and Functions for Testing
 * ============================================================================ */

interface MatchedRoute<TLoaderData = unknown, TPreloaderContext = unknown> {
	_type?: "layout" | "page" | "root"
	error?: Error
	loaderData: TLoaderData
	preloaderContext?: TPreloaderContext
	render: (props: unknown) => unknown
	status?: "error" | "pending" | "success"
	virtualPath: string
}

interface OutletContextValue {
	depth: number
	matches: () => MatchedRoute[]
}

/**
 * Create outlet context value
 */
function createOutletContext(config: {
	depth: number
	matches: () => MatchedRoute[]
}): OutletContextValue {
	return {
		depth: config.depth,
		matches: config.matches,
	}
}

/**
 * Type guard for outlet context
 */
function isOutletContext(value: unknown): value is OutletContextValue {
	if (typeof value !== "object" || value === null) {
		return false
	}

	const obj = value as Record<string, unknown>

	if (typeof obj.depth !== "number") {
		return false
	}

	if (typeof obj.matches !== "function") {
		return false
	}

	return true
}

/**
 * Get the child match for the current outlet depth
 */
function getChildMatch(ctx: OutletContextValue): MatchedRoute | undefined {
	return ctx.matches()[ctx.depth + 1]
}

/* ============================================================================
 * Helper Functions
 * ============================================================================ */

function createMockMatch(virtualPath: string, data?: unknown): MatchedRoute {
	return {
		loaderData: data ?? {},
		render: () => null,
		status: "success",
		virtualPath,
	}
}

/* ============================================================================
 * createOutletContext Tests
 * ============================================================================ */

describe("createOutletContext", () => {
	describe("basic creation", () => {
		it("creates context with depth", () => {
			const matches: MatchedRoute[] = []
			const ctx = createOutletContext({ depth: 0, matches: () => matches })

			expect(ctx.depth).toBe(0)
		})

		it("creates context with matches function", () => {
			const matches: MatchedRoute[] = [createMockMatch("_root_")]
			const ctx = createOutletContext({ depth: 0, matches: () => matches })

			expect(typeof ctx.matches).toBe("function")
			expect(ctx.matches()).toBe(matches)
		})

		it("depth can be any non-negative integer", () => {
			const matches: MatchedRoute[] = []
			const ctx0 = createOutletContext({ depth: 0, matches: () => matches })
			const ctx1 = createOutletContext({ depth: 1, matches: () => matches })
			const ctx5 = createOutletContext({ depth: 5, matches: () => matches })

			expect(ctx0.depth).toBe(0)
			expect(ctx1.depth).toBe(1)
			expect(ctx5.depth).toBe(5)
		})

		it("matches function returns correct array", () => {
			const rootMatch = createMockMatch("_root_", { theme: "dark" })
			const pageMatch = createMockMatch("_root_/home", { title: "Home" })
			const matches = [rootMatch, pageMatch]
			const ctx = createOutletContext({ depth: 0, matches: () => matches })

			const result = ctx.matches()

			expect(result).toHaveLength(2)
			expect(result[0]).toBe(rootMatch)
			expect(result[1]).toBe(pageMatch)
		})
	})

	describe("reactive matches", () => {
		it("matches function can be reactive", () => {
			let matches: MatchedRoute[] = [createMockMatch("_root_")]
			const ctx = createOutletContext({ depth: 0, matches: () => matches })

			expect(ctx.matches()).toHaveLength(1)

			matches = [createMockMatch("_root_"), createMockMatch("_root_/about")]
			expect(ctx.matches()).toHaveLength(2)
		})

		it("matches function re-evaluated on each call", () => {
			let callCount = 0
			const ctx = createOutletContext({
				depth: 0,
				matches: () => {
					callCount++
					return []
				},
			})

			ctx.matches()
			ctx.matches()
			ctx.matches()

			expect(callCount).toBe(3)
		})
	})

	describe("with match data", () => {
		it("preserves loader data in matches", () => {
			const match = createMockMatch("_root_", { user: { id: 1, name: "Alice" } })
			const ctx = createOutletContext({ depth: 0, matches: () => [match] })

			expect(ctx.matches()[0]?.loaderData).toEqual({ user: { id: 1, name: "Alice" } })
		})

		it("preserves preloader context in matches", () => {
			const match: MatchedRoute = {
				loaderData: {},
				preloaderContext: { authToken: "abc123" },
				render: () => null,
				virtualPath: "_root_",
			}
			const ctx = createOutletContext({ depth: 0, matches: () => [match] })

			expect(ctx.matches()[0]?.preloaderContext).toEqual({ authToken: "abc123" })
		})

		it("preserves error in matches", () => {
			const error = new Error("Load failed")
			const match: MatchedRoute = {
				error,
				loaderData: {},
				render: () => null,
				status: "error",
				virtualPath: "_root_",
			}
			const ctx = createOutletContext({ depth: 0, matches: () => [match] })

			expect(ctx.matches()[0]?.error).toBe(error)
			expect(ctx.matches()[0]?.status).toBe("error")
		})
	})
})

/* ============================================================================
 * isOutletContext Tests
 * ============================================================================ */

describe("isOutletContext", () => {
	describe("valid contexts", () => {
		it("returns true for valid context", () => {
			const ctx = createOutletContext({ depth: 0, matches: () => [] })

			expect(isOutletContext(ctx)).toBe(true)
		})

		it("returns true for context with any depth", () => {
			const ctx = createOutletContext({ depth: 10, matches: () => [] })

			expect(isOutletContext(ctx)).toBe(true)
		})

		it("returns true for manually created object", () => {
			const obj = {
				depth: 2,
				matches: () => [],
			}

			expect(isOutletContext(obj)).toBe(true)
		})
	})

	describe("invalid - wrong types", () => {
		it("returns false for null", () => {
			expect(isOutletContext(null)).toBe(false)
		})

		it("returns false for undefined", () => {
			expect(isOutletContext(undefined)).toBe(false)
		})

		it("returns false for string", () => {
			expect(isOutletContext("context")).toBe(false)
		})

		it("returns false for number", () => {
			expect(isOutletContext(42)).toBe(false)
		})

		it("returns false for array", () => {
			expect(isOutletContext([])).toBe(false)
		})

		it("returns false for function", () => {
			expect(isOutletContext(() => {})).toBe(false)
		})
	})

	describe("invalid - missing properties", () => {
		it("returns false for empty object", () => {
			expect(isOutletContext({})).toBe(false)
		})

		it("returns false for object with only depth", () => {
			expect(isOutletContext({ depth: 0 })).toBe(false)
		})

		it("returns false for object with only matches", () => {
			expect(isOutletContext({ matches: () => [] })).toBe(false)
		})
	})

	describe("invalid - wrong property types", () => {
		it("returns false when depth is string", () => {
			expect(isOutletContext({ depth: "0", matches: () => [] })).toBe(false)
		})

		it("returns false when depth is null", () => {
			expect(isOutletContext({ depth: null, matches: () => [] })).toBe(false)
		})

		it("returns false when matches is not function", () => {
			expect(isOutletContext({ depth: 0, matches: [] })).toBe(false)
		})

		it("returns false when matches is string", () => {
			expect(isOutletContext({ depth: 0, matches: "[]" })).toBe(false)
		})

		it("returns false when matches is object", () => {
			expect(isOutletContext({ depth: 0, matches: {} })).toBe(false)
		})
	})

	describe("edge cases", () => {
		it("returns true with extra properties", () => {
			const obj = {
				depth: 0,
				extra: "ignored",
				matches: () => [],
			}

			expect(isOutletContext(obj)).toBe(true)
		})

		it("returns true for depth of 0", () => {
			expect(isOutletContext({ depth: 0, matches: () => [] })).toBe(true)
		})

		it("returns true for negative depth (valid number)", () => {
			/* Note: While semantically invalid, type guard only checks type */
			expect(isOutletContext({ depth: -1, matches: () => [] })).toBe(true)
		})

		it("returns true for float depth (valid number)", () => {
			expect(isOutletContext({ depth: 1.5, matches: () => [] })).toBe(true)
		})
	})
})

/* ============================================================================
 * getChildMatch Tests
 * ============================================================================ */

describe("getChildMatch", () => {
	describe("basic child access", () => {
		it("returns match at depth + 1", () => {
			const root = createMockMatch("_root_")
			const home = createMockMatch("_root_/home")
			const ctx = createOutletContext({ depth: 0, matches: () => [root, home] })

			const child = getChildMatch(ctx)

			expect(child).toBe(home)
		})

		it("returns undefined when no child exists", () => {
			const root = createMockMatch("_root_")
			const ctx = createOutletContext({ depth: 0, matches: () => [root] })

			const child = getChildMatch(ctx)

			expect(child).toBeUndefined()
		})

		it("returns correct child at different depths", () => {
			const root = createMockMatch("_root_")
			const products = createMockMatch("_root_/products")
			const detail = createMockMatch("_root_/products/[id]")
			const matches = [root, products, detail]

			const ctx0 = createOutletContext({ depth: 0, matches: () => matches })
			const ctx1 = createOutletContext({ depth: 1, matches: () => matches })
			const ctx2 = createOutletContext({ depth: 2, matches: () => matches })

			expect(getChildMatch(ctx0)).toBe(products)
			expect(getChildMatch(ctx1)).toBe(detail)
			expect(getChildMatch(ctx2)).toBeUndefined()
		})
	})

	describe("with match hierarchy", () => {
		it("accesses child data correctly", () => {
			const root = createMockMatch("_root_", { theme: "dark" })
			const page = createMockMatch("_root_/home", { title: "Home" })
			const ctx = createOutletContext({ depth: 0, matches: () => [root, page] })

			const child = getChildMatch(ctx)

			expect(child?.virtualPath).toBe("_root_/home")
			expect(child?.loaderData).toEqual({ title: "Home" })
		})

		it("returns child with error state", () => {
			const root = createMockMatch("_root_")
			const error = new Error("Failed to load")
			const errorPage: MatchedRoute = {
				error,
				loaderData: {},
				render: () => null,
				status: "error",
				virtualPath: "_root_/error",
			}
			const ctx = createOutletContext({ depth: 0, matches: () => [root, errorPage] })

			const child = getChildMatch(ctx)

			expect(child?.status).toBe("error")
			expect(child?.error).toBe(error)
		})

		it("returns child with pending state", () => {
			const root = createMockMatch("_root_")
			const pending: MatchedRoute = {
				loaderData: {},
				render: () => null,
				status: "pending",
				virtualPath: "_root_/loading",
			}
			const ctx = createOutletContext({ depth: 0, matches: () => [root, pending] })

			const child = getChildMatch(ctx)

			expect(child?.status).toBe("pending")
		})
	})

	describe("empty and edge cases", () => {
		it("returns undefined for empty matches", () => {
			const ctx = createOutletContext({ depth: 0, matches: () => [] })

			expect(getChildMatch(ctx)).toBeUndefined()
		})

		it("returns undefined when depth exceeds matches", () => {
			const root = createMockMatch("_root_")
			const ctx = createOutletContext({ depth: 5, matches: () => [root] })

			expect(getChildMatch(ctx)).toBeUndefined()
		})

		it("handles single match at depth 0", () => {
			const root = createMockMatch("_root_")
			const ctx = createOutletContext({ depth: 0, matches: () => [root] })

			/* depth + 1 = 1, which is out of bounds */
			expect(getChildMatch(ctx)).toBeUndefined()
		})
	})

	describe("deeply nested routes", () => {
		it("handles deep nesting correctly", () => {
			const matches = [
				createMockMatch("_root_"),
				createMockMatch("_root_/shop"),
				createMockMatch("_root_/shop/category"),
				createMockMatch("_root_/shop/category/[id]"),
				createMockMatch("_root_/shop/category/[id]/reviews"),
			]

			for (let depth = 0; depth < matches.length - 1; depth++) {
				const ctx = createOutletContext({ depth, matches: () => matches })
				expect(getChildMatch(ctx)).toBe(matches[depth + 1])
			}
		})

		it("returns undefined at deepest level", () => {
			const matches = [
				createMockMatch("_root_"),
				createMockMatch("_root_/a"),
				createMockMatch("_root_/a/b"),
				createMockMatch("_root_/a/b/c"),
			]

			const ctx = createOutletContext({ depth: 3, matches: () => matches })
			expect(getChildMatch(ctx)).toBeUndefined()
		})
	})
})

/* ============================================================================
 * MatchedRoute Type Tests
 * ============================================================================ */

describe("MatchedRoute structure", () => {
	it("minimal valid match has virtualPath, loaderData, render", () => {
		const match: MatchedRoute = {
			loaderData: null,
			render: () => null,
			virtualPath: "_root_",
		}

		expect(match.virtualPath).toBe("_root_")
		expect(match.loaderData).toBeNull()
		expect(typeof match.render).toBe("function")
	})

	it("match can have all optional properties", () => {
		const match: MatchedRoute<{ data: string }, { auth: boolean }> = {
			_type: "page",
			loaderData: { data: "test" },
			preloaderContext: { auth: true },
			render: () => null,
			status: "success",
			virtualPath: "_root_/test",
		}

		expect(match._type).toBe("page")
		expect(match.status).toBe("success")
		expect(match.preloaderContext).toEqual({ auth: true })
	})

	it("match types include layout, page, root", () => {
		const types = ["layout", "page", "root"] as const

		for (const type of types) {
			const match: MatchedRoute = {
				_type: type,
				loaderData: {},
				render: () => null,
				virtualPath: "_root_",
			}
			expect(match._type).toBe(type)
		}
	})

	it("status types include error, pending, success", () => {
		const statuses = ["error", "pending", "success"] as const

		for (const status of statuses) {
			const match: MatchedRoute = {
				loaderData: {},
				render: () => null,
				status,
				virtualPath: "_root_",
			}
			expect(match.status).toBe(status)
		}
	})
})

/* ============================================================================
 * Integration Scenarios
 * ============================================================================ */

describe("integration scenarios", () => {
	describe("outlet rendering simulation", () => {
		it("simulates root outlet finding first child", () => {
			const root: MatchedRoute = {
				_type: "root",
				loaderData: { theme: "light" },
				render: () => "RootLayout",
				virtualPath: "_root_",
			}
			const page: MatchedRoute = {
				_type: "page",
				loaderData: { content: "Hello" },
				render: () => "HomePage",
				virtualPath: "_root_/home",
			}

			const rootCtx = createOutletContext({ depth: 0, matches: () => [root, page] })
			const child = getChildMatch(rootCtx)

			expect(child?.render({})).toBe("HomePage")
		})

		it("simulates nested layout finding nested page", () => {
			const matches: MatchedRoute[] = [
				{ loaderData: {}, render: () => "Root", virtualPath: "_root_" },
				{ loaderData: {}, render: () => "ShopLayout", virtualPath: "_root_/shop" },
				{
					loaderData: { products: [] },
					render: () => "ProductList",
					virtualPath: "_root_/shop/products",
				},
			]

			/* Layout at depth 1 renders page at depth 2 */
			const layoutCtx = createOutletContext({ depth: 1, matches: () => matches })
			const page = getChildMatch(layoutCtx)

			expect(page?.virtualPath).toBe("_root_/shop/products")
			expect(page?.render({})).toBe("ProductList")
		})
	})

	describe("context validation in middleware", () => {
		it("validates context before use", () => {
			const maybeContext: unknown = {
				depth: 0,
				matches: () => [],
			}

			if (isOutletContext(maybeContext)) {
				/* TypeScript narrows type here */
				expect(maybeContext.depth).toBe(0)
				expect(typeof maybeContext.matches).toBe("function")
			}
		})

		it("rejects invalid context safely", () => {
			const invalidContexts = [null, undefined, {}, { depth: "0" }, { matches: [] }]

			for (const invalid of invalidContexts) {
				expect(isOutletContext(invalid)).toBe(false)
			}
		})
	})

	describe("dynamic match updates", () => {
		it("handles navigation match updates", () => {
			const homeMatches = [
				createMockMatch("_root_"),
				createMockMatch("_root_/home", { page: "home" }),
			]

			const aboutMatches = [
				createMockMatch("_root_"),
				createMockMatch("_root_/about", { page: "about" }),
			]

			let currentMatches = homeMatches
			const ctx = createOutletContext({ depth: 0, matches: () => currentMatches })

			expect(getChildMatch(ctx)?.loaderData).toEqual({ page: "home" })

			/* Simulate navigation */
			currentMatches = aboutMatches
			expect(getChildMatch(ctx)?.loaderData).toEqual({ page: "about" })
		})
	})
})
