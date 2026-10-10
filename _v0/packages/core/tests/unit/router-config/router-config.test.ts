import { describe, expect, it } from "vitest";
import type { RouterConfig } from "../../../src/router-config/index.ts";
import {
	createRouter,
	extractSerializable,
	isRouterConfig,
	parseFlareState,
} from "../../../src/router-config/index.ts";

function makeTreeNode() {
	return { s: {} };
}

describe("createRouter", () => {
	it("returns config with marker symbol", () => {
		const router = createRouter({ layouts: {}, routeTree: makeTreeNode() });
		const marker = Symbol.for("flare/router-config");
		expect((router as Record<symbol, unknown>)[marker]).toBe(true);
	});

	it("preserves all provided fields", () => {
		const config: RouterConfig = {
			basePath: "/app",
			cache: {
				client: { gcTime: 60000, prefetch: "intent", staleTime: 5000 },
			},
			caseSensitive: true,
			layouts: {},
			routeTree: makeTreeNode(),
			viewTransitions: true,
		};
		const router = createRouter(config);
		expect(router.basePath).toBe("/app");
		expect(router.caseSensitive).toBe(true);
		expect(router.cache?.client).toEqual({ gcTime: 60000, prefetch: "intent", staleTime: 5000 });
		expect(router.viewTransitions).toBe(true);
	});

	it("cache with all client fields", () => {
		const config: RouterConfig = {
			cache: {
				client: {
					gcTime: 300_000,
					prefetch: "viewport",
					prefetchGcTime: 60_000,
					prefetchStaleTime: 30_000,
					staleTime: 5000,
				},
			},
			layouts: {},
			routeTree: makeTreeNode(),
		};
		const router = createRouter(config);
		expect(router.cache?.client).toEqual({
			gcTime: 300_000,
			prefetch: "viewport",
			prefetchGcTime: 60_000,
			prefetchStaleTime: 30_000,
			staleTime: 5000,
		});
	});

	it("cache with client: false disables client caching", () => {
		const router = createRouter({
			cache: { client: false },
			layouts: {},
			routeTree: makeTreeNode(),
		});
		expect(router.cache?.client).toBe(false);
	});

	it("no mutation of input object", () => {
		const config: RouterConfig = { layouts: {}, routeTree: makeTreeNode() };
		const original = { ...config };
		createRouter(config);
		expect(config).toEqual(original);
	});

	it("isRouterConfig(createRouter()) → true", () => {
		const router = createRouter({ layouts: {}, routeTree: makeTreeNode() });
		expect(isRouterConfig(router)).toBe(true);
	});

	it("isRouterConfig({}) → false", () => {
		expect(isRouterConfig({})).toBe(false);
	});

	it("isRouterConfig(null) → false", () => {
		expect(isRouterConfig(null)).toBe(false);
	});

	it("isRouterConfig(undefined) → false", () => {
		expect(isRouterConfig(undefined)).toBe(false);
	});
});

describe("extractSerializable", () => {
	it("excludes layouts, routeTree, queryClientGetter, getScrollRestorationKey", () => {
		const router = createRouter({
			basePath: "/app",
			cache: { client: { staleTime: 5000 } },
			getScrollRestorationKey: () => "/",
			layouts: {},
			queryClientGetter: () => ({}) as never,
			routeTree: makeTreeNode(),
		});
		const serializable = extractSerializable(router);
		expect(serializable.basePath).toBe("/app");
		expect(serializable.cache?.client).toEqual({ staleTime: 5000 });
		expect("layouts" in serializable).toBe(false);
		expect("routeTree" in serializable).toBe(false);
		expect("queryClientGetter" in serializable).toBe(false);
		expect("getScrollRestorationKey" in serializable).toBe(false);
	});

	it("excludes marker symbol", () => {
		const router = createRouter({ layouts: {}, routeTree: makeTreeNode() });
		const serializable = extractSerializable(router);
		const marker = Symbol.for("flare/router-config");
		expect(Object.getOwnPropertySymbols(serializable)).not.toContain(marker);
	});

	it("preserves all serializable fields", () => {
		const router = createRouter({
			basePath: "/x",
			cache: {
				client: {
					gcTime: 1000,
					prefetch: "viewport",
					prefetchGcTime: 2000,
					prefetchStaleTime: 3000,
					staleTime: 4000,
				},
			},
			caseSensitive: true,
			layouts: {},
			notFoundMode: "root",
			routeCacheMaxEntries: 100,
			routeTree: makeTreeNode(),
			scrollRestoration: false,
			scrollRestorationBehavior: "smooth",
			scrollRestorationMaxEntries: 500,
			trailingSlash: "always",
			viewTransitions: { types: ["fade"] },
		});
		const s = extractSerializable(router);
		expect(s.basePath).toBe("/x");
		expect(s.caseSensitive).toBe(true);
		expect(s.cache?.client).toEqual({
			gcTime: 1000,
			prefetch: "viewport",
			prefetchGcTime: 2000,
			prefetchStaleTime: 3000,
			staleTime: 4000,
		});
		expect(s.notFoundMode).toBe("root");
		expect(s.routeCacheMaxEntries).toBe(100);
		expect(s.scrollRestoration).toBe(false);
		expect(s.scrollRestorationBehavior).toBe("smooth");
		expect(s.scrollRestorationMaxEntries).toBe(500);
		expect(s.trailingSlash).toBe("always");
		expect(s.viewTransitions).toEqual({ types: ["fade"] });
	});
});

describe("parseFlareState", () => {
	it("valid state → returns FlareState", () => {
		const raw = { c: {}, m: [], p: "/", r: {}, s: {} };
		const result = parseFlareState(raw);
		expect(result).toEqual(raw);
	});

	it("null → returns null", () => {
		expect(parseFlareState(null)).toBeNull();
	});

	it("undefined → returns null", () => {
		expect(parseFlareState(undefined)).toBeNull();
	});

	it("missing c → returns null", () => {
		expect(parseFlareState({ m: [], p: "/", r: {}, s: {} })).toBeNull();
	});

	it("missing m → returns null", () => {
		expect(parseFlareState({ c: {}, p: "/", r: {}, s: {} })).toBeNull();
	});

	it("missing p → returns null", () => {
		expect(parseFlareState({ c: {}, m: [], r: {}, s: {} })).toBeNull();
	});

	it("m not array → returns null", () => {
		expect(parseFlareState({ c: {}, m: "bad", p: "/", r: {}, s: {} })).toBeNull();
	});

	it("string → returns null", () => {
		expect(parseFlareState("not an object")).toBeNull();
	});

	it("preserves optional fields", () => {
		const raw = {
			c: { dir: "rtl", theme: "dark" },
			dk: ["comp-a"],
			m: [{ d: null, i: "m1", v: "_root_" }],
			p: "/about",
			ph: [{ head: { title: "About" }, matchId: "m1" }],
			r: { id: "42" },
			s: { q: "hello" },
		};
		const result = parseFlareState(raw);
		expect(result).toEqual(raw);
	});
});
