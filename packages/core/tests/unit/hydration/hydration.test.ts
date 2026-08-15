import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMatchCache, createPrefetchCache } from "../../../src/caches/index.ts";
import type { LoadedRouteModules } from "../../../src/navigation/types.ts";
import type { FlareProviderContext } from "../../../src/outlet/types.ts";
import { BUILDER_MARKER } from "../../../src/route-builder/types.ts";
import type { TreeNode } from "../../../src/router-primitives/types.ts";

/* Mock router-primitives and head-client */
vi.mock("../../../src/router-primitives", async (importOriginal) => {
	const original = await importOriginal<typeof import("../../../src/router-primitives")>();
	return { ...original, matchRoute: vi.fn() };
});

vi.mock("../../../src/head-client", () => ({
	applyPerRouteHeads: vi.fn(),
	initRouteHierarchy: vi.fn(),
}));

import { applyPerRouteHeads, initRouteHierarchy } from "../../../src/head-client/index.ts";
import {
	buildInitialMatches,
	buildMatches,
	extractRootBoundaries,
	hydrateHeadState,
	loadRouteModules,
	populateMatchCache,
} from "../../../src/hydration/index.ts";
import { matchRoute } from "../../../src/router-primitives/index.ts";

const mockMatchRoute = matchRoute as ReturnType<typeof vi.fn>;
const mockApplyPerRouteHeads = applyPerRouteHeads as ReturnType<typeof vi.fn>;
const mockInitRouteHierarchy = initRouteHierarchy as ReturnType<typeof vi.fn>;

function makeFakeTree(): TreeNode {
	return { s: {} };
}

function makeCtx(overrides?: Partial<FlareProviderContext>): FlareProviderContext {
	let matches: FlareProviderContext["matches"] extends () => infer R ? R : never = [];
	let params: Record<string, string | string[]> = {};

	return {
		hydrated: () => false,
		intercepted: () => null,
		invalidate: vi.fn(),
		isNavigating: () => false,
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
		navigationPhase: () => "idle" as const,
		notFound: () => false,
		params: () => params,
		prefetch: vi.fn(() => Promise.resolve()),
		prefetchCache: createPrefetchCache(),
		resolvers: new Map(),
		routeTree: makeFakeTree(),
		search: () => ({}),
		setHydrated: vi.fn(),
		setIntercepted: vi.fn(),
		setMatches: (m) => {
			matches = m;
		},
		setNavigationPhase: vi.fn(),
		setNotFound: vi.fn(),
		setParams: (p) => {
			params = p;
		},
		setSearch: vi.fn(),
		setViewTransition: vi.fn(),
		viewTransition: () => null,
		...overrides,
	};
}

describe("loadRouteModules", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockMatchRoute.mockReset();
	});

	it("no match → returns null", async () => {
		mockMatchRoute.mockReturnValue(null);

		const result = await loadRouteModules("/nonexistent", makeFakeTree(), {});

		expect(result).toBeNull();
	});

	it("match → loads page module", async () => {
		const pageComponent = {
			_type: "render",
			render: () => null,
			variablePath: "",
			virtualPath: "_root_/about",
		};

		mockMatchRoute.mockReturnValue({
			params: {},
			route: {
				e: "",
				o: {},
				p: () => Promise.resolve({ default: pageComponent }),
				t: "r",
				v: "",
				x: "_root_/about",
			},
		});

		const result = await loadRouteModules("/about", makeFakeTree(), {});

		expect(result).not.toBeNull();
		expect(result?.page.virtualPath).toBe("_root_/about");
		expect(result?.page.variablePath).toBe("");
		expect(result?.params).toEqual({});
	});

	it("match → loads layouts in parallel", async () => {
		const rootLayout = {
			_type: "layout",
			render: () => null,
			variablePath: "",
			virtualPath: "_root_",
		};
		const pageComponent = {
			_type: "render",
			render: () => null,
			variablePath: "",
			virtualPath: "_root_/about",
		};

		mockMatchRoute.mockReturnValue({
			params: { id: "42" },
			route: {
				e: "",
				o: {},
				p: () => Promise.resolve({ default: pageComponent }),
				t: "r",
				v: "",
				x: "_root_/about",
			},
		});

		const layouts: Record<string, () => Promise<{ default: unknown }>> = {
			_root_: () => Promise.resolve({ default: rootLayout }),
		};

		const result = await loadRouteModules("/about", makeFakeTree(), layouts);

		expect(result).not.toBeNull();
		expect(result?.layouts).toHaveLength(1);
		expect(result?.layouts[0]?.virtualPath).toBe("_root_");
		expect(result?.layouts[0]?.variablePath).toBe("");
		expect(result?.page.virtualPath).toBe("_root_/about");
		expect(result?.page.variablePath).toBe("");
		expect(result?.params).toEqual({ id: "42" });
	});

	it("passes caseSensitive=true to matchRoute", async () => {
		mockMatchRoute.mockReturnValue(null);

		await loadRouteModules("/About", makeFakeTree(), {}, true);

		expect(mockMatchRoute).toHaveBeenCalledWith(expect.anything(), "/About", true, undefined);
	});

	it("passes caseSensitive=false to matchRoute by default", async () => {
		mockMatchRoute.mockReturnValue(null);

		await loadRouteModules("/about", makeFakeTree(), {});

		expect(mockMatchRoute).toHaveBeenCalledWith(expect.anything(), "/about", undefined, undefined);
	});

	it("missing layout loader → skipped", async () => {
		const pageComponent = {
			_type: "render",
			render: () => null,
			variablePath: "",
			virtualPath: "_root_/about",
		};

		mockMatchRoute.mockReturnValue({
			params: {},
			route: {
				e: "",
				o: {},
				p: () => Promise.resolve({ default: pageComponent }),
				t: "r",
				v: "",
				x: "_root_/about",
			},
		});

		/* No layout loader provided */
		const result = await loadRouteModules("/about", makeFakeTree(), {});

		expect(result).not.toBeNull();
		expect(result?.layouts).toHaveLength(0);
	});
});

describe("buildMatches", () => {
	it("combines modules with cached loaderData", () => {
		const ctx = makeCtx();

		/* Pre-populate cache */
		ctx.matchCache.set({
			data: "cached-data",
			invalid: false,
			matchId: "_root_/about:{}:[]",
			updatedAt: Date.now(),
		});

		const modules = {
			layouts: [],
			page: {
				_type: "render" as const,
				render: () => null,
				variablePath: "",
				virtualPath: "_root_/about",
			},
			params: {},
		};

		buildMatches(ctx, modules);

		const matches = ctx.matches();
		expect(matches).toHaveLength(1);
		expect(matches[0]?.loaderData).toBe("cached-data");
		expect(matches[0]?.virtualPath).toBe("_root_/about");
	});

	it("layouts ordered before page", () => {
		const ctx = makeCtx();

		const modules = {
			layouts: [{ _type: "layout" as const, render: () => null, variablePath: "", virtualPath: "_root_" }],
			page: {
				_type: "render" as const,
				render: () => null,
				variablePath: "",
				virtualPath: "_root_/about",
			},
			params: {},
		};

		buildMatches(ctx, modules);

		const matches = ctx.matches();
		expect(matches).toHaveLength(2);
		expect(matches[0]?.virtualPath).toBe("_root_");
		expect(matches[1]?.virtualPath).toBe("_root_/about");
	});

	it("missing cache entry → loaderData undefined", () => {
		const ctx = makeCtx();

		const modules = {
			layouts: [],
			page: {
				_type: "render" as const,
				render: () => null,
				variablePath: "",
				virtualPath: "_root_/about",
			},
			params: {},
		};

		buildMatches(ctx, modules);

		expect(ctx.matches()[0]?.loaderData).toBeUndefined();
	});

	it("sets params on context", () => {
		const ctx = makeCtx();

		const modules = {
			layouts: [],
			page: {
				_type: "render" as const,
				render: () => null,
				variablePath: "",
				virtualPath: "_root_/about",
			},
			params: { id: "42" },
		};

		buildMatches(ctx, modules);

		expect(ctx.params()).toEqual({ id: "42" });
	});
});

describe("populateMatchCache", () => {
	it("adds SSR matches to cache as fresh", () => {
		const matchCache = createMatchCache();

		populateMatchCache(matchCache, [
			{ loaderData: "data1", matchId: "m1" },
			{ loaderData: "data2", matchId: "m2", preloaderContext: { foo: "bar" } },
		]);

		expect(matchCache.get("m1")?.data).toBe("data1");
		expect(matchCache.get("m1")?.invalid).toBe(false);
		expect(matchCache.get("m2")?.data).toBe("data2");
		expect(matchCache.get("m2")?.preloaderContext).toEqual({ foo: "bar" });
	});
});

describe("hydrateHeadState", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("no ph → no head init", () => {
		hydrateHeadState({});

		expect(mockInitRouteHierarchy).not.toHaveBeenCalled();
		expect(mockApplyPerRouteHeads).not.toHaveBeenCalled();
	});

	it("ph present → initRouteHierarchy + applyPerRouteHeads called", () => {
		hydrateHeadState({
			ph: [
				{ head: { title: "Home" }, matchId: "_root_/home:" },
				{ head: { title: "Layout" }, matchId: "_root_:" },
			],
		});

		expect(mockInitRouteHierarchy).toHaveBeenCalledWith(["_root_/home:", "_root_:"], "Home");
		expect(mockApplyPerRouteHeads).toHaveBeenCalledTimes(1);
	});
});

/* ── buildMatches unauthenticatedRender parity with buildInitialMatches ─── */

describe("buildMatches — unauthenticatedRender", () => {
	it("preserves unauthenticatedRender from route module (parity with buildInitialMatches)", () => {
		const ctx = makeCtx();
		const unauthenticatedRender = (_props: unknown) => null;

		const modules = {
			layouts: [],
			page: {
				_type: "render" as const,
				render: () => null,
				unauthenticatedRender,
				variablePath: "",
				virtualPath: "_root_/protected",
			},
			params: {},
		};

		buildMatches(ctx, modules as unknown as LoadedRouteModules);

		/* BUG: buildMatches omits unauthenticatedRender, so this field is undefined
		 * after SPA navigation despite being present in the route module. */
		expect(ctx.matches()[0]?.unauthenticatedRender).toBe(unauthenticatedRender);
	});

	it("filters builder-marked unauthenticatedRender (same as other boundaries)", () => {
		const ctx = makeCtx();
		const builderFn = Object.assign((_cb: unknown) => ({}), { [BUILDER_MARKER]: true });

		const modules = {
			layouts: [],
			page: {
				_type: "render" as const,
				render: () => null,
				unauthenticatedRender: builderFn,
				variablePath: "",
				virtualPath: "_root_/protected",
			},
			params: {},
		};

		buildMatches(ctx, modules as unknown as LoadedRouteModules);
		expect(ctx.matches()[0]?.unauthenticatedRender).toBeUndefined();
	});
});

/* ── isRenderFn builder method filtering ───────────────────────────── */

describe("buildMatches — isRenderFn filtering", () => {
	it("builder method (has BUILDER_MARKER) filtered out → errorRender undefined", () => {
		const ctx = makeCtx();
		const builderFn = Object.assign((_cb: unknown) => ({}), { [BUILDER_MARKER]: true });

		const modules = {
			layouts: [],
			page: {
				_type: "render" as const,
				errorRender: builderFn,
				render: () => null,
				variablePath: "",
				virtualPath: "_root_/about",
			},
			params: {},
		};

		buildMatches(ctx, modules as unknown as LoadedRouteModules);
		expect(ctx.matches()[0]?.errorRender).toBeUndefined();
	});

	it("real render fn (no BUILDER_MARKER, length <= 1) → preserved", () => {
		const ctx = makeCtx();
		const realRenderFn = (_props: unknown) => null;

		const modules = {
			layouts: [],
			page: {
				_type: "render" as const,
				errorRender: realRenderFn,
				render: () => null,
				variablePath: "",
				virtualPath: "_root_/about",
			},
			params: {},
		};

		buildMatches(ctx, modules as unknown as LoadedRouteModules);
		expect(ctx.matches()[0]?.errorRender).toBe(realRenderFn);
	});

	it("non-function errorRender → filtered out", () => {
		const ctx = makeCtx();

		const modules = {
			layouts: [],
			page: {
				_type: "render" as const,
				errorRender: "not-a-function",
				render: () => null,
				variablePath: "",
				virtualPath: "_root_/about",
			},
			params: {},
		};

		buildMatches(ctx, modules as unknown as LoadedRouteModules);
		expect(ctx.matches()[0]?.errorRender).toBeUndefined();
	});
});

/* ── Cached error in client match ──────────────────────────────────── */

describe("buildMatches — cached error", () => {
	it("cached entry with error → error included in client match", () => {
		const ctx = makeCtx();
		const err = new Error("loader failed");

		ctx.matchCache.set({
			data: undefined,
			error: err,
			invalid: false,
			matchId: "_root_/about:{}:[]",
			updatedAt: Date.now(),
		});

		const modules = {
			layouts: [],
			page: {
				_type: "render" as const,
				render: () => null,
				variablePath: "",
				virtualPath: "_root_/about",
			},
			params: {},
		};

		buildMatches(ctx, modules);
		expect(ctx.matches()[0]?.error).toBe(err);
	});

	it("cached entry with preloaderContext → included in client match", () => {
		const ctx = makeCtx();

		ctx.matchCache.set({
			data: "data",
			invalid: false,
			matchId: "_root_/about:{}:[]",
			preloaderContext: { user: { id: "1" } },
			updatedAt: Date.now(),
		});

		const modules = {
			layouts: [],
			page: {
				_type: "render" as const,
				render: () => null,
				variablePath: "",
				virtualPath: "_root_/about",
			},
			params: {},
		};

		buildMatches(ctx, modules);
		expect(ctx.matches()[0]?.preloaderContext).toEqual({ user: { id: "1" } });
	});
});

/* ── extractRootBoundaries ─────────────────────────────────────────── */

describe("extractRootBoundaries", () => {
	it("undefined → empty GlobalBoundaries", () => {
		const result = extractRootBoundaries(undefined);
		expect(result).toEqual({});
	});

	it("root with all 4 real render fns → all extracted", () => {
		const errorRender = (_props: unknown) => null;
		const notFoundRender = (_props: unknown) => null;
		const unauthenticatedRender = (_props: unknown) => null;
		const unauthorizedRender = (_props: unknown) => null;

		const root = {
			_type: "root-layout" as const,
			errorRender,
			notFoundRender,
			render: () => null,
			unauthenticatedRender,
			unauthorizedRender,
			variablePath: "",
			virtualPath: "_root_",
		};

		const result = extractRootBoundaries(root);
		expect(result.error).toBe(errorRender);
		expect(result.notFound).toBe(notFoundRender);
		expect(result.unauthenticated).toBe(unauthenticatedRender);
		expect(result.unauthorized).toBe(unauthorizedRender);
	});

	it("root with builder-marked fns → filtered out", () => {
		const builderFn = Object.assign((_cb: unknown) => ({}), { [BUILDER_MARKER]: true });

		const root = {
			_type: "root-layout" as const,
			errorRender: builderFn,
			notFoundRender: builderFn,
			render: () => null,
			unauthenticatedRender: builderFn,
			unauthorizedRender: builderFn,
			variablePath: "",
			virtualPath: "_root_",
		};

		const result = extractRootBoundaries(root as unknown as import("../../../src/navigation/types").LoadedRouteModule);
		expect(result.error).toBeUndefined();
		expect(result.notFound).toBeUndefined();
		expect(result.unauthenticated).toBeUndefined();
		expect(result.unauthorized).toBeUndefined();
	});

	it("root with partial boundaries → only present ones", () => {
		const errorRender = (_props: unknown) => null;

		const root = {
			_type: "root-layout" as const,
			errorRender,
			render: () => null,
			variablePath: "",
			virtualPath: "_root_",
		};

		const result = extractRootBoundaries(root);
		expect(result.error).toBe(errorRender);
		expect(result.notFound).toBeUndefined();
		expect(result.unauthenticated).toBeUndefined();
		expect(result.unauthorized).toBeUndefined();
	});

	it("non-function values → ignored", () => {
		const root = {
			_type: "root-layout" as const,
			errorRender: "not-a-function",
			notFoundRender: 42,
			render: () => null,
			variablePath: "",
			virtualPath: "_root_",
		};

		const result = extractRootBoundaries(root as unknown as import("../../../src/navigation/types").LoadedRouteModule);
		expect(result.error).toBeUndefined();
		expect(result.notFound).toBeUndefined();
	});
});

/* ── buildInitialMatches ───────────────────────────────────────────── */

describe("buildInitialMatches", () => {
	it("maps modules with cached data → loaderData resolved", () => {
		const matchCache = createMatchCache();
		matchCache.set({
			data: "cached-data",
			invalid: false,
			matchId: "_root_/about:{}:[]",
			updatedAt: Date.now(),
		});

		const modules = [
			{
				_type: "render" as const,
				render: () => null,
				variablePath: "",
				virtualPath: "_root_/about",
			},
		];

		const result = buildInitialMatches(modules, matchCache, {}, {});
		expect(result).toHaveLength(1);
		expect(result[0]?.loaderData).toBe("cached-data");
		expect(result[0]?.virtualPath).toBe("_root_/about");
	});

	it("errorMap populates match.error by virtualPath", () => {
		const matchCache = createMatchCache();
		const err = new Error("loader failed");
		const errorMap = new Map<string, Error>([["_root_/about", err]]);

		const modules = [
			{
				_type: "render" as const,
				render: () => null,
				variablePath: "",
				virtualPath: "_root_/about",
			},
		];

		const result = buildInitialMatches(modules, matchCache, {}, {}, errorMap);
		expect(result[0]?.error).toBe(err);
	});

	it("builder-marked boundary fns filtered out", () => {
		const matchCache = createMatchCache();
		const builderFn = Object.assign((_cb: unknown) => ({}), { [BUILDER_MARKER]: true });

		const modules = [
			{
				_type: "render" as const,
				errorRender: builderFn,
				notFoundRender: builderFn,
				render: () => null,
				unauthenticatedRender: builderFn,
				unauthorizedRender: builderFn,
				variablePath: "",
				virtualPath: "_root_/about",
			},
		];

		const result = buildInitialMatches(
			modules as unknown as import("../../../src/navigation/types").LoadedRouteModule[],
			matchCache,
			{},
			{},
		);
		expect(result[0]?.errorRender).toBeUndefined();
		expect(result[0]?.notFoundRender).toBeUndefined();
		expect(result[0]?.unauthenticatedRender).toBeUndefined();
		expect(result[0]?.unauthorizedRender).toBeUndefined();
	});

	it("missing cache → loaderData undefined", () => {
		const matchCache = createMatchCache();

		const modules = [
			{
				_type: "render" as const,
				render: () => null,
				variablePath: "",
				virtualPath: "_root_/about",
			},
		];

		const result = buildInitialMatches(modules, matchCache, {}, {});
		expect(result[0]?.loaderData).toBeUndefined();
	});

	it("preloaderContext from cache included", () => {
		const matchCache = createMatchCache();
		matchCache.set({
			data: "data",
			invalid: false,
			matchId: "_root_/about:{}:[]",
			preloaderContext: { user: { id: "1" } },
			updatedAt: Date.now(),
		});

		const modules = [
			{
				_type: "render" as const,
				render: () => null,
				variablePath: "",
				virtualPath: "_root_/about",
			},
		];

		const result = buildInitialMatches(modules, matchCache, {}, {});
		expect(result[0]?.preloaderContext).toEqual({ user: { id: "1" } });
	});

	it("loaderDeps affect matchId computation", () => {
		const matchCache = createMatchCache();
		/* Cache entry with deps-aware matchId */
		matchCache.set({
			data: "deps-data",
			invalid: false,
			matchId: '_root_/search:{}:["foo"]',
			updatedAt: Date.now(),
		});

		const modules = [
			{
				_type: "render" as const,
				effectsConfig: {
					loaderDeps: ({ search }: { search: Record<string, string | string[]> }) => [search.q],
				},
				render: () => null,
				variablePath: "",
				virtualPath: "_root_/search",
			},
		];

		const result = buildInitialMatches(modules, matchCache, {}, { q: "foo" });
		expect(result[0]?.loaderData).toBe("deps-data");
	});

	it("carries variablePath from module to client match", () => {
		const matchCache = createMatchCache();

		const modules = [
			{
				_type: "layout" as const,
				render: () => null,
				variablePath: "",
				virtualPath: "_root_",
			},
			{
				_type: "render" as const,
				render: () => null,
				variablePath: "/products/[id]",
				virtualPath: "_root_/products/[id]",
			},
		];

		const result = buildInitialMatches(modules, matchCache, { id: "42" }, {});
		expect(result[0]?.variablePath).toBe("");
		expect(result[1]?.variablePath).toBe("/products/[id]");
	});
});
