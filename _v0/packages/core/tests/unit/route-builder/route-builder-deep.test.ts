import { describe, expect, it, vi } from "vitest";
import { createLayout, createPage, createRootLayout } from "../../../src/route-builder/index.ts";

/* ── helpers ───────────────────────────────────────────────────────── */

const _noop = () => null;
const _noopAsync = async () => ({});
const renderFn = () => "rendered";
const errorFn = () => "error";
const notFoundFn = () => "not-found";
const unauthorizedFn = () => "unauthorized";

/* ── createPage ────────────────────────────────────────────────────── */

describe("createPage", () => {
	describe("cache", () => {
		it("stores client gcTime", () => {
			const r = createPage("/p")
				.cache({ client: { gcTime: 30000 } })
				.render(renderFn);
			expect(r.cache).toEqual({ client: { gcTime: 30000 } });
		});

		it("stores client staleTime", () => {
			const r = createPage("/p")
				.cache({ client: { staleTime: 5000 } })
				.render(renderFn);
			expect(r.cache).toEqual({ client: { staleTime: 5000 } });
		});

		it("stores prefetch hover", () => {
			const r = createPage("/p")
				.cache({ client: { prefetch: "intent" } })
				.render(renderFn);
			expect(r.cache).toEqual({ client: { prefetch: "intent" } });
		});

		it("stores prefetch viewport", () => {
			const r = createPage("/p")
				.cache({ client: { prefetch: "viewport" } })
				.render(renderFn);
			expect(r.cache).toEqual({ client: { prefetch: "viewport" } });
		});

		it("stores prefetch false", () => {
			const r = createPage("/p")
				.cache({ client: { prefetch: false } })
				.render(renderFn);
			expect(r.cache).toEqual({ client: { prefetch: false } });
		});

		it("stores combined client with prefetch + timing", () => {
			const opts = {
				client: { gcTime: 30000, prefetch: "intent" as const, staleTime: 5000 },
			};
			const r = createPage("/p").cache(opts).render(renderFn);
			expect(r.cache).toEqual(opts);
		});

		it("stores prefetchStaleTime", () => {
			const r = createPage("/p")
				.cache({ client: { prefetchStaleTime: 10000 } })
				.render(renderFn);
			expect(r.cache).toEqual({ client: { prefetchStaleTime: 10000 } });
		});

		it("stores prefetchGcTime", () => {
			const r = createPage("/p")
				.cache({ client: { prefetchGcTime: 5000 } })
				.render(renderFn);
			expect(r.cache).toEqual({ client: { prefetchGcTime: 5000 } });
		});

		it("stores cacheDeferred true", () => {
			const r = createPage("/p")
				.cache({ client: { cacheDeferred: true } })
				.render(renderFn);
			expect(r.cache).toEqual({ client: { cacheDeferred: true } });
		});

		it("stores cacheDeferred false", () => {
			const r = createPage("/p")
				.cache({ client: { cacheDeferred: false } })
				.render(renderFn);
			expect(r.cache).toEqual({ client: { cacheDeferred: false } });
		});

		it("stores all 6 client cache fields", () => {
			const client = {
				cacheDeferred: true,
				gcTime: 60000,
				prefetch: "intent" as const,
				prefetchGcTime: 5000,
				prefetchStaleTime: 10000,
				staleTime: 30000,
			};
			const r = createPage("/p").cache({ client }).render(renderFn);
			expect(r.cache).toEqual({ client });
		});
	});

	describe("input", () => {
		it("stores searchParams validator fn", () => {
			const spFn = (raw: URLSearchParams) => ({ q: raw.get("q") ?? "" });
			const r = createPage("/p").input({ searchParams: spFn }).render(renderFn);
			expect(r.inputConfig?.searchParams).toBe(spFn);
		});

		it("stores searchParams object form", () => {
			const spObj = { parse: (raw: URLSearchParams) => ({ q: raw.get("q") ?? "" }) };
			const r = createPage("/p").input({ searchParams: spObj }).render(renderFn);
			expect(r.inputConfig?.searchParams).toBe(spObj);
		});

		it("stores both params + searchParams", () => {
			const pFn = (raw: Record<string, string | string[]>) => ({ id: String(raw["id"] ?? "") });
			const spFn = (raw: URLSearchParams) => ({ q: raw.get("q") ?? "" });
			const r = createPage("/p").input({ params: pFn, searchParams: spFn }).render(renderFn);
			expect(r.inputConfig?.params).toBe(pFn);
			expect(r.inputConfig?.searchParams).toBe(spFn);
		});
	});

	describe("effects", () => {
		it("stores shouldRefetch", () => {
			const fn = vi.fn(() => true);
			const r = createPage("/p").effects({ shouldRefetch: fn }).render(renderFn);
			expect(r.effectsConfig?.shouldRefetch).toBe(fn);
		});

		it("stores both loaderDeps + shouldRefetch", () => {
			const depsFn = vi.fn(({ search }: { search: unknown }) => [search]);
			const refetchFn = vi.fn(() => false);
			const r = createPage("/p").effects({ loaderDeps: depsFn, shouldRefetch: refetchFn }).render(renderFn);
			expect(r.effectsConfig?.loaderDeps).toBe(depsFn);
			expect(r.effectsConfig?.shouldRefetch).toBe(refetchFn);
		});
	});

	describe("head", () => {
		it("stores head fn", () => {
			const headFn = vi.fn(() => ({ title: "Page" }));
			const r = createPage("/p")
				.loader(async () => ({ data: 1 }))
				.head(headFn)
				.render(renderFn);
			expect(r.head).toBe(headFn);
		});
	});

	describe("headers", () => {
		it("stores headers fn", () => {
			const headersFn = vi.fn(() => ({ "x-custom": "val" }));
			const r = createPage("/p")
				.loader(async () => ({}))
				.headers(headersFn)
				.render(renderFn);
			expect(r.headers).toBe(headersFn);
		});
	});

	describe("head + headers", () => {
		it("stores both head and headers", () => {
			const headFn = vi.fn(() => ({ title: "T" }));
			const headersFn = vi.fn(() => ({ "cache-control": "no-store" }));
			const r = createPage("/p")
				.loader(async () => ({}))
				.head(headFn)
				.headers(headersFn)
				.render(renderFn);
			expect(r.head).toBe(headFn);
			expect(r.headers).toBe(headersFn);
		});
	});

	describe("authenticate multi-args", () => {
		it("stores multiple callerData args", () => {
			const r = createPage("/p").authenticate("a", "b", "c").render(renderFn);
			expect(r.authenticate).toEqual(["a", "b", "c"]);
		});
	});

	describe("response", () => {
		it("stores response fn with _type response", () => {
			const respFn = vi.fn(() => new Response("ok"));
			const r = createPage("/p").response(respFn);
			expect(r._type).toBe("response");
			expect(r.response).toBe(respFn);
		});
	});

	describe("skipping optional methods", () => {
		it("undefined for all skipped fields", () => {
			const r = createPage("/p")
				.authenticate("admin")
				.loader(async () => ({ x: 1 }))
				.render(renderFn);
			expect(r.cache).toBeUndefined();
			expect(r.inputConfig).toBeUndefined();
			expect(r.authorize).toBeUndefined();
			expect(r.effectsConfig).toBeUndefined();
			expect(r.preloader).toBeUndefined();
			expect(r.head).toBeUndefined();
			expect(r.headers).toBeUndefined();
		});
	});
});

/* ── createLayout ──────────────────────────────────────────────────── */

describe("createLayout", () => {
	describe("cache", () => {
		it("stores client staleTime", () => {
			const r = createLayout("/l")
				.cache({ client: { staleTime: 5000 } })
				.render(renderFn);
			expect(r.cache).toEqual({ client: { staleTime: 5000 } });
		});

		it("stores client with multiple values", () => {
			const r = createLayout("/l")
				.cache({ client: { gcTime: 30000, staleTime: 5000 } })
				.render(renderFn);
			expect(r.cache).toEqual({ client: { gcTime: 30000, staleTime: 5000 } });
		});

		it("stores prefetchStaleTime + prefetchGcTime", () => {
			const r = createLayout("/l")
				.cache({ client: { prefetchGcTime: 5000, prefetchStaleTime: 10000 } })
				.render(renderFn);
			expect(r.cache).toEqual({ client: { prefetchGcTime: 5000, prefetchStaleTime: 10000 } });
		});

		it("stores all 6 client cache fields", () => {
			const client = {
				cacheDeferred: true,
				gcTime: 60000,
				prefetch: "viewport" as const,
				prefetchGcTime: 5000,
				prefetchStaleTime: 10000,
				staleTime: 30000,
			};
			const r = createLayout("/l").cache({ client }).render(renderFn);
			expect(r.cache).toEqual({ client });
		});
	});

	describe("input", () => {
		it("stores params", () => {
			const pFn = (raw: Record<string, string | string[]>) => ({ id: String(raw["id"] ?? "") });
			const r = createLayout("/l").input({ params: pFn }).render(renderFn);
			expect(r.inputConfig?.params).toBe(pFn);
		});

		it("stores searchParams", () => {
			const spFn = (raw: URLSearchParams) => ({ q: raw.get("q") ?? "" });
			const r = createLayout("/l").input({ searchParams: spFn }).render(renderFn);
			expect(r.inputConfig?.searchParams).toBe(spFn);
		});

		it("stores both params + searchParams", () => {
			const pFn = (raw: Record<string, string | string[]>) => ({ id: String(raw["id"] ?? "") });
			const spFn = (raw: URLSearchParams) => ({ q: raw.get("q") ?? "" });
			const r = createLayout("/l").input({ params: pFn, searchParams: spFn }).render(renderFn);
			expect(r.inputConfig?.params).toBe(pFn);
			expect(r.inputConfig?.searchParams).toBe(spFn);
		});
	});

	describe("authenticate", () => {
		it("stores callerData", () => {
			const r = createLayout("/l").authenticate("editor").render(renderFn);
			expect(r.authenticate).toEqual(["editor"]);
		});

		it("stores multiple callerData args", () => {
			const r = createLayout("/l").authenticate("a", "b", "c").render(renderFn);
			expect(r.authenticate).toEqual(["a", "b", "c"]);
		});
	});

	describe("authorize", () => {
		it("stores authorize fn", () => {
			const authzFn = vi.fn(() => true);
			const r = createLayout("/l").authenticate("admin").authorize(authzFn).render(renderFn);
			expect(r.authorize).toBe(authzFn);
		});
	});

	describe("effects", () => {
		it("stores loaderDeps", () => {
			const depsFn = vi.fn(({ search }: { search: unknown }) => [search]);
			const r = createLayout("/l").effects({ loaderDeps: depsFn }).render(renderFn);
			expect(r.effectsConfig?.loaderDeps).toBe(depsFn);
		});

		it("stores shouldRefetch", () => {
			const fn = vi.fn(() => false);
			const r = createLayout("/l").effects({ shouldRefetch: fn }).render(renderFn);
			expect(r.effectsConfig?.shouldRefetch).toBe(fn);
		});
	});

	describe("head", () => {
		it("stores head fn", () => {
			const headFn = vi.fn(() => ({ title: "Layout" }));
			const r = createLayout("/l")
				.loader(async () => ({}))
				.head(headFn)
				.render(renderFn);
			expect(r.head).toBe(headFn);
		});
	});

	describe("headers", () => {
		it("stores headers fn", () => {
			const headersFn = vi.fn(() => ({ "x-layout": "1" }));
			const r = createLayout("/l")
				.loader(async () => ({}))
				.headers(headersFn)
				.render(renderFn);
			expect(r.headers).toBe(headersFn);
		});
	});

	describe("_type", () => {
		it("is layout", () => {
			const r = createLayout("/l").render(renderFn);
			expect(r._type).toBe("layout");
		});
	});

	describe("no response method", () => {
		it("does not expose response", () => {
			const builder = createLayout("/l") as unknown as Record<string, unknown>;
			expect(builder["response"]).toBeUndefined();
		});
	});

	describe("full chain", () => {
		it("stores all fields from cache through boundaries", () => {
			const cacheOpts = { client: { gcTime: 10000, prefetch: "intent" as const, staleTime: 3000 } };
			const pFn = (raw: Record<string, string | string[]>) => ({ slug: String(raw["slug"] ?? "") });
			const spFn = (raw: URLSearchParams) => ({ page: raw.get("page") ?? "1" });
			const authzFn = vi.fn(() => true);
			const depsFn = vi.fn(({ search }: { search: unknown }) => [search]);
			const refetchFn = vi.fn(() => false);
			const preloaderFn = vi.fn(async () => ({ theme: "dark" }));
			const loaderFn = vi.fn(async () => ({ items: [] }));
			const headFn = vi.fn(() => ({ title: "Full" }));
			const headersFn = vi.fn(() => ({ "x-full": "yes" }));

			const r = createLayout("/l")
				.cache(cacheOpts)
				.input({ params: pFn, searchParams: spFn })
				.authenticate("editor")
				.authorize(authzFn)
				.effects({ loaderDeps: depsFn, shouldRefetch: refetchFn })
				.preloader(preloaderFn)
				.loader(loaderFn)
				.head(headFn)
				.headers(headersFn)
				.render(renderFn)
				.errorRender(errorFn)
				.notFoundRender(notFoundFn)
				.unauthorizedRender(unauthorizedFn);

			expect(r._type).toBe("layout");
			expect(r.cache).toEqual(cacheOpts);
			expect(r.inputConfig?.params).toBe(pFn);
			expect(r.inputConfig?.searchParams).toBe(spFn);
			expect(r.authenticate).toEqual(["editor"]);
			expect(r.authorize).toBe(authzFn);
			expect(r.effectsConfig?.loaderDeps).toBe(depsFn);
			expect(r.effectsConfig?.shouldRefetch).toBe(refetchFn);
			expect(r.preloader).toBe(preloaderFn);
			expect(r.loader).toBe(loaderFn);
			expect(r.head).toBe(headFn);
			expect(r.headers).toBe(headersFn);
			expect(r.render).toBe(renderFn);
			expect(r.errorRender).toBe(errorFn);
			expect(r.notFoundRender).toBe(notFoundFn);
			expect(r.unauthorizedRender).toBe(unauthorizedFn);
			expect(r.virtualPath).toBe("/l");
		});
	});

	describe("skipping optional methods", () => {
		it("undefined for all skipped fields", () => {
			const r = createLayout("/l")
				.authenticate("admin")
				.loader(async () => ({}))
				.render(renderFn);
			expect(r.cache).toBeUndefined();
			expect(r.inputConfig).toBeUndefined();
			expect(r.authorize).toBeUndefined();
			expect(r.effectsConfig).toBeUndefined();
			expect(r.preloader).toBeUndefined();
			expect(r.head).toBeUndefined();
			expect(r.headers).toBeUndefined();
		});
	});
});

/* ── createRootLayout ──────────────────────────────────────────────── */

describe("createRootLayout", () => {
	describe("cache", () => {
		it("stores client staleTime", () => {
			const r = createRootLayout("/")
				.cache({ client: { staleTime: 3000 } })
				.render(renderFn);
			expect(r.cache).toEqual({ client: { staleTime: 3000 } });
		});

		it("stores client with multiple values", () => {
			const r = createRootLayout("/")
				.cache({ client: { gcTime: 30000, staleTime: 5000 } })
				.render(renderFn);
			expect(r.cache).toEqual({ client: { gcTime: 30000, staleTime: 5000 } });
		});

		it("stores prefetchStaleTime + prefetchGcTime", () => {
			const r = createRootLayout("/")
				.cache({ client: { prefetchGcTime: 5000, prefetchStaleTime: 10000 } })
				.render(renderFn);
			expect(r.cache).toEqual({ client: { prefetchGcTime: 5000, prefetchStaleTime: 10000 } });
		});

		it("stores all 6 client cache fields", () => {
			const client = {
				cacheDeferred: true,
				gcTime: 60000,
				prefetch: "intent" as const,
				prefetchGcTime: 5000,
				prefetchStaleTime: 10000,
				staleTime: 30000,
			};
			const r = createRootLayout("/").cache({ client }).render(renderFn);
			expect(r.cache).toEqual({ client });
		});
	});

	describe("input", () => {
		it("stores params", () => {
			const pFn = (raw: Record<string, string | string[]>) => ({ id: String(raw["id"] ?? "") });
			const r = createRootLayout("/").input({ params: pFn }).render(renderFn);
			expect(r.inputConfig?.params).toBe(pFn);
		});

		it("stores searchParams", () => {
			const spFn = (raw: URLSearchParams) => ({ q: raw.get("q") ?? "" });
			const r = createRootLayout("/").input({ searchParams: spFn }).render(renderFn);
			expect(r.inputConfig?.searchParams).toBe(spFn);
		});
	});

	describe("authenticate", () => {
		it("stores empty array", () => {
			const r = createRootLayout("/").authenticate().render(renderFn);
			expect(r.authenticate).toEqual([]);
		});

		it("stores multiple args", () => {
			const r = createRootLayout("/").authenticate("admin", "role:superuser").render(renderFn);
			expect(r.authenticate).toEqual(["admin", "role:superuser"]);
		});

		it("stores multiple callerData args across all builders", () => {
			const page = createPage("/p").authenticate("a", "b", "c").render(renderFn);
			const layout = createLayout("/l").authenticate("a", "b", "c").render(renderFn);
			const root = createRootLayout("/").authenticate("a", "b", "c").render(renderFn);
			expect(page.authenticate).toEqual(["a", "b", "c"]);
			expect(layout.authenticate).toEqual(["a", "b", "c"]);
			expect(root.authenticate).toEqual(["a", "b", "c"]);
		});
	});

	describe("authorize", () => {
		it("stores authorize fn", () => {
			const authzFn = vi.fn(() => true);
			const r = createRootLayout("/").authenticate("admin").authorize(authzFn).render(renderFn);
			expect(r.authorize).toBe(authzFn);
		});
	});

	describe("effects", () => {
		it("stores loaderDeps", () => {
			const depsFn = vi.fn(({ search }: { search: unknown }) => [search]);
			const r = createRootLayout("/").effects({ loaderDeps: depsFn }).render(renderFn);
			expect(r.effectsConfig?.loaderDeps).toBe(depsFn);
		});

		it("stores shouldRefetch", () => {
			const fn = vi.fn(() => true);
			const r = createRootLayout("/").effects({ shouldRefetch: fn }).render(renderFn);
			expect(r.effectsConfig?.shouldRefetch).toBe(fn);
		});
	});

	describe("headers", () => {
		it("stores headers fn", () => {
			const headersFn = vi.fn(() => ({ "x-root": "1" }));
			const r = createRootLayout("/")
				.loader(async () => ({}))
				.headers(headersFn)
				.render(renderFn);
			expect(r.headers).toBe(headersFn);
		});
	});

	describe("_type", () => {
		it("is root-layout", () => {
			const r = createRootLayout("/").render(renderFn);
			expect(r._type).toBe("root-layout");
		});
	});

	describe("full chain", () => {
		it("stores all fields from cache through boundaries", () => {
			const cacheOpts = { client: { prefetch: "viewport" as const, staleTime: 2000 } };
			const pFn = (raw: Record<string, string | string[]>) => ({
				locale: String(raw["locale"] ?? "en"),
			});
			const spFn = (raw: URLSearchParams) => ({ debug: raw.get("debug") === "true" });
			const authzFn = vi.fn(() => true);
			const depsFn = vi.fn(({ search }: { search: unknown }) => [search]);
			const refetchFn = vi.fn(() => false);
			const preloaderFn = vi.fn(async () => ({ config: {} }));
			const loaderFn = vi.fn(async () => ({ user: null }));
			const headFn = vi.fn(() => ({ title: "Root" }));
			const headersFn = vi.fn(() => ({ "x-root": "yes" }));

			const r = createRootLayout("/")
				.cache(cacheOpts)
				.input({ params: pFn, searchParams: spFn })
				.authenticate("admin", "role:superuser")
				.authorize(authzFn)
				.effects({ loaderDeps: depsFn, shouldRefetch: refetchFn })
				.preloader(preloaderFn)
				.loader(loaderFn)
				.head(headFn)
				.headers(headersFn)
				.render(renderFn)
				.errorRender(errorFn)
				.notFoundRender(notFoundFn)
				.unauthorizedRender(unauthorizedFn);

			expect(r._type).toBe("root-layout");
			expect(r.cache).toEqual(cacheOpts);
			expect(r.inputConfig?.params).toBe(pFn);
			expect(r.inputConfig?.searchParams).toBe(spFn);
			expect(r.authenticate).toEqual(["admin", "role:superuser"]);
			expect(r.authorize).toBe(authzFn);
			expect(r.effectsConfig?.loaderDeps).toBe(depsFn);
			expect(r.effectsConfig?.shouldRefetch).toBe(refetchFn);
			expect(r.preloader).toBe(preloaderFn);
			expect(r.loader).toBe(loaderFn);
			expect(r.head).toBe(headFn);
			expect(r.headers).toBe(headersFn);
			expect(r.render).toBe(renderFn);
			expect(r.errorRender).toBe(errorFn);
			expect(r.notFoundRender).toBe(notFoundFn);
			expect(r.unauthorizedRender).toBe(unauthorizedFn);
			expect(r.virtualPath).toBe("/");
		});
	});

	describe("skipping optional methods", () => {
		it("undefined for all skipped fields", () => {
			const r = createRootLayout("/")
				.authenticate("x")
				.loader(async () => ({}))
				.render(renderFn);
			expect(r.cache).toBeUndefined();
			expect(r.inputConfig).toBeUndefined();
			expect(r.authorize).toBeUndefined();
			expect(r.effectsConfig).toBeUndefined();
			expect(r.preloader).toBeUndefined();
			expect(r.head).toBeUndefined();
			expect(r.headers).toBeUndefined();
		});
	});
});

/* ── createPage — intercept ───────────────────────────────────────── */

describe("createPage — intercept", () => {
	it("stores intercept config", () => {
		const r = createPage("/products/[id]")
			.intercept({ from: ["/products"], render: "modal" })
			.render(renderFn);
		expect(r.intercept).toEqual({ from: ["/products"], render: "modal" });
	});

	it("chainable with cache", () => {
		const r = createPage("/products/[id]")
			.intercept({ from: ["/products"], render: "drawer" })
			.cache({ client: { staleTime: 5000 } })
			.render(renderFn);
		expect(r.intercept).toEqual({ from: ["/products"], render: "drawer" });
		expect(r.cache).toEqual({ client: { staleTime: 5000 } });
	});

	it("chainable with loader", () => {
		const r = createPage("/products/[id]")
			.intercept({ from: ["/products"], render: "modal" })
			.loader(async () => ({ name: "test" }))
			.render(renderFn);
		expect(r.intercept).toEqual({ from: ["/products"], render: "modal" });
	});

	it("multiple from paths", () => {
		const r = createPage("/products/[id]")
			.intercept({ from: ["/products", "/search"], render: "panel" })
			.render(renderFn);
		expect(r.intercept).toEqual({ from: ["/products", "/search"], render: "panel" });
	});

	it("undefined when not set", () => {
		const r = createPage("/products/[id]").render(renderFn);
		expect(r.intercept).toBeUndefined();
	});
});
