/**
 * Prefetch Cache Unit Tests
 *
 * Tests prefetch tracking for Link components.
 * Tracks when URLs were prefetched to avoid redundant requests.
 */

import { describe, expect, it } from "vitest"
import { createPrefetchCache } from "../../../src/router/_internal/prefetch-cache"

describe("createPrefetchCache", () => {
	it("creates empty cache", () => {
		const cache = createPrefetchCache()

		expect(cache.size()).toBe(0)
	})
})

describe("set and get", () => {
	it("stores and retrieves prefetch entry", () => {
		const cache = createPrefetchCache()
		const now = Date.now()

		cache.set("/products", now)
		const entry = cache.get("/products")

		expect(entry).toBe(now)
	})

	it("returns undefined for missing entry", () => {
		const cache = createPrefetchCache()

		expect(cache.get("/nonexistent")).toBeUndefined()
	})

	it("overwrites existing entry", () => {
		const cache = createPrefetchCache()

		cache.set("/products", 1000)
		cache.set("/products", 2000)

		expect(cache.get("/products")).toBe(2000)
	})
})

describe("has", () => {
	it("returns true for existing entry", () => {
		const cache = createPrefetchCache()
		cache.set("/test", Date.now())

		expect(cache.has("/test")).toBe(true)
	})

	it("returns false for missing entry", () => {
		const cache = createPrefetchCache()

		expect(cache.has("/nonexistent")).toBe(false)
	})
})

describe("delete", () => {
	it("removes entry from cache", () => {
		const cache = createPrefetchCache()
		cache.set("/test", Date.now())

		cache.delete("/test")

		expect(cache.has("/test")).toBe(false)
	})
})

describe("clear", () => {
	it("removes all entries", () => {
		const cache = createPrefetchCache()
		cache.set("/a", Date.now())
		cache.set("/b", Date.now())

		cache.clear()

		expect(cache.size()).toBe(0)
	})
})

describe("isStale", () => {
	it("returns false for fresh prefetch", () => {
		const cache = createPrefetchCache()
		const now = Date.now()
		cache.set("/products", now)

		expect(cache.isStale("/products", 60000, now)).toBe(false)
	})

	it("returns true for stale prefetch", () => {
		const cache = createPrefetchCache()
		const now = Date.now()
		cache.set("/products", now - 120000)

		expect(cache.isStale("/products", 60000, now)).toBe(true)
	})

	it("returns true for missing entry", () => {
		const cache = createPrefetchCache()

		expect(cache.isStale("/nonexistent", 60000)).toBe(true)
	})

	it("uses staleTime of 0 correctly", () => {
		const cache = createPrefetchCache()
		const now = Date.now()
		cache.set("/products", now - 1)

		expect(cache.isStale("/products", 0, now)).toBe(true)
	})
})

describe("shouldPrefetch", () => {
	it("returns true when not cached", () => {
		const cache = createPrefetchCache()

		expect(cache.shouldPrefetch("/products", 60000)).toBe(true)
	})

	it("returns false when fresh", () => {
		const cache = createPrefetchCache()
		const now = Date.now()
		cache.set("/products", now)

		expect(cache.shouldPrefetch("/products", 60000, now)).toBe(false)
	})

	it("returns true when stale", () => {
		const cache = createPrefetchCache()
		const now = Date.now()
		cache.set("/products", now - 120000)

		expect(cache.shouldPrefetch("/products", 60000, now)).toBe(true)
	})
})

describe("mark", () => {
	it("marks URL as prefetched with current time", () => {
		const cache = createPrefetchCache()
		const before = Date.now()

		cache.mark("/products")

		const after = Date.now()
		const fetchedAt = cache.get("/products")
		expect(fetchedAt).toBeGreaterThanOrEqual(before)
		expect(fetchedAt).toBeLessThanOrEqual(after)
	})
})

describe("size", () => {
	it("returns number of entries", () => {
		const cache = createPrefetchCache()
		cache.set("/a", Date.now())
		cache.set("/b", Date.now())

		expect(cache.size()).toBe(2)
	})
})

describe("cleanup", () => {
	it("removes entries older than maxAge", () => {
		const cache = createPrefetchCache()
		const now = Date.now()

		cache.set("/old", now - 600000)
		cache.set("/fresh", now - 10000)

		cache.cleanup(300000, now)

		expect(cache.has("/old")).toBe(false)
		expect(cache.has("/fresh")).toBe(true)
	})
})
