import { describe, expect, it, vi } from "vitest";
import {
	collectDeferredPromises,
	createDeferredTracker,
	createMatchCache,
	createPrefetchCache,
} from "../../../src/caches/index.ts";

/* ── collectDeferredPromises edge cases ──────────────────────────── */

describe("collectDeferredPromises edge cases", () => {
	it("deeply nested deferred 3 levels deep", () => {
		const p = Promise.resolve("val");
		const data = {
			level1: {
				level2: {
					level3: { __deferred: true, __key: "d0", promise: p },
				},
			},
		};
		const result = collectDeferredPromises(data);
		expect(result).toHaveLength(1);
		expect(result[0]?.key).toBe("d0");
	});

	it("deferred mixed with non-deferred in same object", () => {
		const p = Promise.resolve("val");
		const data = {
			deferred: { __deferred: true, __key: "d0", promise: p },
			nested: { more: { __deferred: true, __key: "d1", promise: p } },
			normal: "hello",
			number: 42,
		};
		const result = collectDeferredPromises(data);
		expect(result).toHaveLength(2);
		expect(result.map((r) => r.key).sort()).toEqual(["d0", "d1"]);
	});

	it("array of deferred markers", () => {
		const data = [
			{ __deferred: true, __key: "d0", promise: Promise.resolve(1) },
			{ __deferred: true, __key: "d1", promise: Promise.resolve(2) },
			{ __deferred: true, __key: "d2", promise: Promise.resolve(3) },
		];
		expect(collectDeferredPromises(data)).toHaveLength(3);
	});

	it("deferred inside array inside object", () => {
		const data = {
			items: [{ id: 1 }, { __deferred: true, __key: "d0", promise: Promise.resolve("x") }, { id: 3 }],
		};
		expect(collectDeferredPromises(data)).toHaveLength(1);
	});

	it("boolean value false → empty", () => {
		expect(collectDeferredPromises(false)).toEqual([]);
	});

	it("empty object → empty", () => {
		expect(collectDeferredPromises({})).toEqual([]);
	});

	it("empty array → empty", () => {
		expect(collectDeferredPromises([])).toEqual([]);
	});

	it("marker with __deferred: false (not true) → not collected", () => {
		const data = { __deferred: false, __key: "d0", promise: Promise.resolve("x") };
		expect(collectDeferredPromises(data)).toEqual([]);
	});

	it("marker missing __key → not collected", () => {
		const data = { __deferred: true, promise: Promise.resolve("x") };
		expect(collectDeferredPromises(data)).toEqual([]);
	});

	it("marker with non-Promise promise field → not collected", () => {
		const data = { __deferred: true, __key: "d0", promise: "not-a-promise" };
		expect(collectDeferredPromises(data)).toEqual([]);
	});
});

/* ── deferredTracker complex resolution ──────────────────────────── */

describe("deferredTracker complex resolution", () => {
	it("three deferreds: resolve in reverse order", () => {
		const cache = createMatchCache();
		const tracker = createDeferredTracker(cache);
		const onAll = vi.fn();

		cache.set({
			data: {
				a: { __deferred: true, __key: "d0" },
				b: { __deferred: true, __key: "d1" },
				c: { __deferred: true, __key: "d2" },
			},
			hasDeferred: true,
			invalid: false,
			matchId: "m1",
			updatedAt: 1000,
		});

		tracker.track("m1", "d0", onAll);
		tracker.track("m1", "d1", onAll);
		tracker.track("m1", "d2", onAll);

		/* Resolve in reverse order */
		tracker.resolve("m1", "d2", "c-val");
		expect(onAll).not.toHaveBeenCalled();
		tracker.resolve("m1", "d1", "b-val");
		expect(onAll).not.toHaveBeenCalled();
		tracker.resolve("m1", "d0", "a-val");
		expect(onAll).toHaveBeenCalledTimes(1);

		const data = cache.get("m1")?.data as Record<string, unknown>;
		expect(data["a"]).toBe("a-val");
		expect(data["b"]).toBe("b-val");
		expect(data["c"]).toBe("c-val");
	});

	it("resolve with null data is valid", () => {
		const cache = createMatchCache();
		const tracker = createDeferredTracker(cache);
		const onAll = vi.fn();

		cache.set({
			data: { review: { __deferred: true, __key: "d0" } },
			hasDeferred: true,
			invalid: false,
			matchId: "m1",
			updatedAt: 1000,
		});

		tracker.track("m1", "d0", onAll);
		tracker.resolve("m1", "d0", null);

		expect(onAll).toHaveBeenCalledTimes(1);
		const data = cache.get("m1")?.data as Record<string, unknown>;
		expect(data["review"]).toBeNull();
	});

	it("resolve with undefined keeps marker (undefined = not yet resolved)", () => {
		const cache = createMatchCache();
		const tracker = createDeferredTracker(cache);
		const onAll = vi.fn();

		cache.set({
			data: { a: { __deferred: true, __key: "d0" }, b: { __deferred: true, __key: "d1" } },
			hasDeferred: true,
			invalid: false,
			matchId: "m1",
			updatedAt: 1000,
		});

		tracker.track("m1", "d0", onAll);
		tracker.track("m1", "d1", onAll);

		/* undefined = tracked but not yet resolved, so this effectively stays pending */
		tracker.resolve("m1", "d0", undefined);
		/* d0 was set to undefined which is the initial "not resolved" sentinel */
		/* d1 also undefined → allResolved check: every value !== undefined → fails */
		expect(onAll).not.toHaveBeenCalled();
	});

	it("reject then resolve same key: reject already removed key", () => {
		const cache = createMatchCache();
		const tracker = createDeferredTracker(cache);
		const onAll = vi.fn();

		cache.set({
			data: { review: { __deferred: true, __key: "d0" } },
			hasDeferred: true,
			invalid: false,
			matchId: "m1",
			updatedAt: 1000,
		});

		tracker.track("m1", "d0", onAll);
		tracker.reject("m1", "d0", new Error("fail"));
		/* After reject, key is deleted from entry.keys, entry still exists but empty */
		/* Resolve on empty/removed matchId → no-op (entry was cleaned up) */
		tracker.resolve("m1", "d0", "late-data");
		expect(onAll).not.toHaveBeenCalled();
	});

	it("multiple independent matchIds resolve at different times", () => {
		const cache = createMatchCache();
		const tracker = createDeferredTracker(cache);
		const onAll = vi.fn();

		cache.set({
			data: { a: { __deferred: true, __key: "d0" } },
			hasDeferred: true,
			invalid: false,
			matchId: "m1",
			updatedAt: 1000,
		});
		cache.set({
			data: { b: { __deferred: true, __key: "d0" } },
			hasDeferred: true,
			invalid: false,
			matchId: "m2",
			updatedAt: 1000,
		});

		tracker.track("m1", "d0", onAll);
		tracker.track("m2", "d0", onAll);

		/* Resolve m2 first */
		tracker.resolve("m2", "d0", "m2-data");
		expect(onAll).toHaveBeenCalledTimes(1);
		expect(onAll).toHaveBeenCalledWith("m2");

		/* Resolve m1 second */
		tracker.resolve("m1", "d0", "m1-data");
		expect(onAll).toHaveBeenCalledTimes(2);
		expect(onAll).toHaveBeenCalledWith("m1");
	});
});

/* ── matchCache invalidation priority ────────────────────────────── */

describe("matchCache invalidation ordering", () => {
	it("tags takes priority: skips matchId/routeId/filter checks", () => {
		const cache = createMatchCache();
		cache.set({
			data: "x",
			invalid: false,
			matchId: "target",
			tags: ["a"],
			updatedAt: Date.now(),
		});
		cache.set({
			data: "y",
			invalid: false,
			matchId: "other",
			tags: ["b"],
			updatedAt: Date.now(),
		});

		/* tags provided → only tag-based check runs */
		cache.invalidate({ matchId: "other", tags: ["a"] });
		expect(cache.get("target")?.invalid).toBe(true);
		/* matchId "other" not checked because tags path returned early */
		expect(cache.get("other")?.invalid).toBe(false);
	});

	it("matchId takes priority over routeId when both provided", () => {
		const cache = createMatchCache();
		cache.set({ data: "x", invalid: false, matchId: "route1:abc", updatedAt: Date.now() });
		cache.set({ data: "y", invalid: false, matchId: "route1:def", updatedAt: Date.now() });

		cache.invalidate({ matchId: "route1:abc", routeId: "route1" });
		/* Only matchId check runs (returns early) */
		expect(cache.get("route1:abc")?.invalid).toBe(true);
		expect(cache.get("route1:def")?.invalid).toBe(false);
	});

	it("invalidate with unknown matchId is no-op", () => {
		const cache = createMatchCache();
		cache.set({ data: "x", invalid: false, matchId: "m1", updatedAt: Date.now() });
		cache.invalidate({ matchId: "nonexistent" });
		expect(cache.get("m1")?.invalid).toBe(false);
	});

	it("invalidate by routeId with colon in routeId", () => {
		const cache = createMatchCache();
		/* matchId format: routeId:params:deps — routeId itself might contain colons */
		cache.set({ data: "x", invalid: false, matchId: "/api:v2:{}", updatedAt: Date.now() });
		cache.invalidate({ routeId: "/api" });
		/* Starts with "/api:" → matches */
		expect(cache.get("/api:v2:{}")?.invalid).toBe(true);
	});
});

/* ── matchCache concurrent operations ────────────────────────────── */

describe("matchCache concurrent operations", () => {
	it("set during getAll iteration: new entry appears in fresh getAll", () => {
		const cache = createMatchCache();
		cache.set({ data: "a", invalid: false, matchId: "m1", updatedAt: Date.now() });
		cache.set({ data: "b", invalid: false, matchId: "m2", updatedAt: Date.now() });

		/* getAll returns a snapshot (spread to array) */
		const snapshot = cache.getAll();
		cache.set({ data: "c", invalid: false, matchId: "m3", updatedAt: Date.now() });

		expect(snapshot).toHaveLength(2);
		expect(cache.getAll()).toHaveLength(3);
	});

	it("invalidate during getAll: snapshot not affected", () => {
		const cache = createMatchCache();
		cache.set({ data: "a", invalid: false, matchId: "m1", updatedAt: Date.now() });
		const snapshot = cache.getAll();
		cache.invalidate();
		/* snapshot refs still point to same objects — invalid flag is mutated */
		expect(snapshot[0]?.invalid).toBe(true);
	});
});

/* ── prefetchCache edge cases ────────────────────────────────────── */

describe("prefetchCache edge cases", () => {
	it("set with timestamp 0 → immediately stale", () => {
		const cache = createPrefetchCache();
		cache.set("/about", 0);
		expect(cache.isStale("/about", 1000)).toBe(true);
	});

	it("set with future timestamp → not stale for a long time", () => {
		const cache = createPrefetchCache();
		cache.set("/about", Date.now() + 999_999);
		expect(cache.isStale("/about", 999_999)).toBe(false);
	});

	it("cleanup with maxAge 0 removes all entries", () => {
		const cache = createPrefetchCache();
		cache.set("/a", Date.now() - 1);
		cache.set("/b", Date.now() - 1);
		cache.cleanup(0);
		expect(cache.size()).toBe(0);
	});

	it("cleanup with huge maxAge removes nothing", () => {
		const cache = createPrefetchCache();
		cache.set("/a", 0);
		cache.set("/b", 1);
		cache.cleanup(Number.POSITIVE_INFINITY);
		expect(cache.size()).toBe(2);
	});
});

/* ── matchCache with tags ────────────────────────────────────────── */

describe("matchCache tag invalidation edge cases", () => {
	it("invalidate with empty tags array → no entries invalidated", () => {
		const cache = createMatchCache();
		cache.set({ data: "x", invalid: false, matchId: "m1", tags: ["a"], updatedAt: Date.now() });
		cache.invalidate({ tags: [] });
		/* empty tags array: some() returns false for all entries */
		expect(cache.get("m1")?.invalid).toBe(false);
	});

	it("entry with empty tags array not affected by tag invalidation", () => {
		const cache = createMatchCache();
		cache.set({ data: "x", invalid: false, matchId: "m1", tags: [], updatedAt: Date.now() });
		cache.invalidate({ tags: ["a"] });
		expect(cache.get("m1")?.invalid).toBe(false);
	});

	it("tag invalidation does not affect entries without tags property", () => {
		const cache = createMatchCache();
		cache.set({ data: "x", invalid: false, matchId: "m1", updatedAt: Date.now() });
		cache.invalidate({ tags: ["a"] });
		expect(cache.get("m1")?.invalid).toBe(false);
	});

	it("invalidate with duplicate tags in array still works", () => {
		const cache = createMatchCache();
		cache.set({ data: "x", invalid: false, matchId: "m1", tags: ["a"], updatedAt: Date.now() });
		cache.invalidate({ tags: ["a", "a", "a"] });
		expect(cache.get("m1")?.invalid).toBe(true);
	});
});

/* ── LRU eviction under repeated updates ─────────────────────────── */

describe("LRU eviction under rapid updates", () => {
	it("rapid set/delete cycles maintain correct size", () => {
		const cache = createMatchCache(5);
		for (let i = 0; i < 100; i++) {
			cache.set({ data: i, invalid: false, matchId: `m${i}`, updatedAt: i });
		}
		expect(cache.size()).toBe(5);
		/* Only last 5 entries remain */
		expect(cache.has("m95")).toBe(true);
		expect(cache.has("m99")).toBe(true);
		expect(cache.has("m94")).toBe(false);
	});

	it("alternating set on same 2 keys never evicts either", () => {
		const cache = createMatchCache(2);
		for (let i = 0; i < 50; i++) {
			cache.set({ data: `a-${i}`, invalid: false, matchId: "m1", updatedAt: i });
			cache.set({ data: `b-${i}`, invalid: false, matchId: "m2", updatedAt: i });
		}
		expect(cache.size()).toBe(2);
		expect(cache.has("m1")).toBe(true);
		expect(cache.has("m2")).toBe(true);
	});
});

/* ── scroll store edge cases ─────────────────────────────────────── */

describe("scroll store LRU from history", () => {
	it("createScrollStore(0) immediately evicts", async () => {
		const { createScrollStore } = await import("../../../src/history");
		const store = createScrollStore(0);
		store.save("k1", { x: 0, y: 100 });
		/* size > 0 → evicts immediately */
		expect(store.get("k1")).toBeNull();
	});

	it("scroll store save same key updates position", async () => {
		const { createScrollStore } = await import("../../../src/history");
		const store = createScrollStore(10);
		store.save("k1", { x: 0, y: 100 });
		store.save("k1", { x: 0, y: 200 });
		expect(store.get("k1")).toEqual({ x: 0, y: 200 });
	});

	it("scroll store evicts oldest on overflow", async () => {
		const { createScrollStore } = await import("../../../src/history");
		const store = createScrollStore(2);
		store.save("k1", { x: 0, y: 1 });
		store.save("k2", { x: 0, y: 2 });
		store.save("k3", { x: 0, y: 3 });
		expect(store.get("k1")).toBeNull();
		expect(store.get("k2")).toEqual({ x: 0, y: 2 });
		expect(store.get("k3")).toEqual({ x: 0, y: 3 });
	});
});
