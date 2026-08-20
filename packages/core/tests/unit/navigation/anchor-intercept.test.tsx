import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMatchCache, createPrefetchCache } from "../../../src/caches/index.ts";
import type { LoadedRouteModules } from "../../../src/navigation/types.ts";
import type { FlareProviderContext, NavigateOptions } from "../../../src/outlet/types.ts";
import type { TreeNode } from "../../../src/router-primitives/types.ts";
import type { SearchParams } from "../../../src/url/index.ts";

/* Mirror the same vi.mock list as navigation.test.ts */
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

vi.mock("../../../src/history", async (importOriginal) => {
	const original = await importOriginal<typeof import("../../../src/history")>();
	return {
		...original,
		restoreScroll: vi.fn(),
		scrollToTop: vi.fn(),
	};
});

import { resetNavigationState, setupNavigation } from "../../../src/navigation/index.ts";
import { matchRoute } from "../../../src/router-primitives/index.ts";

const mockMatchRoute = matchRoute as ReturnType<typeof vi.fn>;

/* ---- helpers mirrored from navigation.test.ts ---- */

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

/* ---- new helpers for anchor intercept tests ---- */

function mountAnchor(html: string): HTMLAnchorElement {
	const div = document.createElement("div");
	div.innerHTML = html;
	document.body.appendChild(div);
	return div.querySelector("a") as HTMLAnchorElement;
}

function dispatchClick(el: Element, init?: MouseEventInit): MouseEvent {
	const ev = new MouseEvent("click", { bubbles: true, button: 0, cancelable: true, ...init });
	el.dispatchEvent(ev);
	return ev;
}

/* ---- test suite ---- */

describe("anchor click delegate", () => {
	let pushStateSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		vi.clearAllMocks();
		mockMatchRoute.mockReset();
		mockLoadRouteModules.mockReset();
		resetLocation();
		pushStateSpy = vi.spyOn(window.history, "pushState");

		/* Default: match returns a valid route unless overridden */
		mockMatchRoute.mockReturnValue({ params: {}, route: makeRoute("_root_/products") });
		mockLoadRouteModules.mockResolvedValue(makeLoadedModules());
	});

	afterEach(() => {
		/* Remove any anchors appended to body */
		document.body.innerHTML = "";
		pushStateSpy.mockRestore();
		resetNavigationState();
		resetLocation();
	});

	/* 1 — production repro from anyrow.ai */
	it("raw <a href='/products#review'> from registered route → SPA nav", async () => {
		const ctx = makeCtx();
		setupNavigation(ctx, mockLoadRouteModules);

		const anchor = mountAnchor("<a href='/products#review'>Link</a>");
		const ev = dispatchClick(anchor);

		await Promise.resolve();

		expect(ev.defaultPrevented).toBe(true);
		expect(mockMatchRoute).toHaveBeenCalledWith(expect.anything(), "/products", expect.anything(), undefined);
		const pushCall = pushStateSpy.mock.calls.find((c: Parameters<History["pushState"]>) => {
			const url = String(c[2]);
			return url.includes("/products") && url.includes("#review");
		});
		expect(pushCall).toBeDefined();
	});

	/* 2 — same-origin pathname, no hash */
	it("raw <a href='/products'> (no hash) from registered route → SPA nav", async () => {
		const ctx = makeCtx();
		setupNavigation(ctx, mockLoadRouteModules);

		const anchor = mountAnchor("<a href='/products'>Link</a>");
		const ev = dispatchClick(anchor);

		await Promise.resolve();

		expect(ev.defaultPrevented).toBe(true);
		expect(mockMatchRoute).toHaveBeenCalledWith(expect.anything(), "/products", expect.anything(), undefined);
		expect(pushStateSpy).toHaveBeenCalled();
	});

	/* 3 — <Link href="/products#review"> raw-href shape → SPA nav via delegate (proves line-217 fix) */
	it("<Link href='/products#review'> raw-href click → SPA nav intercepted", async () => {
		/* Import and render Link inside FlareProvider so the component is wired up */
		const { Link } = await import("../../../src/link/index.tsx");
		const { FlareProvider } = await import("../../../src/outlet/index.tsx");
		const { render } = await import("@solidjs/web");

		/* Mock navigation for the Link module — but because anchor-intercept tests use REAL
		 * navigation module, we need a ctx + setupNavigation so the delegate fires.
		 * The Link component uses the navigation module mock only in link.test.tsx.
		 * Here both modules are real, so the global delegate fires from setupNavigation. */
		const ctx = makeCtx();
		setupNavigation(ctx, mockLoadRouteModules);

		const container = document.createElement("div");
		document.body.appendChild(container);

		let dispose: (() => void) | undefined;
		dispose = render(
			() => (
				<FlareProvider
					layouts={{}}
					matchCache={createMatchCache()}
					matches={[]}
					params={{}}
					prefetchCache={createPrefetchCache()}
					resolvers={new Map()}
					routeTree={makeFakeTree()}
				>
					<Link href="/products#review">Link</Link>
				</FlareProvider>
			),
			container,
		);

		const anchor = container.querySelector("a");
		expect(anchor).not.toBeNull();
		if (!anchor) return;

		const ev = dispatchClick(anchor);

		await Promise.resolve();

		dispose?.();
		container.remove();

		/* Global delegate should have intercepted — defaultPrevented = true, matchRoute called */
		expect(ev.defaultPrevented).toBe(true);
		expect(mockMatchRoute).toHaveBeenCalledWith(expect.anything(), "/products", expect.anything(), undefined);
	});

	/* 4 — same-page hash-only link */
	it("same-page <a href='#review'> → in-page anchor scroll, no cross-route pushState", async () => {
		window.history.replaceState({}, "", "/");

		const ctx = makeCtx({
			location: () => ({
				hash: "",
				params: {},
				pathname: "/",
				search: {},
				url: new URL("http://localhost/"),
				variablePath: "",
				virtualPath: "",
			}),
		});
		/* Route match for "/" */
		mockMatchRoute.mockReturnValue({ params: {}, route: makeRoute("_root_/home") });
		setupNavigation(ctx, mockLoadRouteModules);

		const anchor = mountAnchor("<a href='#review'>Link</a>");
		const ev = dispatchClick(anchor);

		await Promise.resolve();

		expect(ev.defaultPrevented).toBe(true);
		expect(mockMatchRoute).toHaveBeenCalledWith(expect.anything(), "/", expect.anything(), undefined);
		/* pushState URL must contain #review — hash-only fast-path */
		const pushWithHash = pushStateSpy.mock.calls.some((c: Parameters<History["pushState"]>) =>
			String(c[2]).includes("#review"),
		);
		expect(pushWithHash).toBe(true);
	});

	/* 5 — cross-origin fall-through */
	it("cross-origin <a href='https://other.com/x'> → native fall-through", () => {
		const ctx = makeCtx();
		setupNavigation(ctx, mockLoadRouteModules);

		const anchor = mountAnchor("<a href='https://other.com/x'>Link</a>");
		const ev = dispatchClick(anchor);

		expect(ev.defaultPrevented).toBe(false);
		expect(mockMatchRoute).not.toHaveBeenCalled();
	});

	/* 5b — absolute same-origin URL (e.g. <a href="https://anyrow.ai/products"> served from anyrow.ai) → SPA nav */
	it("absolute same-origin <a href='${origin}/products'> → SPA nav", async () => {
		const ctx = makeCtx();
		setupNavigation(ctx, mockLoadRouteModules);

		const absoluteHref = `${window.location.origin}/products`;
		const anchor = mountAnchor(`<a href='${absoluteHref}'>Link</a>`);
		const ev = dispatchClick(anchor);

		await Promise.resolve();

		expect(ev.defaultPrevented).toBe(true);
		expect(mockMatchRoute.mock.calls[0]?.[1]).toBe("/products");
		expect(pushStateSpy).toHaveBeenCalled();
	});

	/* 6 — mailto / tel fall-through */
	it.each([["mailto:user@example.com"], ["tel:+12345678"]])("%s → native fall-through", (href) => {
		const ctx = makeCtx();
		setupNavigation(ctx, mockLoadRouteModules);

		const anchor = mountAnchor(`<a href="${href}">Link</a>`);
		const ev = dispatchClick(anchor);

		expect(ev.defaultPrevented).toBe(false);
		expect(mockMatchRoute).not.toHaveBeenCalled();
	});

	/* 7 — dangerous protocol fall-through (security) */
	it.each([
		["javascript:alert(1)"],
		["data:text/html,<h1>x</h1>"],
		["blob:http://localhost/abc"],
		["vbscript:msgbox(1)"],
	])("%s href → native fall-through (security: delegate must not intercept)", (href) => {
		const ctx = makeCtx();
		setupNavigation(ctx, mockLoadRouteModules);

		const anchor = mountAnchor(`<a href="${href}">Link</a>`);
		const ev = dispatchClick(anchor);

		expect(ev.defaultPrevented).toBe(false);
		expect(mockMatchRoute).not.toHaveBeenCalled();
	});

	/* 8 — modifier keys fall-through */
	it.each([
		["metaKey", { metaKey: true }],
		["ctrlKey", { ctrlKey: true }],
		["shiftKey", { shiftKey: true }],
		["altKey", { altKey: true }],
	] as const)("%s → native fall-through", (_key, modifiers) => {
		const ctx = makeCtx();
		setupNavigation(ctx, mockLoadRouteModules);

		const anchor = mountAnchor("<a href='/products'>Link</a>");
		const ev = dispatchClick(anchor, modifiers);

		expect(ev.defaultPrevented).toBe(false);
		expect(mockMatchRoute).not.toHaveBeenCalled();
	});

	/* 9 — non-primary mouse button fall-through */
	it.each([
		["middle button (button: 1)", 1],
		["right button (button: 2)", 2],
	])("%s → native fall-through", (_label, button) => {
		const ctx = makeCtx();
		setupNavigation(ctx, mockLoadRouteModules);

		const anchor = mountAnchor("<a href='/products'>Link</a>");
		const ev = dispatchClick(anchor, { button });

		expect(ev.defaultPrevented).toBe(false);
		expect(mockMatchRoute).not.toHaveBeenCalled();
	});

	/* 10 — target=_blank fall-through */
	it("target='_blank' → native fall-through", () => {
		const ctx = makeCtx();
		setupNavigation(ctx, mockLoadRouteModules);

		const anchor = mountAnchor("<a href='/products' target='_blank'>Link</a>");
		const ev = dispatchClick(anchor);

		expect(ev.defaultPrevented).toBe(false);
		expect(mockMatchRoute).not.toHaveBeenCalled();
	});

	/* 11 — download attribute fall-through */
	it("download attribute → native fall-through", () => {
		const ctx = makeCtx();
		setupNavigation(ctx, mockLoadRouteModules);

		const anchor = mountAnchor("<a href='/file.csv' download>Link</a>");
		const ev = dispatchClick(anchor);

		expect(ev.defaultPrevented).toBe(false);
		expect(mockMatchRoute).not.toHaveBeenCalled();
	});

	/* 12 — rel=external fall-through */
	it("rel='external' → native fall-through", () => {
		const ctx = makeCtx();
		setupNavigation(ctx, mockLoadRouteModules);

		const anchor = mountAnchor("<a href='/products' rel='external'>Link</a>");
		const ev = dispatchClick(anchor);

		expect(ev.defaultPrevented).toBe(false);
		expect(mockMatchRoute).not.toHaveBeenCalled();
	});

	/* 13 — data-flare-skip opt-out */
	it("data-flare-skip → native fall-through", () => {
		const ctx = makeCtx();
		setupNavigation(ctx, mockLoadRouteModules);

		const anchor = mountAnchor("<a href='/products' data-flare-skip>Link</a>");
		const ev = dispatchClick(anchor);

		expect(ev.defaultPrevented).toBe(false);
		expect(mockMatchRoute).not.toHaveBeenCalled();
	});

	/* 14 — no route match → native fall-through (escape hatch for static assets / 404) */
	it("no registered route match → native fall-through", () => {
		const ctx = makeCtx();
		setupNavigation(ctx, mockLoadRouteModules);
		mockMatchRoute.mockReturnValue(null);

		const anchor = mountAnchor("<a href='/totally-unknown.pdf'>Link</a>");
		const ev = dispatchClick(anchor);

		expect(ev.defaultPrevented).toBe(false);
	});

	/* 15 — event already defaultPrevented → delegate is no-op */
	it("event.defaultPrevented already true → delegate is no-op, matchRoute not called", () => {
		const ctx = makeCtx();
		setupNavigation(ctx, mockLoadRouteModules);

		const anchor = mountAnchor("<a href='/products'>Link</a>");

		/* Another listener prevents default before the delegate fires.
		 * Capture phase means our delegate fires first — but we test the guard
		 * by dispatching an already-prevented event. jsdom allows creating one
		 * via a pre-prevented event: simulate by calling preventDefault() in a
		 * listener that runs before the delegate. Use bubbling (non-capture) on
		 * anchor itself — but the delegate is in capture so it fires first.
		 * Correct approach: the spec says "dispatch click whose handler called
		 * preventDefault() first" — we test this by attaching a capturing listener
		 * on document that fires BEFORE our delegate and prevents default. */
		const blocker = (e: Event) => e.preventDefault();
		document.addEventListener("click", blocker, { capture: true });

		const ev = dispatchClick(anchor);

		document.removeEventListener("click", blocker, { capture: true });

		expect(ev.defaultPrevented).toBe(true);
		/* delegate must not have called matchRoute because another handler already prevented */
		expect(mockMatchRoute).not.toHaveBeenCalled();
	});

	/* 16 — click on nested <span> inside <a> — uses closest("a") */
	it("click on nested <span> inside <a> → delegate uses closest('a'), SPA nav", async () => {
		const ctx = makeCtx();
		setupNavigation(ctx, mockLoadRouteModules);

		const div = document.createElement("div");
		div.innerHTML = "<a href='/products'><span>Click me</span></a>";
		document.body.appendChild(div);
		const span = div.querySelector("span");
		if (!span) return;

		const ev = dispatchClick(span);

		await Promise.resolve();

		expect(ev.defaultPrevented).toBe(true);
		expect(mockMatchRoute).toHaveBeenCalledWith(expect.anything(), "/products", expect.anything(), undefined);
	});

	/* 17 — click on bare <div> with no enclosing <a> → no-op */
	it("click on element with no enclosing <a> → no-op", () => {
		const ctx = makeCtx();
		setupNavigation(ctx, mockLoadRouteModules);

		const div = document.createElement("div");
		div.textContent = "Not a link";
		document.body.appendChild(div);

		const ev = dispatchClick(div);

		expect(ev.defaultPrevented).toBe(false);
		expect(mockMatchRoute).not.toHaveBeenCalled();
	});

	/* 18 — <a> with no href → no-op (semantically a button) */
	it("<a> with no href → no-op", () => {
		const ctx = makeCtx();
		setupNavigation(ctx, mockLoadRouteModules);

		const anchor = mountAnchor("<a>Buttonlike</a>");
		const ev = dispatchClick(anchor);

		expect(ev.defaultPrevented).toBe(false);
		expect(mockMatchRoute).not.toHaveBeenCalled();
	});

	/* 19 — hash on different path crosses route boundaries → SPA nav with both pathname and hash */
	it("cross-route <a href='/products#review'> from '/' → SPA nav with pathname + hash preserved", async () => {
		window.history.replaceState({}, "", "/");

		mockMatchRoute.mockReturnValue({ params: {}, route: makeRoute("_root_/products") });
		const ctx = makeCtx();
		setupNavigation(ctx, mockLoadRouteModules);

		const anchor = mountAnchor("<a href='/products#review'>Link</a>");
		const ev = dispatchClick(anchor);

		await Promise.resolve();

		expect(ev.defaultPrevented).toBe(true);
		const pushCall = pushStateSpy.mock.calls.find((c: Parameters<History["pushState"]>) => {
			const url = String(c[2]);
			return url.includes("/products") && url.includes("#review");
		});
		expect(pushCall).toBeDefined();
	});

	/* 20 — idempotent setup: calling setupNavigation twice does not double-register delegate */
	it("calling setupNavigation twice does not double-register the delegate", async () => {
		const addSpy = vi.spyOn(document, "addEventListener");
		const removeSpy = vi.spyOn(document, "removeEventListener");

		const ctx = makeCtx();
		setupNavigation(ctx, mockLoadRouteModules);
		setupNavigation(ctx, mockLoadRouteModules);

		const clickAdds = addSpy.mock.calls.filter((c) => c[0] === "click");
		const clickRemoves = removeSpy.mock.calls.filter((c) => c[0] === "click");

		/* 2 adds (one per setupNavigation call) and 1 remove (second setup clears first) */
		expect(clickAdds.length).toBe(2);
		expect(clickRemoves.length).toBe(1);

		/* dispatch a single click — matchRoute must be called exactly once, not twice */
		mockMatchRoute.mockClear();
		const anchor = mountAnchor("<a href='/products'>Link</a>");
		dispatchClick(anchor);

		await Promise.resolve();

		expect(mockMatchRoute).toHaveBeenCalledTimes(1);

		addSpy.mockRestore();
		removeSpy.mockRestore();
	});

	/* 21 — resetNavigationState removes the delegate */
	it("resetNavigationState removes the delegate", () => {
		const ctx = makeCtx();
		setupNavigation(ctx, mockLoadRouteModules);
		resetNavigationState();

		const anchor = mountAnchor("<a href='/products'>Link</a>");
		const ev = dispatchClick(anchor);

		expect(ev.defaultPrevented).toBe(false);
		expect(mockMatchRoute).not.toHaveBeenCalled();
	});

	/* 22 — rewritePathname applied before route match */
	it("rewrite applied before route match: /app/products → matchRoute called with /products", () => {
		const ctx = makeCtx();
		setupNavigation(ctx, mockLoadRouteModules, {
			rewrite: {
				input: ({ url }) => new URL(`${url.pathname.replace(/^\/app/, "")}${url.search}${url.hash}`, url),
				output: ({ url }) => new URL(`/app${url.pathname}${url.search}${url.hash}`, url),
			},
		});

		const anchor = mountAnchor("<a href='/app/products'>Link</a>");
		dispatchClick(anchor);

		expect(mockMatchRoute).toHaveBeenCalledWith(expect.anything(), "/products", expect.anything(), undefined);
	});
});
