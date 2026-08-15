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
	return { ...original, matchRoute: vi.fn(), matchRoutePartial: vi.fn() };
});

vi.mock("../../../src/history", async (importOriginal) => {
	const original = await importOriginal<typeof import("../../../src/history")>();
	return {
		...original,
		restoreScroll: vi.fn(),
		scrollToTop: vi.fn(),
	};
});

import { navigate, resetNavigationState, setupNavigation } from "../../../src/navigation/index.ts";
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

function makeRoute(virtualPath: string, type: "r" | "x" = "r") {
	return { e: "", o: {}, p: vi.fn(), t: type, v: "", x: virtualPath };
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

describe("shallow → full rapid succession", () => {
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

	it("shallow nav then immediate full nav: full nav wins, params from full applied", async () => {
		const ctx = makeCtx({
			matches: () => [
				{
					_type: "render" as const,
					loaderData: null,
					render: () => null,
					variablePath: "/search",
					virtualPath: "_root_/search",
				},
			],
		});
		setupNavigation(ctx, mockLoadRouteModules);

		mockMatchRoute.mockImplementation((_tree: unknown, pathname: string) => ({
			params: pathname === "/search" ? { q: "shallow" } : {},
			route: makeRoute(pathname === "/search" ? "_root_/search" : "_root_/about"),
		}));

		mockLoadRouteModules.mockResolvedValue(makeLoadedModules({ page: makeModule("_root_/about") }));
		mockFetchNDJSON.mockResolvedValue({
			matches: [{ loaderData: "about-data", matchId: "_root_/about:" }],
			perRouteHeads: [],
			success: true,
		});

		/* Shallow to same route (instant) then full to different route */
		const shallow = navigate({ shallow: true, to: "/search?q=shallow" });
		const full = navigate({ to: "/about" });

		await Promise.all([shallow, full]);

		/* Full nav should win — params from /about, not /search */
		expect(ctx.isNavigating()).toBe(false);
		expect(ctx.matchCache.get("_root_/about:")?.data).toBe("about-data");
	});

	it("full nav then immediate shallow: shallow completes, full aborted", async () => {
		const ctx = makeCtx({
			matches: () => [
				{
					_type: "render" as const,
					loaderData: null,
					render: () => null,
					variablePath: "/search",
					virtualPath: "_root_/search",
				},
			],
		});
		setupNavigation(ctx, mockLoadRouteModules);

		const gate = { resolve: (_v: unknown) => {} };
		const slowFetch = new Promise((resolve) => {
			gate.resolve = resolve;
		});

		mockMatchRoute.mockImplementation((_tree: unknown, pathname: string) => ({
			params: pathname.includes("search") ? { q: "full" } : { q: "shallow" },
			route: makeRoute("_root_/search"),
		}));

		mockLoadRouteModules.mockResolvedValue(makeLoadedModules());
		mockFetchNDJSON.mockReturnValue(slowFetch);

		/* Full nav starts (blocked on fetch), then shallow fires */
		const full = navigate({ to: "/search?q=full" });
		const shallow = navigate({ shallow: true, to: "/search?q=shallow" });

		/* Resolve stale full nav after shallow completes */
		gate.resolve({
			matches: [{ loaderData: "stale", matchId: "stale-match" }],
			perRouteHeads: [],
			success: true,
		});

		await Promise.all([full, shallow]);

		/* Shallow params should be current (it ran second, incrementing version) */
		expect(ctx.search()).toEqual({ q: "shallow" });
		expect(ctx.isNavigating()).toBe(false);
		/* Stale full nav data should not be in cache */
		expect(ctx.matchCache.get("stale-match")).toBeUndefined();
	});
});

describe("deferred promise resolution after abort", () => {
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

	it("aborted nav's deferred .then() does not corrupt cache for new nav", async () => {
		const ctx = makeCtx();
		setupNavigation(ctx, mockLoadRouteModules);

		let firstNavResolve: (v: unknown) => void = () => {};
		const firstFetchPromise = new Promise((resolve) => {
			firstNavResolve = resolve;
		});

		let callCount = 0;
		mockMatchRoute.mockImplementation((_tree: unknown, pathname: string) => ({
			params: {},
			route: makeRoute(`_root_${pathname}`),
		}));

		mockLoadRouteModules.mockResolvedValue(makeLoadedModules());

		mockFetchNDJSON.mockImplementation(() => {
			callCount++;
			if (callCount === 1) return firstFetchPromise;
			return Promise.resolve({
				matches: [{ loaderData: "second-fresh", matchId: "m2" }],
				perRouteHeads: [],
				success: true,
			});
		});

		/* First nav starts */
		const first = navigate({ to: "/page-a" });
		/* Second nav aborts first */
		const second = navigate({ to: "/page-b" });

		/* Resolve first AFTER second completed */
		firstNavResolve({
			matches: [
				{
					hasDeferredMarkers: true,
					loaderData: { __deferred: true, key: "d0", promise: Promise.resolve("stale-deferred") },
					matchId: "m1",
				},
			],
			perRouteHeads: [],
			success: true,
		});

		await Promise.all([first, second]);
		/* Let microtasks settle for deferred .then() */
		await new Promise((r) => setTimeout(r, 50));

		/* Second nav's data present */
		expect(ctx.matchCache.get("m2")?.data).toBe("second-fresh");
		/* First nav's stale data should NOT be in cache (version guard prevents it) */
		expect(ctx.matchCache.get("m1")).toBeUndefined();
	});
});

describe("popstate during pending fetch", () => {
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

	it("popstate navigate aborts pending programmatic navigate", async () => {
		const ctx = makeCtx();
		setupNavigation(ctx, mockLoadRouteModules);

		const gate = { resolve: (_v: unknown) => {} };
		const slowFetch = new Promise((resolve) => {
			gate.resolve = resolve;
		});

		let callCount = 0;
		mockMatchRoute.mockImplementation((_tree: unknown, pathname: string) => ({
			params: {},
			route: makeRoute(`_root_${pathname}`),
		}));

		mockLoadRouteModules.mockResolvedValue(makeLoadedModules());

		mockFetchNDJSON.mockImplementation(() => {
			callCount++;
			if (callCount === 1) return slowFetch;
			return Promise.resolve({
				matches: [{ loaderData: "popstate-data", matchId: "pop-match" }],
				perRouteHeads: [],
				success: true,
			});
		});

		/* Programmatic nav starts, blocked on fetch */
		const programmatic = navigate({ to: "/slow-page" });

		/* Simulate popstate (browser back) arriving — different URL than current ctx.location() */
		const popstate = navigate({ _popstate: true, to: "/prev-page" } as Parameters<typeof navigate>[0]);

		/* Resolve stale programmatic fetch */
		gate.resolve({
			matches: [{ loaderData: "stale-programmatic", matchId: "prog-match" }],
			perRouteHeads: [],
			success: true,
		});

		await Promise.all([programmatic, popstate]);

		/* Popstate nav should win */
		expect(ctx.isNavigating()).toBe(false);
		expect(ctx.matchCache.get("pop-match")?.data).toBe("popstate-data");
		/* Stale programmatic data should not be cached */
		expect(ctx.matchCache.get("prog-match")).toBeUndefined();
	});
});

describe("triple rapid navigation", () => {
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

	it("A → B → C: only C's state applied, A and B aborted cleanly", async () => {
		const ctx = makeCtx();
		setupNavigation(ctx, mockLoadRouteModules);

		const gates = [{ resolve: (_v: unknown) => {} }, { resolve: (_v: unknown) => {} }];

		let callCount = 0;
		mockMatchRoute.mockImplementation((_tree: unknown, pathname: string) => ({
			params: {},
			route: makeRoute(`_root_${pathname}`),
		}));

		mockLoadRouteModules.mockResolvedValue(makeLoadedModules());

		mockFetchNDJSON.mockImplementation(() => {
			callCount++;
			if (callCount === 1)
				return new Promise((r) => {
					gates[0].resolve = r;
				});
			if (callCount === 2)
				return new Promise((r) => {
					gates[1].resolve = r;
				});
			return Promise.resolve({
				matches: [{ loaderData: "C-data", matchId: "C-match" }],
				perRouteHeads: [],
				success: true,
			});
		});

		const a = navigate({ to: "/page-a" });
		const b = navigate({ to: "/page-b" });
		const c = navigate({ to: "/page-c" });

		/* Resolve stale navigations out of order */
		gates[1].resolve({
			matches: [{ loaderData: "B-data", matchId: "B-match" }],
			perRouteHeads: [],
			success: true,
		});
		gates[0].resolve({
			matches: [{ loaderData: "A-data", matchId: "A-match" }],
			perRouteHeads: [],
			success: true,
		});

		await Promise.all([a, b, c]);

		expect(ctx.isNavigating()).toBe(false);
		expect(ctx.matchCache.get("C-match")?.data).toBe("C-data");
		expect(ctx.matchCache.get("A-match")).toBeUndefined();
		expect(ctx.matchCache.get("B-match")).toBeUndefined();
	});

	it("shallow → shallow → full: only full's data persists", async () => {
		const ctx = makeCtx({
			matches: () => [
				{
					_type: "render" as const,
					loaderData: null,
					render: () => null,
					variablePath: "/search",
					virtualPath: "_root_/search",
				},
			],
		});
		setupNavigation(ctx, mockLoadRouteModules);

		mockMatchRoute.mockImplementation((_tree: unknown, pathname: string) => ({
			params: pathname.includes("search") ? {} : {},
			route: makeRoute(pathname.includes("search") ? "_root_/search" : "_root_/about"),
		}));

		mockLoadRouteModules.mockResolvedValue(makeLoadedModules({ page: makeModule("_root_/about") }));
		mockFetchNDJSON.mockResolvedValue({
			matches: [{ loaderData: "about-data", matchId: "about-m" }],
			perRouteHeads: [],
			success: true,
		});

		const s1 = navigate({ shallow: true, to: "/search?q=a" });
		const s2 = navigate({ shallow: true, to: "/search?q=b" });
		const full = navigate({ to: "/about" });

		await Promise.all([s1, s2, full]);

		expect(ctx.isNavigating()).toBe(false);
		expect(ctx.matchCache.get("about-m")?.data).toBe("about-data");
	});
});

describe("navigate to same URL is no-op", () => {
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

	it("same URL without revalidate → early return, isNavigating stays false", async () => {
		const ctx = makeCtx();
		setupNavigation(ctx, mockLoadRouteModules);

		window.history.replaceState({}, "", "/about");

		await navigate({ to: "/about" });

		expect(ctx.isNavigating()).toBe(false);
		expect(mockFetchNDJSON).not.toHaveBeenCalled();
		expect(mockLoadRouteModules).not.toHaveBeenCalled();
	});
});
