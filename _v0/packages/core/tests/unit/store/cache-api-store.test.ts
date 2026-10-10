/** @vitest-environment node */
import { afterEach, describe, expect, it, vi } from "vitest";
import { createCacheApiStore } from "../../../src/store/cache-api.ts";
import type { FlareStoreEntry } from "../../../src/store/index.ts";

/* Minimal standard CacheStorage: one Map per named cache, keyed by request URL. */
class MemoryCache {
	readonly map = new Map<string, Response>();
	async match(input: RequestInfo | URL): Promise<Response | undefined> {
		return this.map.get(urlOf(input))?.clone();
	}
	async put(input: RequestInfo | URL, response: Response): Promise<void> {
		this.map.set(urlOf(input), response.clone());
	}
	async delete(input: RequestInfo | URL): Promise<boolean> {
		return this.map.delete(urlOf(input));
	}
}

function urlOf(input: RequestInfo | URL): string {
	return typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
}

function memoryCaches() {
	const caches = new Map<string, MemoryCache>();
	return {
		caches,
		storage: {
			open: async (name: string) => {
				let c = caches.get(name);
				if (!c) caches.set(name, (c = new MemoryCache()));
				return c as unknown as Cache;
			},
		} as unknown as CacheStorage,
	};
}

const entry = (html: string, tags?: string[]): FlareStoreEntry => ({
	data: { headers: {}, html, ndjson: "" },
	storedAt: 1,
	tags,
});

afterEach(() => {
	vi.useRealTimers();
});

describe("createCacheApiStore", () => {
	it("round-trips entries", async () => {
		const { storage } = memoryCaches();
		const store = createCacheApiStore({ caches: storage });

		await store.set("static:b1:/about", entry("<html>a</html>", ["posts"]));

		expect(await store.get("static:b1:/about")).toEqual(entry("<html>a</html>", ["posts"]));
		expect(await store.get("static:b1:/missing")).toBeNull();
	});

	it("keys any string safely", async () => {
		const { storage } = memoryCaches();
		const store = createCacheApiStore({ caches: storage });
		const key = 'flare:_root_/[id]:{"id":"a/b?c#d"}';

		await store.set(key, entry("x"));

		expect(await store.get(key)).not.toBeNull();
	});

	it("deletes single entries and lists of keys", async () => {
		const { storage } = memoryCaches();
		const store = createCacheApiStore({ caches: storage });
		await store.set("k1", entry("1"));
		await store.set("k2", entry("2"));
		await store.set("k3", entry("3"));

		await store.delete("k1");
		await store.deleteByKeys?.(["k2"]);

		expect(await store.get("k1")).toBeNull();
		expect(await store.get("k2")).toBeNull();
		expect(await store.get("k3")).not.toBeNull();
	});

	it("deleteByTags removes every entry carrying any of the tags", async () => {
		const { storage } = memoryCaches();
		const store = createCacheApiStore({ caches: storage });
		await store.set("a", entry("a", ["posts"]));
		await store.set("b", entry("b", ["posts", "feed"]));
		await store.set("c", entry("c", ["other"]));

		await store.deleteByTags(["posts"]);

		expect(await store.get("a")).toBeNull();
		expect(await store.get("b")).toBeNull();
		expect(await store.get("c")).not.toBeNull();
	});

	it("concurrent writes under one tag all stay purgeable (no lost index update)", async () => {
		const { storage } = memoryCaches();
		const store = createCacheApiStore({ caches: storage });
		await Promise.all(["l1", "p1", "x1", "y1"].map((k) => store.set(k, entry(k, ["shared"]))));

		await store.deleteByTags(["shared"]);

		for (const k of ["l1", "p1", "x1", "y1"]) expect(await store.get(k)).toBeNull();
	});

	it("the tag index is shared by every store instance on the same cache", async () => {
		const { storage } = memoryCaches();
		const a = createCacheApiStore({ caches: storage });
		const b = createCacheApiStore({ caches: storage });
		await Promise.all([a.set("k1", entry("1", ["t"])), b.set("k2", entry("2", ["t"]))]);

		await a.deleteByTags(["t"]);

		expect(await b.get("k1")).toBeNull();
		expect(await b.get("k2")).toBeNull();
	});

	it("expires entries after their ttl (seconds)", async () => {
		vi.useFakeTimers();
		vi.setSystemTime(1_000_000);
		const { storage } = memoryCaches();
		const store = createCacheApiStore({ caches: storage });
		await store.set("t", entry("t"), 10);

		vi.setSystemTime(1_000_000 + 9_000);
		expect(await store.get("t")).not.toBeNull();
		vi.setSystemTime(1_000_000 + 11_000);
		expect(await store.get("t")).toBeNull();
	});

	it("tells the platform cache how long to keep each entry", async () => {
		const { caches, storage } = memoryCaches();
		const store = createCacheApiStore({ cacheName: "pages", caches: storage });
		await store.set("t", entry("t"), 30);

		const stored = [...(caches.get("pages")?.map.values() ?? [])][0];
		expect(stored?.headers.get("Cache-Control")).toBe("max-age=30");
	});

	it("uses the global caches by default", async () => {
		const { storage } = memoryCaches();
		vi.stubGlobal("caches", storage);
		try {
			const store = createCacheApiStore();
			await store.set("g", entry("g"));
			expect(await store.get("g")).not.toBeNull();
		} finally {
			vi.unstubAllGlobals();
		}
	});
});
