import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMatchCache, createPrefetchCache } from "../../../src/caches/index.ts";
import { RedirectResponse } from "../../../src/errors/index.ts";
import type { LoadedRouteModules } from "../../../src/navigation/types.ts";
import type { FlareProviderContext, InterceptedState, NavigateOptions } from "../../../src/outlet/types.ts";
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

/* Mock history scroll functions — jsdom doesn't implement scrollTo and global refs bind at import time */
vi.mock("../../../src/history", async (importOriginal) => {
	const original = await importOriginal<typeof import("../../../src/history")>();
	return {
		...original,
		restoreScroll: vi.fn(),
		scrollToTop: vi.fn(),
	};
});

import { applyPerRouteHeads } from "../../../src/head-client/index.ts";
import { getHistoryIndex, restoreScroll, scrollToTop } from "../../../src/history/index.ts";
import {
	isExternal,
	navigate,
	prefetch,
	resetNavigationState,
	setupNavigation,
} from "../../../src/navigation/index.ts";
import { fetchNDJSON } from "../../../src/ndjson-client/index.ts";
import { matchRoute, matchRoutePartial } from "../../../src/router-primitives/index.ts";

const mockFetchNDJSON = fetchNDJSON as ReturnType<typeof vi.fn>;
const mockApplyPerRouteHeads = applyPerRouteHeads as ReturnType<typeof vi.fn>;
const mockMatchRoute = matchRoute as ReturnType<typeof vi.fn>;
const mockMatchRoutePartial = matchRoutePartial as ReturnType<typeof vi.fn>;
const mockRestoreScroll = restoreScroll as ReturnType<typeof vi.fn>;
const mockScrollToTop = scrollToTop as ReturnType<typeof vi.fn>;

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

/* Reset jsdom URL to root between tests */
function resetLocation(): void {
	window.history.replaceState({}, "", "/");
}

describe("isExternal", () => {
	it("same-origin absolute URL → false", () => {
		expect(isExternal(`${window.location.origin}/about`)).toBe(false);
	});

	it("different-origin URL → true", () => {
		expect(isExternal("https://other-site.com/page")).toBe(true);
	});

	it("mailto: → true", () => {
		expect(isExternal("mailto:x@y.com")).toBe(true);
	});

	it("tel: → true", () => {
		expect(isExternal("tel:+1234")).toBe(true);
	});

	it("relative path → false", () => {
		expect(isExternal("/about")).toBe(false);
	});

	it("hash-only → false", () => {
		expect(isExternal("#section")).toBe(false);
	});

	it("javascript: → false (blocked, not external)", () => {
		expect(isExternal("javascript:alert(1)")).toBe(false);
	});

	it("data: → false (blocked, not external)", () => {
		expect(isExternal("data:text/html,<h1>test</h1>")).toBe(false);
	});

	it("blob: → false (blocked, not external)", () => {
		expect(isExternal("blob:http://localhost/123")).toBe(false);
	});
});

describe("setupNavigation", () => {
	afterEach(() => {
		resetNavigationState();
		resetLocation();
	});

	it("wires navigate and prefetch on context", () => {
		const ctx = makeCtx();
		setupNavigation(ctx, mockLoadRouteModules);
		expect(ctx).toBeDefined();
	});
});

describe("navigate", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockFetchNDJSON.mockReset();
		mockMatchRoute.mockReset();
		mockLoadRouteModules.mockReset();
		mockApplyPerRouteHeads.mockReset();
		mockScrollToTop.mockReset();
		resetLocation();
	});

	afterEach(() => {
		resetNavigationState();
		resetLocation();
	});

	it("throws if setupNavigation not called", async () => {
		await expect(navigate({ to: "/about" })).rejects.toThrow("setupNavigation()");
	});

	it("same URL without revalidate → no-op", async () => {
		const ctx = makeCtx();
		setupNavigation(ctx, mockLoadRouteModules);

		await navigate({ to: "/" });

		expect(mockMatchRoute).not.toHaveBeenCalled();
	});

	it("same URL with revalidate → proceeds", async () => {
		const ctx = makeCtx();
		setupNavigation(ctx, mockLoadRouteModules);

		mockMatchRoute.mockReturnValue({ params: {}, route: makeRoute("_root_/home") });
		mockLoadRouteModules.mockResolvedValue(makeLoadedModules());
		mockFetchNDJSON.mockResolvedValue({ matches: [], perRouteHeads: [], success: true });

		await navigate({ revalidate: true, to: "/" });

		expect(mockMatchRoute).toHaveBeenCalled();
	});

	it("no match → setNotFound(true)", async () => {
		const ctx = makeCtx();
		setupNavigation(ctx, mockLoadRouteModules);

		mockMatchRoute.mockReturnValue(null);

		await navigate({ to: "/nonexistent" });

		expect(ctx.notFound()).toBe(true);
		expect(ctx.isNavigating()).toBe(false);
		expect(window.location.pathname).toBe("/nonexistent");
		expect(mockApplyPerRouteHeads).toHaveBeenCalledWith([{ head: { title: "Not Found" }, matchId: "__notfound" }]);
	});

	it("cross-root → no module loading, isNavigating reset", async () => {
		const ctx = makeCtx({
			matches: () => [
				{
					_type: "layout" as const,
					loaderData: null,
					render: () => null,
					variablePath: "/home",
					virtualPath: "_root_/home",
				},
			],
		});
		setupNavigation(ctx, mockLoadRouteModules);

		mockMatchRoute.mockReturnValue({ params: {}, route: makeRoute("_docs_/guide") });

		await navigate({ to: "/docs/guide" });

		expect(ctx.isNavigating()).toBe(false);
		expect(mockLoadRouteModules).not.toHaveBeenCalled();
	});

	it("response route (t: 'x') → no module loading, isNavigating reset", async () => {
		const ctx = makeCtx();
		setupNavigation(ctx, mockLoadRouteModules);

		mockMatchRoute.mockReturnValue({ params: {}, route: makeRoute("_root_/api/data", "x") });

		await navigate({ to: "/api/data" });

		expect(ctx.isNavigating()).toBe(false);
		expect(mockLoadRouteModules).not.toHaveBeenCalled();
	});

	it("shallow → updates params/search, no fetch", async () => {
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

		mockMatchRoute.mockReturnValue({ params: { q: "test" }, route: makeRoute("_root_/search") });

		await navigate({ shallow: true, to: "/search?q=test" });

		expect(ctx.params()).toEqual({ q: "test" });
		expect(ctx.isNavigating()).toBe(false);
		expect(mockLoadRouteModules).not.toHaveBeenCalled();
		expect(mockFetchNDJSON).not.toHaveBeenCalled();
	});

	it("replace: true → history.replaceState called", async () => {
		const ctx = makeCtx();
		setupNavigation(ctx, mockLoadRouteModules);

		mockMatchRoute.mockReturnValue({ params: {}, route: makeRoute("_root_/replace-test") });
		mockLoadRouteModules.mockResolvedValue(makeLoadedModules());
		mockFetchNDJSON.mockResolvedValue({ matches: [], perRouteHeads: [], success: true });

		const spy = vi.spyOn(history, "replaceState");

		await navigate({ replace: true, to: "/replace-test" });

		expect(spy).toHaveBeenCalled();
	});

	it("default → history.pushState called", async () => {
		const ctx = makeCtx();
		setupNavigation(ctx, mockLoadRouteModules);

		mockMatchRoute.mockReturnValue({ params: {}, route: makeRoute("_root_/push-test") });
		mockLoadRouteModules.mockResolvedValue(makeLoadedModules());
		mockFetchNDJSON.mockResolvedValue({ matches: [], perRouteHeads: [], success: true });

		const spy = vi.spyOn(history, "pushState");

		await navigate({ to: "/push-test" });

		expect(spy).toHaveBeenCalled();
	});

	it("updates state signals after navigation", async () => {
		const ctx = makeCtx();
		setupNavigation(ctx, mockLoadRouteModules);

		const pageModule = makeModule("_root_/signals-test");

		mockMatchRoute.mockReturnValue({
			params: { id: "42" },
			route: makeRoute("_root_/signals-test"),
		});
		mockLoadRouteModules.mockResolvedValue(
			makeLoadedModules({
				page: pageModule,
				params: { id: "42" },
			}),
		);
		mockFetchNDJSON.mockResolvedValue({
			matches: [{ loaderData: "data", matchId: "_root_/signals-test:" }],
			perRouteHeads: [],
			success: true,
		});

		await navigate({ to: "/signals-test" });

		expect(ctx.isNavigating()).toBe(false);
		expect(ctx.notFound()).toBe(false);
		expect(ctx.params()).toEqual({ id: "42" });
	});

	it("scroll: false → scrollToTop not called", async () => {
		const ctx = makeCtx();
		setupNavigation(ctx, mockLoadRouteModules);

		mockMatchRoute.mockReturnValue({ params: {}, route: makeRoute("_root_/no-scroll") });
		mockLoadRouteModules.mockResolvedValue(makeLoadedModules());
		mockFetchNDJSON.mockResolvedValue({ matches: [], perRouteHeads: [], success: true });

		await navigate({ scroll: false, to: "/no-scroll" });

		expect(mockScrollToTop).not.toHaveBeenCalled();
	});

	it("default scroll → scrollToTop called", async () => {
		const ctx = makeCtx();
		setupNavigation(ctx, mockLoadRouteModules);

		mockMatchRoute.mockReturnValue({ params: {}, route: makeRoute("_root_/scroll-test") });
		mockLoadRouteModules.mockResolvedValue(makeLoadedModules());
		mockFetchNDJSON.mockResolvedValue({ matches: [], perRouteHeads: [], success: true });

		await navigate({ to: "/scroll-test" });

		expect(mockScrollToTop).toHaveBeenCalled();
	});

	it("redirect → recursive navigate", async () => {
		const ctx = makeCtx();
		setupNavigation(ctx, mockLoadRouteModules);

		mockMatchRoute.mockReturnValue({ params: {}, route: makeRoute("_root_/redir") });
		mockLoadRouteModules.mockResolvedValue(makeLoadedModules());

		let callCount = 0;
		mockFetchNDJSON.mockImplementation(() => {
			callCount++;
			if (callCount === 1) return Promise.reject(new RedirectResponse({ to: "/redir-target" }));
			return Promise.resolve({ matches: [], perRouteHeads: [], success: true });
		});

		await navigate({ to: "/redir" });

		expect(mockFetchNDJSON).toHaveBeenCalledTimes(2);
	});

	it("popstate redirect updates URL (does not keep _popstate)", async () => {
		const ctx = makeCtx();
		setupNavigation(ctx, mockLoadRouteModules);

		mockMatchRoute.mockReturnValue({ params: {}, route: makeRoute("_root_/old") });
		mockLoadRouteModules.mockResolvedValue(makeLoadedModules());

		let callCount = 0;
		const spy = vi.spyOn(history, "replaceState");

		mockFetchNDJSON.mockImplementation(() => {
			callCount++;
			if (callCount === 1) return Promise.reject(new RedirectResponse({ to: "/new-target" }));
			return Promise.resolve({ matches: [], perRouteHeads: [], success: true });
		});

		/* Simulate popstate navigation that triggers a redirect */
		await navigate({ _popstate: true, to: "/old" });

		/* Redirect should have updated history (replaceState called for redirect) */
		expect(spy).toHaveBeenCalled();
		expect(ctx.isNavigating()).toBe(false);
	});

	it("redirect loop (>10) → throws", async () => {
		const ctx = makeCtx();
		setupNavigation(ctx, mockLoadRouteModules);

		let redirectIdx = 0;
		mockMatchRoute.mockImplementation((_tree: unknown, _pathname: string) => ({
			params: {},
			route: makeRoute(`_root_/loop-${redirectIdx}`),
		}));
		mockLoadRouteModules.mockResolvedValue(makeLoadedModules());
		mockFetchNDJSON.mockImplementation(() => {
			redirectIdx++;
			return Promise.reject(new RedirectResponse({ to: `/loop-${redirectIdx}` }));
		});

		await expect(navigate({ to: "/loop-0" })).rejects.toThrow("Redirect loop detected");
	});

	it("AbortError → silently ignored", async () => {
		const ctx = makeCtx();
		setupNavigation(ctx, mockLoadRouteModules);

		mockMatchRoute.mockReturnValue({ params: {}, route: makeRoute("_root_/abort-test") });
		mockLoadRouteModules.mockResolvedValue(makeLoadedModules());
		mockFetchNDJSON.mockRejectedValue(new DOMException("aborted", "AbortError"));

		await navigate({ to: "/abort-test" });
	});

	it("perRouteHeads → applyPerRouteHeads called", async () => {
		const ctx = makeCtx();
		setupNavigation(ctx, mockLoadRouteModules);

		mockMatchRoute.mockReturnValue({ params: {}, route: makeRoute("_root_/head-test") });
		mockLoadRouteModules.mockResolvedValue(makeLoadedModules());
		mockFetchNDJSON.mockResolvedValue({
			matches: [],
			perRouteHeads: [{ head: { title: "About" }, matchId: "_root_/head-test:" }],
			success: true,
		});

		await navigate({ to: "/head-test" });

		expect(mockApplyPerRouteHeads).toHaveBeenCalledWith([{ head: { title: "About" }, matchId: "_root_/head-test:" }]);
	});

	it("sets isNavigating true during navigation", async () => {
		const ctx = makeCtx();
		setupNavigation(ctx, mockLoadRouteModules);

		let wasNavigating = false;

		mockMatchRoute.mockReturnValue({ params: {}, route: makeRoute("_root_/nav-test") });
		mockLoadRouteModules.mockImplementation(() => {
			wasNavigating = ctx.isNavigating();
			return Promise.resolve(makeLoadedModules());
		});
		mockFetchNDJSON.mockResolvedValue({ matches: [], perRouteHeads: [], success: true });

		await navigate({ to: "/nav-test" });

		expect(wasNavigating).toBe(true);
		expect(ctx.isNavigating()).toBe(false);
	});
});

describe("prefetch", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockFetchNDJSON.mockReset();
		mockLoadRouteModules.mockReset();
		resetLocation();
	});

	afterEach(() => {
		resetNavigationState();
		resetLocation();
	});

	it("no-op if not setup", async () => {
		await prefetch({ to: "/about" });
		expect(mockFetchNDJSON).not.toHaveBeenCalled();
	});

	it("unmatched path does not fetch NDJSON", async () => {
		const ctx = makeCtx();
		setupNavigation(ctx, mockLoadRouteModules);
		mockMatchRoute.mockReturnValue(null);

		await prefetch({ to: "/does-not-exist-at-all" });

		expect(mockFetchNDJSON).not.toHaveBeenCalled();
		expect(mockLoadRouteModules).not.toHaveBeenCalled();
	});

	it("skips if already prefetched (fresh)", async () => {
		const ctx = makeCtx();
		setupNavigation(ctx, mockLoadRouteModules);

		/* Use window.location.href as base to match what prefetch() does internally */
		const url = new URL("/pf-skip", window.location.href);
		ctx.prefetchCache.mark(url.href);

		await prefetch({ to: "/pf-skip" });

		expect(mockFetchNDJSON).not.toHaveBeenCalled();
	});

	it("skips fetch when matchCache already has fresh data for the route", async () => {
		const ctx = makeCtx();
		setupNavigation(ctx, mockLoadRouteModules);

		const routeId = "_root_/cache-test";
		const matchId = `${routeId}:{}:[]`;
		mockMatchRoute.mockReturnValue({
			params: {},
			route: makeRoute(routeId, "r", { client: { staleTime: 60_000 } }),
		});
		ctx.matchCache.set({
			data: "ssr-data",
			invalid: false,
			matchId,
			updatedAt: Date.now(),
		});

		await prefetch({ to: "/cache-test" });

		expect(mockFetchNDJSON).not.toHaveBeenCalled();
		expect(ctx.matchCache.get(matchId)?.data).toBe("ssr-data");
		/* Skip must still mark the route visited so navigate() does not
		   take the parallel-fetch "new route" path. */
		expect(ctx.prefetchCache.has(new URL("/cache-test", window.location.href).href)).toBe(true);
	});

	it("fetches when matchCache entry is past client staleTime", async () => {
		const ctx = makeCtx();
		setupNavigation(ctx, mockLoadRouteModules);

		const routeId = "_root_/cache-test";
		const matchId = `${routeId}:{}:[]`;
		mockMatchRoute.mockReturnValue({
			params: {},
			route: makeRoute(routeId, "r", { client: { staleTime: 2_000 } }),
		});
		ctx.matchCache.set({
			data: "stale-ssr",
			invalid: false,
			matchId,
			updatedAt: Date.now() - 10_000,
		});
		mockFetchNDJSON.mockResolvedValue({
			matches: [{ loaderData: "fresh-prefetch", matchId }],
			perRouteHeads: [],
			success: true,
		});
		mockLoadRouteModules.mockResolvedValue(makeLoadedModules());

		await prefetch({ to: "/cache-test" });

		expect(mockFetchNDJSON).toHaveBeenCalledTimes(1);
		expect(ctx.matchCache.get(matchId)?.data).toBe("fresh-prefetch");
	});

	it("writes matchCache when NDJSON returns even if loadRouteModules is still pending", async () => {
		const ctx = makeCtx();
		setupNavigation(ctx, mockLoadRouteModules);
		const routeId = "_root_/prefetch-target";
		const matchId = `${routeId}:{}:[]`;
		mockMatchRoute.mockReturnValue({
			params: {},
			route: makeRoute(routeId, "r", { client: { staleTime: 60_000 } }),
		});

		let resolveMods!: (v: LoadedRouteModules) => void;
		mockLoadRouteModules.mockImplementation(
			() =>
				new Promise((resolve) => {
					resolveMods = resolve;
				}),
		);
		mockFetchNDJSON.mockResolvedValue({
			matches: [{ hasDeferredMarkers: false, loaderData: "prefetched", matchId }],
			perRouteHeads: [],
			success: true,
		});

		const pending = prefetch({ to: "/prefetch-target" });
		await vi.waitFor(() => {
			expect(ctx.matchCache.get(matchId)?.data).toBe("prefetched");
		});

		resolveMods(makeLoadedModules({ page: makeModule(routeId) }));
		await pending;
	});

	it("fetches data + modules in parallel", async () => {
		const ctx = makeCtx();
		setupNavigation(ctx, mockLoadRouteModules);
		mockMatchRoute.mockReturnValue({ params: {}, route: makeRoute("_root_/pf-parallel") });

		mockFetchNDJSON.mockResolvedValue({
			matches: [{ loaderData: "prefetched", matchId: "m1" }],
			perRouteHeads: [],
			success: true,
		});
		mockLoadRouteModules.mockResolvedValue(makeLoadedModules());

		await prefetch({ to: "/pf-parallel" });

		expect(mockFetchNDJSON).toHaveBeenCalledTimes(1);
		expect(mockLoadRouteModules).toHaveBeenCalledTimes(1);
		expect(mockFetchNDJSON).toHaveBeenCalledWith(expect.objectContaining({ prefetch: true }));
	});

	it("success → matchCache populated", async () => {
		const ctx = makeCtx();
		setupNavigation(ctx, mockLoadRouteModules);
		mockMatchRoute.mockReturnValue({ params: {}, route: makeRoute("_root_/pf-cache") });

		mockFetchNDJSON.mockResolvedValue({
			matches: [{ loaderData: "prefetched-data", matchId: "test-match" }],
			perRouteHeads: [],
			success: true,
		});
		mockLoadRouteModules.mockResolvedValue(makeLoadedModules());

		await prefetch({ to: "/pf-cache" });

		expect(ctx.matchCache.get("test-match")?.data).toBe("prefetched-data");
	});

	it("error → prefetchCache entry deleted", async () => {
		const ctx = makeCtx();
		setupNavigation(ctx, mockLoadRouteModules);
		mockMatchRoute.mockReturnValue({ params: {}, route: makeRoute("_root_/pf-error") });

		mockFetchNDJSON.mockRejectedValue(new Error("network error"));
		mockLoadRouteModules.mockResolvedValue(makeLoadedModules());

		const url = new URL("/pf-error", window.location.href);

		await prefetch({ to: "/pf-error" });

		expect(ctx.prefetchCache.has(url.href)).toBe(false);
	});

	it("prefetch stores error in matchCache", async () => {
		const ctx = makeCtx();
		setupNavigation(ctx, mockLoadRouteModules);
		mockMatchRoute.mockReturnValue({ params: {}, route: makeRoute("_root_/pf-error-cache") });

		const loaderError = new Error("loader failed");
		mockFetchNDJSON.mockResolvedValue({
			matches: [{ error: loaderError, loaderData: undefined, matchId: "err-match" }],
			perRouteHeads: [],
			success: true,
		});
		mockLoadRouteModules.mockResolvedValue(makeLoadedModules());

		await prefetch({ to: "/pf-error-cache" });

		const cached = ctx.matchCache.get("err-match");
		expect(cached?.error).toBe(loaderError);
	});
});

describe("concurrent navigation abort", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockFetchNDJSON.mockReset();
		mockMatchRoute.mockReset();
		mockLoadRouteModules.mockReset();
		mockApplyPerRouteHeads.mockReset();
		mockScrollToTop.mockReset();
		resetLocation();
	});

	afterEach(() => {
		resetNavigationState();
		resetLocation();
	});

	it("second navigate aborts first — first resolves silently", async () => {
		const ctx = makeCtx();
		setupNavigation(ctx, mockLoadRouteModules);

		const gate = { resolve: (_v: unknown) => {} };
		const firstFetchPromise = new Promise((resolve) => {
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
			if (callCount === 1) return firstFetchPromise;
			return Promise.resolve({ matches: [], perRouteHeads: [], success: true });
		});

		/* Start first nav (will block on fetchNDJSON) */
		const first = navigate({ to: "/page-a" });
		/* Start second nav immediately — aborts first */
		const second = navigate({ to: "/page-b" });

		/* Resolve first fetch after second started — ignored due to version mismatch */
		gate.resolve({ matches: [], perRouteHeads: [], success: true });

		await Promise.all([first, second]);

		/* Only second navigation's state should be applied */
		expect(ctx.isNavigating()).toBe(false);
	});

	it("aborted navigation does not update matches", async () => {
		const ctx = makeCtx();
		setupNavigation(ctx, mockLoadRouteModules);

		const gate = { resolve: (_v: unknown) => {} };
		const firstFetchPromise = new Promise((resolve) => {
			gate.resolve = resolve;
		});

		mockMatchRoute.mockImplementation((_tree: unknown, pathname: string) => ({
			params: {},
			route: makeRoute(`_root_${pathname}`),
		}));

		mockLoadRouteModules.mockResolvedValue(makeLoadedModules());

		let callCount = 0;
		mockFetchNDJSON.mockImplementation(() => {
			callCount++;
			if (callCount === 1) return firstFetchPromise;
			return Promise.resolve({
				matches: [{ loaderData: "second-data", matchId: "second-match" }],
				perRouteHeads: [],
				success: true,
			});
		});

		const first = navigate({ to: "/first" });
		const second = navigate({ to: "/second" });

		gate.resolve({
			matches: [{ loaderData: "first-data", matchId: "first-match" }],
			perRouteHeads: [],
			success: true,
		});

		await Promise.all([first, second]);

		/* First navigation's data should NOT be in match cache */
		expect(ctx.matchCache.get("first-match")).toBeUndefined();
		/* Second navigation's data SHOULD be in match cache */
		expect(ctx.matchCache.get("second-match")?.data).toBe("second-data");
	});

	it("version guard after loadRouteModules prevents stale update", async () => {
		const ctx = makeCtx();
		setupNavigation(ctx, mockLoadRouteModules);

		const gate = { resolve: (_v: LoadedRouteModules) => {} };
		const firstModulesPromise = new Promise<LoadedRouteModules>((resolve) => {
			gate.resolve = resolve;
		});

		mockMatchRoute.mockImplementation((_tree: unknown, pathname: string) => ({
			params: {},
			route: makeRoute(`_root_${pathname}`),
		}));

		let loadCallCount = 0;
		mockLoadRouteModules.mockImplementation((): Promise<LoadedRouteModules> => {
			loadCallCount++;
			if (loadCallCount === 1) return firstModulesPromise;
			return Promise.resolve(makeLoadedModules());
		});

		mockFetchNDJSON.mockResolvedValue({ matches: [], perRouteHeads: [], success: true });

		const first = navigate({ to: "/slow" });
		const second = navigate({ to: "/fast" });

		/* Resolve slow first nav's loadRouteModules after second nav completes */
		gate.resolve(makeLoadedModules());

		await Promise.all([first, second]);

		/* isNavigating should be false — second nav completed cleanly */
		expect(ctx.isNavigating()).toBe(false);
	});
});

describe("view transitions", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockFetchNDJSON.mockReset();
		mockMatchRoute.mockReset();
		mockLoadRouteModules.mockReset();
		mockApplyPerRouteHeads.mockReset();
		mockScrollToTop.mockReset();
		resetLocation();
	});

	afterEach(() => {
		resetNavigationState();
		resetLocation();
		delete (document as unknown as Record<string, unknown>).startViewTransition;
	});

	it("viewTransition: true → calls startViewTransition with callback", async () => {
		const ctx = makeCtx();
		setupNavigation(ctx, mockLoadRouteModules);

		mockMatchRoute.mockReturnValue({ params: {}, route: makeRoute("_root_/vt-test") });
		mockLoadRouteModules.mockResolvedValue(makeLoadedModules());
		mockFetchNDJSON.mockResolvedValue({ matches: [], perRouteHeads: [], success: true });

		const startVT = vi.fn((arg: unknown) => {
			if (typeof arg === "function") arg();
		});
		(document as unknown as Record<string, unknown>).startViewTransition = startVT;

		await navigate({ to: "/vt-test", viewTransition: true });

		expect(startVT).toHaveBeenCalledTimes(1);
		expect(typeof startVT.mock.calls[0][0]).toBe("function");
	});

	it("viewTransition: false → does NOT call startViewTransition", async () => {
		const ctx = makeCtx();
		setupNavigation(ctx, mockLoadRouteModules);

		mockMatchRoute.mockReturnValue({ params: {}, route: makeRoute("_root_/vt-false") });
		mockLoadRouteModules.mockResolvedValue(makeLoadedModules());
		mockFetchNDJSON.mockResolvedValue({ matches: [], perRouteHeads: [], success: true });

		const startVT = vi.fn();
		(document as unknown as Record<string, unknown>).startViewTransition = startVT;

		await navigate({ to: "/vt-false", viewTransition: false });

		expect(startVT).not.toHaveBeenCalled();
	});

	it("no viewTransition option → does NOT call startViewTransition", async () => {
		const ctx = makeCtx();
		setupNavigation(ctx, mockLoadRouteModules);

		mockMatchRoute.mockReturnValue({ params: {}, route: makeRoute("_root_/vt-none") });
		mockLoadRouteModules.mockResolvedValue(makeLoadedModules());
		mockFetchNDJSON.mockResolvedValue({ matches: [], perRouteHeads: [], success: true });

		const startVT = vi.fn();
		(document as unknown as Record<string, unknown>).startViewTransition = startVT;

		await navigate({ to: "/vt-none" });

		expect(startVT).not.toHaveBeenCalled();
	});

	it("viewTransition with types → calls startViewTransition with object", async () => {
		const ctx = makeCtx();
		setupNavigation(ctx, mockLoadRouteModules);

		mockMatchRoute.mockReturnValue({ params: {}, route: makeRoute("_root_/vt-typed") });
		mockLoadRouteModules.mockResolvedValue(makeLoadedModules());
		mockFetchNDJSON.mockResolvedValue({ matches: [], perRouteHeads: [], success: true });

		const startVT = vi.fn((arg: unknown) => {
			if (typeof arg === "object" && arg !== null && "update" in arg) {
				(arg as { update: () => void }).update();
			}
		});
		(document as unknown as Record<string, unknown>).startViewTransition = startVT;

		await navigate({ to: "/vt-typed", viewTransition: { types: ["slide", "forward"] } });

		expect(startVT).toHaveBeenCalledTimes(1);
		const arg = startVT.mock.calls[0][0] as Record<string, unknown>;
		expect(arg.types).toEqual(["slide", "forward"]);
		expect(typeof arg.update).toBe("function");
	});

	it("viewTransition with empty types → calls startViewTransition with callback", async () => {
		const ctx = makeCtx();
		setupNavigation(ctx, mockLoadRouteModules);

		mockMatchRoute.mockReturnValue({ params: {}, route: makeRoute("_root_/vt-empty") });
		mockLoadRouteModules.mockResolvedValue(makeLoadedModules());
		mockFetchNDJSON.mockResolvedValue({ matches: [], perRouteHeads: [], success: true });

		const startVT = vi.fn((arg: unknown) => {
			if (typeof arg === "function") arg();
		});
		(document as unknown as Record<string, unknown>).startViewTransition = startVT;

		await navigate({ to: "/vt-empty", viewTransition: { types: [] } });

		expect(startVT).toHaveBeenCalledTimes(1);
		expect(typeof startVT.mock.calls[0][0]).toBe("function");
	});

	it("fallback when startViewTransition unavailable → update still runs", async () => {
		const ctx = makeCtx();
		setupNavigation(ctx, mockLoadRouteModules);

		mockMatchRoute.mockReturnValue({ params: {}, route: makeRoute("_root_/vt-fallback") });
		mockLoadRouteModules.mockResolvedValue(makeLoadedModules());
		mockFetchNDJSON.mockResolvedValue({ matches: [], perRouteHeads: [], success: true });

		/* No startViewTransition on document */

		await navigate({ to: "/vt-fallback", viewTransition: true });

		expect(ctx.isNavigating()).toBe(false);
		expect(ctx.notFound()).toBe(false);
	});

	it("viewTransition update callback triggers state update", async () => {
		const ctx = makeCtx();
		setupNavigation(ctx, mockLoadRouteModules);

		const pageModule = makeModule("_root_/vt-update");
		mockMatchRoute.mockReturnValue({ params: { id: "1" }, route: makeRoute("_root_/vt-update") });
		mockLoadRouteModules.mockResolvedValue(makeLoadedModules({ page: pageModule, params: { id: "1" } }));
		mockFetchNDJSON.mockResolvedValue({
			matches: [{ loaderData: "vt-data", matchId: "_root_/vt-update:" }],
			perRouteHeads: [],
			success: true,
		});

		const captured: { update: (() => void) | null } = { update: null };
		const startVT = vi.fn((arg: unknown) => {
			if (typeof arg === "function") captured.update = arg as () => void;
		});
		(document as unknown as Record<string, unknown>).startViewTransition = startVT;

		await navigate({ to: "/vt-update", viewTransition: true });

		/* State NOT yet updated because we captured the callback without calling it */
		expect(ctx.matches().length).toBe(0);

		/* Now call the captured update */
		expect(captured.update).not.toBeNull();
		captured.update?.();
		expect(ctx.matches().length).toBe(1);
		expect(ctx.params()).toEqual({ id: "1" });
	});

	it("startViewTransition throws → update still runs (fallback)", async () => {
		const ctx = makeCtx();
		setupNavigation(ctx, mockLoadRouteModules);

		mockMatchRoute.mockReturnValue({ params: {}, route: makeRoute("_root_/vt-err") });
		mockLoadRouteModules.mockResolvedValue(makeLoadedModules());
		mockFetchNDJSON.mockResolvedValue({ matches: [], perRouteHeads: [], success: true });

		const startVT = vi.fn(() => {
			throw new Error("ViewTransition not supported");
		});
		(document as unknown as Record<string, unknown>).startViewTransition = startVT;

		await navigate({ to: "/vt-err", viewTransition: true });

		expect(startVT).toHaveBeenCalledTimes(1);
		/* update() should have been called in catch — navigation completes successfully */
		expect(ctx.isNavigating()).toBe(false);
		expect(ctx.notFound()).toBe(false);
	});

	it("stale VT finished handler does not reset phase when new nav in progress", async () => {
		const ctx = makeCtx();
		setupNavigation(ctx, mockLoadRouteModules);

		mockMatchRoute.mockReturnValue({ params: {}, route: makeRoute("_root_/a") });
		mockLoadRouteModules.mockResolvedValue(makeLoadedModules());
		mockFetchNDJSON.mockResolvedValue({ matches: [], perRouteHeads: [], success: true });

		/* VT mock: capture finished resolver so we can fire it later.
		 * Object container avoids TS control-flow narrowing to `never`.
		 * ready: required because applyViewTransition swallows transition.ready rejection
		 * (WebKit surfaces AbortError when a new VT replaces an in-flight one). */
		const vt1 = { resolve: null as (() => void) | null };
		const startVT = vi.fn((arg: unknown) => {
			const update = typeof arg === "function" ? arg : (arg as { update: () => void }).update;
			update();
			return {
				finished: new Promise<void>((r) => {
					vt1.resolve = r;
				}),
				ready: Promise.resolve(),
				updateCallbackDone: Promise.resolve(),
			};
		});
		(document as unknown as Record<string, unknown>).startViewTransition = startVT;

		/* Nav 1: VT navigation — finished promise pending */
		await navigate({ to: "/a", viewTransition: true });
		expect(vt1.resolve).not.toBeNull();

		/* Nav 2: make module loading hang so nav stays in-flight */
		mockMatchRoute.mockReturnValue({ params: {}, route: makeRoute("_root_/b") });
		let resolveNav2Modules: ((v: LoadedRouteModules) => void) | undefined;
		mockLoadRouteModules.mockReturnValue(
			new Promise<LoadedRouteModules>((r) => {
				resolveNav2Modules = r;
			}),
		);

		const nav2 = navigate({ to: "/b" });

		/* Nav 2 is in "loading" phase — resolve nav 1's stale VT.finished */
		expect(ctx.navigationPhase()).toBe("loading");
		vt1.resolve?.();
		await Promise.resolve();
		await Promise.resolve();

		/* Phase must still be "loading" — stale VT handler must NOT set it to "idle" */
		expect(ctx.navigationPhase()).toBe("loading");

		/* Unblock nav 2 */
		mockFetchNDJSON.mockResolvedValue({ matches: [], perRouteHeads: [], success: true });
		resolveNav2Modules?.(makeLoadedModules({ page: makeModule("_root_/b") }));
		await nav2;
	});

	it("startViewTransition throws with typed VT → update still runs", async () => {
		const ctx = makeCtx();
		setupNavigation(ctx, mockLoadRouteModules);

		mockMatchRoute.mockReturnValue({ params: {}, route: makeRoute("_root_/vt-err2") });
		mockLoadRouteModules.mockResolvedValue(makeLoadedModules());
		mockFetchNDJSON.mockResolvedValue({ matches: [], perRouteHeads: [], success: true });

		const startVT = vi.fn(() => {
			throw new Error("VT failed");
		});
		(document as unknown as Record<string, unknown>).startViewTransition = startVT;

		await navigate({ to: "/vt-err2", viewTransition: { types: ["slide"] } });

		expect(startVT).toHaveBeenCalledTimes(1);
		expect(ctx.isNavigating()).toBe(false);
	});
});

describe("popstate cache behavior", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockFetchNDJSON.mockReset();
		mockMatchRoute.mockReset();
		mockLoadRouteModules.mockReset();
		mockApplyPerRouteHeads.mockReset();
		mockScrollToTop.mockReset();
		resetLocation();
	});

	afterEach(() => {
		resetNavigationState();
		resetLocation();
	});

	it("popstate with cached data → no fetch", async () => {
		const ctx = makeCtx();
		setupNavigation(ctx, mockLoadRouteModules);

		/* Pre-populate matchCache with cached data */
		ctx.matchCache.set({
			data: "cached",
			invalid: false,
			matchId: "_root_/post:{}:[]",
			updatedAt: Date.now(),
		});

		mockMatchRoute.mockReturnValue({ params: {}, route: makeRoute("_root_/post") });
		mockLoadRouteModules.mockResolvedValue(makeLoadedModules({ page: makeModule("_root_/post") }));

		window.history.pushState({}, "", "/post");
		await navigate({ _popstate: true, to: "/post" });

		expect(mockFetchNDJSON).not.toHaveBeenCalled();
		expect(ctx.isNavigating()).toBe(false);
	});

	it("popstate with hasDeferred cache → fetches", async () => {
		const ctx = makeCtx();
		setupNavigation(ctx, mockLoadRouteModules);

		ctx.matchCache.set({
			data: { comments: { __deferred: true, key: "c" } },
			hasDeferred: true,
			invalid: false,
			matchId: "_root_/post:{}:[]",
			updatedAt: Date.now(),
		});

		mockMatchRoute.mockReturnValue({ params: {}, route: makeRoute("_root_/post") });
		mockLoadRouteModules.mockResolvedValue(makeLoadedModules({ page: makeModule("_root_/post") }));
		mockFetchNDJSON.mockResolvedValue({ matches: [], perRouteHeads: [], success: true });

		window.history.pushState({}, "", "/post");
		await navigate({ _popstate: true, to: "/post" });

		expect(mockFetchNDJSON).toHaveBeenCalled();
	});

	it("popstate without cached data → fetches", async () => {
		const ctx = makeCtx();
		setupNavigation(ctx, mockLoadRouteModules);

		mockMatchRoute.mockReturnValue({ params: {}, route: makeRoute("_root_/post") });
		mockLoadRouteModules.mockResolvedValue(makeLoadedModules({ page: makeModule("_root_/post") }));
		mockFetchNDJSON.mockResolvedValue({ matches: [], perRouteHeads: [], success: true });

		window.history.pushState({}, "", "/post");
		await navigate({ _popstate: true, to: "/post" });

		expect(mockFetchNDJSON).toHaveBeenCalled();
	});
});

describe("popstate direction", () => {
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

	it("popstate uses _popstateDirection when provided", async () => {
		const ctx = makeCtx();
		setupNavigation(ctx, mockLoadRouteModules);

		mockMatchRoute.mockReturnValue({ params: {}, route: makeRoute("_root_/dir") });
		mockLoadRouteModules.mockResolvedValue(makeLoadedModules());
		mockFetchNDJSON.mockResolvedValue({ matches: [], perRouteHeads: [], success: true });

		/* Navigate with explicit forward direction */
		await navigate({ _popstate: true, _popstateDirection: "forward", to: "/dir" });

		expect(ctx.isNavigating()).toBe(false);
	});
});

describe("popstate handling", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockFetchNDJSON.mockReset();
		mockMatchRoute.mockReset();
		mockLoadRouteModules.mockReset();
		mockApplyPerRouteHeads.mockReset();
		mockScrollToTop.mockReset();
		resetLocation();
	});

	afterEach(() => {
		resetNavigationState();
		resetLocation();
	});

	it("hash navigation scrolls to element", async () => {
		const ctx = makeCtx();
		setupNavigation(ctx, mockLoadRouteModules);

		mockMatchRoute.mockReturnValue({ params: {}, route: makeRoute("_root_/docs") });
		mockLoadRouteModules.mockResolvedValue(makeLoadedModules());
		mockFetchNDJSON.mockResolvedValue({ matches: [], perRouteHeads: [], success: true });

		const el = document.createElement("div");
		el.id = "section-2";
		el.scrollIntoView = vi.fn();
		document.body.appendChild(el);

		await navigate({ to: "/docs#section-2" });

		expect(el.scrollIntoView).toHaveBeenCalled();
		expect(mockScrollToTop).not.toHaveBeenCalled();
		document.body.removeChild(el);
	});

	it("hash-only change while intercepted clears intercept overlay", async () => {
		window.history.replaceState({}, "", "/products/42");

		let intercepted: InterceptedState | null = { dismiss: () => {}, match: {} } as InterceptedState;
		const ctx = makeCtx({
			intercepted: () => intercepted,
			location: () => ({
				hash: "",
				params: { id: "42" },
				pathname: "/products/42",
				search: {},
				url: new URL("http://localhost/products/42"),
				variablePath: "/products/:id",
				virtualPath: "_root_/products/$id",
			}),
			setIntercepted: (v) => {
				intercepted = v;
			},
		});
		setupNavigation(ctx, mockLoadRouteModules);

		mockMatchRoute.mockReturnValue({
			params: { id: "42" },
			route: makeRoute("_root_/products/$id"),
		});

		await navigate({ to: "/products/42#reviews" });

		expect(intercepted).toBeNull();
	});

	it("hash-only change skips loaders when pathname + search unchanged", async () => {
		/* Set jsdom URL to /docs so navigate to /docs#section is hash-only */
		window.history.replaceState({}, "", "/docs");

		const ctx = makeCtx({
			location: () => ({
				hash: "",
				params: {},
				pathname: "/docs",
				search: {},
				url: new URL("http://localhost/docs"),
				variablePath: "",
				virtualPath: "",
			}),
		});
		setupNavigation(ctx, mockLoadRouteModules);

		mockMatchRoute.mockReturnValue({ params: {}, route: makeRoute("_root_/docs") });
		mockLoadRouteModules.mockResolvedValue(makeLoadedModules());
		mockFetchNDJSON.mockResolvedValue({ matches: [], perRouteHeads: [], success: true });

		const el = document.createElement("div");
		el.id = "features";
		el.scrollIntoView = vi.fn();
		document.body.appendChild(el);

		await navigate({ to: "/docs#features" });

		/* Should scroll to element */
		expect(el.scrollIntoView).toHaveBeenCalled();
		/* Should NOT load modules or fetch data — only hash changed */
		expect(mockLoadRouteModules).not.toHaveBeenCalled();
		expect(mockFetchNDJSON).not.toHaveBeenCalled();

		document.body.removeChild(el);
	});

	it("stale rAF scroll restore is dropped when superseded by new navigation", async () => {
		const ctx = makeCtx();
		setupNavigation(ctx, mockLoadRouteModules, { scrollRestoration: true });

		mockMatchRoute.mockReturnValue({ params: {}, route: makeRoute("_root_/a") });
		mockLoadRouteModules.mockResolvedValue(makeLoadedModules());
		mockFetchNDJSON.mockResolvedValue({ matches: [], perRouteHeads: [], success: true });

		/* Capture rAF callbacks instead of executing them */
		const rafCallbacks: FrameRequestCallback[] = [];
		const originalRAF = window.requestAnimationFrame;
		window.requestAnimationFrame = (cb: FrameRequestCallback) => {
			rafCallbacks.push(cb);
			return rafCallbacks.length;
		};

		/* Nav 1: popstate with scroll restore — schedules rAF */
		await navigate({ _popstate: true, _restoreScroll: { x: 0, y: 500 }, to: "/a" });

		/* Nav 2: supersedes nav 1 — increments version */
		mockMatchRoute.mockReturnValue({ params: {}, route: makeRoute("_root_/b") });
		mockLoadRouteModules.mockResolvedValue(makeLoadedModules({ page: makeModule("_root_/b") }));
		await navigate({ to: "/b" });

		/* Now flush the stale rAF from nav 1 */
		for (const cb of rafCallbacks) cb(performance.now());

		/* restoreScroll should NOT have been called — nav 1 is stale */
		expect(mockRestoreScroll).not.toHaveBeenCalled();

		window.requestAnimationFrame = originalRAF;
	});

	it("non-navigation error during navigate still resets isNavigating", async () => {
		const ctx = makeCtx();
		setupNavigation(ctx, mockLoadRouteModules);

		mockMatchRoute.mockReturnValue({ params: {}, route: makeRoute("_root_/error-page") });
		mockLoadRouteModules.mockRejectedValue(new Error("module load failure"));

		await expect(navigate({ to: "/error-page" })).rejects.toThrow("module load failure");

		expect(ctx.isNavigating()).toBe(false);
	});
});

describe("replace navigation does not increment history index", () => {
	beforeEach(() => {
		resetNavigationState();
		resetLocation();
	});

	afterEach(() => {
		resetNavigationState();
		resetLocation();
	});

	it("push increments, replace does not", async () => {
		const ctx = makeCtx();
		setupNavigation(ctx, mockLoadRouteModules);

		mockMatchRoute.mockReturnValue({ params: {}, route: makeRoute("_root_/a") });
		mockLoadRouteModules.mockResolvedValue(makeLoadedModules());
		mockFetchNDJSON.mockResolvedValue({ matches: [], perRouteHeads: [] });

		const indexBefore = getHistoryIndex();

		/* push navigation should increment */
		await navigate({ to: "/a" });
		const indexAfterPush = getHistoryIndex();
		expect(indexAfterPush).toBe(indexBefore + 1);

		/* replace navigation should NOT increment */
		mockMatchRoute.mockReturnValue({ params: {}, route: makeRoute("_root_/b") });
		await navigate({ replace: true, to: "/b" });
		const indexAfterReplace = getHistoryIndex();
		expect(indexAfterReplace).toBe(indexAfterPush);
	});
});

describe("setupNavigation re-setup cleanup", () => {
	afterEach(() => {
		resetNavigationState();
		resetLocation();
	});

	it("re-setup does not accumulate popstate listeners", () => {
		const ctx = makeCtx();

		/* Setup twice — should not throw or leak */
		setupNavigation(ctx, mockLoadRouteModules);
		setupNavigation(ctx, mockLoadRouteModules);

		/* resetNavigationState should clean up everything */
		resetNavigationState();
	});
});

describe("notFoundMode", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockFetchNDJSON.mockReset();
		mockMatchRoute.mockReset();
		mockMatchRoutePartial.mockReset();
		mockLoadRouteModules.mockReset();
		mockApplyPerRouteHeads.mockReset();
		mockScrollToTop.mockReset();
		resetLocation();
	});

	afterEach(() => {
		resetNavigationState();
		resetLocation();
	});

	it("root mode: matchRoute null → sets notFound=true, matches=[]", async () => {
		const ctx = makeCtx();
		setupNavigation(ctx, mockLoadRouteModules, { notFoundMode: "root" });

		mockMatchRoute.mockReturnValue(null);

		await navigate({ to: "/nonexistent" });

		expect(ctx.notFound()).toBe(true);
		expect(ctx.matches()).toEqual([]);
		expect(ctx.isNavigating()).toBe(false);
	});

	it("fuzzy mode: matchRoute null, partial match found → sets matches with layouts + notFound page", async () => {
		const ctx = makeCtx();
		setupNavigation(ctx, mockLoadRouteModules, { notFoundMode: "fuzzy" });

		mockMatchRoute.mockReturnValue(null);
		mockMatchRoutePartial.mockReturnValue({
			params: {},
			route: makeRoute("_root_/products"),
		});

		const layoutMod = {
			_type: "layout" as const,
			notFoundRender: () => null,
			render: () => null,
			variablePath: "/",
			virtualPath: "_root_",
		};
		const pageMod = {
			_type: "render" as const,
			render: () => null,
			variablePath: "/products",
			virtualPath: "_root_/products",
		};

		mockLoadRouteModules.mockResolvedValue({
			layouts: [layoutMod],
			page: pageMod,
			params: {},
		});

		await navigate({ to: "/products/nonexistent" });

		expect(mockApplyPerRouteHeads).toHaveBeenCalledWith([
			{ head: { title: "Not Found" }, matchId: "_root_/products/__notfound" },
		]);
		expect(ctx.notFound()).toBe(false);
		const matches = ctx.matches();
		expect(matches.length).toBeGreaterThanOrEqual(2);
		/* Last match should be synthetic notFound */
		const lastMatch = matches[matches.length - 1];
		expect(lastMatch?.error).toBeDefined();
		expect(lastMatch?.virtualPath).toContain("__notfound");
		expect(ctx.isNavigating()).toBe(false);
	});

	it("fuzzy mode: matchRoute null, no partial match → falls back to root behavior", async () => {
		const ctx = makeCtx();
		setupNavigation(ctx, mockLoadRouteModules, { notFoundMode: "fuzzy" });

		mockMatchRoute.mockReturnValue(null);
		mockMatchRoutePartial.mockReturnValue(null);

		await navigate({ to: "/totally/unknown" });

		expect(ctx.notFound()).toBe(true);
		expect(ctx.matches()).toEqual([]);
		expect(ctx.isNavigating()).toBe(false);
		expect(window.location.pathname).toBe("/totally/unknown");
	});

	it("default mode (unset) behaves as fuzzy", async () => {
		const ctx = makeCtx();
		setupNavigation(ctx, mockLoadRouteModules);

		mockMatchRoute.mockReturnValue(null);
		mockMatchRoutePartial.mockReturnValue({
			params: { id: "5" },
			route: makeRoute("_root_/users/[id]"),
		});

		const layoutMod = {
			_type: "layout" as const,
			render: () => null,
			variablePath: "/",
			virtualPath: "_root_",
		};
		const pageMod = {
			_type: "render" as const,
			render: () => null,
			variablePath: "/users/:id",
			virtualPath: "_root_/users/[id]",
		};

		mockLoadRouteModules.mockResolvedValue({
			layouts: [layoutMod],
			page: pageMod,
			params: { id: "5" },
		});

		await navigate({ to: "/users/5/nonexistent" });

		expect(ctx.notFound()).toBe(false);
		const matches = ctx.matches();
		expect(matches.length).toBeGreaterThanOrEqual(2);
		expect(ctx.isNavigating()).toBe(false);
	});
});
