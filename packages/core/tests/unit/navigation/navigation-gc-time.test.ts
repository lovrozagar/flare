import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMatchCache, createPrefetchCache } from "../../../src/caches/index.ts";
import type { LoadedRouteModules } from "../../../src/navigation/types.ts";
import { resetNavigationState, setupNavigation } from "../../../src/navigation/index.ts";
import type { FlareProviderContext } from "../../../src/outlet/types.ts";
import type { TreeNode } from "../../../src/router-primitives/types.ts";

vi.mock("../../../src/ndjson-client", () => ({
	fetchNDJSON: vi.fn(),
}));

function makeFakeTree(): TreeNode {
	return { s: {} };
}

function makeCtx(overrides?: Partial<FlareProviderContext>): FlareProviderContext {
	let navigationPhase: import("../../../src/outlet/types").NavigationPhase = "idle";
	const ctx: FlareProviderContext = {
		hydrated: () => true,
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
		matches: () => [],
		navigate: vi.fn(() => Promise.resolve()),
		navigationPhase: () => navigationPhase,
		notFound: () => false,
		params: () => ({}),
		prefetch: vi.fn(() => Promise.resolve()),
		prefetchCache: createPrefetchCache(),
		resolvers: new Map(),
		routeTree: makeFakeTree(),
		search: () => ({}),
		setHydrated: vi.fn(),
		setIntercepted: vi.fn(),
		setMatches: vi.fn(),
		setNavigationPhase: (v) => {
			navigationPhase = v;
		},
		setNotFound: vi.fn(),
		setParams: vi.fn(),
		setSearch: vi.fn(),
		setViewTransition: vi.fn(),
		viewTransition: () => null,
		...overrides,
	};
	return ctx;
}

const mockLoad = vi.fn<(pathname: string, tree: unknown, layouts: unknown) => Promise<LoadedRouteModules>>();

describe("client gcTime / prefetchGcTime", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		resetNavigationState();
	});

	afterEach(() => {
		resetNavigationState();
		vi.useRealTimers();
	});

	it("evicts matchCache entries older than router gcTime", () => {
		const ctx = makeCtx({ routerCacheDefaults: { gcTime: 90_000, prefetchGcTime: 90_000 } });
		setupNavigation(ctx, mockLoad);

		const t0 = Date.now();
		ctx.matchCache.set({ data: "old", invalid: false, matchId: "old", updatedAt: t0 - 120_000 });
		ctx.matchCache.set({ data: "fresh", invalid: false, matchId: "fresh", updatedAt: t0 });

		vi.advanceTimersByTime(60_000);

		expect(ctx.matchCache.has("old")).toBe(false);
		expect(ctx.matchCache.has("fresh")).toBe(true);
	});

	it("evicts prefetchCache entries older than prefetchGcTime", () => {
		const ctx = makeCtx({ routerCacheDefaults: { gcTime: 5 * 60_000, prefetchGcTime: 90_000 } });
		setupNavigation(ctx, mockLoad);

		const t0 = Date.now();
		ctx.prefetchCache.set("/stale", t0 - 120_000);
		ctx.prefetchCache.set("/fresh", t0);

		vi.advanceTimersByTime(60_000);

		expect(ctx.prefetchCache.has("/stale")).toBe(false);
		expect(ctx.prefetchCache.has("/fresh")).toBe(true);
	});
});
