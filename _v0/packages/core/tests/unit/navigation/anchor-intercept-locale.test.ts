import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMatchCache, createPrefetchCache } from "../../../src/caches/index.ts";
import type { LoadedRouteModules } from "../../../src/navigation/types.ts";
import type { FlareProviderContext, NavigateOptions } from "../../../src/outlet/types.ts";
import type { RouteData } from "../../../src/router-primitives/index.ts";
import type { SearchParams } from "../../../src/url/index.ts";

/* Real router-primitives — no mock. These tests exercise the actual matcher
 * to confirm the locale allow-list constraint flows through the intercept. */
vi.mock("../../../src/ndjson-client", () => ({
	fetchNDJSON: vi.fn(),
}));

vi.mock("../../../src/head-client", () => ({
	applyPerRouteHeads: vi.fn(),
}));

vi.mock("../../../src/history", async (importOriginal) => {
	const original = await importOriginal<typeof import("../../../src/history")>();
	return { ...original, restoreScroll: vi.fn(), scrollToTop: vi.fn() };
});

import { resetNavigationState, setupNavigation } from "../../../src/navigation/index.ts";
import { createTreeNode, insertRoute } from "../../../src/router-primitives/index.ts";

function makeRouteData(virtualPath: string): RouteData {
	return {
		e: "default",
		o: {},
		p: () => Promise.resolve({ default: null }),
		t: "r",
		v: virtualPath,
		x: virtualPath,
	};
}

function makeLoadedModules(): LoadedRouteModules {
	return {
		layouts: [],
		page: { _type: "render", render: () => null, variablePath: "", virtualPath: "_root_/home" },
		params: {},
	};
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
		routeTree: createTreeNode(),
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

function mountAnchor(html: string): HTMLAnchorElement {
	const div = document.createElement("div");
	div.innerHTML = html;
	document.body.appendChild(div);
	return div.querySelector("a") as HTMLAnchorElement;
}

function dispatchClick(el: Element): MouseEvent {
	const ev = new MouseEvent("click", { bubbles: true, button: 0, cancelable: true });
	el.dispatchEvent(ev);
	return ev;
}

describe("anchor intercept — locale allow-list (real matcher, no matchRoute mock)", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		window.history.replaceState({}, "", "/");
	});

	afterEach(() => {
		document.body.innerHTML = "";
		resetNavigationState();
		window.history.replaceState({}, "", "/");
	});

	describe("cross-worker path not intercepted when locale allow-list rejects it", () => {
		it('<a href="/docs"> NOT intercepted: locales=["en"], tree has only [[locale]]', () => {
			/* Real tree matching the landing shape — [[locale]] index only.
			 * Without the fix /docs would match as locale="docs" and get intercepted. */
			const tree = createTreeNode();
			insertRoute(tree, "/[[locale]]", makeRouteData("[[locale]]/_root_/"));

			const mockLoadRouteModules = vi
				.fn<(pathname: string, routeTree: unknown, layouts: unknown) => Promise<LoadedRouteModules>>()
				.mockResolvedValue(makeLoadedModules());

			const ctx = makeCtx({ routeTree: tree });
			setupNavigation(ctx, mockLoadRouteModules, {
				locale: { defaultLocale: "en", locales: ["en"] },
			});

			const anchor = mountAnchor("<a href='/docs'>Docs</a>");
			const ev = dispatchClick(anchor);

			/* matcher returns null → anchor intercept falls through → no preventDefault */
			expect(ev.defaultPrevented).toBe(false);
		});

		it('<a href="/login"> NOT intercepted: locales=["en"], tree has only [[locale]] index', () => {
			/* /login is a cross-worker path. Tree has [[locale]] index only.
			 * "login" not in locales → consume rejected; no static /login child → skip
			 * branch also fails → null → no intercept. */
			const tree = createTreeNode();
			insertRoute(tree, "/[[locale]]", makeRouteData("[[locale]]/_root_/"));

			const mockLoadRouteModules = vi
				.fn<(pathname: string, routeTree: unknown, layouts: unknown) => Promise<LoadedRouteModules>>()
				.mockResolvedValue(makeLoadedModules());

			const ctx = makeCtx({ routeTree: tree });
			setupNavigation(ctx, mockLoadRouteModules, {
				locale: { defaultLocale: "en", locales: ["en"] },
			});

			const anchor = mountAnchor("<a href='/login'>Login</a>");
			const ev = dispatchClick(anchor);

			expect(ev.defaultPrevented).toBe(false);
		});
	});

	describe("same-app locale-prefixed path IS intercepted", () => {
		it('<a href="/en/about"> IS intercepted: tree has [[locale]]/about, locales=["en"]', async () => {
			const tree = createTreeNode();
			insertRoute(tree, "/[[locale]]", makeRouteData("[[locale]]/_root_/"));
			insertRoute(tree, "/[[locale]]/about", makeRouteData("[[locale]]/_root_/about"));

			const mockLoadRouteModules = vi
				.fn<(pathname: string, routeTree: unknown, layouts: unknown) => Promise<LoadedRouteModules>>()
				.mockResolvedValue(makeLoadedModules());

			const ctx = makeCtx({ routeTree: tree });
			setupNavigation(ctx, mockLoadRouteModules, {
				locale: { defaultLocale: "en", locales: ["en"] },
			});

			const anchor = mountAnchor("<a href='/en/about'>About</a>");
			const ev = dispatchClick(anchor);

			await Promise.resolve();

			/* "en" is in allow-list → consume accepted → match found → intercepted */
			expect(ev.defaultPrevented).toBe(true);
		});

		it('<a href="/about"> IS intercepted via skip branch (locale absent from URL)', async () => {
			const tree = createTreeNode();
			insertRoute(tree, "/[[locale]]", makeRouteData("[[locale]]/_root_/"));
			insertRoute(tree, "/[[locale]]/about", makeRouteData("[[locale]]/_root_/about"));

			const mockLoadRouteModules = vi
				.fn<(pathname: string, routeTree: unknown, layouts: unknown) => Promise<LoadedRouteModules>>()
				.mockResolvedValue(makeLoadedModules());

			const ctx = makeCtx({ routeTree: tree });
			setupNavigation(ctx, mockLoadRouteModules, {
				locale: { defaultLocale: "en", locales: ["en"] },
			});

			/* /about → skip branch matches /[[locale]]/about with no locale param */
			const anchor = mountAnchor("<a href='/about'>About</a>");
			const ev = dispatchClick(anchor);

			await Promise.resolve();

			expect(ev.defaultPrevented).toBe(true);
		});
	});

	describe("no localeConfig → original greedy behavior preserved", () => {
		it('<a href="/docs"> IS intercepted when no locale option passed (back-compat)', async () => {
			/* Greedy: [[locale]] consumes "docs" as param value — original behavior unchanged. */
			const tree = createTreeNode();
			insertRoute(tree, "/[[locale]]", makeRouteData("[[locale]]/_root_/"));

			const mockLoadRouteModules = vi
				.fn<(pathname: string, routeTree: unknown, layouts: unknown) => Promise<LoadedRouteModules>>()
				.mockResolvedValue(makeLoadedModules());

			const ctx = makeCtx({ routeTree: tree });
			/* No locale option → localeConfig stays undefined → no allow-list constraint */
			setupNavigation(ctx, mockLoadRouteModules);

			const anchor = mountAnchor("<a href='/docs'>Docs</a>");
			const ev = dispatchClick(anchor);

			await Promise.resolve();

			expect(ev.defaultPrevented).toBe(true);
		});
	});
});
