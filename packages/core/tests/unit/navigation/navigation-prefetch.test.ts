import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMatchCache, createPrefetchCache } from "../../../src/caches/index.ts";
import type { LoadedRouteModules } from "../../../src/navigation/types.ts";
import type { FlareProviderContext, NavigateOptions } from "../../../src/outlet/types.ts";
import type { TreeNode } from "../../../src/router-primitives/types.ts";
import type { SearchParams } from "../../../src/url/index.ts";

vi.mock("../../../src/ndjson-client", () => ({
	fetchNDJSON: vi.fn(),
}));

vi.mock("../../../src/head-client", () => ({
	applyPerRouteHeads: vi.fn(),
}));

vi.mock("../../../src/router-primitives", async (importOriginal) => {
	const original = await importOriginal<typeof import("../../../src/router-primitives")>();
	return { ...original, matchRoute: vi.fn() };
});

vi.mock("../../../src/history", async (importOriginal) => {
	const original = await importOriginal<typeof import("../../../src/history")>();
	return {
		...original,
		restoreScroll: vi.fn(),
		scrollToTop: vi.fn(),
	};
});

import { navigate, prefetch, resetNavigationState, setupNavigation } from "../../../src/navigation/index.ts";
import { fetchNDJSON } from "../../../src/ndjson-client/index.ts";
import { matchRoute } from "../../../src/router-primitives/index.ts";

const mockFetchNDJSON = fetchNDJSON as ReturnType<typeof vi.fn>;
const mockMatchRoute = matchRoute as ReturnType<typeof vi.fn>;

function makeFakeTree(): TreeNode {
	return { s: {} };
}

function makeModule(virtualPath: string, type: "layout" | "render" = "render") {
	return { _type: type, render: () => null, variablePath: "", virtualPath };
}

function makeLoadedModules(overrides?: Partial<LoadedRouteModules>): LoadedRouteModules {
	return {
		layouts: [],
		page: makeModule("_root_/home"),
		params: {},
		...overrides,
	};
}

function makeRoute(virtualPath: string, type: "r" | "x" = "r", meta: Record<string, unknown> = {}) {
	return { e: "", o: meta, p: vi.fn(), t: type, v: "", x: virtualPath };
}

function makeCtx(overrides?: Partial<FlareProviderContext>): FlareProviderContext {
	let matches: FlareProviderContext["matches"] extends () => infer R ? R : never = [];
	let params: Record<string, string | string[]> = {};
	let search: SearchParams = {};
	let navigationPhase: import("../../../src/outlet/types").NavigationPhase = "idle";
	let viewTransition: import("../../../src/outlet/types").BrowserViewTransition | null = null;
	let notFound = false;
	let hydrated = false;

	const ctx: FlareProviderContext = {
		hydrated: () => hydrated,
		intercepted: () => null,
		invalidate: vi.fn(),
		isNavigating: () => navigationPhase !== "idle",
		layouts: {},
		location: () => ({
			hash: "",
			params: {},
			pathname: "/",
			search: {},
			url: new URL("http://localhost/"),
			variablePath: "",
			virtualPath: "",
		}),
		matchCache: createMatchCache(),
		matches: () => matches,
		navigate: vi.fn(() => Promise.resolve()),
		navigationPhase: () => navigationPhase,
		notFound: () => notFound,
		params: () => params,
		prefetch: vi.fn(() => Promise.resolve()),
		prefetchCache: createPrefetchCache(),
		resolvers: new Map(),
		routeTree: makeFakeTree(),
		search: () => search,
		setHydrated: (v: boolean) => {
			hydrated = v;
		},
		setIntercepted: () => {},
		setMatches: (m) => {
			matches = m;
		},
		setNavigationPhase: (v: import("../../../src/outlet/types").NavigationPhase) => {
			navigationPhase = v;
		},
		setNotFound: (v: boolean) => {
			notFound = v;
		},
		setParams: (p) => {
			params = p;
		},
		setSearch: (s) => {
			search = s;
		},
		setViewTransition: (vt: import("../../../src/outlet/types").BrowserViewTransition | null) => {
			viewTransition = vt;
		},
		viewTransition: () => viewTransition,
		...overrides,
	};

	let navigateFn: (opts: NavigateOptions) => Promise<void> = () => Promise.resolve();
	let prefetchFn: (opts: { to: string }) => Promise<void> = () => Promise.resolve();

	Object.defineProperty(ctx, "_setNavigate", {
		value: (fn: typeof navigateFn) => {
			navigateFn = fn;
		},
	});
	Object.defineProperty(ctx, "_setPrefetch", {
		value: (fn: typeof prefetchFn) => {
			prefetchFn = fn;
		},
	});

	return ctx;
}

const mockLoadRouteModules =
	vi.fn<(pathname: string, routeTree: unknown, layouts: unknown) => Promise<LoadedRouteModules>>();

function resetLocation(): void {
	window.history.replaceState({}, "", "/");
}

describe("prefetch marks route visited", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockFetchNDJSON.mockReset();
		mockMatchRoute.mockReset();
		mockLoadRouteModules.mockReset();
		resetLocation();
	});

	afterEach(() => {
		resetNavigationState();
		resetLocation();
	});

	it("prefetch marks route as visited → navigate takes staleness path", async () => {
		const ctx = makeCtx();
		setupNavigation(ctx, mockLoadRouteModules);

		/* Mock matchRoute for prefetch's internal use */
		mockMatchRoute.mockReturnValue({
			params: {},
			route: makeRoute("_root_/about"),
		});

		const computedMatchId = "_root_/about:{}:[]";

		mockFetchNDJSON.mockResolvedValue({
			matches: [{ loaderData: "prefetched", matchId: computedMatchId }],
			perRouteHeads: [],
			success: true,
		});
		mockLoadRouteModules.mockResolvedValue(
			makeLoadedModules({
				page: makeModule("_root_/about"),
			}),
		);

		/* Prefetch the route */
		await prefetch({ to: "/about" });

		/* Verify cache populated */
		expect(ctx.matchCache.get(computedMatchId)?.data).toBe("prefetched");

		/* Now navigate — should NOT do parallel fetch (route is visited) */
		vi.clearAllMocks();
		mockMatchRoute.mockReturnValue({
			params: {},
			route: makeRoute("_root_/about"),
		});
		mockLoadRouteModules.mockResolvedValue(
			makeLoadedModules({
				page: makeModule("_root_/about"),
			}),
		);
		mockFetchNDJSON.mockResolvedValue({
			matches: [],
			perRouteHeads: [],
			success: true,
		});

		await navigate({ to: "/about" });

		/* loadRouteModules called first (not parallel with fetch) */
		expect(mockLoadRouteModules).toHaveBeenCalledTimes(1);
	});

	it("navigate to prefetched route with deferred → fetches fresh (hasDeferred forces stale)", async () => {
		const ctx = makeCtx();
		setupNavigation(ctx, mockLoadRouteModules);

		mockMatchRoute.mockReturnValue({
			params: {},
			route: makeRoute("_root_/dashboard"),
		});

		const computedMatchId = "_root_/dashboard:{}:[]";

		/* Prefetch returns data with hasDeferredMarkers */
		mockFetchNDJSON.mockResolvedValue({
			matches: [
				{
					hasDeferredMarkers: true,
					loaderData: { stats: "shell" },
					matchId: computedMatchId,
				},
			],
			perRouteHeads: [],
			success: true,
		});
		mockLoadRouteModules.mockResolvedValue(
			makeLoadedModules({
				page: makeModule("_root_/dashboard"),
			}),
		);

		await prefetch({ to: "/dashboard" });

		/* Verify cache has hasDeferred */
		expect(ctx.matchCache.get(computedMatchId)?.hasDeferred).toBe(true);

		/* Navigate — stale because hasDeferred */
		vi.clearAllMocks();
		mockMatchRoute.mockReturnValue({
			params: {},
			route: makeRoute("_root_/dashboard"),
		});
		mockLoadRouteModules.mockResolvedValue(
			makeLoadedModules({
				page: makeModule("_root_/dashboard"),
			}),
		);
		mockFetchNDJSON.mockResolvedValue({
			matches: [{ loaderData: { stats: "full" }, matchId: computedMatchId }],
			perRouteHeads: [],
			success: true,
		});

		await navigate({ to: "/dashboard" });

		/* Should have fetched fresh data */
		expect(mockFetchNDJSON).toHaveBeenCalledTimes(1);
		/* Cache updated with fresh data */
		expect(ctx.matchCache.get(computedMatchId)?.data).toEqual({ stats: "full" });
	});

	it("navigate to prefetched route without deferred → uses cache, no fetch", async () => {
		const ctx = makeCtx();
		setupNavigation(ctx, mockLoadRouteModules);

		mockMatchRoute.mockReturnValue({
			params: {},
			route: makeRoute("_root_/static-page"),
		});

		/* computeMatchId for empty params + no loaderDeps = "routeId:{}:[]" */
		const computedMatchId = "_root_/static-page:{}:[]";

		/* Prefetch returns data without deferred markers */
		mockFetchNDJSON.mockResolvedValue({
			matches: [
				{
					loaderData: { content: "cached" },
					matchId: computedMatchId,
				},
			],
			perRouteHeads: [],
			success: true,
		});
		mockLoadRouteModules.mockResolvedValue(
			makeLoadedModules({
				page: {
					...makeModule("_root_/static-page"),
					cache: { client: { staleTime: 60_000 } },
				},
			}),
		);

		await prefetch({ to: "/static-page" });

		/* Navigate — cache is fresh (no hasDeferred, within staleTime) */
		vi.clearAllMocks();
		mockMatchRoute.mockReturnValue({
			params: {},
			route: makeRoute("_root_/static-page"),
		});
		mockLoadRouteModules.mockResolvedValue(
			makeLoadedModules({
				page: {
					...makeModule("_root_/static-page"),
					cache: { client: { staleTime: 60_000 } },
				},
			}),
		);

		await navigate({ to: "/static-page" });

		/* No fetch needed — data from prefetch cache */
		expect(mockFetchNDJSON).not.toHaveBeenCalled();
		/* Data should still be in cache */
		expect(ctx.matchCache.get(computedMatchId)?.data).toEqual({ content: "cached" });
	});
});

describe("prefetch respects route-level prefetchStaleTime", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockFetchNDJSON.mockReset();
		mockMatchRoute.mockReset();
		mockLoadRouteModules.mockReset();
		resetLocation();
	});

	afterEach(() => {
		resetNavigationState();
		resetLocation();
	});

	it("skips prefetch when route prefetchStaleTime makes cache fresh", async () => {
		const ctx = makeCtx();
		setupNavigation(ctx, mockLoadRouteModules);

		const routeMeta = { client: { prefetchStaleTime: 120_000 } };
		mockMatchRoute.mockReturnValue({
			params: {},
			route: makeRoute("_root_/cached-route", "r", routeMeta),
		});

		const computedMatchId = "_root_/cached-route:{}:[]";

		/* First prefetch succeeds — populates prefetchCache */
		mockFetchNDJSON.mockResolvedValue({
			matches: [{ loaderData: "first", matchId: computedMatchId }],
			perRouteHeads: [],
			success: true,
		});
		mockLoadRouteModules.mockResolvedValue(
			makeLoadedModules({
				page: {
					...makeModule("_root_/cached-route"),
					cache: { client: { prefetchStaleTime: 120_000 } },
				},
			}),
		);

		await prefetch({ to: "/cached-route" });
		expect(mockFetchNDJSON).toHaveBeenCalledTimes(1);

		/* Second prefetch within prefetchStaleTime window → should be skipped */
		vi.clearAllMocks();
		mockMatchRoute.mockReturnValue({
			params: {},
			route: makeRoute("_root_/cached-route", "r", routeMeta),
		});
		mockLoadRouteModules.mockResolvedValue(
			makeLoadedModules({
				page: {
					...makeModule("_root_/cached-route"),
					cache: { client: { prefetchStaleTime: 120_000 } },
				},
			}),
		);

		await prefetch({ to: "/cached-route" });

		/* Should NOT re-fetch — route says prefetch is fresh for 120s */
		expect(mockFetchNDJSON).not.toHaveBeenCalled();
	});

	it("re-prefetches when prefetchStaleTime is short and time elapses", async () => {
		const ctx = makeCtx();
		setupNavigation(ctx, mockLoadRouteModules);

		const routeMeta = { client: { prefetchStaleTime: 100 } };
		mockMatchRoute.mockReturnValue({
			params: {},
			route: makeRoute("_root_/short-cache", "r", routeMeta),
		});

		const computedMatchId = "_root_/short-cache:{}:[]";

		/* First prefetch with short prefetchStaleTime */
		mockFetchNDJSON.mockResolvedValue({
			matches: [{ loaderData: "v1", matchId: computedMatchId }],
			perRouteHeads: [],
			success: true,
		});
		mockLoadRouteModules.mockResolvedValue(
			makeLoadedModules({
				page: {
					...makeModule("_root_/short-cache"),
					cache: { client: { prefetchStaleTime: 100 } },
				},
			}),
		);

		await prefetch({ to: "/short-cache" });
		expect(mockFetchNDJSON).toHaveBeenCalledTimes(1);

		/* Advance time beyond prefetchStaleTime */
		vi.clearAllMocks();
		const now = Date.now();
		vi.spyOn(Date, "now").mockReturnValue(now + 200);

		mockMatchRoute.mockReturnValue({
			params: {},
			route: makeRoute("_root_/short-cache", "r", routeMeta),
		});
		mockFetchNDJSON.mockResolvedValue({
			matches: [{ loaderData: "v2", matchId: computedMatchId }],
			perRouteHeads: [],
			success: true,
		});
		mockLoadRouteModules.mockResolvedValue(
			makeLoadedModules({
				page: {
					...makeModule("_root_/short-cache"),
					cache: { client: { prefetchStaleTime: 100 } },
				},
			}),
		);

		await prefetch({ to: "/short-cache" });

		/* Should re-fetch — stale after 200ms > 100ms prefetchStaleTime */
		expect(mockFetchNDJSON).toHaveBeenCalledTimes(1);

		vi.spyOn(Date, "now").mockRestore();
	});

	it("uses default 30s staleTime when no prefetchStaleTime set", async () => {
		const ctx = makeCtx();
		setupNavigation(ctx, mockLoadRouteModules);

		mockMatchRoute.mockReturnValue({
			params: {},
			route: makeRoute("_root_/default-route"),
		});

		const computedMatchId = "_root_/default-route:{}:[]";

		/* First prefetch — no prefetchStaleTime on route */
		mockFetchNDJSON.mockResolvedValue({
			matches: [{ loaderData: "data", matchId: computedMatchId }],
			perRouteHeads: [],
			success: true,
		});
		mockLoadRouteModules.mockResolvedValue(
			makeLoadedModules({
				page: makeModule("_root_/default-route"),
			}),
		);

		await prefetch({ to: "/default-route" });
		expect(mockFetchNDJSON).toHaveBeenCalledTimes(1);

		/* Second prefetch within default 30s window → skipped */
		vi.clearAllMocks();
		mockMatchRoute.mockReturnValue({
			params: {},
			route: makeRoute("_root_/default-route"),
		});

		await prefetch({ to: "/default-route" });
		expect(mockFetchNDJSON).not.toHaveBeenCalled();
	});

	it("uses router prefetchStaleTime when route has none", async () => {
		const ctx = makeCtx({ routerCacheDefaults: { prefetchStaleTime: 100 } });
		setupNavigation(ctx, mockLoadRouteModules);

		const computedMatchId = "_root_/router-pst:{}:[]";
		const routeMeta = {};

		mockMatchRoute.mockReturnValue({
			params: {},
			route: makeRoute("_root_/router-pst", "r", routeMeta),
		});
		mockFetchNDJSON.mockResolvedValue({
			matches: [{ loaderData: "d", matchId: computedMatchId }],
			perRouteHeads: [],
			success: true,
		});
		mockLoadRouteModules.mockResolvedValue(
			makeLoadedModules({
				page: makeModule("_root_/router-pst"),
			}),
		);

		await prefetch({ to: "/router-pst" });
		expect(mockFetchNDJSON).toHaveBeenCalledTimes(1);

		/* Advance time past router prefetchStaleTime (100ms) */
		vi.spyOn(Date, "now").mockReturnValue(Date.now() + 200);

		vi.clearAllMocks();
		mockMatchRoute.mockReturnValue({
			params: {},
			route: makeRoute("_root_/router-pst", "r", routeMeta),
		});
		mockFetchNDJSON.mockResolvedValue({
			matches: [{ loaderData: "d2", matchId: computedMatchId }],
			perRouteHeads: [],
			success: true,
		});
		mockLoadRouteModules.mockResolvedValue(
			makeLoadedModules({
				page: makeModule("_root_/router-pst"),
			}),
		);

		await prefetch({ to: "/router-pst" });

		/* Should re-fetch — stale after 200ms > 100ms router prefetchStaleTime */
		expect(mockFetchNDJSON).toHaveBeenCalledTimes(1);

		vi.spyOn(Date, "now").mockRestore();
	});

	it("route prefetchStaleTime overrides router default", async () => {
		const ctx = makeCtx({ routerCacheDefaults: { prefetchStaleTime: 60_000 } });
		setupNavigation(ctx, mockLoadRouteModules);

		const computedMatchId = "_root_/route-pst:{}:[]";
		const routeMeta = { client: { prefetchStaleTime: 100 } };

		mockMatchRoute.mockReturnValue({
			params: {},
			route: makeRoute("_root_/route-pst", "r", routeMeta),
		});
		mockFetchNDJSON.mockResolvedValue({
			matches: [{ loaderData: "d", matchId: computedMatchId }],
			perRouteHeads: [],
			success: true,
		});
		mockLoadRouteModules.mockResolvedValue(
			makeLoadedModules({
				page: {
					...makeModule("_root_/route-pst"),
					cache: { client: { prefetchStaleTime: 100 } },
				},
			}),
		);

		await prefetch({ to: "/route-pst" });
		expect(mockFetchNDJSON).toHaveBeenCalledTimes(1);

		/* Advance past route's 100ms but within router's 60s */
		vi.spyOn(Date, "now").mockReturnValue(Date.now() + 200);

		vi.clearAllMocks();
		mockMatchRoute.mockReturnValue({
			params: {},
			route: makeRoute("_root_/route-pst", "r", routeMeta),
		});
		mockFetchNDJSON.mockResolvedValue({
			matches: [{ loaderData: "d2", matchId: computedMatchId }],
			perRouteHeads: [],
			success: true,
		});
		mockLoadRouteModules.mockResolvedValue(
			makeLoadedModules({
				page: {
					...makeModule("_root_/route-pst"),
					cache: { client: { prefetchStaleTime: 100 } },
				},
			}),
		);

		await prefetch({ to: "/route-pst" });

		/* Route's 100ms wins over router's 60s — should re-fetch */
		expect(mockFetchNDJSON).toHaveBeenCalledTimes(1);

		vi.spyOn(Date, "now").mockRestore();
	});
});

describe("prefetch cache NOT marked on failure", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockFetchNDJSON.mockReset();
		mockMatchRoute.mockReset();
		mockLoadRouteModules.mockReset();
		resetLocation();
	});

	afterEach(() => {
		resetNavigationState();
		resetLocation();
	});

	it("failed loadRouteModules → cache NOT marked, second prefetch retries", async () => {
		const ctx = makeCtx();
		setupNavigation(ctx, mockLoadRouteModules);

		mockMatchRoute.mockReturnValue({
			params: {},
			route: makeRoute("_root_/fail-page"),
		});

		mockFetchNDJSON.mockResolvedValue({
			matches: [],
			perRouteHeads: [],
			success: true,
		});
		/* First prefetch: loadRouteModules rejects */
		mockLoadRouteModules.mockRejectedValue(new Error("module load failed"));

		await prefetch({ to: "/fail-page" }).catch(() => {});

		/* Second prefetch attempt — should NOT be skipped */
		mockFetchNDJSON.mockReset();
		mockFetchNDJSON.mockResolvedValue({
			matches: [],
			perRouteHeads: [],
			success: true,
		});
		mockLoadRouteModules.mockReset();
		mockLoadRouteModules.mockResolvedValue(makeLoadedModules({ page: makeModule("_root_/fail-page") }));

		await prefetch({ to: "/fail-page" });

		/* If cache was marked prematurely, shouldPrefetch returns false and fetchNDJSON is never called */
		expect(mockFetchNDJSON).toHaveBeenCalledTimes(1);
	});

	it("failed fetchNDJSON → cache NOT marked, second prefetch retries", async () => {
		const ctx = makeCtx();
		setupNavigation(ctx, mockLoadRouteModules);

		mockMatchRoute.mockReturnValue({
			params: {},
			route: makeRoute("_root_/fetch-fail"),
		});

		/* First prefetch: fetchNDJSON rejects */
		mockFetchNDJSON.mockRejectedValue(new Error("network error"));
		mockLoadRouteModules.mockResolvedValue(makeLoadedModules({ page: makeModule("_root_/fetch-fail") }));

		await prefetch({ to: "/fetch-fail" }).catch(() => {});

		/* Second attempt */
		mockFetchNDJSON.mockReset();
		mockFetchNDJSON.mockResolvedValue({
			matches: [{ loaderData: "recovered", matchId: "_root_/fetch-fail:{}:[]" }],
			perRouteHeads: [],
			success: true,
		});
		mockLoadRouteModules.mockReset();
		mockLoadRouteModules.mockResolvedValue(makeLoadedModules({ page: makeModule("_root_/fetch-fail") }));

		await prefetch({ to: "/fetch-fail" });
		expect(mockFetchNDJSON).toHaveBeenCalledTimes(1);
	});

	it("successful prefetch → cache IS marked, second prefetch skipped", async () => {
		const ctx = makeCtx();
		setupNavigation(ctx, mockLoadRouteModules);

		mockMatchRoute.mockReturnValue({
			params: {},
			route: makeRoute("_root_/good-page"),
		});

		mockFetchNDJSON.mockResolvedValue({
			matches: [{ loaderData: "ok", matchId: "_root_/good-page:{}:[]" }],
			perRouteHeads: [],
			success: true,
		});
		mockLoadRouteModules.mockResolvedValue(makeLoadedModules({ page: makeModule("_root_/good-page") }));

		await prefetch({ to: "/good-page" });

		/* Second prefetch should be skipped (cache marked) */
		mockFetchNDJSON.mockReset();
		mockLoadRouteModules.mockReset();

		await prefetch({ to: "/good-page" });
		expect(mockFetchNDJSON).not.toHaveBeenCalled();
	});
});
