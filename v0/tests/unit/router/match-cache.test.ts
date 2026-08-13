/**
 * Match Cache Unit Tests
 *
 * Tests client-side match cache for navigation.
 * Caches loader data by matchId with invalidation support.
 */

import { describe, expect, it } from "vitest"
import { type CachedMatch, createMatchCache } from "../../../src/router/_internal/match-cache"

describe("createMatchCache", () => {
	it("creates empty cache", () => {
		const cache = createMatchCache()

		expect(cache.size()).toBe(0)
	})
})

describe("set and get", () => {
	it("stores and retrieves match", () => {
		const cache = createMatchCache()
		const match: CachedMatch = {
			data: { product: { name: "Widget" } },
			invalid: false,
			matchId: "_root_/products/[id]:{}:[]",
			routeId: "_root_/products/[id]",
			updatedAt: Date.now(),
		}

		cache.set(match)
		const retrieved = cache.get(match.matchId)

		expect(retrieved).toEqual(match)
	})

	it("returns undefined for missing match", () => {
		const cache = createMatchCache()

		expect(cache.get("nonexistent")).toBeUndefined()
	})

	it("overwrites existing match", () => {
		const cache = createMatchCache()
		const matchId = "_root_/products/[id]:{}:[]"

		cache.set({
			data: { version: 1 },
			invalid: false,
			matchId,
			routeId: "_root_/products/[id]",
			updatedAt: 1000,
		})

		cache.set({
			data: { version: 2 },
			invalid: false,
			matchId,
			routeId: "_root_/products/[id]",
			updatedAt: 2000,
		})

		const retrieved = cache.get(matchId)
		expect(retrieved?.data).toEqual({ version: 2 })
	})
})

describe("has", () => {
	it("returns true for existing match", () => {
		const cache = createMatchCache()
		cache.set({
			data: {},
			invalid: false,
			matchId: "test",
			routeId: "test",
			updatedAt: Date.now(),
		})

		expect(cache.has("test")).toBe(true)
	})

	it("returns false for missing match", () => {
		const cache = createMatchCache()

		expect(cache.has("nonexistent")).toBe(false)
	})
})

describe("delete", () => {
	it("removes match from cache", () => {
		const cache = createMatchCache()
		cache.set({
			data: {},
			invalid: false,
			matchId: "test",
			routeId: "test",
			updatedAt: Date.now(),
		})

		cache.delete("test")

		expect(cache.has("test")).toBe(false)
	})

	it("does nothing for nonexistent match", () => {
		const cache = createMatchCache()

		expect(() => cache.delete("nonexistent")).not.toThrow()
	})
})

describe("clear", () => {
	it("removes all matches", () => {
		const cache = createMatchCache()
		cache.set({
			data: {},
			invalid: false,
			matchId: "a",
			routeId: "a",
			updatedAt: Date.now(),
		})
		cache.set({
			data: {},
			invalid: false,
			matchId: "b",
			routeId: "b",
			updatedAt: Date.now(),
		})

		cache.clear()

		expect(cache.size()).toBe(0)
	})
})

describe("invalidate", () => {
	it("invalidates all matches when no options", () => {
		const cache = createMatchCache()
		cache.set({
			data: {},
			invalid: false,
			matchId: "a",
			routeId: "_root_/a",
			updatedAt: Date.now(),
		})
		cache.set({
			data: {},
			invalid: false,
			matchId: "b",
			routeId: "_root_/b",
			updatedAt: Date.now(),
		})

		cache.invalidate()

		expect(cache.get("a")?.invalid).toBe(true)
		expect(cache.get("b")?.invalid).toBe(true)
	})

	it("invalidates by routeId", () => {
		const cache = createMatchCache()
		cache.set({
			data: {},
			invalid: false,
			matchId: "products-123",
			routeId: "_root_/products/[id]",
			updatedAt: Date.now(),
		})
		cache.set({
			data: {},
			invalid: false,
			matchId: "users-456",
			routeId: "_root_/users/[id]",
			updatedAt: Date.now(),
		})

		cache.invalidate({ routeId: "_root_/products/[id]" })

		expect(cache.get("products-123")?.invalid).toBe(true)
		expect(cache.get("users-456")?.invalid).toBe(false)
	})

	it("invalidates by matchId", () => {
		const cache = createMatchCache()
		cache.set({
			data: {},
			invalid: false,
			matchId: "products-123",
			routeId: "_root_/products/[id]",
			updatedAt: Date.now(),
		})
		cache.set({
			data: {},
			invalid: false,
			matchId: "products-456",
			routeId: "_root_/products/[id]",
			updatedAt: Date.now(),
		})

		cache.invalidate({ matchId: "products-123" })

		expect(cache.get("products-123")?.invalid).toBe(true)
		expect(cache.get("products-456")?.invalid).toBe(false)
	})

	it("invalidates by filter function", () => {
		const cache = createMatchCache()
		cache.set({
			data: {},
			invalid: false,
			matchId: "admin-1",
			routeId: "_root_/admin/users",
			updatedAt: Date.now(),
		})
		cache.set({
			data: {},
			invalid: false,
			matchId: "admin-2",
			routeId: "_root_/admin/settings",
			updatedAt: Date.now(),
		})
		cache.set({
			data: {},
			invalid: false,
			matchId: "public-1",
			routeId: "_root_/home",
			updatedAt: Date.now(),
		})

		cache.invalidate({
			filter: (match) => match.routeId.startsWith("_root_/admin"),
		})

		expect(cache.get("admin-1")?.invalid).toBe(true)
		expect(cache.get("admin-2")?.invalid).toBe(true)
		expect(cache.get("public-1")?.invalid).toBe(false)
	})
})

describe("isStale", () => {
	it("returns false for fresh match", () => {
		const cache = createMatchCache()
		const now = Date.now()
		cache.set({
			data: {},
			invalid: false,
			matchId: "test",
			routeId: "test",
			updatedAt: now,
		})

		expect(cache.isStale("test", 60000, now)).toBe(false)
	})

	it("returns true for stale match", () => {
		const cache = createMatchCache()
		const now = Date.now()
		cache.set({
			data: {},
			invalid: false,
			matchId: "test",
			routeId: "test",
			updatedAt: now - 120000,
		})

		expect(cache.isStale("test", 60000, now)).toBe(true)
	})

	it("returns true for invalid match", () => {
		const cache = createMatchCache()
		cache.set({
			data: {},
			invalid: true,
			matchId: "test",
			routeId: "test",
			updatedAt: Date.now(),
		})

		expect(cache.isStale("test", 60000)).toBe(true)
	})

	it("returns true for missing match", () => {
		const cache = createMatchCache()

		expect(cache.isStale("nonexistent", 60000)).toBe(true)
	})
})

describe("getAll", () => {
	it("returns all cached matches", () => {
		const cache = createMatchCache()
		cache.set({
			data: { a: 1 },
			invalid: false,
			matchId: "a",
			routeId: "_root_/a",
			updatedAt: 1000,
		})
		cache.set({
			data: { b: 2 },
			invalid: false,
			matchId: "b",
			routeId: "_root_/b",
			updatedAt: 2000,
		})

		const all = cache.getAll()

		expect(all).toHaveLength(2)
		expect(all.map((m) => m.matchId).sort()).toEqual(["a", "b"])
	})
})

describe("size", () => {
	it("returns number of cached matches", () => {
		const cache = createMatchCache()
		cache.set({
			data: {},
			invalid: false,
			matchId: "a",
			routeId: "a",
			updatedAt: Date.now(),
		})
		cache.set({
			data: {},
			invalid: false,
			matchId: "b",
			routeId: "b",
			updatedAt: Date.now(),
		})

		expect(cache.size()).toBe(2)
	})
})
