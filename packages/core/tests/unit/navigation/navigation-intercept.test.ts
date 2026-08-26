import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMatchCache, createPrefetchCache } from "../../../src/caches/index.ts";
import type { LoadedRouteModules } from "../../../src/navigation/types.ts";
import type { FlareProviderContext } from "../../../src/outlet/types.ts";
import type { TreeNode } from "../../../src/router-primitives/types.ts";
import type { SearchParams } from "../../../src/url/index.ts";

/* Mock external dependencies */
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
		page: makeModule("_root_/products/[id]"),
		params: { id: "42" },
		...overrides,
	};
}

function makeRoute(virtualPath: string, type: "r" | "x" = "r", intercept?: { from: string[]; render: string }) {
	return { e: "", o: { intercept }, p: vi.fn(), t: type, v: "/products/[id]", x: virtualPath };
}

function makeCtx(overrides?: Partial<FlareProviderContext>): FlareProviderContext {
	let matches: FlareProviderContext["matches"] extends () => infer R ? R : never = [];
	let params: Record<string, string | string[]> = {};
	let search: SearchParams = {};
	let navigationPhase: import("../../../src/outlet/types").NavigationPhase = "idle";
	let viewTransition: import("../../../src/outlet/types").BrowserViewTransition | null = null;
	let notFound = false;
	let hydrated = false;
	let intercepted: ReturnType<FlareProviderContext["intercepted"]> = null;

	const ctx: FlareProviderContext = {
		hydrated: () => hydrated,
		intercepted: () => intercepted,
		invalidate: vi.fn(),
		isNavigating: () => navigationPhase !== "idle",
		layouts: {},
		location: () => ({
			hash: "",
			params: {},
			pathname: "/products",
			search: {},
			url: new URL("http://localhost/products"),
			variablePath: "/products",
			virtualPath: "_root_/products/",
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
		setIntercepted: (s) => {
			intercepted = s;
		},
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

	let navigateFn: (opts: unknown) => Promise<void> = () => Promise.resolve();
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

describe("intercept routes", () => {
	beforeEach(() => {
		resetNavigationState();
		vi.clearAllMocks();
		resetLocation();
	});

	afterEach(() => {
		resetNavigationState();
	});

	it("intercepts navigation when current variablePath matches from", async () => {
		const ctx = makeCtx();
		setupNavigation(ctx, mockLoadRouteModules);

		/* Route with intercept config */
		const route = makeRoute("_root_/products/[id]", "r", {
			from: ["/products"],
			render: "modal",
		});

		mockMatchRoute.mockReturnValue({
			params: { id: "42" },
			route,
		});

		mockLoadRouteModules.mockResolvedValue(
			makeLoadedModules({
				page: makeModule("_root_/products/[id]"),
				params: { id: "42" },
			}),
		);

		mockFetchNDJSON.mockResolvedValue({
			matches: [
				{
					error: null,
					hasDeferredMarkers: false,
					loaderData: { name: "Widget" },
					matchId: "test-match-id",
					preloaderContext: undefined,
				},
			],
			perRouteHeads: [],
		});

		/* Navigate from /products to /products/42 */
		window.history.replaceState({}, "", "/products");
		await navigate({ to: "/products/42" });

		/* Should have set intercepted state */
		expect(ctx.intercepted()).not.toBeNull();
		expect(ctx.intercepted()?.render).toBe("modal");
		expect(ctx.intercepted()?.match).toBeDefined();
		expect(ctx.intercepted()?.dismiss).toBeInstanceOf(Function);
		expect(ctx.intercepted()?.backgroundLocation.pathname).toBe("/products");
		expect(ctx.intercepted()?.params).toEqual({ id: "42" });
		/* Background tree keeps the pre-overlay params */
		expect(ctx.params()).toEqual({});

		/* Should not be navigating anymore */
		expect(ctx.isNavigating()).toBe(false);
	});

	it("does NOT intercept when current variablePath does not match from", async () => {
		const ctx = makeCtx({
			location: () => ({
				hash: "",
				params: {},
				pathname: "/about",
				search: {},
				url: new URL("http://localhost/about"),
				variablePath: "/about",
				virtualPath: "_root_/about",
			}),
		});
		setupNavigation(ctx, mockLoadRouteModules);

		const route = makeRoute("_root_/products/[id]", "r", {
			from: ["/products"],
			render: "modal",
		});

		mockMatchRoute.mockReturnValue({
			params: { id: "42" },
			route,
		});

		mockLoadRouteModules.mockResolvedValue(
			makeLoadedModules({
				page: makeModule("_root_/products/[id]"),
				params: { id: "42" },
			}),
		);

		mockFetchNDJSON.mockResolvedValue({
			matches: [
				{
					error: null,
					hasDeferredMarkers: false,
					loaderData: { name: "Widget" },
					matchId: "test-match-id",
					preloaderContext: undefined,
				},
			],
			perRouteHeads: [],
		});

		window.history.replaceState({}, "", "/about");
		await navigate({ to: "/products/42" });

		/* Should NOT have intercepted — normal navigation */
		expect(ctx.intercepted()).toBeNull();
	});

	it("does NOT intercept on popstate events", async () => {
		const ctx = makeCtx();
		setupNavigation(ctx, mockLoadRouteModules);

		const route = makeRoute("_root_/products/[id]", "r", {
			from: ["/products"],
			render: "modal",
		});

		mockMatchRoute.mockReturnValue({
			params: { id: "42" },
			route,
		});

		mockLoadRouteModules.mockResolvedValue(
			makeLoadedModules({
				page: makeModule("_root_/products/[id]"),
				params: { id: "42" },
			}),
		);

		mockFetchNDJSON.mockResolvedValue({
			matches: [
				{
					error: null,
					hasDeferredMarkers: false,
					loaderData: { name: "Widget" },
					matchId: "test-match-id",
					preloaderContext: undefined,
				},
			],
			perRouteHeads: [],
		});

		window.history.replaceState({}, "", "/products");
		await navigate({ _popstate: true, to: "/products/42" });

		/* Should NOT have intercepted — popstate bypasses intercept */
		expect(ctx.intercepted()).toBeNull();
	});

	it("clears intercepted state when navigating to a different route", async () => {
		const ctx = makeCtx();
		setupNavigation(ctx, mockLoadRouteModules);

		/* Step 1: intercept by navigating from /products to /products/42 */
		const interceptRoute = makeRoute("_root_/products/[id]", "r", {
			from: ["/products"],
			render: "modal",
		});

		mockMatchRoute.mockReturnValueOnce({ params: { id: "42" }, route: interceptRoute });
		mockLoadRouteModules.mockResolvedValueOnce(
			makeLoadedModules({ page: makeModule("_root_/products/[id]"), params: { id: "42" } }),
		);
		mockFetchNDJSON.mockResolvedValueOnce({
			matches: [
				{
					error: null,
					hasDeferredMarkers: false,
					loaderData: { name: "Widget" },
					matchId: "intercept-match",
					preloaderContext: undefined,
				},
			],
			perRouteHeads: [],
		});

		window.history.replaceState({}, "", "/products");
		await navigate({ to: "/products/42" });
		expect(ctx.intercepted()).not.toBeNull();

		/* Step 2: navigate to a completely different route */
		const aboutRoute = makeRoute("_root_/about", "r");
		mockMatchRoute.mockReturnValueOnce({ params: {}, route: aboutRoute });
		mockLoadRouteModules.mockResolvedValueOnce({
			layouts: [],
			page: makeModule("_root_/about"),
			params: {},
		});
		mockFetchNDJSON.mockResolvedValueOnce({
			matches: [
				{
					error: null,
					hasDeferredMarkers: false,
					loaderData: { title: "About" },
					matchId: "about-match",
					preloaderContext: undefined,
				},
			],
			perRouteHeads: [],
		});

		await navigate({ to: "/about" });

		/* Intercepted overlay must be cleared after navigating away */
		expect(ctx.intercepted()).toBeNull();
	});

	it("does NOT intercept when route has no intercept config", async () => {
		const ctx = makeCtx();
		setupNavigation(ctx, mockLoadRouteModules);

		/* Route without intercept */
		const route = makeRoute("_root_/products/[id]", "r");

		mockMatchRoute.mockReturnValue({
			params: { id: "42" },
			route,
		});

		mockLoadRouteModules.mockResolvedValue(
			makeLoadedModules({
				page: makeModule("_root_/products/[id]"),
				params: { id: "42" },
			}),
		);

		mockFetchNDJSON.mockResolvedValue({
			matches: [
				{
					error: null,
					hasDeferredMarkers: false,
					loaderData: { name: "Widget" },
					matchId: "test-match-id",
					preloaderContext: undefined,
				},
			],
			perRouteHeads: [],
		});

		window.history.replaceState({}, "", "/products");
		await navigate({ to: "/products/42" });

		/* No intercept — normal navigation */
		expect(ctx.intercepted()).toBeNull();
	});
});

describe("intercept navigation — AbortError handling", () => {
	beforeEach(() => {
		resetNavigationState();
		vi.clearAllMocks();
		window.history.replaceState({}, "", "/");
	});

	afterEach(() => {
		resetNavigationState();
	});

	it("DOMException AbortError silently returns (existing behavior)", async () => {
		const ctx = makeCtx();
		setupNavigation(ctx, mockLoadRouteModules);

		mockMatchRoute.mockReturnValue({
			params: { id: "42" },
			route: makeRoute("_root_/products/[id]", "r", {
				from: ["/products"],
				render: "modal",
			}),
		});
		mockLoadRouteModules.mockRejectedValue(new DOMException("The operation was aborted", "AbortError"));

		window.history.replaceState({}, "", "/products");
		await navigate({ to: "/products/42" });

		/* AbortError in intercept → silently returns, no NDJSON fetch */
		expect(mockFetchNDJSON).not.toHaveBeenCalled();
	});

	it("plain Error named AbortError is also silently handled", async () => {
		const ctx = makeCtx();
		setupNavigation(ctx, mockLoadRouteModules);

		mockMatchRoute.mockReturnValue({
			params: { id: "42" },
			route: makeRoute("_root_/products/[id]", "r", {
				from: ["/products"],
				render: "modal",
			}),
		});
		const abortErr = new Error("aborted");
		abortErr.name = "AbortError";
		mockLoadRouteModules.mockRejectedValue(abortErr);

		window.history.replaceState({}, "", "/products");
		await navigate({ to: "/products/42" });

		/* Plain Error with name "AbortError" → also silently returns */
		expect(mockFetchNDJSON).not.toHaveBeenCalled();
	});

	it("real error falls through to normal navigation", async () => {
		const ctx = makeCtx();
		setupNavigation(ctx, mockLoadRouteModules);

		mockMatchRoute.mockReturnValue({
			params: { id: "42" },
			route: makeRoute("_root_/products/[id]", "r", {
				from: ["/products"],
				render: "modal",
			}),
		});
		/* Intercept load fails with non-AbortError, then normal path succeeds */
		mockLoadRouteModules.mockRejectedValueOnce(new Error("network error")).mockResolvedValue(makeLoadedModules());

		mockFetchNDJSON.mockResolvedValue({
			matches: [
				{
					error: null,
					hasDeferredMarkers: false,
					loaderData: { name: "Widget" },
					matchId: "test-match-id",
					preloaderContext: undefined,
				},
			],
			perRouteHeads: [],
		});

		window.history.replaceState({}, "", "/products");
		await navigate({ to: "/products/42" });

		/* Real error → falls through to normal navigation which fetches data */
		expect(mockFetchNDJSON).toHaveBeenCalledTimes(1);
	});
});
