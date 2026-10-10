import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMatchCache, createPrefetchCache } from "../../../src/caches/index.ts";
import { BuildMismatchError } from "../../../src/errors/index.ts";
import type { LoadedRouteModules } from "../../../src/navigation/types.ts";
import type { FlareProviderContext } from "../../../src/outlet/types.ts";
import type { TreeNode } from "../../../src/router-primitives/types.ts";
import type { SearchParams } from "../../../src/url/index.ts";

vi.mock("../../../src/ndjson-client", () => ({ fetchNDJSON: vi.fn() }));
vi.mock("../../../src/head-client", () => ({ applyPerRouteHeads: vi.fn() }));
vi.mock("../../../src/navigation/document.ts", () => ({ navigateDocument: vi.fn() }));
vi.mock("../../../src/router-primitives", async (importOriginal) => {
	const original = await importOriginal<typeof import("../../../src/router-primitives")>();
	return { ...original, matchRoute: vi.fn() };
});
vi.mock("../../../src/history", async (importOriginal) => {
	const original = await importOriginal<typeof import("../../../src/history")>();
	return { ...original, restoreScroll: vi.fn(), scrollToTop: vi.fn() };
});

import { navigateDocument } from "../../../src/navigation/document.ts";
import { navigate, resetNavigationState, setupNavigation } from "../../../src/navigation/index.ts";
import { fetchNDJSON } from "../../../src/ndjson-client/index.ts";
import { matchRoute } from "../../../src/router-primitives/index.ts";

const mockFetchNDJSON = fetchNDJSON as ReturnType<typeof vi.fn>;
const mockMatchRoute = matchRoute as ReturnType<typeof vi.fn>;
const mockNavigateDocument = navigateDocument as ReturnType<typeof vi.fn>;

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

	/* setupNavigation hands ctx its navigate/prefetch; these tests call navigate() directly. */
	Object.defineProperty(ctx, "_setNavigate", { value: () => {} });
	Object.defineProperty(ctx, "_setPrefetch", { value: () => {} });

	return ctx;
}

const mockLoadRouteModules =
	vi.fn<(pathname: string, routeTree: unknown, layouts: unknown) => Promise<LoadedRouteModules>>();

/* ── Build skew ──────────────────────────────────────────────────── */

function setup() {
	const ctx = makeCtx();
	const setMatches = vi.spyOn(ctx, "setMatches");
	setupNavigation(ctx, mockLoadRouteModules);
	mockMatchRoute.mockImplementation((_tree: unknown, pathname: string) => ({
		params: {},
		route: makeRoute(`_root_${pathname}`),
	}));
	mockLoadRouteModules.mockResolvedValue(makeLoadedModules());
	mockFetchNDJSON.mockRejectedValue(new BuildMismatchError("new-build"));
	return { ctx, setMatches };
}

describe("navigate — build skew", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockLoadRouteModules.mockReset();
		sessionStorage.clear();
	});

	afterEach(() => {
		resetNavigationState();
		window.history.replaceState({}, "", "/");
	});

	it("loads the target as a full document and renders nothing", async () => {
		const { ctx, setMatches } = setup();

		await expect(navigate({ to: "/pricing" })).resolves.toBeUndefined();

		expect(mockNavigateDocument).toHaveBeenCalledTimes(1);
		expect(new URL(String(mockNavigateDocument.mock.calls[0]?.[0])).pathname).toBe("/pricing");
		expect(setMatches).not.toHaveBeenCalled();
		expect(ctx.isNavigating()).toBe(false);
	});

	it("different targets within the guard window each get a full load", async () => {
		setup();

		await navigate({ to: "/a" });
		window.history.replaceState({}, "", "/");
		await navigate({ to: "/b" });

		expect(mockNavigateDocument.mock.calls.map((c) => new URL(String(c[0])).pathname)).toEqual(["/a", "/b"]);
	});

	it("the same target twice within the guard window surfaces the error instead of looping", async () => {
		setup();

		await navigate({ to: "/same" });
		/* The mocked document load never left the page; start the second attempt from "/" again. */
		window.history.replaceState({}, "", "/");
		await expect(navigate({ to: "/same" })).rejects.toBeInstanceOf(BuildMismatchError);

		expect(mockNavigateDocument).toHaveBeenCalledTimes(1);
	});
});
