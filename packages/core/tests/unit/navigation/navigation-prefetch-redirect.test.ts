import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMatchCache, createPrefetchCache } from "../../../src/caches/index.ts";
import { RedirectResponse } from "../../../src/errors/index.ts";
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

import { prefetch, resetNavigationState, setupNavigation } from "../../../src/navigation/index.ts";
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

describe("prefetch does not follow redirects", () => {
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

	it("prefetch silently discards internal redirect — no navigation triggered", async () => {
		const ctx = makeCtx();
		setupNavigation(ctx, mockLoadRouteModules);

		mockMatchRoute.mockReturnValue({
			params: {},
			route: makeRoute("_root_/protected"),
		});

		/* fetchNDJSON rejects with internal redirect (e.g. auth redirect to /login) */
		mockFetchNDJSON.mockRejectedValue(new RedirectResponse({ to: "/login" }));
		mockLoadRouteModules.mockResolvedValue(makeLoadedModules({ page: makeModule("_root_/protected") }));

		await prefetch({ to: "/protected" });

		/* Allow any fire-and-forget navigate to settle */
		await new Promise((r) => setTimeout(r, 50));

		/* fetchNDJSON should only be called once (the prefetch itself).
		 * A second call would mean navigate() was triggered by the redirect. */
		expect(mockFetchNDJSON).toHaveBeenCalledTimes(1);

		/* Navigation state should remain idle */
		expect(ctx.isNavigating()).toBe(false);

		/* Matches should be empty — user hasn't navigated anywhere */
		expect(ctx.matches()).toEqual([]);

		/* Window location should not have changed */
		expect(window.location.pathname).toBe("/");
	});

	it("prefetch silently discards external redirect — no hard navigation", async () => {
		/* Spy on hardNavigate BEFORE prefetch triggers it */
		const navModule = await import("../../../src/navigation");
		const hardNavSpy = vi.spyOn(navModule, "hardNavigate").mockImplementation(() => {});

		const ctx = makeCtx();
		setupNavigation(ctx, mockLoadRouteModules);

		mockMatchRoute.mockReturnValue({
			params: {},
			route: makeRoute("_root_/oauth"),
		});

		/* fetchNDJSON rejects with external redirect */
		mockFetchNDJSON.mockRejectedValue(new RedirectResponse({ href: "https://oauth.example.com/authorize" }));
		mockLoadRouteModules.mockResolvedValue(makeLoadedModules({ page: makeModule("_root_/oauth") }));

		await prefetch({ to: "/oauth" });

		/* Allow any fire-and-forget calls to settle */
		await new Promise((r) => setTimeout(r, 50));

		/* hardNavigate should NOT be called — user just hovered a link */
		expect(hardNavSpy).not.toHaveBeenCalled();

		/* Window location should not have changed */
		expect(window.location.pathname).toBe("/");

		hardNavSpy.mockRestore();
	});

	it("prefetch cleans up prefetchCache on redirect", async () => {
		const ctx = makeCtx();
		setupNavigation(ctx, mockLoadRouteModules);

		mockMatchRoute.mockReturnValue({
			params: {},
			route: makeRoute("_root_/admin"),
		});

		mockFetchNDJSON.mockRejectedValue(new RedirectResponse({ to: "/login" }));
		mockLoadRouteModules.mockResolvedValue(makeLoadedModules({ page: makeModule("_root_/admin") }));

		await prefetch({ to: "/admin" });

		/* prefetchCache should be cleared for the failed URL so retry works */
		expect(ctx.prefetchCache.has("http://localhost/admin")).toBe(false);
	});
});
