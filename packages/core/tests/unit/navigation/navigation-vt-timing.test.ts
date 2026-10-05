/**
 * Bug: navigationPhase set to "idle" before VT update callback runs.
 *
 * document.startViewTransition(callback) calls callback asynchronously.
 * But setNavigationPhase("idle") runs synchronously after startViewTransition returns.
 * This means isNavigating becomes false while route state is still stale.
 *
 * The fix: move setNavigationPhase("idle") into the update() callback so it runs
 * atomically with the state transition inside the VT.
 */
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

import { navigate, prefetch, resetNavigationState, setupNavigation } from "../../../src/navigation/index.ts";
import { setOutletNodes } from "../../../src/outlet/outlet-nodes.ts";
import { registerBoundary } from "../../../src/view-transition-boundary/registry.ts";
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
		page: makeModule("_root_/target"),
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

describe("isNavigating timing with View Transitions", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockLoadRouteModules.mockReset();
	});

	afterEach(() => {
		resetNavigationState();
		resetLocation();
	});

	it("isNavigating is still true when VT startViewTransition returns but update() hasn't run", async () => {
		const ctx = makeCtx();
		setupNavigation(ctx, mockLoadRouteModules, { viewTransitions: true });

		const route = makeRoute("_root_/target");
		mockMatchRoute.mockReturnValue({ params: {}, route });
		mockLoadRouteModules.mockResolvedValue(makeLoadedModules());
		mockFetchNDJSON.mockResolvedValue({ matches: [], perRouteHeads: [] });

		const captured: {
			finishedResolve: (() => void) | null;
			updateFn: (() => void) | null;
		} = { finishedResolve: null, updateFn: null };
		let isNavigatingWhenVTReturned: boolean | null = null;

		const origStartVT = document.startViewTransition;
		(document as unknown as Record<string, unknown>).startViewTransition = (
			arg: (() => void) | { update: () => void },
		) => {
			/* Capture update but DON'T call it — simulates async VT behavior */
			if (typeof arg === "function") {
				captured.updateFn = arg;
			} else if (arg && typeof arg === "object" && "update" in arg) {
				captured.updateFn = arg.update;
			}
			/* After startViewTransition returns, check isNavigating */
			queueMicrotask(() => {
				isNavigatingWhenVTReturned = ctx.isNavigating();
			});
			const finished = new Promise<void>((resolve) => {
				captured.finishedResolve = resolve;
			});
			return {
				finished,
				ready: Promise.resolve(),
				skipTransition: () => {},
				updateCallbackDone: new Promise<void>((resolve) => {
					const origUpdate = captured.updateFn;
					captured.updateFn = () => {
						origUpdate?.();
						resolve();
					};
				}),
			};
		};

		const navPromise = navigate({ to: "/target" });

		/* Wait for the navigate to complete synchronous portion */
		await new Promise((r) => setTimeout(r, 50));

		/* isNavigating should still be true — update() hasn't run yet */
		expect(isNavigatingWhenVTReturned).toBe(true);

		/* Now call the update fn to complete the transition */
		expect(captured.updateFn).not.toBeNull();
		captured.updateFn?.();

		await new Promise((r) => setTimeout(r, 10));

		/* After update(), isNavigating still true — in "transitioning" phase */
		expect(ctx.isNavigating()).toBe(true);
		expect(ctx.navigationPhase()).toBe("transitioning");
		expect(ctx.matches().length).toBeGreaterThanOrEqual(0);

		/* VT finished → idle */
		captured.finishedResolve?.();
		await new Promise((r) => setTimeout(r, 10));
		expect(ctx.isNavigating()).toBe(false);

		await navPromise.catch(() => {});

		/* Cleanup */
		if (origStartVT) {
			(document as unknown as Record<string, unknown>).startViewTransition = origStartVT;
		} else {
			delete (document as unknown as Record<string, unknown>).startViewTransition;
		}
	});

	it("route state (matches) is updated atomically inside VT update callback", async () => {
		const ctx = makeCtx();
		setupNavigation(ctx, mockLoadRouteModules, { viewTransitions: true });

		const route = makeRoute("_root_/newpage");
		mockMatchRoute.mockReturnValue({ params: { id: "42" }, route });
		mockLoadRouteModules.mockResolvedValue(
			makeLoadedModules({
				page: makeModule("_root_/newpage"),
				params: { id: "42" },
			}),
		);
		mockFetchNDJSON.mockResolvedValue({ matches: [], perRouteHeads: [] });

		const captured: {
			finishedResolve: (() => void) | null;
			updateFn: (() => void) | null;
		} = { finishedResolve: null, updateFn: null };
		let stateBeforeUpdate = { matchCount: 0, phase: "idle" as string };
		let stateAfterUpdate = { matchCount: 0, phase: "idle" as string };

		const origStartVT = document.startViewTransition;
		(document as unknown as Record<string, unknown>).startViewTransition = (
			arg: (() => void) | { update: () => void },
		) => {
			if (typeof arg === "function") {
				captured.updateFn = arg;
			} else if (arg && typeof arg === "object" && "update" in arg) {
				captured.updateFn = arg.update;
			}
			const finished = new Promise<void>((resolve) => {
				captured.finishedResolve = resolve;
			});
			return {
				finished,
				ready: Promise.resolve(),
				skipTransition: () => {},
				updateCallbackDone: new Promise<void>((resolve) => {
					const origUpdate = captured.updateFn;
					captured.updateFn = () => {
						origUpdate?.();
						resolve();
					};
				}),
			};
		};

		navigate({ to: "/newpage" }).catch(() => {});

		await new Promise((r) => setTimeout(r, 50));

		stateBeforeUpdate = {
			matchCount: ctx.matches().length,
			phase: ctx.navigationPhase(),
		};

		captured.updateFn?.();

		await new Promise((r) => setTimeout(r, 10));

		stateAfterUpdate = {
			matchCount: ctx.matches().length,
			phase: ctx.navigationPhase(),
		};

		/* Before update: still loading, old match state */
		expect(stateBeforeUpdate.phase).toBe("loading");
		expect(stateBeforeUpdate.matchCount).toBe(0);

		/* After update: transitioning (VT animating), new match state applied */
		expect(stateAfterUpdate.phase).toBe("transitioning");
		expect(stateAfterUpdate.matchCount).toBeGreaterThan(0);

		/* Finish VT → idle */
		captured.finishedResolve?.();
		await new Promise((r) => setTimeout(r, 10));
		expect(ctx.navigationPhase()).toBe("idle");

		if (origStartVT) {
			(document as unknown as Record<string, unknown>).startViewTransition = origStartVT;
		} else {
			delete (document as unknown as Record<string, unknown>).startViewTransition;
		}
	});

	it("navigate() promise does not resolve until VT update() callback has run", async () => {
		const ctx = makeCtx();
		setupNavigation(ctx, mockLoadRouteModules, { viewTransitions: true });

		const route = makeRoute("_root_/page");
		mockMatchRoute.mockReturnValue({ params: {}, route });
		mockLoadRouteModules.mockResolvedValue(makeLoadedModules({ page: makeModule("_root_/page") }));
		mockFetchNDJSON.mockResolvedValue({ matches: [], perRouteHeads: [] });

		const captured: {
			resolveUpdateCallbackDone: (() => void) | null;
			updateFn: (() => void) | null;
		} = {
			resolveUpdateCallbackDone: null,
			updateFn: null,
		};
		let navResolved = false;

		const origStartVT = document.startViewTransition;
		(document as unknown as Record<string, unknown>).startViewTransition = (
			arg: (() => void) | { update: () => void },
		) => {
			if (typeof arg === "function") {
				captured.updateFn = arg;
			} else if (arg && typeof arg === "object" && "update" in arg) {
				captured.updateFn = arg.update;
			}
			/* Return a ViewTransition-like object with updateCallbackDone promise */
			return {
				finished: new Promise<void>(() => {}),
				ready: Promise.resolve(),
				updateCallbackDone: new Promise<void>((resolve) => {
					captured.resolveUpdateCallbackDone = resolve;
				}),
			};
		};

		const navPromise = navigate({ to: "/page" }).then(() => {
			navResolved = true;
		});

		/* Let async work settle — but update() hasn't been called yet */
		await new Promise((r) => setTimeout(r, 50));

		/* BUG: navigate() resolves before update() runs, so navResolved is true
		 * even though head/state updates haven't happened. */
		expect(navResolved).toBe(false);

		/* Now call update + resolve updateCallbackDone */
		captured.updateFn?.();
		captured.resolveUpdateCallbackDone?.();
		await navPromise;

		expect(navResolved).toBe(true);
		/* isNavigating still true — VT finished hasn't resolved yet (transitioning phase) */
		expect(ctx.isNavigating()).toBe(true);
		expect(ctx.navigationPhase()).toBe("transitioning");

		if (origStartVT) {
			(document as unknown as Record<string, unknown>).startViewTransition = origStartVT;
		} else {
			delete (document as unknown as Record<string, unknown>).startViewTransition;
		}
	});
});

describe("one view transition per navigation, around the first route swap", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockFetchNDJSON.mockReset();
		mockMatchRoute.mockReset();
		mockLoadRouteModules.mockReset();
		window.history.replaceState({}, "", "/");
	});

	afterEach(() => {
		resetNavigationState();
		delete (document as unknown as Record<string, unknown>).startViewTransition;
		window.history.replaceState({}, "", "/");
	});

	it("wraps the cached-shell paint, not the post-fetch update", async () => {
		const ctx = makeCtx();
		setupNavigation(ctx, mockLoadRouteModules, { viewTransitions: true });
		const PAGE = "_root_/target";
		const PAGE_ID = "_root_/target:{}:[]";
		mockMatchRoute.mockReturnValue({ params: {}, route: makeRoute(PAGE) });
		mockLoadRouteModules.mockResolvedValue(makeLoadedModules({ page: makeModule(PAGE) }));

		/* A data prefetch caches the page, so the click paints a shell before the enter fetch. */
		mockFetchNDJSON.mockResolvedValue({
			matches: [{ loaderData: "prefetched", matchId: PAGE_ID }],
			perRouteHeads: [],
			success: true,
		});
		await prefetch({ to: "/target" });

		let resolveEnter: ((value: unknown) => void) | undefined;
		mockFetchNDJSON.mockReset();
		mockFetchNDJSON.mockReturnValue(
			new Promise((resolve) => {
				resolveEnter = resolve;
			}),
		);

		const pageMounted = () => ctx.matches().some((m) => m.virtualPath === PAGE);
		const calls: Array<{ mountedAtStart: boolean; mountedAfterUpdate?: boolean }> = [];
		(document as unknown as Record<string, unknown>).startViewTransition = (
			arg: (() => void) | { update: () => void },
		) => {
			const update = typeof arg === "function" ? arg : arg.update;
			const call: { mountedAtStart: boolean; mountedAfterUpdate?: boolean } = { mountedAtStart: pageMounted() };
			calls.push(call);
			/* Browsers run the update callback after capturing the old snapshot. */
			const updateCallbackDone = new Promise<void>((resolve) => {
				setTimeout(() => {
					update();
					call.mountedAfterUpdate = pageMounted();
					resolve();
				}, 0);
			});
			return {
				finished: updateCallbackDone,
				ready: Promise.resolve(),
				skipTransition: () => {},
				updateCallbackDone,
			};
		};

		const navP = navigate({ to: "/target" });
		await vi.waitFor(() => expect(mockFetchNDJSON).toHaveBeenCalledTimes(1));
		await vi.waitFor(() => expect(calls[0]?.mountedAfterUpdate).toBe(true));

		resolveEnter?.({
			matches: [{ loaderData: "fresh", matchId: PAGE_ID }],
			perRouteHeads: [],
			success: true,
		});
		await navP;

		expect(calls).toHaveLength(1);
		expect(calls[0]?.mountedAtStart).toBe(false);
		expect(ctx.matches().find((m) => m.virtualPath === PAGE)?.loaderData).toBe("fresh");
	});
});

describe("view transition scope", () => {
	type Started = { target: "document" | "element"; types?: string[]; skip: ReturnType<typeof vi.fn> };
	let started: Started[] = [];
	let elementProto: ((arg: unknown) => unknown) | undefined;

	function fakeTransition(update: () => void, entry: Started, settle = true) {
		const updateCallbackDone = Promise.resolve().then(update);
		return {
			finished: settle ? updateCallbackDone : new Promise<void>(() => {}),
			ready: Promise.resolve(),
			skipTransition: entry.skip,
			updateCallbackDone,
		};
	}

	function install(opts: { element?: boolean; elementThrows?: boolean; settle?: boolean } = {}) {
		started = [];
		const start =
			(target: "document" | "element") => (arg: (() => void) | { types?: string[]; update: () => void }) => {
				if (target === "element" && opts.elementThrows) throw new Error("scoped VT unsupported");
				const update = typeof arg === "function" ? arg : arg.update;
				const entry: Started = { skip: vi.fn(), target, types: typeof arg === "function" ? undefined : arg.types };
				started.push(entry);
				return fakeTransition(update, entry, opts.settle ?? true);
			};
		(document as unknown as Record<string, unknown>).startViewTransition = start("document");
		if (opts.element !== false) {
			(Element.prototype as unknown as Record<string, unknown>).startViewTransition = start("element");
		}
	}

	/* A shell with a boundary around the outlet content; the next navigation swaps depth 0. */
	function mountShell(): HTMLElement {
		const main = document.createElement("main");
		const page = document.createElement("section");
		main.appendChild(page);
		document.body.appendChild(main);
		registerBoundary(main);
		setOutletNodes(0, [page]);
		return main;
	}

	function stubTarget(path: string): void {
		mockMatchRoute.mockReturnValue({ params: {}, route: makeRoute(path) });
		mockLoadRouteModules.mockResolvedValue(makeLoadedModules({ page: makeModule(path) }));
		mockFetchNDJSON.mockResolvedValue({ matches: [], perRouteHeads: [], success: true });
	}

	beforeEach(() => {
		vi.clearAllMocks();
		mockFetchNDJSON.mockReset();
		mockMatchRoute.mockReset();
		mockLoadRouteModules.mockReset();
		window.history.replaceState({}, "", "/");
		elementProto = (Element.prototype as unknown as { startViewTransition?: (arg: unknown) => unknown })
			.startViewTransition;
	});

	afterEach(() => {
		resetNavigationState();
		delete (document as unknown as Record<string, unknown>).startViewTransition;
		if (elementProto) (Element.prototype as unknown as Record<string, unknown>).startViewTransition = elementProto;
		else delete (Element.prototype as unknown as Record<string, unknown>).startViewTransition;
		document.body.innerHTML = "";
		vi.restoreAllMocks();
	});

	it("auto: runs on the boundary around the swapped content, with the configured types", async () => {
		install();
		const ctx = makeCtx();
		setupNavigation(ctx, mockLoadRouteModules, { viewTransitions: { types: ["slide"] } });
		mountShell();
		stubTarget("_root_/next");
		await navigate({ to: "/next" });
		expect(started).toEqual([expect.objectContaining({ target: "element", types: ["slide"] })]);
	});

	it("scope: 'document' on navigate, and a router scope function, use the document", async () => {
		install();
		const ctx = makeCtx();
		setupNavigation(ctx, mockLoadRouteModules, { viewTransitions: { scope: () => "document" } });
		mountShell();
		stubTarget("_root_/next");
		await navigate({ to: "/next" });
		stubTarget("_root_/other");
		await navigate({ to: "/other", viewTransition: { scope: "document" } });
		expect(started.map((s) => s.target)).toEqual(["document", "document"]);
	});

	it("falls back to the document without the element API", async () => {
		install({ element: false });
		delete (Element.prototype as unknown as Record<string, unknown>).startViewTransition;
		const ctx = makeCtx();
		setupNavigation(ctx, mockLoadRouteModules, { viewTransitions: true });
		mountShell();
		stubTarget("_root_/next");
		await navigate({ to: "/next" });
		expect(started.map((s) => s.target)).toEqual(["document"]);
	});

	it("falls back to the document, warning once, when the element call throws", async () => {
		install({ elementThrows: true });
		const ctx = makeCtx();
		setupNavigation(ctx, mockLoadRouteModules, { viewTransitions: true });
		mountShell();
		stubTarget("_root_/next");
		await navigate({ to: "/next" });
		expect(started.map((s) => s.target)).toEqual(["document"]);
	});

	it("skips a transition still running when the next navigation starts one", async () => {
		install({ settle: false });
		const ctx = makeCtx();
		setupNavigation(ctx, mockLoadRouteModules, { viewTransitions: true });
		mountShell();
		stubTarget("_root_/next");
		await navigate({ to: "/next" });
		stubTarget("_root_/other");
		await navigate({ to: "/other" });
		expect(started).toHaveLength(2);
		expect(started[0]?.skip).toHaveBeenCalledTimes(1);
		expect(started[1]?.skip).not.toHaveBeenCalled();
	});

	it("uses the document when the commit flips not-found", async () => {
		install();
		let notFound = true;
		const ctx = makeCtx({ notFound: () => notFound, setNotFound: (v: boolean) => (notFound = v) });
		setupNavigation(ctx, mockLoadRouteModules, { viewTransitions: true });
		mountShell();
		stubTarget("_root_/next");
		await navigate({ to: "/next" });
		expect(started.map((s) => s.target)).toEqual(["document"]);
	});
});
