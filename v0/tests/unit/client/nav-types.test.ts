/**
 * Navigation Types Unit Tests
 *
 * Tests shared navigation helpers.
 */

import { describe, expect, it, vi } from "vitest"
import { updateMatchCache, updateQueryClient } from "../../../src/client/nav-types"
import { createMatchCache } from "../../../src/router/_internal/match-cache"

describe("updateMatchCache", () => {
	it("updates cache with matches from nav state", () => {
		const matchCache = createMatchCache()
		const navState = {
			matches: [
				{ id: "_root_", loaderData: { user: "alice" } },
				{ id: "_root_/page", loaderData: { page: 1 } },
			],
			params: {},
			pathname: "/page",
			queries: [],
		}

		updateMatchCache(matchCache, navState)

		expect(matchCache.has("_root_")).toBe(true)
		expect(matchCache.has("_root_/page")).toBe(true)

		const rootEntry = matchCache.get("_root_")
		expect(rootEntry?.data).toEqual({ user: "alice" })
		expect(rootEntry?.invalid).toBe(false)

		const pageEntry = matchCache.get("_root_/page")
		expect(pageEntry?.data).toEqual({ page: 1 })
	})

	it("sets updatedAt timestamp", () => {
		const matchCache = createMatchCache()
		const before = Date.now()

		updateMatchCache(matchCache, {
			matches: [{ id: "test", loaderData: {} }],
			params: {},
			pathname: "/",
			queries: [],
		})

		const after = Date.now()
		const entry = matchCache.get("test")
		expect(entry?.updatedAt).toBeGreaterThanOrEqual(before)
		expect(entry?.updatedAt).toBeLessThanOrEqual(after)
	})

	it("handles empty matches", () => {
		const matchCache = createMatchCache()
		updateMatchCache(matchCache, {
			matches: [],
			params: {},
			pathname: "/",
			queries: [],
		})
		/* Should not throw */
	})
})

describe("updateQueryClient", () => {
	it("calls setQueryData for each query", () => {
		const setQueryData = vi.fn()
		const queryClient = { setQueryData }

		const queries = [
			{ data: { name: "Alice" }, key: ["user", 1], staleTime: 60000 },
			{ data: { items: [] }, key: ["list"] },
		]

		updateQueryClient(queryClient, queries)

		expect(setQueryData).toHaveBeenCalledTimes(2)
		expect(setQueryData).toHaveBeenCalledWith(
			["user", 1],
			{ name: "Alice" },
			expect.objectContaining({ staleTime: 60000 }),
		)
		expect(setQueryData).toHaveBeenCalledWith(
			["list"],
			{ items: [] },
			expect.objectContaining({ staleTime: undefined }),
		)
	})

	it("sets updatedAt timestamp", () => {
		const setQueryData = vi.fn()
		const queryClient = { setQueryData }
		const before = Date.now()

		updateQueryClient(queryClient, [{ data: {}, key: ["test"] }])

		const after = Date.now()
		const options = setQueryData.mock.calls[0]?.[2] as { updatedAt: number }
		expect(options.updatedAt).toBeGreaterThanOrEqual(before)
		expect(options.updatedAt).toBeLessThanOrEqual(after)
	})

	it("handles empty queries", () => {
		const setQueryData = vi.fn()
		const queryClient = { setQueryData }

		updateQueryClient(queryClient, [])

		expect(setQueryData).not.toHaveBeenCalled()
	})
})
