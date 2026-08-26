import { describe, expect, it, vi } from "vitest";
import type { PipelineConfig, ResolvedRoute } from "../../../src/loader-pipeline/index.ts";
import { runPipeline } from "../../../src/loader-pipeline/index.ts";
import type { FlareStore, FlareStoreEntry } from "../../../src/store/index.ts";

function makeRoute(overrides?: Partial<ResolvedRoute>): ResolvedRoute {
	return {
		_type: "render",
		variablePath: "/test",
		virtualPath: "_root_/test",
		...overrides,
	};
}

function makeConfig(overrides?: Partial<PipelineConfig>): PipelineConfig {
	return {
		abortController: new AbortController(),
		cause: "enter",
		env: {},
		prefetch: false,
		request: new Request("http://localhost/test"),
		routes: [],
		url: new URL("http://localhost/test"),
		...overrides,
	};
}

function createMapStore(): FlareStore & { store: Map<string, FlareStoreEntry> } {
	const store = new Map<string, FlareStoreEntry>();
	return {
		delete: async (key: string) => {
			store.delete(key);
		},
		deleteByTags: async (tags: string[]) => {
			for (const [key, entry] of store) {
				if (entry.tags?.some((t) => tags.includes(t))) store.delete(key);
			}
		},
		get: async (key: string) => store.get(key) ?? null,
		set: async (key: string, entry: FlareStoreEntry) => {
			store.set(key, entry);
		},
		store,
	};
}

describe("Store cache intercept", () => {
	it("cache hit returns cached loaderData — skips loader", async () => {
		const loader = vi.fn(() => Promise.resolve("fresh-data"));
		const store = createMapStore();
		store.store.set("flare:_root_/test:{}", {
			data: "cached-data",
			storedAt: Date.now(),
		});

		const route = makeRoute({
			cache: { ssr: { staleTime: 60_000 } },
			loader,
		});

		const result = await runPipeline(
			makeConfig({
				routes: [route],
				store,
			}),
		);

		expect(result.matches[0]?.loaderData).toBe("cached-data");
		expect(result.matches[0]?.status).toBe("success");
		expect(result.matches[0]?.cacheHit).toBe(true);
		expect(loader).not.toHaveBeenCalled();
	});

	it("two sequential pipeline runs share the store — second skips the loader", async () => {
		const loader = vi.fn(() => Promise.resolve({ timestamp: 42 }));
		const store = createMapStore();
		const route = makeRoute({
			cache: { ssr: { staleTime: 30_000 } },
			loader,
		});
		const config = makeConfig({ routes: [route], store });

		const first = await runPipeline(config);
		const second = await runPipeline(config);

		expect(loader).toHaveBeenCalledOnce();
		expect(first.matches[0]?.loaderData).toEqual({ timestamp: 42 });
		expect(second.matches[0]?.loaderData).toEqual({ timestamp: 42 });
		expect(second.matches[0]?.cacheHit).toBe(true);
	});

	it("cache miss calls loader and writes to store", async () => {
		const loader = vi.fn(() => Promise.resolve("fresh-data"));
		const store = createMapStore();

		const route = makeRoute({
			cache: { ssr: { staleTime: 60_000 } },
			loader,
		});

		const result = await runPipeline(
			makeConfig({
				routes: [route],
				store,
			}),
		);

		expect(result.matches[0]?.loaderData).toBe("fresh-data");
		expect(result.matches[0]?.cacheHit).toBe(false);
		expect(loader).toHaveBeenCalledOnce();

		const stored = store.store.get("flare:_root_/test:{}");
		expect(stored?.data).toBe("fresh-data");
		expect(stored?.storedAt).toBeGreaterThan(0);
	});

	it("slow loader does not overwrite a newer cache entry", async () => {
		let releaseSlow: () => void = () => {};
		const slowGate = new Promise<void>((resolve) => {
			releaseSlow = resolve;
		});
		let calls = 0;
		const loader = vi.fn(async () => {
			const n = ++calls;
			if (n === 1) {
				await slowGate;
				return { ts: 1 };
			}
			return { ts: 2 };
		});
		const store = createMapStore();
		const route = makeRoute({
			cache: { ssr: { staleTime: 60_000 } },
			loader,
		});

		const slow = runPipeline(makeConfig({ routes: [route], store }));
		await vi.waitFor(() => {
			expect(calls).toBe(1);
		});
		const fast = await runPipeline(makeConfig({ routes: [route], store }));
		expect(fast.matches[0]?.loaderData).toEqual({ ts: 2 });

		releaseSlow();
		await slow;

		expect(store.store.get("flare:_root_/test:{}")?.data).toEqual({ ts: 2 });
	});

	it("stale entry (age > staleTime) calls loader and refreshes store", async () => {
		const loader = vi.fn(() => Promise.resolve("refreshed-data"));
		const store = createMapStore();
		store.store.set("flare:_root_/test:{}", {
			data: "stale-data",
			storedAt: Date.now() - 120_000,
		});

		const route = makeRoute({
			cache: { ssr: { staleTime: 60_000 } },
			loader,
		});

		const result = await runPipeline(
			makeConfig({
				routes: [route],
				store,
			}),
		);

		expect(result.matches[0]?.loaderData).toBe("refreshed-data");
		expect(loader).toHaveBeenCalledOnce();

		const stored = store.store.get("flare:_root_/test:{}");
		expect(stored?.data).toBe("refreshed-data");
	});

	it("does not share default SSR cache across authenticated users", async () => {
		const loader = vi.fn((ctx: { auth: { id: string } }) => Promise.resolve({ user: ctx.auth.id }));
		const store = createMapStore();
		const route = makeRoute({
			authenticate: [],
			authenticateMode: true,
			cache: { ssr: { staleTime: 60_000 } },
			loader,
		});

		const alice = await runPipeline(
			makeConfig({
				authenticateFn: async () => ({ id: "alice" }),
				routes: [route],
				store,
			}),
		);
		const bob = await runPipeline(
			makeConfig({
				authenticateFn: async () => ({ id: "bob" }),
				routes: [route],
				store,
			}),
		);

		expect(alice.matches[0]?.loaderData).toEqual({ user: "alice" });
		expect(bob.matches[0]?.loaderData).toEqual({ user: "bob" });
		expect(loader).toHaveBeenCalledTimes(2);
	});

	it("passes auth into a custom SSR cache key", async () => {
		const store = createMapStore();
		const key = vi.fn(({ auth }: { auth?: { id: string } }) => `user:${auth?.id}`);
		const route = makeRoute({
			authenticate: [],
			authenticateMode: true,
			cache: { ssr: { key, staleTime: 60_000 } },
			loader: (ctx: { auth: { id: string } }) => ({ user: ctx.auth.id }),
		});

		await runPipeline(
			makeConfig({
				authenticateFn: async () => ({ id: "alice" }),
				routes: [route],
				store,
			}),
		);

		expect(key).toHaveBeenCalledWith(expect.objectContaining({ auth: { id: "alice" } }));
		expect(store.store.has("user:alice")).toBe(true);
	});

	it("respects custom key function", async () => {
		const loader = vi.fn(() => Promise.resolve("fresh"));
		const store = createMapStore();
		store.store.set("custom:slug-abc", {
			data: "custom-cached",
			storedAt: Date.now(),
		});

		const route = makeRoute({
			cache: {
				ssr: {
					key: ({ params }) => `custom:slug-${params.slug}`,
					staleTime: 60_000,
				},
			},
			loader,
			virtualPath: "_root_/blog/[slug]",
		});

		const result = await runPipeline(
			makeConfig({
				params: { slug: "abc" },
				routes: [route],
				store,
			}),
		);

		expect(result.matches[0]?.loaderData).toBe("custom-cached");
		expect(loader).not.toHaveBeenCalled();
	});

	it("default key uses virtualPath:params pattern", async () => {
		const loader = vi.fn(() => Promise.resolve("data"));
		const store = createMapStore();

		const route = makeRoute({
			cache: { ssr: { staleTime: 60_000 } },
			loader,
			virtualPath: "_root_/blog/[slug]",
		});

		await runPipeline(
			makeConfig({
				params: { slug: "hello" },
				routes: [route],
				store,
			}),
		);

		const expectedKey = 'flare:_root_/blog/[slug]:{"slug":"hello"}';
		expect(store.store.has(expectedKey)).toBe(true);
	});

	it("no store → store config ignored, loader runs normally", async () => {
		const loader = vi.fn(() => Promise.resolve("normal-data"));

		const route = makeRoute({
			cache: { ssr: { staleTime: 60_000 } },
			loader,
		});

		const result = await runPipeline(
			makeConfig({
				routes: [route],
			}),
		);

		expect(result.matches[0]?.loaderData).toBe("normal-data");
		expect(result.matches[0]?.cacheHit).toBeUndefined();
		expect(loader).toHaveBeenCalledOnce();
	});

	it("no store config → loader runs normally even with store", async () => {
		const loader = vi.fn(() => Promise.resolve("normal-data"));
		const store = createMapStore();

		const route = makeRoute({
			cache: { client: { staleTime: 5000 } },
			loader,
		});

		const result = await runPipeline(
			makeConfig({
				routes: [route],
				store,
			}),
		);

		expect(result.matches[0]?.loaderData).toBe("normal-data");
		expect(loader).toHaveBeenCalledOnce();
	});

	it("ttl passed to store.set", async () => {
		const setSpy = vi.fn(async () => {});
		const store: FlareStore = {
			delete: async () => {},
			deleteByTags: async () => {},
			get: async () => null,
			set: setSpy,
		};

		const route = makeRoute({
			cache: { ssr: { staleTime: 60_000, ttl: 300 } },
			loader: () => Promise.resolve("data"),
		});

		await runPipeline(
			makeConfig({
				routes: [route],
				store,
			}),
		);

		expect(setSpy).toHaveBeenCalledOnce();
		expect(setSpy).toHaveBeenCalledWith(
			expect.any(String),
			expect.objectContaining({ data: "data", storedAt: expect.any(Number) }),
			300,
		);
	});

	it("cache store get failure → treats as miss, runs loader", async () => {
		const loader = vi.fn(() => Promise.resolve("fallback-data"));
		const store: FlareStore = {
			delete: async () => {},
			deleteByTags: async () => {},
			get: async () => {
				throw new Error("store down");
			},
			set: async () => {},
		};

		const route = makeRoute({
			cache: { ssr: { staleTime: 60_000 } },
			loader,
		});

		const result = await runPipeline(
			makeConfig({
				routes: [route],
				store,
			}),
		);

		expect(result.matches[0]?.loaderData).toBe("fallback-data");
		expect(loader).toHaveBeenCalledOnce();
	});

	it("cache store set failure → does not break request", async () => {
		const loader = vi.fn(() => Promise.resolve("data"));
		const store: FlareStore = {
			delete: async () => {},
			deleteByTags: async () => {},
			get: async () => null,
			set: async () => {
				throw new Error("write failed");
			},
		};

		const route = makeRoute({
			cache: { ssr: { staleTime: 60_000 } },
			loader,
		});

		const result = await runPipeline(
			makeConfig({
				routes: [route],
				store,
			}),
		);

		expect(result.matches[0]?.loaderData).toBe("data");
		expect(result.matches[0]?.status).toBe("success");
	});

	it("factory function store resolved with env", async () => {
		const loader = vi.fn(() => Promise.resolve("fresh"));
		const innerStore = createMapStore();
		innerStore.store.set("flare:_root_/test:{}", {
			data: "from-kv",
			storedAt: Date.now(),
		});

		const storeFactory = (_env: unknown) => innerStore;

		const route = makeRoute({
			cache: { ssr: { staleTime: 60_000 } },
			loader,
		});

		const result = await runPipeline(
			makeConfig({
				env: { KV: "mock-binding" },
				routes: [route],
				store: storeFactory,
			}),
		);

		expect(result.matches[0]?.loaderData).toBe("from-kv");
		expect(loader).not.toHaveBeenCalled();
	});

	it("tags stored in cache entry on write-back (static array)", async () => {
		const store = createMapStore();

		const route = makeRoute({
			cache: {
				ssr: {
					staleTime: 60_000,
					tags: ["products", "featured"],
					ttl: 300,
				},
			},
			loader: () => Promise.resolve("tagged-data"),
		});

		await runPipeline(
			makeConfig({
				routes: [route],
				store,
			}),
		);

		const stored = store.store.get("flare:_root_/test:{}");
		expect(stored?.tags).toEqual(["products", "featured"]);
	});

	it("tags stored in cache entry on write-back (function)", async () => {
		const store = createMapStore();

		const route = makeRoute({
			cache: {
				ssr: {
					staleTime: 60_000,
					tags: ({ params }) => [`product:${params.id}`],
				},
			},
			loader: () => Promise.resolve("tagged-data"),
			virtualPath: "_root_/products/[id]",
		});

		await runPipeline(
			makeConfig({
				params: { id: "42" },
				routes: [route],
				store,
			}),
		);

		const stored = store.store.get('flare:_root_/products/[id]:{"id":"42"}');
		expect(stored?.tags).toEqual(["product:42"]);
	});

	it("deleteByKeys called when FlareStore implements it", async () => {
		const deleteByKeysSpy = vi.fn(async () => {});
		const store: FlareStore = {
			delete: async () => {},
			deleteByKeys: deleteByKeysSpy,
			deleteByTags: async () => {},
			get: async () => null,
			set: async () => {},
		};

		await store.deleteByKeys?.(["key1", "key2"], { source: "test" });

		expect(deleteByKeysSpy).toHaveBeenCalledWith(["key1", "key2"], { source: "test" });
	});

	it("does not write loader data that contains defer() markers", async () => {
		const store = createMapStore();

		const route = makeRoute({
			cache: { ssr: { staleTime: 60_000 } },
			loader: (ctx) => {
				const defer = ctx.defer as (fn: () => Promise<unknown>) => unknown;
				return Promise.resolve({
					items: ["a", "b"],
					lazy: defer(() => Promise.resolve("resolved")),
				});
			},
		});

		const result = await runPipeline(
			makeConfig({
				routes: [route],
				store,
			}),
		);

		expect(result.matches[0]?.loaderData).toEqual(expect.objectContaining({ items: ["a", "b"] }));
		expect(store.store.size).toBe(0);
	});

	it("cache hit of serialized defer markers is treated as a miss", async () => {
		const loader = vi.fn(() => Promise.resolve({ items: ["fresh"] }));
		const store = createMapStore();
		store.store.set("flare:_root_/test:{}", {
			data: { items: ["stale"], lazy: { __deferred: true, key: "d0" } },
			storedAt: Date.now(),
		});

		const route = makeRoute({
			cache: { ssr: { staleTime: 60_000 } },
			loader,
		});

		const result = await runPipeline(
			makeConfig({
				routes: [route],
				store,
			}),
		);

		expect(loader).toHaveBeenCalledOnce();
		expect(result.matches[0]?.loaderData).toEqual({ items: ["fresh"] });
		expect(result.matches[0]?.cacheHit).not.toBe(true);
	});

	it("default key includes search so ?tab= values do not collide", async () => {
		const store = createMapStore();
		const route = makeRoute({
			cache: { ssr: { staleTime: 60_000 } },
			loader: (ctx) => {
				const location = ctx.location as { search: { tab?: string } };
				return Promise.resolve(`tab:${location.search.tab ?? ""}`);
			},
		});

		const first = await runPipeline(
			makeConfig({
				request: new Request("http://localhost/test?tab=a"),
				routes: [route],
				store,
				url: new URL("http://localhost/test?tab=a"),
			}),
		);
		const second = await runPipeline(
			makeConfig({
				request: new Request("http://localhost/test?tab=b"),
				routes: [route],
				store,
				url: new URL("http://localhost/test?tab=b"),
			}),
		);

		expect(first.matches[0]?.loaderData).toBe("tab:a");
		expect(second.matches[0]?.loaderData).toBe("tab:b");
		expect(second.matches[0]?.cacheHit).not.toBe(true);
		expect(store.store.has("flare:_root_/test:{}:tab=a")).toBe(true);
		expect(store.store.has("flare:_root_/test:{}:tab=b")).toBe(true);
	});

	it("same path and search hits the default SSR cache", async () => {
		const loader = vi.fn(() => Promise.resolve("tab-a"));
		const store = createMapStore();
		const route = makeRoute({
			cache: { ssr: { staleTime: 60_000 } },
			loader,
		});
		const config = makeConfig({
			request: new Request("http://localhost/test?tab=a"),
			routes: [route],
			store,
			url: new URL("http://localhost/test?tab=a"),
		});

		await runPipeline(config);
		const second = await runPipeline(config);

		expect(loader).toHaveBeenCalledOnce();
		expect(second.matches[0]?.loaderData).toBe("tab-a");
		expect(second.matches[0]?.cacheHit).toBe(true);
	});

	it("custom key function receives search", async () => {
		const loader = vi.fn(() => Promise.resolve("fresh"));
		const store = createMapStore();
		store.store.set("custom:hello:reviews", {
			data: "cached-tab",
			storedAt: Date.now(),
		});

		const route = makeRoute({
			cache: {
				ssr: {
					key: ({ params, search }) => `custom:${params.slug}:${search.tab}`,
					staleTime: 60_000,
				},
			},
			loader,
			virtualPath: "_root_/blog/[slug]",
		});

		const result = await runPipeline(
			makeConfig({
				params: { slug: "hello" },
				request: new Request("http://localhost/blog/hello?tab=reviews"),
				routes: [route],
				store,
				url: new URL("http://localhost/blog/hello?tab=reviews"),
			}),
		);

		expect(result.matches[0]?.loaderData).toBe("cached-tab");
		expect(loader).not.toHaveBeenCalled();
	});

	it("circular references in loader data replaced with null in cache", async () => {
		const store = createMapStore();

		const circular: Record<string, unknown> = { name: "root" };
		circular.self = circular;

		const route = makeRoute({
			cache: { ssr: { staleTime: 60_000 } },
			loader: () => Promise.resolve(circular),
		});

		await runPipeline(
			makeConfig({
				routes: [route],
				store,
			}),
		);

		const stored = store.store.get("flare:_root_/test:{}");
		const data = stored?.data as Record<string, unknown>;
		expect(data.name).toBe("root");
		expect(data.self).toBeNull();
	});

	it("no staleTime → entry always considered fresh", async () => {
		const loader = vi.fn(() => Promise.resolve("fresh"));
		const store = createMapStore();
		store.store.set("flare:_root_/test:{}", {
			data: "cached-forever",
			storedAt: Date.now() - 999_999_999,
		});

		const route = makeRoute({
			cache: { ssr: {} },
			loader,
		});

		const result = await runPipeline(
			makeConfig({
				routes: [route],
				store,
			}),
		);

		expect(result.matches[0]?.loaderData).toBe("cached-forever");
		expect(loader).not.toHaveBeenCalled();
	});
});
