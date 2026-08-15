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

describe("shallow navigation guard", () => {
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

	it("shallow to same route with different search → updates search/params, no fetch", async () => {
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

		mockMatchRoute.mockReturnValue({
			params: { q: "test" },
			route: makeRoute("_root_/search"),
		});

		await navigate({ shallow: true, to: "/search?q=test" });

		expect(ctx.params()).toEqual({ q: "test" });
		expect(ctx.search()).toEqual({ q: "test" });
		expect(ctx.isNavigating()).toBe(false);
		expect(mockLoadRouteModules).not.toHaveBeenCalled();
		expect(mockFetchNDJSON).not.toHaveBeenCalled();
	});

	it("shallow to different route → does full navigation (loads modules, fetches data)", async () => {
		const ctx = makeCtx({
			matches: () => [
				{
					_type: "render" as const,
					loaderData: null,
					render: () => null,
					variablePath: "/home",
					virtualPath: "_root_/home",
				},
			],
		});
		setupNavigation(ctx, mockLoadRouteModules);

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
			matches: [{ loaderData: "about-data", matchId: "_root_/about:" }],
			perRouteHeads: [],
			success: true,
		});

		await navigate({ shallow: true, to: "/about" });

		/* Should have proceeded to full navigation */
		expect(mockLoadRouteModules).toHaveBeenCalled();
		expect(mockFetchNDJSON).toHaveBeenCalled();
		expect(ctx.isNavigating()).toBe(false);
	});

	it("shallow to different route → logs warning in dev mode", async () => {
		const ctx = makeCtx({
			matches: () => [
				{
					_type: "render" as const,
					loaderData: null,
					render: () => null,
					variablePath: "/home",
					virtualPath: "_root_/home",
				},
			],
		});
		setupNavigation(ctx, mockLoadRouteModules);

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

		const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

		await navigate({ shallow: true, to: "/about" });

		expect(warnSpy).toHaveBeenCalledWith(
			"[flare:nav]",
			expect.stringContaining("shallow navigation to different route"),
		);
		warnSpy.mockRestore();
	});

	it("shallow to same route (nested layout match) → stays shallow", async () => {
		const ctx = makeCtx({
			matches: () => [
				{
					_type: "layout" as const,
					loaderData: null,
					render: () => null,
					variablePath: "/",
					virtualPath: "_root_",
				},
				{
					_type: "render" as const,
					loaderData: null,
					render: () => null,
					variablePath: "/products",
					virtualPath: "_root_/products",
				},
			],
		});
		setupNavigation(ctx, mockLoadRouteModules);

		mockMatchRoute.mockReturnValue({
			params: { page: "2" },
			route: makeRoute("_root_/products"),
		});

		await navigate({ shallow: true, to: "/products?page=2" });

		expect(ctx.params()).toEqual({ page: "2" });
		expect(mockLoadRouteModules).not.toHaveBeenCalled();
		expect(mockFetchNDJSON).not.toHaveBeenCalled();
	});

	it("shallow with empty matches (initial load) → falls through to full nav", async () => {
		const ctx = makeCtx({ matches: () => [] });
		setupNavigation(ctx, mockLoadRouteModules);

		mockMatchRoute.mockReturnValue({
			params: {},
			route: makeRoute("_root_/page"),
		});
		mockLoadRouteModules.mockResolvedValue(
			makeLoadedModules({
				page: makeModule("_root_/page"),
			}),
		);
		mockFetchNDJSON.mockResolvedValue({
			matches: [],
			perRouteHeads: [],
			success: true,
		});

		await navigate({ shallow: true, to: "/page" });

		/* No currentPage (empty matches) → different from target → full nav */
		expect(mockLoadRouteModules).toHaveBeenCalled();
	});

	it("shallow same-route preserves isNavigating: false after completion", async () => {
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

		mockMatchRoute.mockReturnValue({
			params: {},
			route: makeRoute("_root_/search"),
		});

		await navigate({ shallow: true, to: "/search?q=a" });
		expect(ctx.isNavigating()).toBe(false);

		await navigate({ shallow: true, to: "/search?q=b" });
		expect(ctx.isNavigating()).toBe(false);
		expect(ctx.search()).toEqual({ q: "b" });
	});

	it("shallow same-route updates history (pushState called before shallow check)", async () => {
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

		mockMatchRoute.mockReturnValue({
			params: {},
			route: makeRoute("_root_/search"),
		});

		const spy = vi.spyOn(history, "pushState");

		await navigate({ shallow: true, to: "/search?q=test" });

		/* History update happens in Step 4, before Step 5 (shallow guard) */
		expect(spy).toHaveBeenCalled();
	});

	it("shallow different route + replace: true → full nav with replace", async () => {
		const ctx = makeCtx({
			matches: () => [
				{
					_type: "render" as const,
					loaderData: null,
					render: () => null,
					variablePath: "/home",
					virtualPath: "_root_/home",
				},
			],
		});
		setupNavigation(ctx, mockLoadRouteModules);

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

		const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

		await navigate({ replace: true, shallow: true, to: "/about" });

		/* Shallow ignored → full nav proceeds */
		expect(mockLoadRouteModules).toHaveBeenCalled();
		expect(ctx.isNavigating()).toBe(false);
		warnSpy.mockRestore();
	});

	it("shallow warning includes target route name", async () => {
		const ctx = makeCtx({
			matches: () => [
				{
					_type: "render" as const,
					loaderData: null,
					render: () => null,
					variablePath: "/home",
					virtualPath: "_root_/home",
				},
			],
		});
		setupNavigation(ctx, mockLoadRouteModules);

		mockMatchRoute.mockReturnValue({
			params: {},
			route: makeRoute("_root_/dashboard/settings"),
		});
		mockLoadRouteModules.mockResolvedValue(
			makeLoadedModules({
				page: makeModule("_root_/dashboard/settings"),
			}),
		);
		mockFetchNDJSON.mockResolvedValue({
			matches: [],
			perRouteHeads: [],
			success: true,
		});

		const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

		await navigate({ shallow: true, to: "/dashboard/settings" });

		expect(warnSpy).toHaveBeenCalledWith("[flare:nav]", expect.stringContaining("_root_/dashboard/settings"));
		warnSpy.mockRestore();
	});
});

describe("shallow navigation input validation", () => {
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

	it("searchParams validator applies defaults", async () => {
		const route = makeRoute("_root_/search");
		route.p.mockResolvedValue({
			default: {
				inputConfig: {
					searchParams: (raw: URLSearchParams) => ({
						page: raw.get("page") ?? "1",
						sort: raw.get("sort") ?? "name",
					}),
				},
			},
		});

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

		mockMatchRoute.mockReturnValue({ params: {}, route });

		await navigate({ shallow: true, to: "/search" });

		expect(ctx.search()).toEqual({ page: "1", sort: "name" });
	});

	it("searchParams validator transforms values", async () => {
		const route = makeRoute("_root_/search");
		route.p.mockResolvedValue({
			default: {
				inputConfig: {
					searchParams: (raw: URLSearchParams) => ({
						filter: (raw.get("filter") ?? "").trim().toLowerCase(),
					}),
				},
			},
		});

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

		mockMatchRoute.mockReturnValue({ params: {}, route });

		await navigate({ shallow: true, to: "/search?filter=HELLO" });

		expect(ctx.search()).toEqual({ filter: "hello" });
	});

	it("params validator runs on shallow", async () => {
		const route = makeRoute("_root_/users/[id]");
		route.p.mockResolvedValue({
			default: {
				inputConfig: {
					params: (raw: Record<string, string | string[]>) => ({
						id: String(raw.id).toUpperCase(),
					}),
				},
			},
		});

		const ctx = makeCtx({
			matches: () => [
				{
					_type: "render" as const,
					loaderData: null,
					render: () => null,
					variablePath: "/users/:id",
					virtualPath: "_root_/users/[id]",
				},
			],
		});
		setupNavigation(ctx, mockLoadRouteModules);

		mockMatchRoute.mockReturnValue({ params: { id: "abc" }, route });

		await navigate({ shallow: true, to: "/users/abc" });

		expect(ctx.params()).toEqual({ id: "ABC" });
	});

	it("validation error falls back to raw values and warns", async () => {
		const route = makeRoute("_root_/search");
		route.p.mockResolvedValue({
			default: {
				inputConfig: {
					searchParams: () => {
						throw new Error("bad input");
					},
				},
			},
		});

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

		mockMatchRoute.mockReturnValue({ params: {}, route });

		const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

		await navigate({ shallow: true, to: "/search?q=test" });

		expect(ctx.search()).toEqual({ q: "test" });
		expect(warnSpy).toHaveBeenCalledWith("[flare:nav]", expect.stringContaining("shallow validation failed"));
		warnSpy.mockRestore();
	});

	it("no inputConfig resolves to raw values without crash", async () => {
		const route = makeRoute("_root_/search");
		route.p.mockResolvedValue({ default: {} });

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

		mockMatchRoute.mockReturnValue({ params: { q: "test" }, route });

		await navigate({ shallow: true, to: "/search?q=test" });

		expect(route.p).toHaveBeenCalled();
		expect(ctx.search()).toEqual({ q: "test" });
		expect(ctx.params()).toEqual({ q: "test" });
	});
});
