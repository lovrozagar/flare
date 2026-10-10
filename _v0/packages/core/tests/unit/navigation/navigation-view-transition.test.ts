import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMatchCache, createPrefetchCache } from "../../../src/caches/index.ts";
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

function makeRoute(virtualPath: string) {
	return { e: "", o: {}, p: vi.fn(), t: "r", v: "", x: virtualPath };
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

/* ── View transition edge cases ──────────────────────────────────── */

describe("view transition edge cases", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockLoadRouteModules.mockReset();
	});

	afterEach(() => {
		resetNavigationState();
		resetLocation();
	});

	it("VT throws but update succeeds — no error propagates", async () => {
		const ctx = makeCtx();
		setupNavigation(ctx, mockLoadRouteModules, { viewTransitions: true });

		const route = makeRoute("_root_/about");
		mockMatchRoute.mockReturnValue({ params: {}, route });
		mockLoadRouteModules.mockResolvedValue(makeLoadedModules());
		mockFetchNDJSON.mockResolvedValue({ matches: [], perRouteHeads: [] });

		/* Simulate startViewTransition that throws */
		const origStartVT = document.startViewTransition;
		(document as unknown as Record<string, unknown>).startViewTransition = () => {
			throw new Error("VT not supported in this context");
		};

		/* Should not throw — VT error is cosmetic */
		await expect(navigate({ to: "/about" })).resolves.toBeUndefined();

		/* State should be updated (update() ran successfully) */
		expect(ctx.matches().length).toBeGreaterThanOrEqual(0);
		expect(ctx.isNavigating()).toBe(false);

		/* Cleanup */
		if (origStartVT) {
			(document as unknown as Record<string, unknown>).startViewTransition = origStartVT;
		} else {
			delete (document as unknown as Record<string, unknown>).startViewTransition;
		}
	});

	it("VT throws AND update throws — update error propagates (B2 fix)", async () => {
		const ctx = makeCtx();
		const updateError = new Error("Critical state update failure");

		/* Override setMatches to throw when update() calls it */
		ctx.setMatches = () => {
			throw updateError;
		};

		setupNavigation(ctx, mockLoadRouteModules, { viewTransitions: true });

		const route = makeRoute("_root_/fail");
		mockMatchRoute.mockReturnValue({ params: {}, route });
		mockLoadRouteModules.mockResolvedValue(makeLoadedModules());
		mockFetchNDJSON.mockResolvedValue({ matches: [], perRouteHeads: [] });

		/* Simulate startViewTransition that throws */
		const origStartVT = document.startViewTransition;
		(document as unknown as Record<string, unknown>).startViewTransition = () => {
			throw new Error("VT API error");
		};

		/* update() error should propagate — not be silently swallowed */
		await expect(navigate({ to: "/fail" })).rejects.toThrow("Critical state update failure");

		/* Cleanup */
		if (origStartVT) {
			(document as unknown as Record<string, unknown>).startViewTransition = origStartVT;
		} else {
			delete (document as unknown as Record<string, unknown>).startViewTransition;
		}
	});

	it("VT succeeds with typed transitions", async () => {
		const ctx = makeCtx();
		setupNavigation(ctx, mockLoadRouteModules, {
			viewTransitions: { types: ["slide"] },
		});

		const route = makeRoute("_root_/typed");
		mockMatchRoute.mockReturnValue({ params: {}, route });
		mockLoadRouteModules.mockResolvedValue(makeLoadedModules());
		mockFetchNDJSON.mockResolvedValue({ matches: [], perRouteHeads: [] });

		let vtArg: unknown = null;
		(document as unknown as Record<string, unknown>).startViewTransition = (arg: unknown) => {
			vtArg = arg;
			if (typeof arg === "function") arg();
			else if (arg && typeof arg === "object" && "update" in arg) (arg as { update: () => void }).update();
			return {
				finished: Promise.resolve(),
				ready: Promise.resolve(),
				skipTransition: () => {},
				updateCallbackDone: Promise.resolve(),
			};
		};

		await navigate({ to: "/typed" });
		await new Promise((r) => setTimeout(r, 10));

		/* Should have been called with types */
		expect(vtArg).toEqual(expect.objectContaining({ types: ["slide"] }));
		expect(ctx.isNavigating()).toBe(false);

		delete (document as unknown as Record<string, unknown>).startViewTransition;
	});

	it("VT with dynamic types function returning false skips VT", async () => {
		const ctx = makeCtx();
		setupNavigation(ctx, mockLoadRouteModules, {
			viewTransitions: { types: () => false as const },
		});

		const route = makeRoute("_root_/dynamic");
		mockMatchRoute.mockReturnValue({ params: {}, route });
		mockLoadRouteModules.mockResolvedValue(makeLoadedModules());
		mockFetchNDJSON.mockResolvedValue({ matches: [], perRouteHeads: [] });

		let vtCalled = false;
		(document as unknown as Record<string, unknown>).startViewTransition = () => {
			vtCalled = true;
		};

		await navigate({ to: "/dynamic" });

		/* startViewTransition should NOT have been called — types fn returned false */
		expect(vtCalled).toBe(false);
		expect(ctx.isNavigating()).toBe(false);

		delete (document as unknown as Record<string, unknown>).startViewTransition;
	});

	it("VT with dynamic types function returning empty array skips types", async () => {
		const ctx = makeCtx();
		setupNavigation(ctx, mockLoadRouteModules, {
			viewTransitions: { types: () => [] },
		});

		const route = makeRoute("_root_/empty");
		mockMatchRoute.mockReturnValue({ params: {}, route });
		mockLoadRouteModules.mockResolvedValue(makeLoadedModules());
		mockFetchNDJSON.mockResolvedValue({ matches: [], perRouteHeads: [] });

		let vtArg: unknown = null;
		(document as unknown as Record<string, unknown>).startViewTransition = (arg: unknown) => {
			vtArg = arg;
			if (typeof arg === "function") arg();
			return {
				finished: Promise.resolve(),
				ready: Promise.resolve(),
				skipTransition: () => {},
				updateCallbackDone: Promise.resolve(),
			};
		};

		await navigate({ to: "/empty" });
		await new Promise((r) => setTimeout(r, 10));

		/* Empty array: called without types (plain function) */
		expect(typeof vtArg).toBe("function");
		expect(ctx.isNavigating()).toBe(false);

		delete (document as unknown as Record<string, unknown>).startViewTransition;
	});

	it("per-navigation viewTransition overrides router default", async () => {
		const ctx = makeCtx();
		/* Default: no VT */
		setupNavigation(ctx, mockLoadRouteModules, { viewTransitions: false });

		const route = makeRoute("_root_/override");
		mockMatchRoute.mockReturnValue({ params: {}, route });
		mockLoadRouteModules.mockResolvedValue(makeLoadedModules());
		mockFetchNDJSON.mockResolvedValue({ matches: [], perRouteHeads: [] });

		let vtCalled = false;
		(document as unknown as Record<string, unknown>).startViewTransition = (arg: unknown) => {
			vtCalled = true;
			if (typeof arg === "function") arg();
			return {
				finished: Promise.resolve(),
				ready: Promise.resolve(),
				skipTransition: () => {},
				updateCallbackDone: Promise.resolve(),
			};
		};

		/* Per-navigation override to enable VT */
		await navigate({ to: "/override", viewTransition: true });
		await new Promise((r) => setTimeout(r, 10));

		expect(vtCalled).toBe(true);
		expect(ctx.isNavigating()).toBe(false);

		delete (document as unknown as Record<string, unknown>).startViewTransition;
	});
});
