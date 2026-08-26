import { describe, expect, it, vi } from "vitest";
import {
	collectDeferredPromises,
	createDeferredTracker,
	createMatchCache,
	createPrefetchCache,
} from "../../../src/caches/index.ts";

describe("matchCache", () => {
	it("set + get → returns cached entry", () => {
		const cache = createMatchCache();
		cache.set({ data: "hello", invalid: false, matchId: "m1", updatedAt: Date.now() });
		expect(cache.get("m1")?.data).toBe("hello");
	});

	it("get missing → undefined", () => {
		const cache = createMatchCache();
		expect(cache.get("m1")).toBeUndefined();
	});

	it("has existing → true", () => {
		const cache = createMatchCache();
		cache.set({ data: "x", invalid: false, matchId: "m1", updatedAt: Date.now() });
		expect(cache.has("m1")).toBe(true);
	});

	it("has missing → false", () => {
		const cache = createMatchCache();
		expect(cache.has("m1")).toBe(false);
	});

	it("delete → removes entry", () => {
		const cache = createMatchCache();
		cache.set({ data: "x", invalid: false, matchId: "m1", updatedAt: Date.now() });
		cache.delete("m1");
		expect(cache.get("m1")).toBeUndefined();
	});

	it("clear → empties cache, size returns 0", () => {
		const cache = createMatchCache();
		cache.set({ data: "a", invalid: false, matchId: "m1", updatedAt: Date.now() });
		cache.set({ data: "b", invalid: false, matchId: "m2", updatedAt: Date.now() });
		cache.clear();
		expect(cache.size()).toBe(0);
	});

	it("getAll → returns all entries as array", () => {
		const cache = createMatchCache();
		cache.set({ data: "a", invalid: false, matchId: "m1", updatedAt: Date.now() });
		cache.set({ data: "b", invalid: false, matchId: "m2", updatedAt: Date.now() });
		expect(cache.getAll()).toHaveLength(2);
	});

	it("set same matchId → overwrites", () => {
		const cache = createMatchCache();
		cache.set({ data: "old", invalid: false, matchId: "m1", updatedAt: Date.now() });
		cache.set({ data: "new", invalid: false, matchId: "m1", updatedAt: Date.now() });
		expect(cache.get("m1")?.data).toBe("new");
		expect(cache.size()).toBe(1);
	});
});

describe("matchCache.isStale", () => {
	it("no entry → true", () => {
		const cache = createMatchCache();
		expect(cache.isStale("m1", 1000)).toBe(true);
	});

	it("entry just set, staleTime 1000 → false", () => {
		const cache = createMatchCache();
		cache.set({ data: "x", invalid: false, matchId: "m1", updatedAt: Date.now() });
		expect(cache.isStale("m1", 1000)).toBe(false);
	});

	it("entry set 2000ms ago, staleTime 1000 → true", () => {
		const cache = createMatchCache();
		cache.set({ data: "x", invalid: false, matchId: "m1", updatedAt: Date.now() - 2000 });
		expect(cache.isStale("m1", 1000)).toBe(true);
	});

	it("entry marked invalid → true regardless of time", () => {
		const cache = createMatchCache();
		cache.set({ data: "x", invalid: true, matchId: "m1", updatedAt: Date.now() });
		expect(cache.isStale("m1", 999999)).toBe(true);
	});

	it("staleTime 0 → always true", () => {
		const cache = createMatchCache();
		cache.set({ data: "x", invalid: false, matchId: "m1", updatedAt: Date.now() });
		expect(cache.isStale("m1", 0)).toBe(true);
	});

	it("staleTime Infinity → never stale", () => {
		const cache = createMatchCache();
		cache.set({ data: "x", invalid: false, matchId: "m1", updatedAt: Date.now() - 999999999 });
		expect(cache.isStale("m1", Number.POSITIVE_INFINITY)).toBe(false);
	});

	it("staleTime NaN → always stale (not silently never-stale)", () => {
		const cache = createMatchCache();
		cache.set({ data: "x", invalid: false, matchId: "m1", updatedAt: Date.now() });
		expect(cache.isStale("m1", Number.NaN)).toBe(true);
	});

	it("staleTime negative → always stale", () => {
		const cache = createMatchCache();
		cache.set({ data: "x", invalid: false, matchId: "m1", updatedAt: Date.now() });
		expect(cache.isStale("m1", -1)).toBe(true);
	});
});

describe("matchCache.invalidate", () => {
	it("no options → all entries invalid", () => {
		const cache = createMatchCache();
		cache.set({ data: "a", invalid: false, matchId: "m1", updatedAt: Date.now() });
		cache.set({ data: "b", invalid: false, matchId: "m2", updatedAt: Date.now() });
		cache.invalidate();
		expect(cache.get("m1")?.invalid).toBe(true);
		expect(cache.get("m2")?.invalid).toBe(true);
	});

	it("{ matchId } → only that entry invalid", () => {
		const cache = createMatchCache();
		cache.set({ data: "a", invalid: false, matchId: "m1", updatedAt: Date.now() });
		cache.set({ data: "b", invalid: false, matchId: "m2", updatedAt: Date.now() });
		cache.invalidate({ matchId: "m1" });
		expect(cache.get("m1")?.invalid).toBe(true);
		expect(cache.get("m2")?.invalid).toBe(false);
	});

	it("{ routeId } → matches starting with routeId: invalid", () => {
		const cache = createMatchCache();
		cache.set({ data: "a", invalid: false, matchId: "/products:abc", updatedAt: Date.now() });
		cache.set({ data: "b", invalid: false, matchId: "/products-old:xyz", updatedAt: Date.now() });
		cache.invalidate({ routeId: "/products" });
		expect(cache.get("/products:abc")?.invalid).toBe(true);
		expect(cache.get("/products-old:xyz")?.invalid).toBe(false);
	});

	it("{ filter } → entries where filter returns true invalid", () => {
		const cache = createMatchCache();
		cache.set({ data: "a", invalid: false, matchId: "m1", updatedAt: Date.now() });
		cache.set({ data: "b", invalid: false, matchId: "m2", updatedAt: Date.now() });
		cache.invalidate({ filter: (entry) => entry.matchId === "m1" });
		expect(cache.get("m1")?.invalid).toBe(true);
		expect(cache.get("m2")?.invalid).toBe(false);
	});

	it("invalid entry still in cache (not deleted)", () => {
		const cache = createMatchCache();
		cache.set({ data: "a", invalid: false, matchId: "m1", updatedAt: Date.now() });
		cache.invalidate({ matchId: "m1" });
		expect(cache.has("m1")).toBe(true);
	});

	it("isStale returns true for invalid entry", () => {
		const cache = createMatchCache();
		cache.set({ data: "a", invalid: false, matchId: "m1", updatedAt: Date.now() });
		cache.invalidate({ matchId: "m1" });
		expect(cache.isStale("m1", 999999)).toBe(true);
	});
});

describe("prefetchCache", () => {
	it("mark + has → true", () => {
		const cache = createPrefetchCache();
		cache.mark("/about");
		expect(cache.has("/about")).toBe(true);
	});

	it("has missing → false", () => {
		const cache = createPrefetchCache();
		expect(cache.has("/about")).toBe(false);
	});

	it("delete → removes entry", () => {
		const cache = createPrefetchCache();
		cache.mark("/about");
		cache.delete("/about");
		expect(cache.has("/about")).toBe(false);
	});

	it("clear → empties cache", () => {
		const cache = createPrefetchCache();
		cache.mark("/a");
		cache.mark("/b");
		cache.clear();
		expect(cache.size()).toBe(0);
	});

	it("get → returns fetchedAt timestamp", () => {
		const cache = createPrefetchCache();
		const before = Date.now();
		cache.mark("/about");
		const ts = cache.get("/about");
		expect(ts).toBeGreaterThanOrEqual(before);
	});
});

describe("prefetchCache.shouldPrefetch", () => {
	it("no entry → true", () => {
		const cache = createPrefetchCache();
		expect(cache.shouldPrefetch("/about", 30000)).toBe(true);
	});

	it("just marked, staleTime 30000 → false", () => {
		const cache = createPrefetchCache();
		cache.mark("/about");
		expect(cache.shouldPrefetch("/about", 30000)).toBe(false);
	});

	it("marked 31000ms ago, staleTime 30000 → true", () => {
		const cache = createPrefetchCache();
		cache.set("/about", Date.now() - 31000);
		expect(cache.shouldPrefetch("/about", 30000)).toBe(true);
	});
});

describe("prefetchCache.isStale", () => {
	it("no entry → true", () => {
		const cache = createPrefetchCache();
		expect(cache.isStale("/about", 30000)).toBe(true);
	});

	it("fresh entry → false", () => {
		const cache = createPrefetchCache();
		cache.mark("/about");
		expect(cache.isStale("/about", 30000)).toBe(false);
	});

	it("expired entry → true", () => {
		const cache = createPrefetchCache();
		cache.set("/about", Date.now() - 31000);
		expect(cache.isStale("/about", 30000)).toBe(true);
	});
});

describe("prefetchCache.cleanup", () => {
	it("entries older than maxAge removed", () => {
		const cache = createPrefetchCache();
		cache.set("/old", Date.now() - 600000);
		cache.set("/new", Date.now());
		cache.cleanup(300000);
		expect(cache.has("/old")).toBe(false);
		expect(cache.has("/new")).toBe(true);
	});
});

describe("prefetchCache mark before fetch", () => {
	it("mark then shouldPrefetch → false (prevents duplicate)", () => {
		const cache = createPrefetchCache();
		cache.mark("/about");
		expect(cache.shouldPrefetch("/about", 30000)).toBe(false);
	});
});

describe("matchCache GC boundary", () => {
	it("entry exactly at maxAge boundary is NOT evicted (uses >)", () => {
		const cache = createMatchCache();
		const exactlyAtBoundary = Date.now() - 300_000;
		cache.set({
			data: "boundary",
			invalid: false,
			matchId: "boundary-match",
			updatedAt: exactlyAtBoundary,
		});

		/* GC logic: now - entry.updatedAt > maxAge → 300000 > 300000 is false → kept */
		const now = Date.now();
		for (const entry of cache.getAll()) {
			if (now - entry.updatedAt > 300_000) {
				cache.delete(entry.matchId);
			}
		}

		expect(cache.has("boundary-match")).toBe(true);
	});
});

describe("matchCache maxSize LRU eviction", () => {
	it("evicts oldest entry when exceeding maxSize", () => {
		const cache = createMatchCache(3);
		cache.set({ data: "a", invalid: false, matchId: "m1", updatedAt: Date.now() });
		cache.set({ data: "b", invalid: false, matchId: "m2", updatedAt: Date.now() });
		cache.set({ data: "c", invalid: false, matchId: "m3", updatedAt: Date.now() });
		expect(cache.size()).toBe(3);

		/* 4th entry triggers eviction of oldest (m1) */
		cache.set({ data: "d", invalid: false, matchId: "m4", updatedAt: Date.now() });
		expect(cache.size()).toBe(3);
		expect(cache.has("m1")).toBe(false);
		expect(cache.has("m2")).toBe(true);
		expect(cache.has("m4")).toBe(true);
	});

	it("overwriting existing key does not trigger eviction", () => {
		const cache = createMatchCache(3);
		cache.set({ data: "a", invalid: false, matchId: "m1", updatedAt: Date.now() });
		cache.set({ data: "b", invalid: false, matchId: "m2", updatedAt: Date.now() });
		cache.set({ data: "c", invalid: false, matchId: "m3", updatedAt: Date.now() });

		/* Overwrite m1 — size stays 3, no eviction */
		cache.set({ data: "a-new", invalid: false, matchId: "m1", updatedAt: Date.now() });
		expect(cache.size()).toBe(3);
		expect(cache.get("m1")?.data).toBe("a-new");
		expect(cache.has("m2")).toBe(true);
	});

	it("maxSize 1 keeps only latest entry", () => {
		const cache = createMatchCache(1);
		cache.set({ data: "a", invalid: false, matchId: "m1", updatedAt: Date.now() });
		cache.set({ data: "b", invalid: false, matchId: "m2", updatedAt: Date.now() });
		expect(cache.size()).toBe(1);
		expect(cache.has("m1")).toBe(false);
		expect(cache.has("m2")).toBe(true);
	});

	it("re-set moves entry to end of LRU order (oldest evicted, not re-set)", () => {
		const cache = createMatchCache(3);
		cache.set({ data: "a", invalid: false, matchId: "m1", updatedAt: Date.now() });
		cache.set({ data: "b", invalid: false, matchId: "m2", updatedAt: Date.now() });
		cache.set({ data: "c", invalid: false, matchId: "m3", updatedAt: Date.now() });

		/* Touch m1 → moves to end, m2 becomes oldest */
		cache.set({ data: "a2", invalid: false, matchId: "m1", updatedAt: Date.now() });

		/* Insert m4 → m2 evicted (oldest), not m1 */
		cache.set({ data: "d", invalid: false, matchId: "m4", updatedAt: Date.now() });
		expect(cache.has("m2")).toBe(false);
		expect(cache.has("m1")).toBe(true);
		expect(cache.get("m1")?.data).toBe("a2");
	});
});

describe("prefetchCache maxSize LRU eviction", () => {
	it("mark evicts oldest when exceeding maxSize", () => {
		const cache = createPrefetchCache(2);
		cache.mark("/a");
		cache.mark("/b");
		expect(cache.size()).toBe(2);

		cache.mark("/c");
		expect(cache.size()).toBe(2);
		expect(cache.has("/a")).toBe(false);
		expect(cache.has("/c")).toBe(true);
	});

	it("set evicts oldest when exceeding maxSize", () => {
		const cache = createPrefetchCache(2);
		cache.set("/a", Date.now());
		cache.set("/b", Date.now());

		cache.set("/c", Date.now());
		expect(cache.size()).toBe(2);
		expect(cache.has("/a")).toBe(false);
		expect(cache.has("/c")).toBe(true);
	});

	it("mark re-marks existing → moves to end of LRU", () => {
		const cache = createPrefetchCache(3);
		cache.mark("/a");
		cache.mark("/b");
		cache.mark("/c");

		/* Touch /a → moves to end, /b becomes oldest */
		cache.mark("/a");

		cache.mark("/d");
		expect(cache.has("/b")).toBe(false);
		expect(cache.has("/a")).toBe(true);
	});

	it("set re-sets existing → moves to end of LRU", () => {
		const cache = createPrefetchCache(3);
		cache.set("/a", Date.now());
		cache.set("/b", Date.now());
		cache.set("/c", Date.now());

		/* Touch /a → moves to end, /b becomes oldest */
		cache.set("/a", Date.now());

		cache.set("/d", Date.now());
		expect(cache.has("/b")).toBe(false);
		expect(cache.has("/a")).toBe(true);
	});
});

describe("matchCache.isStale with hasDeferred", () => {
	it("entry with hasDeferred: true → always stale regardless of time", () => {
		const cache = createMatchCache();
		cache.set({
			data: "shell",
			hasDeferred: true,
			invalid: false,
			matchId: "m1",
			updatedAt: Date.now(),
		});
		expect(cache.isStale("m1", 999999)).toBe(true);
	});

	it("entry without hasDeferred, within staleTime → not stale", () => {
		const cache = createMatchCache();
		cache.set({
			data: "full",
			invalid: false,
			matchId: "m1",
			updatedAt: Date.now(),
		});
		expect(cache.isStale("m1", 999999)).toBe(false);
	});

	it("entry with hasDeferred: false → not stale (only true triggers)", () => {
		const cache = createMatchCache();
		cache.set({
			data: "full",
			hasDeferred: false,
			invalid: false,
			matchId: "m1",
			updatedAt: Date.now(),
		});
		expect(cache.isStale("m1", 999999)).toBe(false);
	});

	it("hasDeferred: true takes precedence over fresh staleTime", () => {
		const cache = createMatchCache();
		cache.set({
			data: "shell",
			hasDeferred: true,
			invalid: false,
			matchId: "m1",
			updatedAt: Date.now(),
		});
		/* Even with Infinity staleTime, hasDeferred forces stale */
		expect(cache.isStale("m1", Number.POSITIVE_INFINITY)).toBe(true);
	});

	it("hasDeferred: undefined → not stale within staleTime", () => {
		const cache = createMatchCache();
		cache.set({
			data: "full",
			invalid: false,
			matchId: "m1",
			updatedAt: Date.now(),
		});
		/* hasDeferred is absent (undefined) — should not trigger stale */
		expect(cache.isStale("m1", 999999)).toBe(false);
	});

	it("overwriting hasDeferred entry with non-deferred clears staleness", () => {
		const cache = createMatchCache();
		cache.set({
			data: "shell",
			hasDeferred: true,
			invalid: false,
			matchId: "m1",
			updatedAt: Date.now(),
		});
		expect(cache.isStale("m1", 999999)).toBe(true);

		/* Overwrite with fresh data (no hasDeferred) */
		cache.set({
			data: "full",
			invalid: false,
			matchId: "m1",
			updatedAt: Date.now(),
		});
		expect(cache.isStale("m1", 999999)).toBe(false);
	});

	it("invalid + hasDeferred → stale (invalid checked first)", () => {
		const cache = createMatchCache();
		cache.set({
			data: "shell",
			hasDeferred: true,
			invalid: true,
			matchId: "m1",
			updatedAt: Date.now(),
		});
		expect(cache.isStale("m1", 999999)).toBe(true);
	});
});

describe("matchCache.isCached", () => {
	it("returns true for valid cached entry", () => {
		const cache = createMatchCache();
		cache.set({ data: "hello", invalid: false, matchId: "m1", updatedAt: Date.now() });
		expect(cache.isCached("m1")).toBe(true);
	});

	it("returns false for missing entry", () => {
		const cache = createMatchCache();
		expect(cache.isCached("m1")).toBe(false);
	});

	it("returns false for invalid entry", () => {
		const cache = createMatchCache();
		cache.set({ data: "hello", invalid: true, matchId: "m1", updatedAt: Date.now() });
		expect(cache.isCached("m1")).toBe(false);
	});
});

describe("prefetchCache cleanup multi-entry", () => {
	it("removes multiple old entries, keeps multiple fresh ones", () => {
		const cache = createPrefetchCache();
		const old = Date.now() - 400_000;
		cache.set("/old1", old);
		cache.set("/old2", old - 100_000);
		cache.set("/fresh1", Date.now());
		cache.set("/fresh2", Date.now() - 1000);

		cache.cleanup(300_000);

		expect(cache.has("/old1")).toBe(false);
		expect(cache.has("/old2")).toBe(false);
		expect(cache.has("/fresh1")).toBe(true);
		expect(cache.has("/fresh2")).toBe(true);
		expect(cache.size()).toBe(2);
	});
});

describe("deferredTracker", () => {
	it("fires onAllResolved when single deferred resolves", () => {
		const matchCache = createMatchCache();
		const tracker = createDeferredTracker(matchCache);
		const onAll = vi.fn();

		matchCache.set({
			data: { review: { __deferred: true, __key: "d0" } },
			hasDeferred: true,
			invalid: false,
			matchId: "m1",
			updatedAt: 1000,
		});

		tracker.track("m1", "d0", onAll);
		tracker.resolve("m1", "d0", { stars: 5 });

		expect(onAll).toHaveBeenCalledTimes(1);
		expect(onAll).toHaveBeenCalledWith("m1");
	});

	it("waits for all deferreds before firing onAllResolved", () => {
		const matchCache = createMatchCache();
		const tracker = createDeferredTracker(matchCache);
		const onAll = vi.fn();

		matchCache.set({
			data: {
				comments: { __deferred: true, __key: "d1" },
				review: { __deferred: true, __key: "d0" },
			},
			hasDeferred: true,
			invalid: false,
			matchId: "m1",
			updatedAt: 1000,
		});

		tracker.track("m1", "d0", onAll);
		tracker.track("m1", "d1", onAll);

		tracker.resolve("m1", "d0", { stars: 5 });
		expect(onAll).not.toHaveBeenCalled();

		tracker.resolve("m1", "d1", [{ text: "great" }]);
		expect(onAll).toHaveBeenCalledTimes(1);
	});

	it("updates matchCache data when all deferreds resolve", () => {
		const matchCache = createMatchCache();
		const tracker = createDeferredTracker(matchCache);
		const now = Date.now();

		matchCache.set({
			data: { review: { __deferred: true, __key: "d0" } },
			hasDeferred: true,
			invalid: false,
			matchId: "m1",
			updatedAt: now - 5000,
		});

		tracker.track("m1", "d0", () => {});
		tracker.resolve("m1", "d0", { stars: 5 });

		const entry = matchCache.get("m1");
		expect(entry?.hasDeferred).toBe(false);
		expect(entry?.updatedAt).toBeGreaterThanOrEqual(now);
	});

	it("replaces deferred marker in data with resolved value", () => {
		const matchCache = createMatchCache();
		const tracker = createDeferredTracker(matchCache);

		matchCache.set({
			data: {
				name: "Product",
				review: { __deferred: true, __key: "d0" },
			},
			hasDeferred: true,
			invalid: false,
			matchId: "m1",
			updatedAt: 1000,
		});

		tracker.track("m1", "d0", () => {});
		tracker.resolve("m1", "d0", { stars: 5 });

		const entry = matchCache.get("m1");
		const data = entry?.data as Record<string, unknown>;
		expect(data["name"]).toBe("Product");
		expect(data["review"]).toEqual({ stars: 5 });
	});

	it("replaces nested deferred markers in arrays", () => {
		const matchCache = createMatchCache();
		const tracker = createDeferredTracker(matchCache);

		matchCache.set({
			data: {
				items: [{ extra: { __deferred: true, __key: "d0" }, id: 1 }],
			},
			hasDeferred: true,
			invalid: false,
			matchId: "m1",
			updatedAt: 1000,
		});

		tracker.track("m1", "d0", () => {});
		tracker.resolve("m1", "d0", "resolved-extra");

		const data = matchCache.get("m1")?.data as Record<string, unknown>;
		const items = data["items"] as Array<Record<string, unknown>>;
		expect(items[0]?.["extra"]).toBe("resolved-extra");
	});

	it("reject keeps hasDeferred true", () => {
		const matchCache = createMatchCache();
		const tracker = createDeferredTracker(matchCache);
		const onAll = vi.fn();

		matchCache.set({
			data: { review: { __deferred: true, __key: "d0" } },
			hasDeferred: true,
			invalid: false,
			matchId: "m1",
			updatedAt: 1000,
		});

		tracker.track("m1", "d0", onAll);
		tracker.reject("m1", "d0", new Error("network error"));

		const entry = matchCache.get("m1");
		expect(entry?.hasDeferred).toBe(true);
		expect(onAll).not.toHaveBeenCalled();
	});

	it("mixed resolve + reject: partial resolve does not clear hasDeferred", () => {
		const matchCache = createMatchCache();
		const tracker = createDeferredTracker(matchCache);
		const onAll = vi.fn();

		matchCache.set({
			data: {
				comments: { __deferred: true, __key: "d1" },
				review: { __deferred: true, __key: "d0" },
			},
			hasDeferred: true,
			invalid: false,
			matchId: "m1",
			updatedAt: 1000,
		});

		tracker.track("m1", "d0", onAll);
		tracker.track("m1", "d1", onAll);

		tracker.resolve("m1", "d0", { stars: 5 });
		tracker.reject("m1", "d1", new Error("fail"));

		const entry = matchCache.get("m1");
		expect(entry?.hasDeferred).toBe(true);
		expect(onAll).not.toHaveBeenCalled();
	});

	it("independent matchIds tracked separately", () => {
		const matchCache = createMatchCache();
		const tracker = createDeferredTracker(matchCache);
		const onAll = vi.fn();

		matchCache.set({
			data: { review: { __deferred: true, __key: "d0" } },
			hasDeferred: true,
			invalid: false,
			matchId: "m1",
			updatedAt: 1000,
		});
		matchCache.set({
			data: { stats: { __deferred: true, __key: "d0" } },
			hasDeferred: true,
			invalid: false,
			matchId: "m2",
			updatedAt: 1000,
		});

		tracker.track("m1", "d0", onAll);
		tracker.track("m2", "d0", onAll);

		tracker.resolve("m1", "d0", { stars: 5 });
		expect(onAll).toHaveBeenCalledTimes(1);
		expect(onAll).toHaveBeenCalledWith("m1");

		tracker.resolve("m2", "d0", { count: 42 });
		expect(onAll).toHaveBeenCalledTimes(2);
		expect(onAll).toHaveBeenCalledWith("m2");
	});

	it("clear removes all tracked state", () => {
		const matchCache = createMatchCache();
		const tracker = createDeferredTracker(matchCache);
		const onAll = vi.fn();

		matchCache.set({
			data: { review: { __deferred: true, __key: "d0" } },
			hasDeferred: true,
			invalid: false,
			matchId: "m1",
			updatedAt: 1000,
		});

		tracker.track("m1", "d0", onAll);
		tracker.clear();

		/* Resolve after clear → no-op */
		tracker.resolve("m1", "d0", { stars: 5 });
		expect(onAll).not.toHaveBeenCalled();
	});

	it("resolve on untracked key → no-op", () => {
		const matchCache = createMatchCache();
		const tracker = createDeferredTracker(matchCache);

		/* Should not throw */
		tracker.resolve("m1", "d0", "data");
		expect(matchCache.get("m1")).toBeUndefined();
	});

	it("prune removes stale entries not in active set", () => {
		const matchCache = createMatchCache();
		const tracker = createDeferredTracker(matchCache);
		const onAll = vi.fn();

		matchCache.set({
			data: { review: { __deferred: true, __key: "d0" } },
			hasDeferred: true,
			invalid: false,
			matchId: "m1",
			updatedAt: 1000,
		});
		matchCache.set({
			data: { stats: { __deferred: true, __key: "d0" } },
			hasDeferred: true,
			invalid: false,
			matchId: "m2",
			updatedAt: 1000,
		});

		tracker.track("m1", "d0", onAll);
		tracker.track("m2", "d0", onAll);

		/* Simulate navigating away from m1 — only m2 is active */
		tracker.prune(new Set(["m2"]));

		/* m1 resolve should no-op (pruned) */
		tracker.resolve("m1", "d0", { stars: 5 });
		expect(onAll).not.toHaveBeenCalled();

		/* m2 resolve should still work (kept) */
		tracker.resolve("m2", "d0", { count: 42 });
		expect(onAll).toHaveBeenCalledTimes(1);
		expect(onAll).toHaveBeenCalledWith("m2");
	});
});

describe("collectDeferredPromises", () => {
	it("null → empty", () => {
		expect(collectDeferredPromises(null)).toEqual([]);
	});

	it("undefined → empty", () => {
		expect(collectDeferredPromises(undefined)).toEqual([]);
	});

	it("primitive → empty", () => {
		expect(collectDeferredPromises("hello")).toEqual([]);
		expect(collectDeferredPromises(42)).toEqual([]);
	});

	it("plain object → empty", () => {
		expect(collectDeferredPromises({ name: "test" })).toEqual([]);
	});

	it("single deferred marker with promise → collected", () => {
		const p = Promise.resolve("val");
		const data = { __deferred: true, __key: "d0", promise: p };
		const result = collectDeferredPromises(data);
		expect(result).toHaveLength(1);
		expect(result[0]?.key).toBe("d0");
		expect(result[0]?.promise).toBe(p);
	});

	it("nested deferred in object → collected", () => {
		const p = Promise.resolve("val");
		const data = { name: "Product", review: { __deferred: true, __key: "d0", promise: p } };
		const result = collectDeferredPromises(data);
		expect(result).toHaveLength(1);
		expect(result[0]?.key).toBe("d0");
	});

	it("deferred in array → collected", () => {
		const p = Promise.resolve("val");
		const data = { items: [{ __deferred: true, __key: "d0", promise: p }] };
		const result = collectDeferredPromises(data);
		expect(result).toHaveLength(1);
	});

	it("multiple deferreds → all collected", () => {
		const p0 = Promise.resolve("v0");
		const p1 = Promise.resolve("v1");
		const data = {
			a: { __deferred: true, __key: "d0", promise: p0 },
			b: { __deferred: true, __key: "d1", promise: p1 },
		};
		const result = collectDeferredPromises(data);
		expect(result).toHaveLength(2);
		expect(result.map((r) => r.key).sort()).toEqual(["d0", "d1"]);
	});

	it("marker without promise → not collected", () => {
		const data = { __deferred: true, __key: "d0" };
		expect(collectDeferredPromises(data)).toEqual([]);
	});
});

describe("resolveCacheTags", () => {
	it("returns undefined when cache has no tags", async () => {
		const { resolveCacheTags } = await import("../../../src/caches/index.ts");
		expect(resolveCacheTags(undefined, {})).toBeUndefined();
		expect(resolveCacheTags({ cdn: { maxAge: 60 } }, {})).toBeUndefined();
	});

	it("collects static cdn and ssr tags", async () => {
		const { resolveCacheTags } = await import("../../../src/caches/index.ts");
		expect(resolveCacheTags({ cdn: { tags: ["a"] }, ssr: { tags: ["b"] } }, {})).toEqual(["a", "b"]);
	});

	it("resolves function tags with params", async () => {
		const { resolveCacheTags } = await import("../../../src/caches/index.ts");
		expect(
			resolveCacheTags({ cdn: { tags: ({ params }) => [`item:${String(params.id)}`] } }, { id: "42" }),
		).toEqual(["item:42"]);
	});
});

describe("matchCache.invalidate by tags", () => {
	it("invalidate({ tags: ['a'] }) marks entries with matching tags", () => {
		const cache = createMatchCache();
		cache.set({ data: "x", invalid: false, matchId: "m1", tags: ["a", "b"], updatedAt: Date.now() });
		cache.invalidate({ tags: ["a"] });
		expect(cache.get("m1")?.invalid).toBe(true);
	});

	it("invalidate({ tags: ['a'] }) skips entries without matching tags", () => {
		const cache = createMatchCache();
		cache.set({ data: "x", invalid: false, matchId: "m1", tags: ["b", "c"], updatedAt: Date.now() });
		cache.set({ data: "y", invalid: false, matchId: "m2", tags: ["a"], updatedAt: Date.now() });
		cache.invalidate({ tags: ["a"] });
		expect(cache.get("m1")?.invalid).toBe(false);
		expect(cache.get("m2")?.invalid).toBe(true);
	});

	it("invalidate({ tags: ['a'] }) skips entries with no tags", () => {
		const cache = createMatchCache();
		cache.set({ data: "x", invalid: false, matchId: "m1", updatedAt: Date.now() });
		cache.set({ data: "y", invalid: false, matchId: "m2", tags: ["a"], updatedAt: Date.now() });
		cache.invalidate({ tags: ["a"] });
		expect(cache.get("m1")?.invalid).toBe(false);
		expect(cache.get("m2")?.invalid).toBe(true);
	});

	it("invalidate({ tags: ['a', 'b'] }) marks entries with any overlapping tag", () => {
		const cache = createMatchCache();
		cache.set({ data: "x", invalid: false, matchId: "m1", tags: ["a", "c"], updatedAt: Date.now() });
		cache.set({ data: "y", invalid: false, matchId: "m2", tags: ["b"], updatedAt: Date.now() });
		cache.set({ data: "z", invalid: false, matchId: "m3", tags: ["d"], updatedAt: Date.now() });
		cache.invalidate({ tags: ["a", "b"] });
		expect(cache.get("m1")?.invalid).toBe(true);
		expect(cache.get("m2")?.invalid).toBe(true);
		expect(cache.get("m3")?.invalid).toBe(false);
	});
});

/* ── Cache edge cases ──────────────────────────────────────────────── */

describe("deferredTracker edge cases", () => {
	it("resolve() on invalidated matchCache entry still updates data", () => {
		const cache = createMatchCache();
		const tracker = createDeferredTracker(cache);

		cache.set({
			data: { review: { __deferred: true, __key: "d0" } },
			hasDeferred: true,
			invalid: false,
			matchId: "m1",
			updatedAt: 1000,
		});

		tracker.track("m1", "d0", () => {});

		/* Invalidate entry between track and resolve */
		cache.invalidate({ matchId: "m1" });
		expect(cache.get("m1")?.invalid).toBe(true);

		/* Resolve still updates — invalid flag doesn't block resolve */
		tracker.resolve("m1", "d0", { stars: 5 });

		const entry = cache.get("m1");
		const data = entry?.data as Record<string, unknown>;
		expect(data["review"]).toEqual({ stars: 5 });
		expect(entry?.hasDeferred).toBe(false);
	});

	it("resolve() after clear() is a no-op", () => {
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
		tracker.clear();
		tracker.resolve("m1", "d0", { stars: 5 });

		expect(onAll).not.toHaveBeenCalled();
		/* Original data unchanged */
		const data = cache.get("m1")?.data as Record<string, unknown>;
		expect((data["review"] as Record<string, unknown>)["__deferred"]).toBe(true);
	});

	it("duplicate resolve with different data: second value wins", () => {
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

		/* Resolve d0, then resolve it again with different data before d1 */
		tracker.resolve("m1", "d0", "first");
		expect(onAll).not.toHaveBeenCalled();

		/* Re-resolve d0 overwrites */
		tracker.resolve("m1", "d0", "second");
		expect(onAll).not.toHaveBeenCalled();

		/* Now resolve d1 — triggers onAllResolved */
		tracker.resolve("m1", "d1", "b-value");
		expect(onAll).toHaveBeenCalledTimes(1);

		const data = cache.get("m1")?.data as Record<string, unknown>;
		expect(data["a"]).toBe("second");
		expect(data["b"]).toBe("b-value");
	});

	it("reject prevents cache update even if remaining keys resolve", () => {
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

		tracker.reject("m1", "d0", new Error("fail"));
		tracker.resolve("m1", "d1", "b-value");

		/* rejected = true → cache not updated, callback not fired */
		expect(cache.get("m1")?.hasDeferred).toBe(true);
		expect(onAll).not.toHaveBeenCalled();
	});

	it("stale resolve from old generation does not corrupt fresh cache", () => {
		const cache = createMatchCache();
		const tracker = createDeferredTracker(cache);

		/* Nav 1: track deferred key */
		cache.set({
			data: { val: { __deferred: true, __key: "d0" } },
			hasDeferred: true,
			invalid: false,
			matchId: "m1",
			updatedAt: 1000,
		});
		const gen1 = tracker.track("m1", "d0", vi.fn());

		/* Nav 2: fresh data replaces cache, re-tracks same key */
		cache.set({
			data: { val: { __deferred: true, __key: "d0" } },
			hasDeferred: true,
			invalid: false,
			matchId: "m1",
			updatedAt: 2000,
		});
		const gen2 = tracker.track("m1", "d0", vi.fn());

		/* Old Nav 1 deferred resolves with stale data — skipped via generation mismatch */
		tracker.resolve("m1", "d0", "stale-value", gen1);

		/* Fresh Nav 2 deferred resolves with correct data */
		tracker.resolve("m1", "d0", "fresh-value", gen2);

		/* Cache should have fresh value, not stale */
		const cached = cache.get("m1");
		expect(cached?.data).toEqual({ val: "fresh-value" });
	});

	it("resolve for untracked matchId is a no-op", () => {
		const cache = createMatchCache();
		const tracker = createDeferredTracker(cache);

		cache.set({
			data: "original",
			hasDeferred: false,
			invalid: false,
			matchId: "m1",
			updatedAt: 1000,
		});

		tracker.resolve("m1", "d0", "should-be-ignored");
		expect(cache.get("m1")?.data).toBe("original");
	});

	it("resolve when matchCache entry was deleted between track and resolve", () => {
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
		cache.delete("m1");

		/* Resolve should not crash — cached is undefined, skip update */
		tracker.resolve("m1", "d0", { stars: 5 });
		expect(onAll).toHaveBeenCalledTimes(1);
		expect(cache.get("m1")).toBeUndefined();
	});

	it("resolve with undefined data → onAllResolved still fires", () => {
		const cache = createMatchCache();
		const tracker = createDeferredTracker(cache);
		const onAll = vi.fn();

		cache.set({
			data: { effect: { __deferred: true, __key: "d0" } },
			hasDeferred: true,
			invalid: false,
			matchId: "m1",
			updatedAt: 1000,
		});

		tracker.track("m1", "d0", onAll);
		/* Deferred resolves with undefined (side-effect only, no return value) */
		tracker.resolve("m1", "d0", undefined);

		expect(onAll).toHaveBeenCalledTimes(1);
		expect(onAll).toHaveBeenCalledWith("m1");
		expect(cache.get("m1")?.hasDeferred).toBe(false);
	});
});

describe("matchCache staleness edge cases", () => {
	it("isStale with negative staleTime → always stale", () => {
		const cache = createMatchCache();
		cache.set({ data: "x", invalid: false, matchId: "m1", updatedAt: Date.now() });
		expect(cache.isStale("m1", -1)).toBe(true);
	});

	it("isStale with zero staleTime → always stale", () => {
		const cache = createMatchCache();
		cache.set({ data: "x", invalid: false, matchId: "m1", updatedAt: Date.now() });
		expect(cache.isStale("m1", 0)).toBe(true);
	});

	it("isStale with NaN staleTime → always stale", () => {
		const cache = createMatchCache();
		cache.set({ data: "x", invalid: false, matchId: "m1", updatedAt: Date.now() });
		expect(cache.isStale("m1", Number.NaN)).toBe(true);
	});

	it("isStale with Infinity staleTime → never stale", () => {
		const cache = createMatchCache();
		cache.set({ data: "x", invalid: false, matchId: "m1", updatedAt: Date.now() - 100_000_000 });
		expect(cache.isStale("m1", Number.POSITIVE_INFINITY)).toBe(false);
	});

	it("get() returns entry regardless of invalid flag", () => {
		const cache = createMatchCache();
		cache.set({ data: "x", invalid: false, matchId: "m1", updatedAt: Date.now() });
		cache.invalidate({ matchId: "m1" });
		/* get returns entry even though invalid */
		expect(cache.get("m1")?.data).toBe("x");
		expect(cache.get("m1")?.invalid).toBe(true);
		/* isCached returns false for invalid */
		expect(cache.isCached("m1")).toBe(false);
	});

	it("set() with same matchId replaces and moves to LRU tail", () => {
		const cache = createMatchCache(3);
		cache.set({ data: "a", invalid: false, matchId: "m1", updatedAt: 1 });
		cache.set({ data: "b", invalid: false, matchId: "m2", updatedAt: 2 });
		cache.set({ data: "c", invalid: false, matchId: "m3", updatedAt: 3 });

		/* Re-set m1 → moves to tail */
		cache.set({ data: "a-updated", invalid: false, matchId: "m1", updatedAt: 4 });

		/* Add new entry → m2 (now oldest) evicted */
		cache.set({ data: "d", invalid: false, matchId: "m4", updatedAt: 5 });
		expect(cache.get("m2")).toBeUndefined();
		expect(cache.get("m1")?.data).toBe("a-updated");
		expect(cache.size()).toBe(3);
	});

	it("invalidate all + set new entry: new entry is fresh, old entries stale", () => {
		const cache = createMatchCache();
		cache.set({ data: "old", invalid: false, matchId: "m1", updatedAt: Date.now() });
		cache.invalidate();
		cache.set({ data: "new", invalid: false, matchId: "m2", updatedAt: Date.now() });

		expect(cache.isStale("m1", 60_000)).toBe(true);
		expect(cache.isStale("m2", 60_000)).toBe(false);
	});
});

describe("prefetchCache edge cases", () => {
	it("mark + delete + shouldPrefetch: returns true (entry gone)", () => {
		const cache = createPrefetchCache();
		cache.mark("/about");
		cache.delete("/about");
		expect(cache.shouldPrefetch("/about", 60_000)).toBe(true);
	});

	it("cleanup only removes entries older than maxAge", () => {
		const cache = createPrefetchCache();
		const now = Date.now();
		cache.set("/old", now - 60_000);
		cache.set("/new", now - 1_000);

		cache.cleanup(30_000);

		expect(cache.has("/old")).toBe(false);
		expect(cache.has("/new")).toBe(true);
	});

	it("shouldPrefetch with staleTime=0 on same tick → false (uses > not >=)", () => {
		const cache = createPrefetchCache();
		cache.mark("/about");
		/* Unlike matchCache.isStale which has explicit staleTime<=0 guard,
		 * prefetchCache.shouldPrefetch uses raw `Date.now() - fetchedAt > staleTime`
		 * so staleTime=0 on same millisecond = `0 > 0` = false */
		expect(cache.shouldPrefetch("/about", 0)).toBe(false);
	});

	it("shouldPrefetch with staleTime=0 after time passes → true", () => {
		const cache = createPrefetchCache();
		cache.set("/about", Date.now() - 1);
		expect(cache.shouldPrefetch("/about", 0)).toBe(true);
	});

	it("concurrent mark at max capacity evicts oldest", () => {
		const cache = createPrefetchCache(3);
		cache.mark("/a");
		cache.mark("/b");
		cache.mark("/c");
		cache.mark("/d");

		expect(cache.has("/a")).toBe(false);
		expect(cache.has("/d")).toBe(true);
		expect(cache.size()).toBe(3);
	});
});
