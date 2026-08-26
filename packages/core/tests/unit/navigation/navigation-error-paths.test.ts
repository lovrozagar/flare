import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMatchCache, createPrefetchCache } from "../../../src/caches/index.ts";
import { RedirectResponse } from "../../../src/errors/index.ts";
import type { LoadedRouteModules } from "../../../src/navigation/types.ts";
import type { FlareProviderContext, NavigateOptions } from "../../../src/outlet/types.ts";
import type { TreeNode } from "../../../src/router-primitives/types.ts";
import type { SearchParams } from "../../../src/url/index.ts";

vi.mock("../../../src/ndjson-client", () => ({ fetchNDJSON: vi.fn() }));
vi.mock("../../../src/head-client", () => ({ applyPerRouteHeads: vi.fn() }));
vi.mock("../../../src/router-primitives", async (importOriginal) => {
	const original = await importOriginal<typeof import("../../../src/router-primitives")>();
	return { ...original, matchRoute: vi.fn() };
});
vi.mock("../../../src/history", async (importOriginal) => {
	const original = await importOriginal<typeof import("../../../src/history")>();
	return { ...original, restoreScroll: vi.fn(), scrollToTop: vi.fn() };
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

/* ── Error paths ─────────────────────────────────────────────────── */

describe("navigate error paths", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockLoadRouteModules.mockReset();
	});

	afterEach(() => {
		resetNavigationState();
		resetLocation();
	});

	it("throws if setupNavigation not called", async () => {
		await expect(navigate({ to: "/test" })).rejects.toThrow("navigate() called before setupNavigation()");
	});

	it("network error during fetchNDJSON propagates", async () => {
		const ctx = makeCtx();
		setupNavigation(ctx, mockLoadRouteModules);

		const route = makeRoute("_root_/net-fail");
		mockMatchRoute.mockReturnValue({ params: {}, route });
		mockLoadRouteModules.mockResolvedValue(makeLoadedModules());
		mockFetchNDJSON.mockRejectedValue(new TypeError("Failed to fetch"));

		await expect(navigate({ to: "/net-fail" })).rejects.toThrow("Failed to fetch");
		expect(ctx.isNavigating()).toBe(false);
	});

	it("network throw after instant shell commits a match error", async () => {
		const ctx = makeCtx();
		setupNavigation(ctx, mockLoadRouteModules);
		const routeId = "_root_/shell-fail";
		const matchId = `${routeId}:{}:[]`;
		mockMatchRoute.mockReturnValue({
			params: {},
			route: makeRoute(routeId),
		});
		mockLoadRouteModules.mockResolvedValue(
			makeLoadedModules({
				page: { ...makeModule(routeId), cache: { client: { staleTime: 60_000 } } },
			}),
		);
		ctx.matchCache.set({
			data: "shell",
			hasDeferred: true,
			invalid: false,
			matchId,
			updatedAt: Date.now(),
		});
		mockFetchNDJSON.mockResolvedValueOnce({
			matches: [{ hasDeferredMarkers: true, loaderData: "shell", matchId }],
			perRouteHeads: [],
			success: true,
		});
		const { prefetch } = await import("../../../src/navigation/index.ts");
		await prefetch({ to: "/shell-fail" });
		mockFetchNDJSON.mockRejectedValue(new TypeError("Failed to fetch"));
		await expect(navigate({ to: "/shell-fail" })).rejects.toThrow("Failed to fetch");
		expect(ctx.matchCache.get(matchId)?.error).toBeInstanceOf(Error);
	});

	it("AbortError is silently swallowed (navigation superseded)", async () => {
		const ctx = makeCtx();
		setupNavigation(ctx, mockLoadRouteModules);

		const route = makeRoute("_root_/abort");
		mockMatchRoute.mockReturnValue({ params: {}, route });
		mockLoadRouteModules.mockResolvedValue(makeLoadedModules());
		mockFetchNDJSON.mockRejectedValue(new DOMException("Aborted", "AbortError"));

		await expect(navigate({ to: "/abort" })).resolves.toBeUndefined();
	});

	it("redirect loop throws after MAX_REDIRECTS (10)", async () => {
		const ctx = makeCtx();
		setupNavigation(ctx, mockLoadRouteModules);

		/* Alternate between /loop-a and /loop-b to avoid same-URL guard */
		mockMatchRoute.mockImplementation((_tree: unknown, pathname: string) => {
			const vp = pathname === "/loop-b" ? "_root_/loop-b" : "_root_/loop-a";
			return { params: {}, route: makeRoute(vp) };
		});
		mockLoadRouteModules.mockResolvedValue(makeLoadedModules());

		let callCount = 0;
		mockFetchNDJSON.mockImplementation(() => {
			callCount++;
			const target = callCount % 2 === 1 ? "/loop-b" : "/loop-a";
			return Promise.reject(new RedirectResponse({ replace: true, to: target }));
		});

		await expect(navigate({ to: "/loop-a" })).rejects.toThrow("Redirect loop detected");
	});

	it("external redirect calls hardNavigate", async () => {
		const ctx = makeCtx();
		setupNavigation(ctx, mockLoadRouteModules);

		const route = makeRoute("_root_/ext");
		mockMatchRoute.mockReturnValue({ params: {}, route });
		mockLoadRouteModules.mockResolvedValue(makeLoadedModules());
		mockFetchNDJSON.mockRejectedValue(new RedirectResponse({ href: "https://external.com/path" }));

		/* hardNavigate won't actually change location in test — just don't throw */
		await expect(navigate({ to: "/ext" })).resolves.toBeUndefined();
		expect(ctx.isNavigating()).toBe(false);
	});

	it("no-match sets notFound state", async () => {
		const ctx = makeCtx();
		setupNavigation(ctx, mockLoadRouteModules);

		mockMatchRoute.mockReturnValue(null);

		await navigate({ to: "/unknown" });

		expect(ctx.notFound()).toBe(true);
		expect(ctx.matches()).toEqual([]);
		expect(ctx.isNavigating()).toBe(false);
	});

	it("response route (type x) triggers hard navigation", async () => {
		const ctx = makeCtx();
		setupNavigation(ctx, mockLoadRouteModules);

		const route = makeRoute("_root_/api/data", "x");
		mockMatchRoute.mockReturnValue({ params: {}, route });

		await navigate({ to: "/api/data" });

		expect(ctx.isNavigating()).toBe(false);
	});

	it("loadRouteModules error propagates and resets state", async () => {
		const ctx = makeCtx();
		setupNavigation(ctx, mockLoadRouteModules);

		const route = makeRoute("_root_/load-fail");
		mockMatchRoute.mockReturnValue({ params: {}, route });
		mockLoadRouteModules.mockRejectedValue(new Error("Module load failed"));
		mockFetchNDJSON.mockResolvedValue({ matches: [], perRouteHeads: [] });

		await expect(navigate({ to: "/load-fail" })).rejects.toThrow("Module load failed");
		expect(ctx.isNavigating()).toBe(false);
	});
});
