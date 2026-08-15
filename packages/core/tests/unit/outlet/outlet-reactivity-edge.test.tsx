import { render } from "solid-js/web";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createMatchCache, createPrefetchCache } from "../../../src/caches/index.ts";
import { NotFoundError } from "../../../src/errors/index.ts";
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
import type { TreeNode } from "../../../src/router-primitives/types.ts";

function makeFakeTree(): TreeNode {
	return { s: {} };
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

/* ── location memo reactivity ─────────────────────────────────────── */

describe("location memo reactivity", () => {
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

	it("params-only change triggers location memo update (virtualPath stays)", () => {
		let ctx: FlareProviderContext | undefined;
		const page = makeMatch({ virtualPath: "_root_/users/[id]" });
		const props = makeProviderProps({
			matches: [page],
			params: { id: "1" },
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

		expect(ctx?.location().params).toEqual({ id: "1" });

		/* Simulate navigation: params change, same route */
		ctx?.setParams({ id: "99" });
		expect(ctx?.location().params).toEqual({ id: "99" });
		/* virtualPath unchanged */
		expect(ctx?.location().virtualPath).toBe("_root_/users/[id]");
	});

	it("search-only change triggers location memo update", () => {
		let ctx: FlareProviderContext | undefined;
		const page = makeMatch({ virtualPath: "_root_/search" });
		const props = makeProviderProps({ matches: [page] });

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

		expect(ctx?.location().search).toEqual({});

		ctx?.setSearch({ q: "hello" });
		expect(ctx?.location().search).toEqual({ q: "hello" });

		ctx?.setSearch({ page: "2", q: "world" });
		expect(ctx?.location().search).toEqual({ page: "2", q: "world" });
	});

	it("matches change updates virtualPath in location", () => {
		let ctx: FlareProviderContext | undefined;
		const home = makeMatch({ virtualPath: "_root_/home" });
		const about = makeMatch({ virtualPath: "_root_/about" });
		const props = makeProviderProps({ matches: [home] });

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

		expect(ctx?.location().virtualPath).toBe("_root_/home");

		ctx?.setMatches([about]);
		expect(ctx?.location().virtualPath).toBe("_root_/about");
	});

	it("empty matches → empty virtualPath", () => {
		let ctx: FlareProviderContext | undefined;
		const page = makeMatch({ virtualPath: "_root_/home" });
		const props = makeProviderProps({ matches: [page] });

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

		expect(ctx?.location().virtualPath).toBe("_root_/home");

		ctx?.setMatches([]);
		expect(ctx?.location().virtualPath).toBe("");
	});
});

/* ── useLoaderData reactivity ─────────────────────────────────────── */

describe("useLoaderData reactivity", () => {
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

	it("reacts to matches signal change with new loaderData", () => {
		let ctx: FlareProviderContext | undefined;
		let loaderAccessor: (() => unknown) | undefined;

		const page = makeMatch({
			loaderData: { count: 0 },
			virtualPath: "_root_/counter",
		});
		const props = makeProviderProps({ matches: [page] });

		dispose = render(
			() => (
				<FlareProvider {...props}>
					{(() => {
						ctx = useRouterContext();
						const router = useRouter();
						loaderAccessor = router.useLoaderData({ from: "_root_/counter" });
						return null;
					})()}
				</FlareProvider>
			),
			container,
		);

		expect(loaderAccessor?.()).toEqual({ count: 0 });

		/* Simulate revalidation updating loader data */
		ctx?.setMatches([
			makeMatch({
				loaderData: { count: 42 },
				virtualPath: "_root_/counter",
			}),
		]);
		expect(loaderAccessor?.()).toEqual({ count: 42 });
	});

	it("returns undefined when route disappears from matches", () => {
		let ctx: FlareProviderContext | undefined;
		let loaderAccessor: (() => unknown) | undefined;

		const page = makeMatch({
			loaderData: "visible",
			virtualPath: "_root_/temp",
		});
		const props = makeProviderProps({ matches: [page] });

		dispose = render(
			() => (
				<FlareProvider {...props}>
					{(() => {
						ctx = useRouterContext();
						const router = useRouter();
						loaderAccessor = router.useLoaderData({ from: "_root_/temp" });
						return null;
					})()}
				</FlareProvider>
			),
			container,
		);

		expect(loaderAccessor?.()).toBe("visible");

		/* Navigate away — match disappears */
		ctx?.setMatches([makeMatch({ virtualPath: "_root_/other" })]);
		expect(loaderAccessor?.()).toBeUndefined();
	});
});

/* ── useSearch / useParams reactivity ─────────────────────────────── */

describe("useSearch / useParams reactivity", () => {
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

	it("useSearch accessor updates when setSearch called", () => {
		let ctx: FlareProviderContext | undefined;
		let searchAccessor: (() => unknown) | undefined;

		const props = makeProviderProps();
		dispose = render(
			() => (
				<FlareProvider {...props}>
					{(() => {
						ctx = useRouterContext();
						const router = useRouter();
						searchAccessor = router.useSearch({ from: "_root_" });
						return null;
					})()}
				</FlareProvider>
			),
			container,
		);

		expect(searchAccessor?.()).toEqual({});

		ctx?.setSearch({ q: "test" });
		expect(searchAccessor?.()).toEqual({ q: "test" });
	});

	it("useParams accessor updates when setParams called", () => {
		let ctx: FlareProviderContext | undefined;
		let paramsAccessor: (() => unknown) | undefined;

		const props = makeProviderProps({ params: { id: "1" } });
		dispose = render(
			() => (
				<FlareProvider {...props}>
					{(() => {
						ctx = useRouterContext();
						const router = useRouter();
						paramsAccessor = router.useParams({ from: "_root_" });
						return null;
					})()}
				</FlareProvider>
			),
			container,
		);

		expect(paramsAccessor?.()).toEqual({ id: "1" });

		ctx?.setParams({ id: "999" });
		expect(paramsAccessor?.()).toEqual({ id: "999" });
	});
});

/* ── notFound reactivity ──────────────────────────────────────────── */

describe("notFound reactivity through Outlet", () => {
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

	it("notFound + empty matches → shows default 404 at depth 0", () => {
		let ctx: FlareProviderContext | undefined;
		const page = makeMatch({ virtualPath: "_root_/home" });
		const props = makeProviderProps({ matches: [page] });

		dispose = render(
			() => (
				<FlareProvider {...props}>
					{(() => {
						ctx = useRouterContext();
						return null;
					})()}
					<Outlet />
				</FlareProvider>
			),
			container,
		);

		expect(container.querySelector("[data-testid='page-_root_/home']")).not.toBeNull();

		/* notFound + clear matches → 404 fallback shows */
		ctx?.setNotFound(true);
		ctx?.setMatches([]);
		expect(container.textContent).toContain("Page not found");

		/* Clear notFound + restore matches → page back */
		ctx?.setNotFound(false);
		ctx?.setMatches([page]);
		expect(container.querySelector("[data-testid='page-_root_/home']")).not.toBeNull();
	});

	it("notFound=true but match exists → match still renders (notFound fallback only without match)", () => {
		let ctx: FlareProviderContext | undefined;
		const page = makeMatch({ loaderData: "still here", virtualPath: "_root_/home" });
		const props = makeProviderProps({ matches: [page] });

		dispose = render(
			() => (
				<FlareProvider {...props}>
					{(() => {
						ctx = useRouterContext();
						return null;
					})()}
					<Outlet />
				</FlareProvider>
			),
			container,
		);

		/* notFound=true but match exists → match wins */
		ctx?.setNotFound(true);
		expect(container.querySelector("[data-testid='page-_root_/home']")).not.toBeNull();
		expect(container.textContent).toContain("still here");
	});

	it("notFound + empty matches + global boundary → renders global 404", () => {
		let ctx: FlareProviderContext | undefined;
		const page = makeMatch({ virtualPath: "_root_/home" });
		const props = makeProviderProps({
			boundaries: {
				notFound: () => <div data-testid="global-404">Global Not Found</div>,
			},
			matches: [page],
		});

		dispose = render(
			() => (
				<FlareProvider {...props}>
					{(() => {
						ctx = useRouterContext();
						return null;
					})()}
					<Outlet />
				</FlareProvider>
			),
			container,
		);

		expect(container.querySelector("[data-testid='page-_root_/home']")).not.toBeNull();

		ctx?.setNotFound(true);
		ctx?.setMatches([]);
		expect(container.querySelector("[data-testid='global-404']")).not.toBeNull();
	});
});

/* ── isNavigating reactivity ──────────────────────────────────────── */

describe("isNavigating reactivity", () => {
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

	it("useRouter.isNavigating reflects setNavigationPhase changes", () => {
		let ctx: FlareProviderContext | undefined;
		let router: ReturnType<typeof useRouter> | undefined;

		const props = makeProviderProps();
		dispose = render(
			() => (
				<FlareProvider {...props}>
					{(() => {
						ctx = useRouterContext();
						router = useRouter();
						return null;
					})()}
				</FlareProvider>
			),
			container,
		);

		expect(router?.isNavigating()).toBe(false);
		ctx?.setNavigationPhase("loading");
		expect(router?.isNavigating()).toBe(true);
		ctx?.setNavigationPhase("idle");
		expect(router?.isNavigating()).toBe(false);
	});
});

/* ── ErrorBoundary reset on SPA navigation ────────────────────────── */

describe("ErrorBoundary reset on match change", () => {
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

	it("pipeline error on match → error rendered, setMatches to valid → error clears", () => {
		let ctx: FlareProviderContext | undefined;

		const errorPage: ClientMatch = {
			_type: "render",
			error: new Error("pipeline boom"),
			loaderData: null,
			render: () => <div data-testid="page-content">OK</div>,
			variablePath: "",
			virtualPath: "_root_/broken",
		};

		const props = makeProviderProps({ matches: [errorPage] });
		dispose = render(
			() => (
				<FlareProvider {...props}>
					{(() => {
						ctx = useRouterContext();
						return null;
					})()}
					<Outlet />
				</FlareProvider>
			),
			container,
		);

		/* Error should be shown */
		expect(container.textContent).toContain("Something went wrong");

		/* Navigate to valid page — match changes */
		const goodPage = makeMatch({
			loaderData: "fresh",
			virtualPath: "_root_/home",
		});
		ctx?.setMatches([goodPage]);

		/* Error boundary should reset, valid page should render */
		expect(container.querySelector("[data-testid='page-_root_/home']")).not.toBeNull();
		expect(container.textContent).toContain("fresh");
		expect(container.textContent).not.toContain("Something went wrong");
	});

	it("runtime error → SPA nav to new route → error boundary resets", () => {
		let ctx: FlareProviderContext | undefined;
		let throwError = true;

		const fragile: ClientMatch = {
			_type: "render",
			loaderData: null,
			render: () => {
				if (throwError) throw new Error("runtime crash");
				return <div data-testid="fragile-ok">Recovered</div>;
			},
			variablePath: "",
			virtualPath: "_root_/fragile",
		};

		const props = makeProviderProps({ matches: [fragile] });
		dispose = render(
			() => (
				<FlareProvider {...props}>
					{(() => {
						ctx = useRouterContext();
						return null;
					})()}
					<Outlet />
				</FlareProvider>
			),
			container,
		);

		/* Error boundary catches the throw */
		expect(container.textContent).toContain("Something went wrong");

		/* Fix the component and navigate to a different route */
		throwError = false;
		const safe = makeMatch({
			loaderData: "safe data",
			virtualPath: "_root_/safe",
		});
		ctx?.setMatches([safe]);

		expect(container.querySelector("[data-testid='page-_root_/safe']")).not.toBeNull();
		expect(container.textContent).not.toContain("Something went wrong");
	});

	it("NotFoundError on match → setMatches to valid → clears not-found boundary", () => {
		let ctx: FlareProviderContext | undefined;

		const layout = makeLayoutMatch("_root_", {
			notFoundRender: () => <div data-testid="nf-boundary">Not Found</div>,
		});
		const notFoundPage: ClientMatch = {
			_type: "render",
			error: new NotFoundError(),
			loaderData: null,
			render: () => <div>OK</div>,
			variablePath: "",
			virtualPath: "_root_/missing",
		};

		const props = makeProviderProps({ matches: [layout, notFoundPage] });
		dispose = render(
			() => (
				<FlareProvider {...props}>
					{(() => {
						ctx = useRouterContext();
						return null;
					})()}
					<Outlet />
				</FlareProvider>
			),
			container,
		);

		expect(container.querySelector("[data-testid='nf-boundary']")).not.toBeNull();

		/* Navigate to valid route */
		const valid = makeMatch({
			loaderData: "found!",
			virtualPath: "_root_/home",
		});
		ctx?.setMatches([layout, valid]);

		expect(container.querySelector("[data-testid='page-_root_/home']")).not.toBeNull();
		expect(container.querySelector("[data-testid='nf-boundary']")).toBeNull();
	});
});

/* ── Outlet depth matching edge cases ─────────────────────────────── */

describe("Outlet match replacement at same depth", () => {
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

	it("replacing page match at depth 1 (layout stays, page swaps)", () => {
		let ctx: FlareProviderContext | undefined;

		const layout = makeLayoutMatch("_root_");
		const page1 = makeMatch({ loaderData: "page-1", virtualPath: "_root_/page-1" });
		const page2 = makeMatch({ loaderData: "page-2", virtualPath: "_root_/page-2" });

		const props = makeProviderProps({ matches: [layout, page1] });
		dispose = render(
			() => (
				<FlareProvider {...props}>
					{(() => {
						ctx = useRouterContext();
						return null;
					})()}
					<Outlet />
				</FlareProvider>
			),
			container,
		);

		expect(container.querySelector("[data-testid='page-_root_/page-1']")).not.toBeNull();
		expect(container.textContent).toContain("page-1");

		/* Swap page at depth 1, layout at depth 0 unchanged */
		ctx?.setMatches([layout, page2]);

		expect(container.querySelector("[data-testid='page-_root_/page-2']")).not.toBeNull();
		expect(container.textContent).toContain("page-2");
		/* Layout remains */
		expect(container.querySelector("[data-testid='layout-_root_']")).not.toBeNull();
	});

	it("replacing layout → page chain entirely", () => {
		let ctx: FlareProviderContext | undefined;

		const layout1 = makeLayoutMatch("_root_/shop");
		const page1 = makeMatch({ loaderData: "product", virtualPath: "_root_/shop/product" });

		const layout2 = makeLayoutMatch("_root_/blog");
		const page2 = makeMatch({ loaderData: "post", virtualPath: "_root_/blog/post" });

		const props = makeProviderProps({ matches: [layout1, page1] });
		dispose = render(
			() => (
				<FlareProvider {...props}>
					{(() => {
						ctx = useRouterContext();
						return null;
					})()}
					<Outlet />
				</FlareProvider>
			),
			container,
		);

		expect(container.querySelector("[data-testid='layout-_root_/shop']")).not.toBeNull();

		/* Full route swap */
		ctx?.setMatches([layout2, page2]);

		expect(container.querySelector("[data-testid='layout-_root_/blog']")).not.toBeNull();
		expect(container.querySelector("[data-testid='layout-_root_/shop']")).toBeNull();
		expect(container.textContent).toContain("post");
	});
});

/* ── render receives location reactively ──────────────────────────── */

describe("render props receive reactive location", () => {
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

	it("page render() receives loaderData from match", () => {
		let receivedData: unknown;

		const page: ClientMatch = {
			_type: "render",
			loaderData: { title: "Hello" },
			render: (props: RenderProps) => {
				receivedData = props.loaderData;
				return <div>OK</div>;
			},
			variablePath: "",
			virtualPath: "_root_/page",
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

		expect(receivedData).toEqual({ title: "Hello" });
	});

	it("page render() receives preloaderContext from match", () => {
		let receivedPreloader: unknown;

		const page: ClientMatch = {
			_type: "render",
			loaderData: null,
			preloaderContext: { user: { name: "Alice" } },
			render: (props: RenderProps) => {
				receivedPreloader = props.preloaderContext;
				return <div>OK</div>;
			},
			variablePath: "",
			virtualPath: "_root_/page",
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

		expect(receivedPreloader).toEqual({ user: { name: "Alice" } });
	});
});

/* ── hydrated signal edge cases ───────────────────────────────────── */

describe("hydrated signal", () => {
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

	it("starts false, becomes true via setHydrated", () => {
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

		expect(ctx?.hydrated()).toBe(false);
		ctx?.setHydrated(true);
		expect(ctx?.hydrated()).toBe(true);
	});

	it("useRouter.hydrated reflects same signal", () => {
		let ctx: FlareProviderContext | undefined;
		let router: ReturnType<typeof useRouter> | undefined;

		const props = makeProviderProps();
		dispose = render(
			() => (
				<FlareProvider {...props}>
					{(() => {
						ctx = useRouterContext();
						router = useRouter();
						return null;
					})()}
				</FlareProvider>
			),
			container,
		);

		expect(router?.hydrated()).toBe(false);
		ctx?.setHydrated(true);
		expect(router?.hydrated()).toBe(true);
	});
});
