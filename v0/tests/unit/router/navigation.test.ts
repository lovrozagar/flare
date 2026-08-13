/**
 * Navigation Helper Unit Tests
 *
 * Tests navigation decision logic for CSR.
 * Determines which matchIds need fresh data from server.
 */

import { describe, expect, it } from "vitest"
import {
	computeNeededMatchIds,
	type NavigationContext,
	type RouteMatch,
} from "../../../src/router/_internal/navigation"

describe("computeNeededMatchIds", () => {
	const createMatch = (
		matchId: string,
		routeId: string,
		options?: { shouldRefetch?: boolean; staleTime?: number },
	): RouteMatch => ({
		matchId,
		routeId,
		shouldRefetch: options?.shouldRefetch,
		staleTime: options?.staleTime,
	})

	it("returns all matchIds when cache is empty", () => {
		const ctx: NavigationContext = {
			defaultStaleTime: 0,
			getCachedMatch: () => undefined,
			matches: [createMatch("root", "_root_"), createMatch("products", "_root_/products")],
			now: Date.now(),
		}

		const needed = computeNeededMatchIds(ctx)

		expect(needed).toEqual(["root", "products"])
	})

	it("excludes fresh cached matches", () => {
		const now = Date.now()
		const ctx: NavigationContext = {
			defaultStaleTime: 60000,
			getCachedMatch: (matchId) => {
				if (matchId === "root") {
					return { invalid: false, updatedAt: now - 10000 }
				}
				return undefined
			},
			matches: [createMatch("root", "_root_"), createMatch("products", "_root_/products")],
			now,
		}

		const needed = computeNeededMatchIds(ctx)

		expect(needed).toEqual(["products"])
	})

	it("includes stale cached matches", () => {
		const now = Date.now()
		const ctx: NavigationContext = {
			defaultStaleTime: 60000,
			getCachedMatch: (matchId) => {
				if (matchId === "root") {
					return { invalid: false, updatedAt: now - 120000 }
				}
				return undefined
			},
			matches: [createMatch("root", "_root_")],
			now,
		}

		const needed = computeNeededMatchIds(ctx)

		expect(needed).toEqual(["root"])
	})

	it("includes invalid cached matches", () => {
		const now = Date.now()
		const ctx: NavigationContext = {
			defaultStaleTime: 60000,
			getCachedMatch: () => ({ invalid: true, updatedAt: now }),
			matches: [createMatch("root", "_root_")],
			now,
		}

		const needed = computeNeededMatchIds(ctx)

		expect(needed).toEqual(["root"])
	})

	it("respects route-level staleTime", () => {
		const now = Date.now()
		const ctx: NavigationContext = {
			defaultStaleTime: 60000,
			getCachedMatch: (matchId) => {
				if (matchId === "products") {
					return { invalid: false, updatedAt: now - 10000 }
				}
				return undefined
			},
			matches: [createMatch("products", "_root_/products", { staleTime: 5000 })],
			now,
		}

		const needed = computeNeededMatchIds(ctx)

		expect(needed).toEqual(["products"])
	})

	it("includes match when shouldRefetch returns true", () => {
		const now = Date.now()
		const ctx: NavigationContext = {
			defaultStaleTime: 60000,
			getCachedMatch: () => ({ invalid: false, updatedAt: now }),
			matches: [createMatch("products", "_root_/products", { shouldRefetch: true })],
			now,
		}

		const needed = computeNeededMatchIds(ctx)

		expect(needed).toEqual(["products"])
	})

	it("returns empty array when all matches are fresh", () => {
		const now = Date.now()
		const ctx: NavigationContext = {
			defaultStaleTime: 60000,
			getCachedMatch: () => ({ invalid: false, updatedAt: now }),
			matches: [createMatch("root", "_root_"), createMatch("products", "_root_/products")],
			now,
		}

		const needed = computeNeededMatchIds(ctx)

		expect(needed).toEqual([])
	})
})

describe("complex scenarios", () => {
	const createMatch = (
		matchId: string,
		routeId: string,
		options?: { shouldRefetch?: boolean; staleTime?: number },
	): RouteMatch => ({
		matchId,
		routeId,
		shouldRefetch: options?.shouldRefetch,
		staleTime: options?.staleTime,
	})

	it("mixed fresh, stale, and missing matches", () => {
		const now = Date.now()
		const ctx: NavigationContext = {
			defaultStaleTime: 60000,
			getCachedMatch: (matchId) => {
				if (matchId === "root") {
					return { invalid: false, updatedAt: now }
				}
				if (matchId === "layout") {
					return { invalid: false, updatedAt: now - 120000 }
				}
				return undefined
			},
			matches: [
				createMatch("root", "_root_"),
				createMatch("layout", "_root_/(auth)"),
				createMatch("page", "_root_/(auth)/dashboard"),
			],
			now,
		}

		const needed = computeNeededMatchIds(ctx)

		expect(needed).toEqual(["layout", "page"])
	})

	it("shouldRefetch overrides fresh cache", () => {
		const now = Date.now()
		const ctx: NavigationContext = {
			defaultStaleTime: 60000,
			getCachedMatch: () => ({ invalid: false, updatedAt: now }),
			matches: [
				createMatch("root", "_root_"),
				createMatch("products", "_root_/products", { shouldRefetch: true }),
				createMatch("detail", "_root_/products/[id]"),
			],
			now,
		}

		const needed = computeNeededMatchIds(ctx)

		expect(needed).toEqual(["products"])
	})

	it("staleTime: 0 always needs fresh data", () => {
		const now = Date.now()
		const ctx: NavigationContext = {
			defaultStaleTime: 0,
			getCachedMatch: () => ({ invalid: false, updatedAt: now - 1 }),
			matches: [createMatch("products", "_root_/products")],
			now,
		}

		const needed = computeNeededMatchIds(ctx)

		expect(needed).toEqual(["products"])
	})
})
