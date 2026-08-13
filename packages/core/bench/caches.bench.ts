import { bench, describe } from "vitest"
import { collectDeferredPromises, createDeferredTracker, createMatchCache } from "../src/caches"
import { serializeLoaderData } from "../src/ndjson-server"

/* ── collectDeferredPromises ──────────────────────────────────────── */

describe("collectDeferredPromises", () => {
	const noDeferred = {
		items: [
			{ id: 1, name: "a" },
			{ id: 2, name: "b" },
		],
		meta: { page: 1, total: 50 },
	}

	const withDeferred = {
		comments: { __deferred: true, __key: "comments", promise: Promise.resolve([]) },
		items: [{ id: 1, name: "a" }],
		meta: { page: 1, total: 50 },
		related: { __deferred: true, __key: "related", promise: Promise.resolve([]) },
	}

	const deepNested = {
		level1: {
			level2: {
				level3: {
					deferred: { __deferred: true, __key: "deep", promise: Promise.resolve(42) },
					value: "found",
				},
			},
		},
		top: "value",
	}

	bench("no deferred markers", () => {
		collectDeferredPromises(noDeferred)
	})

	bench("2 deferred markers at top level", () => {
		collectDeferredPromises(withDeferred)
	})

	bench("deeply nested deferred", () => {
		collectDeferredPromises(deepNested)
	})
})

/* ── serializeLoaderData with deferred-shaped data ────────────────── */

describe("serializeLoaderData — deferred shapes", () => {
	const loaderWithDeferred = {
		comments: { __deferred: true, error: undefined, key: "comments", promise: Promise.resolve([]) },
		items: [
			{ id: 1, name: "Alice" },
			{ id: 2, name: "Bob" },
		],
		stats: { count: 42, mean: 3.14 },
	}

	const loaderPure = {
		items: [
			{ id: 1, name: "Alice" },
			{ id: 2, name: "Bob" },
		],
		stats: { count: 42, mean: 3.14 },
	}

	bench("with deferred marker", () => {
		serializeLoaderData(loaderWithDeferred)
	})

	bench("pure data (no deferred)", () => {
		serializeLoaderData(loaderPure)
	})
})

/* ── DeferredTracker track + resolve cycle ────────────────────────── */

describe("deferredTracker resolve cycle", () => {
	const matchCache = createMatchCache()
	let callCount = 0
	const onResolved = () => {
		callCount++
	}

	bench("track + resolve single key", () => {
		const tracker = createDeferredTracker(matchCache)
		tracker.track("match-1", "comments", onResolved)
		tracker.resolve("match-1", "comments", [{ id: 1, text: "hello" }])
	})

	bench("track + resolve 3 keys", () => {
		const tracker = createDeferredTracker(matchCache)
		tracker.track("match-2", "comments", onResolved)
		tracker.track("match-2", "related", onResolved)
		tracker.track("match-2", "stats", onResolved)
		tracker.resolve("match-2", "comments", [1, 2])
		tracker.resolve("match-2", "related", [3, 4])
		tracker.resolve("match-2", "stats", { count: 10 })
	})

	bench("track + prune", () => {
		const tracker = createDeferredTracker(matchCache)
		tracker.track("match-a", "k1", onResolved)
		tracker.track("match-b", "k2", onResolved)
		tracker.track("match-c", "k3", onResolved)
		const active = new Set(["match-a"])
		tracker.prune(active)
	})
})
