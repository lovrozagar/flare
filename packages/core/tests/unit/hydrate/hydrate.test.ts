import { beforeEach, describe, expect, it, vi } from "vitest";

/* ── Mock all heavy dependencies ──────────────────────────────────────── */

vi.mock("virtual:flare-is-dev", () => ({ default: false }));

vi.mock("@solidjs/web", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@solidjs/web")>();
	return {
		...actual,
		hydrate: vi.fn((fn: () => unknown) => {
			fn();
		}),
		render: vi.fn(),
	};
});

vi.mock("../../../src/caches", () => ({
	createMatchCache: vi.fn(() => ({
		get: vi.fn(),
		set: vi.fn(),
	})),
	createPrefetchCache: vi.fn(() => new Map()),
}));

vi.mock("../../../src/direction", () => ({
	DirectionProvider: vi.fn((props: { children: unknown }) => props.children),
}));

vi.mock("../../../src/history", () => ({
	replaceHistoryState: vi.fn(),
}));

vi.mock("../../../src/hydration", () => ({
	buildInitialMatches: vi.fn(() => []),
	extractRootBoundaries: vi.fn(() => ({})),
	hydrateHeadState: vi.fn(),
	loadRouteModules: vi.fn(),
	populateMatchCache: vi.fn(),
}));

vi.mock("../../../src/navigation", () => ({
	setupNavigation: vi.fn(),
}));

vi.mock("../../../src/outlet", () => ({
	FlareProvider: vi.fn((props: { children: unknown; onContextReady?: (ctx: unknown) => void }) => {
		if (props.onContextReady) {
			props.onContextReady({ fakeCtx: true });
		}
		return props.children;
	}),
	Outlet: vi.fn(() => null),
	useRouter: vi.fn(() => ({})),
}));

vi.mock("../../../src/broadcast/provider", () => ({
	BroadcastProvider: vi.fn((props: { children: unknown }) => props.children),
}));

vi.mock("../../../src/theme", () => ({
	ThemeProvider: vi.fn((props: { children: unknown }) => props.children),
}));

vi.mock("../../../src/components/ssr-context.tsx", () => ({
	SSRContextProvider: vi.fn((props: { children: unknown }) => props.children),
}));

vi.mock("../../../src/state-parser", () => ({
	hydrateFlareState: vi.fn(() => ({
		matches: [],
		params: {},
		pathname: "/",
		resolvers: new Map(),
		search: {},
	})),
	installDeferredResolver: vi.fn(),
	parseFlareState: vi.fn(),
}));

import { render, hydrate as solidHydrate } from "@solidjs/web";
import { createMatchCache } from "../../../src/caches/index.ts";
import { replaceHistoryState } from "../../../src/history/index.ts";
import { hydrate } from "../../../src/hydrate/index.tsx";
import {
	buildInitialMatches,
	extractRootBoundaries,
	hydrateHeadState,
	loadRouteModules,
	populateMatchCache,
} from "../../../src/hydration/index.ts";
import { setupNavigation } from "../../../src/navigation/index.ts";
import { hydrateFlareState, installDeferredResolver, parseFlareState } from "../../../src/state-parser/index.ts";

const mockParseFlareState = parseFlareState as ReturnType<typeof vi.fn>;
const mockHydrateFlareState = hydrateFlareState as ReturnType<typeof vi.fn>;
const mockInstallDeferredResolver = installDeferredResolver as ReturnType<typeof vi.fn>;
const mockLoadRouteModules = loadRouteModules as ReturnType<typeof vi.fn>;
const mockBuildInitialMatches = buildInitialMatches as ReturnType<typeof vi.fn>;
const mockExtractRootBoundaries = extractRootBoundaries as ReturnType<typeof vi.fn>;
const mockPopulateMatchCache = populateMatchCache as ReturnType<typeof vi.fn>;
const mockHydrateHeadState = hydrateHeadState as ReturnType<typeof vi.fn>;
const mockReplaceHistoryState = replaceHistoryState as ReturnType<typeof vi.fn>;
const mockSetupNavigation = setupNavigation as ReturnType<typeof vi.fn>;
const mockSolidHydrate = solidHydrate as ReturnType<typeof vi.fn>;
const mockRender = render as ReturnType<typeof vi.fn>;
const mockCreateMatchCache = createMatchCache as ReturnType<typeof vi.fn>;

function makeRouterConfig(overrides?: Record<string, unknown>) {
	return {
		basePath: undefined,
		cache: undefined,
		caseSensitive: false,
		direction: undefined,
		layouts: {},
		notFoundMode: "fuzzy",
		routeCacheMaxEntries: 100,
		routeTree: { s: {} },
		scrollRestoration: undefined,
		scrollRestorationBehavior: undefined,
		scrollRestorationMaxEntries: undefined,
		theme: undefined,
		viewTransitions: false,
		...overrides,
	};
}

function makeFlareState(overrides?: Record<string, unknown>) {
	return {
		c: {},
		e: undefined,
		m: [],
		p: "/",
		ph: undefined,
		r: {},
		s: {},
		...overrides,
	};
}

beforeEach(() => {
	vi.clearAllMocks();

	/* Reset self.flare */
	(globalThis as Record<string, unknown>).self = { flare: undefined };

	/* Provide minimal DOM */
	const appEl = { id: "app" };
	(globalThis as Record<string, unknown>).document = {
		body: { appendChild: vi.fn() },
		createElement: vi.fn(() => ({ id: "" })),
		documentElement: { setAttribute: vi.fn() },
		getElementById: vi.fn((id: string) => (id === "app" ? appEl : null)),
	};
	(globalThis as Record<string, unknown>).window = {
		location: {
			hash: "",
			href: "http://localhost/",
			pathname: "/",
			search: "",
		},
	};

	/* Default mock returns */
	const cache = { get: vi.fn(), set: vi.fn() };
	mockCreateMatchCache.mockReturnValue(cache);

	mockHydrateFlareState.mockReturnValue({
		matches: [],
		params: {},
		pathname: "/",
		resolvers: new Map(),
		search: {},
	});
});

/* ── 1.1 State parsing & validation ──────────────────────────────────── */

describe("state parsing & validation", () => {
	it("missing self.flare → returns early (no crash)", async () => {
		mockParseFlareState.mockReturnValue(null);
		await hydrate(makeRouterConfig() as never);
		expect(mockHydrateFlareState).not.toHaveBeenCalled();
	});

	it("valid self.flare → parseFlareState called with raw value", async () => {
		const raw = makeFlareState();
		(globalThis as Record<string, unknown>).self = { flare: raw };
		mockParseFlareState.mockReturnValue(raw);
		mockLoadRouteModules.mockResolvedValue(null);

		await hydrate(makeRouterConfig() as never);
		expect(mockParseFlareState).toHaveBeenCalledWith(raw);
	});

	it("hydrateFlareState called with parsed state", async () => {
		const raw = makeFlareState({ p: "/about" });
		(globalThis as Record<string, unknown>).self = { flare: raw };
		mockParseFlareState.mockReturnValue(raw);
		mockLoadRouteModules.mockResolvedValue(null);

		await hydrate(makeRouterConfig() as never);
		expect(mockHydrateFlareState).toHaveBeenCalledWith(raw);
	});

	it("installDeferredResolver called with resolvers from state", async () => {
		const resolvers = new Map([["key", { reject: vi.fn(), resolve: vi.fn() }]]);
		const raw = makeFlareState();
		(globalThis as Record<string, unknown>).self = { flare: raw };
		mockParseFlareState.mockReturnValue(raw);
		mockHydrateFlareState.mockReturnValue({
			matches: [],
			params: {},
			pathname: "/",
			resolvers,
			search: {},
		});
		mockLoadRouteModules.mockResolvedValue(null);

		await hydrate(makeRouterConfig() as never);
		expect(mockInstallDeferredResolver).toHaveBeenCalledWith(resolvers);
	});

	it("basePath stripped from pathname for module loading", async () => {
		const raw = makeFlareState({ p: "/app/about" });
		(globalThis as Record<string, unknown>).self = { flare: raw };
		mockParseFlareState.mockReturnValue(raw);
		mockHydrateFlareState.mockReturnValue({
			matches: [],
			params: {},
			pathname: "/app/about",
			resolvers: new Map(),
			search: {},
		});
		mockLoadRouteModules.mockResolvedValue(null);

		await hydrate(makeRouterConfig({ basePath: "/app" }) as never);
		expect(mockLoadRouteModules.mock.calls[0]?.[0]).toBe("/about");
	});
});

/* ── 1.2 Module loading ──────────────────────────────────────────────── */

describe("module loading", () => {
	it("loadRouteModules returns null → no hydration attempted", async () => {
		const raw = makeFlareState();
		(globalThis as Record<string, unknown>).self = { flare: raw };
		mockParseFlareState.mockReturnValue(raw);
		mockLoadRouteModules.mockResolvedValue(null);

		await hydrate(makeRouterConfig() as never);
		expect(mockSolidHydrate).not.toHaveBeenCalled();
		expect(mockSetupNavigation).not.toHaveBeenCalled();
	});

	it("loadRouteModules success → buildInitialMatches called", async () => {
		const raw = makeFlareState();
		(globalThis as Record<string, unknown>).self = { flare: raw };
		mockParseFlareState.mockReturnValue(raw);

		const modules = {
			layouts: [],
			page: { _type: "render", variablePath: "", virtualPath: "_root_/home" },
			params: {},
		};
		mockLoadRouteModules.mockResolvedValue(modules);
		mockBuildInitialMatches.mockReturnValue([]);

		await hydrate(makeRouterConfig() as never);
		expect(mockBuildInitialMatches).toHaveBeenCalled();
	});

	it("async router config (function) resolved before use", async () => {
		const raw = makeFlareState();
		(globalThis as Record<string, unknown>).self = { flare: raw };
		mockParseFlareState.mockReturnValue(raw);
		mockLoadRouteModules.mockResolvedValue(null);

		const config = makeRouterConfig();
		const asyncRouter = () => Promise.resolve(config);

		await hydrate(asyncRouter as never);
		expect(mockParseFlareState).toHaveBeenCalled();
	});

	it("sync router config (object) used directly", async () => {
		const raw = makeFlareState();
		(globalThis as Record<string, unknown>).self = { flare: raw };
		mockParseFlareState.mockReturnValue(raw);
		mockLoadRouteModules.mockResolvedValue(null);

		await hydrate(makeRouterConfig() as never);
		expect(mockLoadRouteModules).toHaveBeenCalled();
	});

	it("error map constructed from per-match errorName", async () => {
		const raw = makeFlareState({
			m: [{ d: null, i: "m1", v: "_root_/about", x: "LoaderError" }],
		});
		(globalThis as Record<string, unknown>).self = { flare: raw };
		mockParseFlareState.mockReturnValue(raw);
		mockHydrateFlareState.mockReturnValue({
			matches: [{ errorName: "LoaderError", loaderData: null, matchId: "m1", virtualPath: "_root_/about" }],
			params: {},
			pathname: "/",
			resolvers: new Map(),
			search: {},
		});

		const modules = {
			layouts: [],
			page: { _type: "render", variablePath: "", virtualPath: "_root_/about" },
			params: {},
		};
		mockLoadRouteModules.mockResolvedValue(modules);
		mockBuildInitialMatches.mockReturnValue([]);

		await hydrate(makeRouterConfig() as never);

		const errorMapArg = mockBuildInitialMatches.mock.calls[0][4];
		expect(errorMapArg).toBeInstanceOf(Map);
		expect(errorMapArg.has("_root_/about")).toBe(true);
		const err = errorMapArg.get("_root_/about");
		expect(err.name).toBe("LoaderError");
		expect(err).toBeInstanceOf(Error);
	});
});

/* ── 1.3 Head state hydration ────────────────────────────────────────── */

describe("head state hydration", () => {
	it("hydrateHeadState called when raw.ph present", async () => {
		const raw = makeFlareState({
			ph: [{ head: { title: "Home" }, matchId: "_root_:" }],
		});
		(globalThis as Record<string, unknown>).self = { flare: raw };
		mockParseFlareState.mockReturnValue(raw);
		mockLoadRouteModules.mockResolvedValue(null);

		await hydrate(makeRouterConfig() as never);
		expect(mockHydrateHeadState).toHaveBeenCalled();
	});

	it("hydrateHeadState NOT called when raw.ph absent", async () => {
		const raw = makeFlareState({ ph: undefined });
		(globalThis as Record<string, unknown>).self = { flare: raw };
		mockParseFlareState.mockReturnValue(raw);
		mockLoadRouteModules.mockResolvedValue(null);

		await hydrate(makeRouterConfig() as never);
		expect(mockHydrateHeadState).not.toHaveBeenCalled();
	});

	it("populateMatchCache called with state matches and ph", async () => {
		const matches = [{ loaderData: "data", matchId: "m1" }];
		const ph = [{ head: { title: "X" }, matchId: "m1" }];
		const raw = makeFlareState({ ph });
		(globalThis as Record<string, unknown>).self = { flare: raw };
		mockParseFlareState.mockReturnValue(raw);
		mockHydrateFlareState.mockReturnValue({
			matches,
			params: {},
			pathname: "/",
			resolvers: new Map(),
			search: {},
		});
		mockLoadRouteModules.mockResolvedValue(null);

		await hydrate(makeRouterConfig() as never);
		expect(mockPopulateMatchCache).toHaveBeenCalledWith(expect.anything(), matches, ph);
	});
});

/* ── 1.4 History & navigation setup ──────────────────────────────────── */

describe("history & navigation setup", () => {
	it("replaceHistoryState called with window.location values", async () => {
		const raw = makeFlareState();
		(globalThis as Record<string, unknown>).self = { flare: raw };
		mockParseFlareState.mockReturnValue(raw);

		const modules = {
			layouts: [],
			page: { _type: "render", variablePath: "", virtualPath: "_root_" },
			params: {},
		};
		mockLoadRouteModules.mockResolvedValue(modules);
		mockBuildInitialMatches.mockReturnValue([]);

		await hydrate(makeRouterConfig() as never);
		expect(mockReplaceHistoryState).toHaveBeenCalledWith(
			"/",
			{},
			"",
			expect.objectContaining({ hash: "", historyIndex: 0 }),
		);
	});

	it("setupNavigation called with provider context", async () => {
		const raw = makeFlareState();
		(globalThis as Record<string, unknown>).self = { flare: raw };
		mockParseFlareState.mockReturnValue(raw);

		const modules = {
			layouts: [],
			page: { _type: "render", variablePath: "", virtualPath: "_root_" },
			params: {},
		};
		mockLoadRouteModules.mockResolvedValue(modules);
		mockBuildInitialMatches.mockReturnValue([]);

		await hydrate(makeRouterConfig() as never);
		expect(mockSetupNavigation).toHaveBeenCalled();
	});

	it("onContextReady callback invoked", async () => {
		const raw = makeFlareState();
		(globalThis as Record<string, unknown>).self = { flare: raw };
		mockParseFlareState.mockReturnValue(raw);

		const modules = {
			layouts: [],
			page: { _type: "render", variablePath: "", virtualPath: "_root_" },
			params: {},
		};
		mockLoadRouteModules.mockResolvedValue(modules);
		mockBuildInitialMatches.mockReturnValue([]);

		const onContextReady = vi.fn();
		await hydrate(makeRouterConfig() as never, { onContextReady });
		expect(onContextReady).toHaveBeenCalledWith(expect.objectContaining({ fakeCtx: true }));
	});

	it("setupNavigation receives notFoundMode from router config", async () => {
		const raw = makeFlareState();
		(globalThis as Record<string, unknown>).self = { flare: raw };
		mockParseFlareState.mockReturnValue(raw);

		const modules = {
			layouts: [],
			page: { _type: "render", variablePath: "", virtualPath: "_root_" },
			params: {},
		};
		mockLoadRouteModules.mockResolvedValue(modules);
		mockBuildInitialMatches.mockReturnValue([]);

		await hydrate(makeRouterConfig({ notFoundMode: "strict" }) as never);
		const navOptions = mockSetupNavigation.mock.calls[0][2];
		expect(navOptions.notFoundMode).toBe("strict");
	});
});

/* ── 1.5 DOM & hydration ─────────────────────────────────────────────── */

describe("DOM & hydration", () => {
	it("solidHydrate called with document as target", async () => {
		const raw = makeFlareState();
		(globalThis as Record<string, unknown>).self = { flare: raw };
		mockParseFlareState.mockReturnValue(raw);

		const modules = {
			layouts: [],
			page: { _type: "render", variablePath: "", virtualPath: "_root_" },
			params: {},
		};
		mockLoadRouteModules.mockResolvedValue(modules);
		mockBuildInitialMatches.mockReturnValue([]);

		await hydrate(makeRouterConfig() as never);
		expect(mockSolidHydrate).toHaveBeenCalled();
	});

	it("no route modules → solidHydrate NOT called", async () => {
		const raw = makeFlareState();
		(globalThis as Record<string, unknown>).self = { flare: raw };
		mockParseFlareState.mockReturnValue(raw);

		/*
		 * When loadRouteModules returns null, hydrate() skips the
		 * hydration block entirely — no solidHydrate call.
		 */
		mockLoadRouteModules.mockResolvedValue(null);

		await hydrate(makeRouterConfig() as never);
		expect(mockSolidHydrate).not.toHaveBeenCalled();
	});

	it("data-hydrated attribute set on documentElement after successful hydration", async () => {
		const raw = makeFlareState();
		(globalThis as Record<string, unknown>).self = { flare: raw };
		mockParseFlareState.mockReturnValue(raw);

		const modules = {
			layouts: [],
			page: { _type: "render", variablePath: "", virtualPath: "_root_/home" },
			params: {},
		};
		mockLoadRouteModules.mockResolvedValue(modules);
		mockBuildInitialMatches.mockReturnValue([]);

		await hydrate(makeRouterConfig() as never);
		const doc = (globalThis as Record<string, unknown>).document as Record<string, unknown>;
		const docEl = doc.documentElement as { setAttribute: ReturnType<typeof vi.fn> };
		expect(docEl.setAttribute).toHaveBeenCalledWith("data-hydrated", "");
	});

	it("data-hydrated NOT set when no route modules found", async () => {
		const raw = makeFlareState();
		(globalThis as Record<string, unknown>).self = { flare: raw };
		mockParseFlareState.mockReturnValue(raw);
		mockLoadRouteModules.mockResolvedValue(null);

		await hydrate(makeRouterConfig() as never);
		const doc = (globalThis as Record<string, unknown>).document as Record<string, unknown>;
		const docEl = doc.documentElement as { setAttribute: ReturnType<typeof vi.fn> };
		expect(docEl.setAttribute).not.toHaveBeenCalledWith("data-hydrated", "");
	});

	it("dev overlay suppressed when devOverlay: false", async () => {
		const raw = makeFlareState();
		(globalThis as Record<string, unknown>).self = { flare: raw };
		mockParseFlareState.mockReturnValue(raw);

		const modules = {
			layouts: [],
			page: { _type: "render", variablePath: "", virtualPath: "_root_" },
			params: {},
		};
		mockLoadRouteModules.mockResolvedValue(modules);
		mockBuildInitialMatches.mockReturnValue([]);

		await hydrate(makeRouterConfig() as never, { devOverlay: false });
		expect(mockRender).not.toHaveBeenCalled();
	});

	it("root layout excluded from allModules but added to initialRouteIds", async () => {
		const raw = makeFlareState();
		(globalThis as Record<string, unknown>).self = { flare: raw };
		mockParseFlareState.mockReturnValue(raw);

		const rootLayout = {
			_type: "root-layout",
			render: () => null,
			variablePath: "",
			virtualPath: "_root_",
		};
		const page = {
			_type: "render",
			render: () => null,
			variablePath: "",
			virtualPath: "_root_/home",
		};
		const modules = {
			layouts: [rootLayout],
			page,
			params: {},
		};
		mockLoadRouteModules.mockResolvedValue(modules);
		mockBuildInitialMatches.mockReturnValue([]);
		mockExtractRootBoundaries.mockReturnValue({});

		await hydrate(makeRouterConfig() as never);

		/* buildInitialMatches should get only non-root layouts + page */
		const allModulesArg = mockBuildInitialMatches.mock.calls[0][0];
		expect(allModulesArg).toHaveLength(1);
		expect(allModulesArg[0].virtualPath).toBe("_root_/home");

		/* setupNavigation should get root layout in initialRouteIds */
		const navOptions = mockSetupNavigation.mock.calls[0][2];
		expect(navOptions.initialRouteIds).toContain("_root_");
		expect(navOptions.initialRouteIds).toContain("_root_/home");
	});
});
