import { createRoot } from "solid-js";
import { render } from "solid-js/web";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMatchCache, createPrefetchCache } from "../../../src/caches/index.ts";
import { NotFoundError, UnauthenticatedError, UnauthorizedError } from "../../../src/errors/index.ts";
import {
	type ClientMatch,
	FlareProvider,
	type FlareProviderContext,
	type FlareProviderProps,
	Outlet,
	type RenderProps,
	useRouter,
	useRouterContext,
} from "../../../src/outlet/index.tsx";
import { createTreeNode, insertRoute } from "../../../src/router-primitives/index.ts";
import type { TreeNode } from "../../../src/router-primitives/types.ts";

function makeFakeTree(): TreeNode {
	return {
		s: {},
	};
}

function makeMatch(overrides: Partial<ClientMatch> & { virtualPath: string }): ClientMatch {
	return {
		_type: "render",
		loaderData: null,
		render: (props: RenderProps) => <div data-testid={`page-${overrides.virtualPath}`}>{String(props.loaderData)}</div>,
		variablePath: "",
		...overrides,
	};
}

function makeLayoutMatch(virtualPath: string, overrides?: Partial<ClientMatch>): ClientMatch {
	return {
		_type: "layout",
		loaderData: null,
		render: (props: RenderProps) => <div data-testid={`layout-${virtualPath}`}>{props.children}</div>,
		variablePath: "",
		virtualPath,
		...overrides,
	};
}

function makeProviderProps(overrides?: Partial<FlareProviderProps>): FlareProviderProps {
	return {
		children: null as unknown as import("solid-js").JSX.Element,
		layouts: {},
		matchCache: createMatchCache(),
		matches: [],
		params: {},
		prefetchCache: createPrefetchCache(),
		resolvers: new Map(),
		routeTree: makeFakeTree(),
		...overrides,
	};
}

describe("FlareProvider", () => {
	let container: HTMLDivElement;
	let dispose: () => void;

	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);
	});

	afterEach(() => {
		dispose?.();
		container.remove();
	});

	it("provides context to children", () => {
		let ctx: FlareProviderContext | undefined;

		const props = makeProviderProps();
		dispose = render(
			() => (
				<FlareProvider {...props}>
					{(() => {
						ctx = useRouterContext();
						return null;
					})()}
				</FlareProvider>
			),
			container,
		);

		expect(ctx).toBeDefined();
		expect(typeof ctx?.hydrated).toBe("function");
		expect(typeof ctx?.isNavigating).toBe("function");
		expect(typeof ctx?.matches).toBe("function");
	});

	it("search signal initialized from props", () => {
		let ctx: FlareProviderContext | undefined;

		const props = makeProviderProps({
			search: { page: "2", sort: "name" },
		});
		dispose = render(
			() => (
				<FlareProvider {...props}>
					{(() => {
						ctx = useRouterContext();
						return null;
					})()}
				</FlareProvider>
			),
			container,
		);

		expect(ctx).toBeDefined();
		const s = ctx?.search();
		expect(s).toEqual({ page: "2", sort: "name" });
	});

	it("search signal defaults to empty when no prop", () => {
		let ctx: FlareProviderContext | undefined;

		const props = makeProviderProps();
		dispose = render(
			() => (
				<FlareProvider {...props}>
					{(() => {
						ctx = useRouterContext();
						return null;
					})()}
				</FlareProvider>
			),
			container,
		);

		expect(ctx?.search()).toEqual({});
	});

	it("onContextReady called with context", () => {
		const onContextReady = vi.fn();

		const props = makeProviderProps({ onContextReady });
		dispose = render(
			() => (
				<FlareProvider {...props}>
					<div />
				</FlareProvider>
			),
			container,
		);

		expect(onContextReady).toHaveBeenCalledTimes(1);
		expect(onContextReady.mock.calls[0]?.[0]).toHaveProperty("hydrated");
		expect(onContextReady.mock.calls[0]?.[0]).toHaveProperty("setMatches");
	});

	it("initial signals from props", () => {
		let ctx: FlareProviderContext | undefined;

		const pageMatch = makeMatch({ virtualPath: "_root_/about" });
		const props = makeProviderProps({
			matches: [pageMatch],
			params: { id: "123" },
		});

		dispose = render(
			() => (
				<FlareProvider {...props}>
					{(() => {
						ctx = useRouterContext();
						return null;
					})()}
				</FlareProvider>
			),
			container,
		);

		expect(ctx?.matches()).toEqual([pageMatch]);
		expect(ctx?.params()).toEqual({ id: "123" });
		expect(ctx?.hydrated()).toBe(false);
		expect(ctx?.isNavigating()).toBe(false);
		expect(ctx?.notFound()).toBe(false);
	});

	it("location prefers window.location over initialLocation on client", () => {
		let ctx: FlareProviderContext | undefined;

		const props = makeProviderProps({
			initialLocation: {
				hash: "",
				params: {},
				pathname: "/initial-page",
				search: {},
				url: new URL("http://localhost/initial-page"),
				variablePath: "/initial-page",
				virtualPath: "_root_/initial-page",
			},
			matches: [makeMatch({ virtualPath: "_root_/home" })],
		});

		dispose = render(
			() => (
				<FlareProvider {...props}>
					{(() => {
						ctx = useRouterContext();
						return null;
					})()}
				</FlareProvider>
			),
			container,
		);

		/* window exists in jsdom → location reads from window, not initialLocation */
		expect(ctx?.location().pathname).toBe(window.location.pathname);
		expect(ctx?.location().pathname).not.toBe("/initial-page");
	});

	it("location computed from matches", () => {
		let ctx: FlareProviderContext | undefined;

		const props = makeProviderProps({
			matches: [makeMatch({ virtualPath: "_root_/about" })],
		});

		dispose = render(
			() => (
				<FlareProvider {...props}>
					{(() => {
						ctx = useRouterContext();
						return null;
					})()}
				</FlareProvider>
			),
			container,
		);

		expect(ctx?.location().virtualPath).toBe("_root_/about");
	});

	it("location variablePath derived from last match", () => {
		let ctx: FlareProviderContext | undefined;

		const props = makeProviderProps({
			matches: [
				makeLayoutMatch("_root_"),
				makeMatch({ variablePath: "/products/[id]", virtualPath: "_root_/products/[id]" }),
			],
		});

		dispose = render(
			() => (
				<FlareProvider {...props}>
					{(() => {
						ctx = useRouterContext();
						return null;
					})()}
				</FlareProvider>
			),
			container,
		);

		expect(ctx?.location().variablePath).toBe("/products/[id]");
	});
});

describe("useRouter", () => {
	let container: HTMLDivElement;
	let dispose: () => void;

	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);
	});

	afterEach(() => {
		dispose?.();
		container.remove();
	});

	it("returns public API (no setters, no caches)", () => {
		let router: ReturnType<typeof useRouter> | undefined;

		const props = makeProviderProps();
		dispose = render(
			() => (
				<FlareProvider {...props}>
					{(() => {
						router = useRouter();
						return null;
					})()}
				</FlareProvider>
			),
			container,
		);

		expect(router).toBeDefined();
		/* Signals */
		expect(typeof router?.hydrated).toBe("function");
		expect(typeof router?.isNavigating).toBe("function");
		expect(typeof router?.location).toBe("function");
		expect(typeof router?.matches).toBe("function");
		expect(typeof router?.params).toBe("function");
		expect(typeof router?.search).toBe("function");
		/* Actions */
		expect(typeof router?.navigate).toBe("function");
		expect(typeof router?.prefetch).toBe("function");
		expect(typeof router?.invalidate).toBe("function");
		expect(typeof router?.buildUrl).toBe("function");
		expect(typeof router?.clearCache).toBe("function");
		expect(typeof router?.refetch).toBe("function");
		/* Should NOT have setters */
		expect((router as unknown as Record<string, unknown>).setMatches).toBeUndefined();
		expect((router as unknown as Record<string, unknown>).setParams).toBeUndefined();
	});

	it("throws outside FlareProvider", () => {
		expect(() => {
			createRoot((dispose) => {
				try {
					useRouter();
				} finally {
					dispose();
				}
			});
		}).toThrow("useRouterContext() called outside FlareProvider");
	});

	it("exposes data hooks (useLoaderData, useMatch, usePreloaderContext, useBlocker, buildLocation)", () => {
		let router: ReturnType<typeof useRouter> | undefined;

		const props = makeProviderProps();
		dispose = render(
			() => (
				<FlareProvider {...props}>
					{(() => {
						router = useRouter();
						return null;
					})()}
				</FlareProvider>
			),
			container,
		);

		expect(typeof router?.useLoaderData).toBe("function");
		expect(typeof router?.useMatch).toBe("function");
		expect(typeof router?.usePreloaderContext).toBe("function");
		expect(typeof router?.useBlocker).toBe("function");
		expect(typeof router?.buildLocation).toBe("function");
	});

	it("useLoaderData returns reactive loader data for matching virtualPath", () => {
		let loaderAccessor: (() => unknown) | undefined;

		const page = makeMatch({
			loaderData: { greeting: "hello" },
			virtualPath: "_root_/about",
		});
		const props = makeProviderProps({ matches: [page] });
		dispose = render(
			() => (
				<FlareProvider {...props}>
					{(() => {
						const router = useRouter();
						loaderAccessor = router.useLoaderData({ from: "_root_/about" });
						return null;
					})()}
				</FlareProvider>
			),
			container,
		);

		expect(loaderAccessor?.()).toEqual({ greeting: "hello" });
	});

	it("useLoaderData returns undefined for non-matching virtualPath", () => {
		let loaderAccessor: (() => unknown) | undefined;

		const page = makeMatch({ loaderData: { x: 1 }, virtualPath: "_root_/about" });
		const props = makeProviderProps({ matches: [page] });
		dispose = render(
			() => (
				<FlareProvider {...props}>
					{(() => {
						const router = useRouter();
						loaderAccessor = router.useLoaderData({ from: "_root_/missing" });
						return null;
					})()}
				</FlareProvider>
			),
			container,
		);

		expect(loaderAccessor?.()).toBeUndefined();
	});

	it("useMatch returns ClientMatch for matching virtualPath", () => {
		let matchAccessor: (() => ClientMatch | undefined) | undefined;

		const page = makeMatch({ loaderData: "data", virtualPath: "_root_/about" });
		const props = makeProviderProps({ matches: [page] });
		dispose = render(
			() => (
				<FlareProvider {...props}>
					{(() => {
						const router = useRouter();
						matchAccessor = router.useMatch({ from: "_root_/about" });
						return null;
					})()}
				</FlareProvider>
			),
			container,
		);

		expect(matchAccessor?.()?.virtualPath).toBe("_root_/about");
		expect(matchAccessor?.()?.loaderData).toBe("data");
	});

	it("usePreloaderContext returns preloader context for matching virtualPath", () => {
		let preloaderAccessor: (() => unknown) | undefined;

		const page = makeMatch({
			preloaderContext: { user: { id: "42" } },
			virtualPath: "_root_/profile",
		});
		const props = makeProviderProps({ matches: [page] });
		dispose = render(
			() => (
				<FlareProvider {...props}>
					{(() => {
						const router = useRouter();
						preloaderAccessor = router.usePreloaderContext({ from: "_root_/profile" });
						return null;
					})()}
				</FlareProvider>
			),
			container,
		);

		expect(preloaderAccessor?.()).toEqual({ user: { id: "42" } });
	});

	it("useBlocker returns BlockerState with blocked signal", () => {
		let blockerState: ReturnType<ReturnType<typeof useRouter>["useBlocker"]> | undefined;

		const props = makeProviderProps();
		dispose = render(
			() => (
				<FlareProvider {...props}>
					{(() => {
						const router = useRouter();
						blockerState = router.useBlocker(() => true);
						return null;
					})()}
				</FlareProvider>
			),
			container,
		);

		expect(blockerState).toBeDefined();
		expect(typeof blockerState?.blocked).toBe("function");
		expect(typeof blockerState?.proceed).toBe("function");
		expect(typeof blockerState?.reset).toBe("function");
		expect(blockerState?.blocked()).toBe(false);
	});

	it("buildLocation uses caseSensitive=true from context", () => {
		const tree = createTreeNode();
		insertRoute(tree, "/about", {
			e: "/about",
			o: {},
			p: () => Promise.resolve({ default: {} }),
			t: "r",
			v: "_root_/about",
			x: "_root_/about",
		});

		let router: ReturnType<typeof useRouter> | undefined;
		const props = makeProviderProps({ caseSensitive: true, routeTree: tree });
		dispose = render(
			() => (
				<FlareProvider {...props}>
					{(() => {
						router = useRouter();
						return null;
					})()}
				</FlareProvider>
			),
			container,
		);

		/* /About with caseSensitive=true → no match (route is /about) */
		const loc = router?.buildLocation({ to: "/About" });
		expect(loc?.virtualPath).toBe("");
	});

	it("buildLocation matches case-insensitively by default", () => {
		const tree = createTreeNode();
		insertRoute(tree, "/about", {
			e: "/about",
			o: {},
			p: () => Promise.resolve({ default: {} }),
			t: "r",
			v: "_root_/about",
			x: "_root_/about",
		});

		let router: ReturnType<typeof useRouter> | undefined;
		const props = makeProviderProps({ routeTree: tree });
		dispose = render(
			() => (
				<FlareProvider {...props}>
					{(() => {
						router = useRouter();
						return null;
					})()}
				</FlareProvider>
			),
			container,
		);

		/* /About with default (caseSensitive=false) → matches /about */
		const loc = router?.buildLocation({ to: "/About" });
		expect(loc?.virtualPath).toBe("_root_/about");
	});

	it("caseSensitive stored in context", () => {
		let ctx: FlareProviderContext | undefined;

		const props = makeProviderProps({ caseSensitive: true });
		dispose = render(
			() => (
				<FlareProvider {...props}>
					{(() => {
						ctx = useRouterContext();
						return null;
					})()}
				</FlareProvider>
			),
			container,
		);

		expect(ctx?.caseSensitive).toBe(true);
	});
});

describe("useRouterContext", () => {
	it("throws outside FlareProvider", () => {
		expect(() => {
			createRoot((dispose) => {
				try {
					useRouterContext();
				} finally {
					dispose();
				}
			});
		}).toThrow("useRouterContext() called outside FlareProvider");
	});
});

describe("Outlet", () => {
	let container: HTMLDivElement;
	let dispose: () => void;

	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);
	});

	afterEach(() => {
		dispose?.();
		container.remove();
	});

	it("renders page match", () => {
		const pageMatch = makeMatch({
			loaderData: "page data",
			virtualPath: "_root_/home",
		});

		const props = makeProviderProps({ matches: [pageMatch] });
		dispose = render(
			() => (
				<FlareProvider {...props}>
					<Outlet />
				</FlareProvider>
			),
			container,
		);

		expect(container.querySelector("[data-testid='page-_root_/home']")).not.toBeNull();
		expect(container.querySelector("[data-testid='page-_root_/home']")?.textContent).toBe("page data");
	});

	it("renders layout + page chain", () => {
		const layoutMatch = makeLayoutMatch("_root_");
		const pageMatch = makeMatch({
			loaderData: "nested",
			virtualPath: "_root_/about",
		});

		const props = makeProviderProps({ matches: [layoutMatch, pageMatch] });
		dispose = render(
			() => (
				<FlareProvider {...props}>
					<Outlet />
				</FlareProvider>
			),
			container,
		);

		const layout = container.querySelector("[data-testid='layout-_root_']");
		expect(layout).not.toBeNull();
		const page = container.querySelector("[data-testid='page-_root_/about']");
		expect(page).not.toBeNull();
		/* Page should be inside layout */
		expect(layout?.contains(page)).toBe(true);
	});

	it("no match → renders nothing", () => {
		const props = makeProviderProps({ matches: [] });
		dispose = render(
			() => (
				<FlareProvider {...props}>
					<Outlet />
				</FlareProvider>
			),
			container,
		);

		expect(container.innerHTML).toBe("");
	});

	it("layout does NOT get children when it is a page type", () => {
		/* Pages (_type: "render") should not receive children */
		let receivedChildren = false;
		const pageMatch: ClientMatch = {
			_type: "render",
			loaderData: null,
			render: (props: RenderProps) => {
				if (props.children) receivedChildren = true;
				return <div data-testid="page">page</div>;
			},
			variablePath: "",
			virtualPath: "_root_/home",
		};

		const props = makeProviderProps({ matches: [pageMatch] });
		dispose = render(
			() => (
				<FlareProvider {...props}>
					<Outlet />
				</FlareProvider>
			),
			container,
		);

		expect(receivedChildren).toBe(false);
	});

	it("layout receives children", () => {
		let receivedChildren = false;
		const layoutMatch: ClientMatch = {
			_type: "layout",
			loaderData: null,
			render: (props: RenderProps) => {
				if (props.children) receivedChildren = true;
				return <div>{props.children}</div>;
			},
			variablePath: "",
			virtualPath: "_root_",
		};
		const pageMatch = makeMatch({ virtualPath: "_root_/home" });

		const props = makeProviderProps({ matches: [layoutMatch, pageMatch] });
		dispose = render(
			() => (
				<FlareProvider {...props}>
					<Outlet />
				</FlareProvider>
			),
			container,
		);

		expect(receivedChildren).toBe(true);
	});

	it("three-level nesting: root → layout → page", () => {
		const root = makeLayoutMatch("_root_");
		const layout = makeLayoutMatch("_root_/(shop)");
		const page = makeMatch({
			loaderData: "product",
			virtualPath: "_root_/(shop)/products",
		});

		const props = makeProviderProps({ matches: [root, layout, page] });
		dispose = render(
			() => (
				<FlareProvider {...props}>
					<Outlet />
				</FlareProvider>
			),
			container,
		);

		const rootEl = container.querySelector("[data-testid='layout-_root_']");
		const layoutEl = container.querySelector("[data-testid='layout-_root_/(shop)']");
		const pageEl = container.querySelector("[data-testid='page-_root_/(shop)/products']");

		expect(rootEl).not.toBeNull();
		expect(layoutEl).not.toBeNull();
		expect(pageEl).not.toBeNull();
		expect(rootEl?.contains(layoutEl)).toBe(true);
		expect(layoutEl?.contains(pageEl)).toBe(true);
	});
});

describe("error boundary walk-up", () => {
	let container: HTMLDivElement;
	let dispose: () => void;

	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);
	});

	afterEach(() => {
		dispose?.();
		container.remove();
	});

	it("error in page → caught by page's errorRender", () => {
		const page: ClientMatch = {
			_type: "render",
			errorRender: (props) => <div data-testid="error-boundary">Caught: {String(props.error)}</div>,
			loaderData: null,
			render: () => {
				throw new Error("page error");
			},
			variablePath: "",
			virtualPath: "_root_/broken",
		};

		const props = makeProviderProps({ matches: [page] });
		dispose = render(
			() => (
				<FlareProvider {...props}>
					<Outlet />
				</FlareProvider>
			),
			container,
		);

		expect(container.querySelector("[data-testid='error-boundary']")).not.toBeNull();
	});

	it("no route errorRender → minimal fallback", () => {
		const page: ClientMatch = {
			_type: "render",
			loaderData: null,
			render: () => {
				throw new Error("unhandled");
			},
			variablePath: "",
			virtualPath: "_root_/broken",
		};

		const props = makeProviderProps({ matches: [page] });
		dispose = render(
			() => (
				<FlareProvider {...props}>
					<Outlet />
				</FlareProvider>
			),
			container,
		);

		expect(container.textContent).toContain("Something went wrong");
	});

	it("no route errorRender → global boundary used", () => {
		const page: ClientMatch = {
			_type: "render",
			loaderData: null,
			render: () => {
				throw new Error("boom");
			},
			variablePath: "",
			virtualPath: "_root_/broken",
		};

		const props = makeProviderProps({
			boundaries: {
				error: (p) => <div data-testid="global-error">Global: {(p.error as Error).message}</div>,
			},
			matches: [page],
		});
		dispose = render(
			() => (
				<FlareProvider {...props}>
					<Outlet />
				</FlareProvider>
			),
			container,
		);

		expect(container.querySelector("[data-testid='global-error']")?.textContent).toBe("Global: boom");
	});

	it("NotFoundError → walks notFoundRender chain", () => {
		const layout: ClientMatch = {
			_type: "layout",
			loaderData: null,
			notFoundRender: () => <div data-testid="not-found">Custom 404</div>,
			render: (props: RenderProps) => <div>{props.children}</div>,
			variablePath: "",
			virtualPath: "_root_",
		};
		const page: ClientMatch = {
			_type: "render",
			loaderData: null,
			render: () => {
				throw new NotFoundError();
			},
			variablePath: "",
			virtualPath: "_root_/missing",
		};

		const props = makeProviderProps({ matches: [layout, page] });
		dispose = render(
			() => (
				<FlareProvider {...props}>
					<Outlet />
				</FlareProvider>
			),
			container,
		);

		expect(container.querySelector("[data-testid='not-found']")).not.toBeNull();
	});

	it("UnauthenticatedError → walks unauthenticatedRender chain", () => {
		const layout: ClientMatch = {
			_type: "layout",
			loaderData: null,
			render: (props: RenderProps) => <div>{props.children}</div>,
			unauthenticatedRender: () => <div data-testid="unauth">Login required</div>,
			variablePath: "",
			virtualPath: "_root_",
		};
		const page: ClientMatch = {
			_type: "render",
			loaderData: null,
			render: () => {
				throw new UnauthenticatedError();
			},
			variablePath: "",
			virtualPath: "_root_/secret",
		};

		const props = makeProviderProps({ matches: [layout, page] });
		dispose = render(
			() => (
				<FlareProvider {...props}>
					<Outlet />
				</FlareProvider>
			),
			container,
		);

		expect(container.querySelector("[data-testid='unauth']")).not.toBeNull();
	});

	it("no unauthorized boundary → minimal fallback", () => {
		const page: ClientMatch = {
			_type: "render",
			loaderData: null,
			render: () => {
				throw new UnauthorizedError();
			},
			variablePath: "",
			virtualPath: "_root_/forbidden",
		};

		const props = makeProviderProps({ matches: [page] });
		dispose = render(
			() => (
				<FlareProvider {...props}>
					<Outlet />
				</FlareProvider>
			),
			container,
		);

		expect(container.textContent).toContain("Access denied");
	});
});
