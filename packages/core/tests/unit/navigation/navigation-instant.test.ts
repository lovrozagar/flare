import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../src/logger", () => ({
	error: vi.fn(),
	verbose: vi.fn(),
	warn: vi.fn(),
}));
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

import { restoreScroll, scrollToTop } from "../../../src/history/index.ts";
import { warn } from "../../../src/logger.ts";
import { navigate, prefetch, resetNavigationState, setupNavigation } from "../../../src/navigation/index.ts";
import { fetchNDJSON } from "../../../src/ndjson-client/index.ts";
import { matchRoute } from "../../../src/router-primitives/index.ts";

const mockFetchNDJSON = fetchNDJSON as ReturnType<typeof vi.fn>;
const mockMatchRoute = matchRoute as ReturnType<typeof vi.fn>;
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

function resetLocation(): void {
	window.history.replaceState({}, "", "/");
}

const ABOUT_ID = "_root_/about:{}:[]";
const ABOUT_PAGE = makeModule("_root_/about");

function stubAboutRoute(): void {
	mockMatchRoute.mockReturnValue({
		params: {},
		route: makeRoute("_root_/about"),
	});
	mockLoadRouteModules.mockResolvedValue(
		makeLoadedModules({
			page: ABOUT_PAGE,
		}),
	);
}

describe("instant navigation — commit shell before NDJSON", () => {
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

	it("paints prefetched loaderData before the navigation fetch resolves", async () => {
		const ctx = makeCtx();
		setupNavigation(ctx, mockLoadRouteModules);
		stubAboutRoute();

		mockFetchNDJSON.mockResolvedValue({
			matches: [{ loaderData: "prefetched-shell", matchId: ABOUT_ID }],
			perRouteHeads: [],
			success: true,
		});

		await prefetch({ to: "/about" });
		expect(ctx.matchCache.get(ABOUT_ID)?.data).toBe("prefetched-shell");

		let resolveNavFetch: ((value: unknown) => void) | undefined;
		const navFetch = new Promise((resolve) => {
			resolveNavFetch = resolve;
		});
		mockFetchNDJSON.mockReset();
		mockFetchNDJSON.mockReturnValue(navFetch);
		stubAboutRoute();

		const navP = navigate({ to: "/about" });

		await vi.waitFor(() => {
			expect(ctx.matches().some((m) => m.loaderData === "prefetched-shell")).toBe(true);
		});

		resolveNavFetch?.({
			matches: [{ loaderData: "fresh", matchId: ABOUT_ID }],
			perRouteHeads: [],
			success: true,
		});
		await navP;

		expect(ctx.matches().some((m) => m.loaderData === "fresh")).toBe(true);
	});

	it("A→B→A paints cached A before the refetch resolves", async () => {
		const ctx = makeCtx();
		setupNavigation(ctx, mockLoadRouteModules);

		mockMatchRoute.mockImplementation((_tree, pathname) => {
			if (String(pathname).includes("about")) {
				return { params: {}, route: makeRoute("_root_/about") };
			}
			return { params: {}, route: makeRoute("_root_/other") };
		});
		mockLoadRouteModules.mockImplementation(async (pathname) => {
			if (String(pathname).includes("about")) {
				return makeLoadedModules({ page: ABOUT_PAGE });
			}
			return makeLoadedModules({ page: makeModule("_root_/other") });
		});

		mockFetchNDJSON.mockResolvedValueOnce({
			matches: [{ loaderData: "visit-1", matchId: ABOUT_ID }],
			perRouteHeads: [],
			success: true,
		});
		await navigate({ to: "/about" });
		expect(ctx.matches().some((m) => m.loaderData === "visit-1")).toBe(true);

		mockFetchNDJSON.mockResolvedValueOnce({
			matches: [{ loaderData: "other", matchId: "_root_/other:{}:[]" }],
			perRouteHeads: [],
			success: true,
		});
		await navigate({ to: "/other" });

		let resolveReturn: ((value: unknown) => void) | undefined;
		mockFetchNDJSON.mockReturnValue(
			new Promise((resolve) => {
				resolveReturn = resolve;
			}),
		);

		const navP = navigate({ to: "/about" });

		await vi.waitFor(() => {
			expect(ctx.matches().some((m) => m.loaderData === "visit-1")).toBe(true);
		});

		resolveReturn?.({
			matches: [{ loaderData: "visit-2", matchId: ABOUT_ID }],
			perRouteHeads: [],
			success: true,
		});
		await navP;

		expect(ctx.matches().some((m) => m.loaderData === "visit-2")).toBe(true);
	});

	it("paints a hasDeferred prefetch shell before the enter fetch resolves", async () => {
		const ctx = makeCtx();
		setupNavigation(ctx, mockLoadRouteModules);
		stubAboutRoute();

		mockFetchNDJSON.mockResolvedValue({
			matches: [
				{
					hasDeferredMarkers: true,
					loaderData: { inventory: { __deferred: true, key: "d0" }, title: "shell-title" },
					matchId: ABOUT_ID,
				},
			],
			perRouteHeads: [],
			success: true,
		});

		await prefetch({ to: "/about" });

		let resolveNavFetch: ((value: unknown) => void) | undefined;
		mockFetchNDJSON.mockReset();
		mockFetchNDJSON.mockReturnValue(
			new Promise((resolve) => {
				resolveNavFetch = resolve;
			}),
		);
		stubAboutRoute();

		const navP = navigate({ to: "/about" });

		await vi.waitFor(() => {
			const page = ctx.matches().find((m) => m.virtualPath === "_root_/about");
			const data = page?.loaderData as { inventory: { promise: Promise<unknown> }; title: string };
			expect(data.title).toBe("shell-title");
			expect(data.inventory.promise).toBeInstanceOf(Promise);
		});

		resolveNavFetch?.({
			keepShell: true,
			matches: [
				{
					keepShell: true,
					loaderData: { inventory: "loaded", title: "from-enter" },
					matchId: ABOUT_ID,
				},
			],
			perRouteHeads: [],
			success: true,
		});
		await navP;

		const page = ctx.matches().find((m) => m.virtualPath === "_root_/about");
		expect((page?.loaderData as { title: string } | undefined)?.title).toBe("shell-title");
		expect(mockFetchNDJSON.mock.calls[0]?.[0]?.keepMatchIds).toEqual([ABOUT_ID]);
	});

	it("same-route search change keeps page match identity", async () => {
		const hooksId = "_root_/hooks-test:{}:[]";
		const hooksPage = makeModule("_root_/hooks-test");
		const ctx = makeCtx();
		setupNavigation(ctx, mockLoadRouteModules);
		mockMatchRoute.mockReturnValue({
			params: {},
			route: makeRoute("_root_/hooks-test"),
		});
		mockLoadRouteModules.mockResolvedValue(makeLoadedModules({ page: hooksPage }));
		mockFetchNDJSON.mockResolvedValue({
			matches: [{ loaderData: { greeting: "hello" }, matchId: hooksId }],
			perRouteHeads: [],
			success: true,
		});

		window.history.replaceState({}, "", "/");
		await navigate({ to: "/hooks-test" });
		const pageBefore = ctx.matches().find((m) => m.virtualPath === "_root_/hooks-test");
		expect(pageBefore).toBeDefined();

		await navigate({ search: { filter: "active" }, to: "/hooks-test" });

		const pageAfter = ctx.matches().find((m) => m.virtualPath === "_root_/hooks-test");
		/* Same object so Outlet <Show when={match()}> does not remount the page
		   (wiping local signals like hooks-test navigated()). */
		expect(pageAfter).toBe(pageBefore);
		expect(ctx.search()).toEqual({ filter: "active" });
	});

	it("same-route search change does not call setMatches when the match is reused", async () => {
		const hooksId = "_root_/hooks-test:{}:[]";
		const hooksPage = makeModule("_root_/hooks-test");
		const ctx = makeCtx();
		setupNavigation(ctx, mockLoadRouteModules);
		mockMatchRoute.mockReturnValue({
			params: {},
			route: makeRoute("_root_/hooks-test"),
		});
		mockLoadRouteModules.mockResolvedValue(makeLoadedModules({ page: hooksPage }));
		mockFetchNDJSON.mockResolvedValue({
			matches: [{ loaderData: { greeting: "hello" }, matchId: hooksId }],
			perRouteHeads: [],
			success: true,
		});

		window.history.replaceState({}, "", "/");
		await navigate({ to: "/hooks-test" });

		const inner = ctx.setMatches.bind(ctx);
		const spy = vi.fn(inner);
		ctx.setMatches = spy;

		await navigate({ search: { filter: "active" }, to: "/hooks-test" });

		expect(spy).not.toHaveBeenCalled();
		expect(ctx.search()).toEqual({ filter: "active" });
	});

	it("cleared pipeline error replaces the match object so Errored can remount", async () => {
		const pageId = "_root_/retry-test:{}:[]";
		const pageMod = makeModule("_root_/retry-test");
		const ctx = makeCtx();
		setupNavigation(ctx, mockLoadRouteModules);
		mockMatchRoute.mockReturnValue({
			params: {},
			route: makeRoute("_root_/retry-test"),
		});
		mockLoadRouteModules.mockResolvedValue(makeLoadedModules({ page: pageMod }));

		mockFetchNDJSON.mockResolvedValueOnce({
			matches: [{ error: new Error("Transient failure"), matchId: pageId }],
			perRouteHeads: [],
			success: true,
		});

		window.history.replaceState({}, "", "/");
		await navigate({ to: "/retry-test" });
		const before = ctx.matches().find((m) => m.virtualPath === "_root_/retry-test");
		expect(before?.error).toBeInstanceOf(Error);

		mockFetchNDJSON.mockResolvedValueOnce({
			matches: [{ loaderData: "ok", matchId: pageId }],
			perRouteHeads: [],
			success: true,
		});
		await navigate({ replace: true, revalidate: true, to: "/retry-test" });

		const after = ctx.matches().find((m) => m.virtualPath === "_root_/retry-test");
		expect(after).not.toBe(before);
		expect(after?.error).toBeUndefined();
		expect(after?.loaderData).toBe("ok");
	});
});

describe("instant navigation — in-flight prefetch is the navigation fetch", () => {
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

	it("hover-then-click does not start a second NDJSON while prefetch is in flight", async () => {
		const ctx = makeCtx();
		setupNavigation(ctx, mockLoadRouteModules);
		stubAboutRoute();

		let resolvePrefetch: ((value: unknown) => void) | undefined;
		mockFetchNDJSON.mockReturnValue(
			new Promise((resolve) => {
				resolvePrefetch = resolve;
			}),
		);

		const prefetchP = prefetch({ to: "/about" });
		await vi.waitFor(() => expect(mockFetchNDJSON).toHaveBeenCalledTimes(1));

		const navP = navigate({ to: "/about" });
		await vi.waitFor(() => expect(mockLoadRouteModules).toHaveBeenCalled());
		expect(mockFetchNDJSON).toHaveBeenCalledTimes(1);

		resolvePrefetch?.({
			matches: [{ loaderData: "from-prefetch", matchId: ABOUT_ID }],
			perRouteHeads: [],
			success: true,
		});
		await prefetchP;
		await navP;

		expect(mockFetchNDJSON).toHaveBeenCalledTimes(1);
		expect(ctx.matches().some((m) => m.loaderData === "from-prefetch")).toBe(true);
	});

	it("hover-then-click on a deferred route waits for prefetch then fetches enter chunks", async () => {
		const ctx = makeCtx();
		setupNavigation(ctx, mockLoadRouteModules);
		stubAboutRoute();

		let resolvePrefetch: ((value: unknown) => void) | undefined;
		mockFetchNDJSON.mockReturnValueOnce(
			new Promise((resolve) => {
				resolvePrefetch = resolve;
			}),
		);
		mockFetchNDJSON.mockResolvedValueOnce({
			matches: [{ keepShell: true, loaderData: { title: "full" }, matchId: ABOUT_ID }],
			perRouteHeads: [],
			success: true,
		});

		const prefetchP = prefetch({ to: "/about" });
		await vi.waitFor(() => expect(mockFetchNDJSON).toHaveBeenCalledTimes(1));

		const navP = navigate({ to: "/about" });
		await vi.waitFor(() => expect(mockLoadRouteModules).toHaveBeenCalled());
		expect(mockFetchNDJSON).toHaveBeenCalledTimes(1);

		resolvePrefetch?.({
			matches: [
				{
					hasDeferredMarkers: true,
					loaderData: { inventory: { __deferred: true, key: "d0" }, title: "shell" },
					matchId: ABOUT_ID,
				},
			],
			perRouteHeads: [],
			success: true,
		});
		await prefetchP;
		await navP;

		expect(mockFetchNDJSON).toHaveBeenCalledTimes(2);
		expect(mockFetchNDJSON.mock.calls[0]?.[0]).toMatchObject({ prefetch: true });
		expect(mockFetchNDJSON.mock.calls[1]?.[0]?.prefetch).toBeFalsy();
		expect(mockFetchNDJSON.mock.calls[1]?.[0]?.keepMatchIds).toEqual([ABOUT_ID]);
		expect(ctx.matches().some((m) => JSON.stringify(m.loaderData).includes("shell"))).toBe(true);
	});
});

describe("instant navigation — late prefetch must not clobber", () => {
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

	it("prefetch matchCache.set is ignored when a newer committed entry exists", async () => {
		const ctx = makeCtx();
		setupNavigation(ctx, mockLoadRouteModules);
		stubAboutRoute();

		let resolvePrefetch: ((value: unknown) => void) | undefined;
		mockFetchNDJSON.mockReturnValue(
			new Promise((resolve) => {
				resolvePrefetch = resolve;
			}),
		);

		const prefetchP = prefetch({ to: "/about" });
		await vi.waitFor(() => expect(mockFetchNDJSON).toHaveBeenCalledTimes(1));

		ctx.matchCache.set({
			data: "from-navigate",
			invalid: false,
			matchId: ABOUT_ID,
			updatedAt: Date.now() + 5_000,
		});

		resolvePrefetch?.({
			matches: [{ loaderData: "from-prefetch", matchId: ABOUT_ID }],
			perRouteHeads: [],
			success: true,
		});
		await prefetchP;

		expect(ctx.matchCache.get(ABOUT_ID)?.data).toBe("from-navigate");
	});
});

describe("instant navigation — viewport warms modules only", () => {
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

	it("modulesOnly prefetch does not fetch NDJSON", async () => {
		const ctx = makeCtx();
		setupNavigation(ctx, mockLoadRouteModules);
		stubAboutRoute();

		await prefetch({ modulesOnly: true, to: "/about" });

		expect(mockFetchNDJSON).not.toHaveBeenCalled();
		expect(mockLoadRouteModules).toHaveBeenCalled();
		expect(ctx.prefetchCache.has(new URL("/about", window.location.href).href)).toBe(false);
	});

	it("click after modulesOnly still fetches enter NDJSON (no data shell)", async () => {
		const ctx = makeCtx();
		setupNavigation(ctx, mockLoadRouteModules);
		stubAboutRoute();
		mockFetchNDJSON.mockResolvedValue({
			matches: [{ loaderData: "from-enter", matchId: ABOUT_ID }],
			perRouteHeads: [],
			success: true,
		});

		await prefetch({ modulesOnly: true, to: "/about" });
		vi.mocked(warn).mockClear();
		await navigate({ to: "/about" });

		expect(mockFetchNDJSON).toHaveBeenCalledTimes(1);
		expect(ctx.matches().some((m) => m.loaderData === "from-enter")).toBe(true);
		expect(warn).toHaveBeenCalledWith("nav", expect.stringContaining("no prefetched shell"));
	});
});

describe("instant navigation — popstate restores scroll on the cached shell", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockFetchNDJSON.mockReset();
		mockMatchRoute.mockReset();
		mockLoadRouteModules.mockReset();
		mockRestoreScroll.mockReset();
		mockScrollToTop.mockReset();
		resetLocation();
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		resetNavigationState();
		resetLocation();
	});

	it("restores saved scroll on the cached shell before rAF or the enter fetch", async () => {
		const ctx = makeCtx();
		setupNavigation(ctx, mockLoadRouteModules);
		stubAboutRoute();

		mockFetchNDJSON.mockResolvedValue({
			matches: [{ loaderData: "cached-page", matchId: ABOUT_ID }],
			perRouteHeads: [],
			success: true,
		});
		await prefetch({ to: "/about" });

		vi.stubGlobal("requestAnimationFrame", () => 1);

		let resolveNavFetch: ((value: unknown) => void) | undefined;
		mockFetchNDJSON.mockReset();
		mockFetchNDJSON.mockReturnValue(
			new Promise((resolve) => {
				resolveNavFetch = resolve;
			}),
		);
		stubAboutRoute();

		const navP = navigate({
			_popstate: true,
			_restoreScroll: { x: 0, y: 420 },
			to: "/about",
		});

		await vi.waitFor(() => {
			expect(ctx.matches().some((m) => m.loaderData === "cached-page")).toBe(true);
		});

		/* Same turn as the shell paint — not after fetch, not after rAF. */
		expect(mockRestoreScroll).toHaveBeenCalledWith({ x: 0, y: 420 }, "auto");
		expect(mockScrollToTop).not.toHaveBeenCalled();

		resolveNavFetch?.({
			matches: [{ loaderData: "fresh", matchId: ABOUT_ID }],
			perRouteHeads: [],
			success: true,
		});
		await navP;
	});
});

describe("instant navigation — aborted deferred visits refetch", () => {
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

	it("returning after abort does not keepMatchIds or keep dead promises", async () => {
		const ctx = makeCtx();
		setupNavigation(ctx, mockLoadRouteModules);

		mockMatchRoute.mockImplementation((_tree, pathname) => {
			if (String(pathname).includes("about")) {
				return { params: {}, route: makeRoute("_root_/about") };
			}
			return { params: {}, route: makeRoute("_root_/other") };
		});
		mockLoadRouteModules.mockImplementation(async (pathname) => {
			if (String(pathname).includes("about")) {
				return makeLoadedModules({ page: ABOUT_PAGE });
			}
			return makeLoadedModules({ page: makeModule("_root_/other") });
		});

		const deadFast = new Promise(() => {});
		mockFetchNDJSON.mockResolvedValueOnce({
			matches: [
				{
					hasDeferredMarkers: true,
					loaderData: {
						fast: { __key: "d0", promise: deadFast },
						instant: "instant-value",
					},
					matchId: ABOUT_ID,
				},
			],
			perRouteHeads: [],
			success: true,
		});
		await navigate({ to: "/about" });

		mockFetchNDJSON.mockResolvedValueOnce({
			matches: [{ loaderData: "other", matchId: "_root_/other:{}:[]" }],
			perRouteHeads: [],
			success: true,
		});
		await navigate({ to: "/other" });

		mockFetchNDJSON.mockResolvedValueOnce({
			matches: [
				{
					hasDeferredMarkers: true,
					loaderData: {
						fast: { __key: "d0", promise: Promise.resolve("fast-result") },
						instant: "instant-value",
					},
					matchId: ABOUT_ID,
				},
			],
			perRouteHeads: [],
			success: true,
		});
		await navigate({ to: "/about" });

		expect(mockFetchNDJSON.mock.calls[2]?.[0]?.keepMatchIds).toBeFalsy();

		const page = ctx.matches().find((m) => m.virtualPath === "_root_/about");
		const data = page?.loaderData as { fast: { promise: Promise<unknown> }; instant: string };
		expect(data.instant).toBe("instant-value");
		await expect(data.fast.promise).resolves.toBe("fast-result");
	});
});
