import { render } from "@solidjs/web";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMatchCache, createPrefetchCache } from "../../../src/caches/index.ts";
import { NotFoundError, UnauthorizedError } from "../../../src/errors/index.ts";
import {
	type ClientMatch,
	FlareProvider,
	type FlareProviderContext,
	type FlareProviderProps,
	Outlet,
	type RenderProps,
	useRouterContext,
} from "../../../src/outlet/index.tsx";
import type { TreeNode } from "../../../src/router-primitives/types.ts";

function makeFakeTree(): TreeNode {
	return {
		s: {},
	};
}

function makeMatch(overrides: Partial<ClientMatch> & { virtualPath: string; variablePath?: string }): ClientMatch {
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

describe("pipeline error rendering", () => {
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

	it("match with error field renders errorRender instead of normal render", () => {
		const page = makeMatch({
			error: new Error("broken"),
			errorRender: (props) => <div data-testid="error-boundary">{String((props.error as Error).message)}</div>,
			render: () => <div data-testid="should-not-render">Normal</div>,
			virtualPath: "_root_/broken",
		});

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
		expect(container.querySelector("[data-testid='error-boundary']")?.textContent).toBe("broken");
		expect(container.querySelector("[data-testid='should-not-render']")).toBeNull();
	});

	it("match with NotFoundError error field renders notFoundRender boundary", () => {
		const page = makeMatch({
			error: new NotFoundError(),
			notFoundRender: () => <div data-testid="not-found-boundary">Custom 404</div>,
			render: () => <div data-testid="should-not-render">Normal</div>,
			virtualPath: "_root_/missing",
		});

		const props = makeProviderProps({ matches: [page] });
		dispose = render(
			() => (
				<FlareProvider {...props}>
					<Outlet />
				</FlareProvider>
			),
			container,
		);

		expect(container.querySelector("[data-testid='not-found-boundary']")).not.toBeNull();
		expect(container.querySelector("[data-testid='not-found-boundary']")?.textContent).toBe("Custom 404");
		expect(container.querySelector("[data-testid='should-not-render']")).toBeNull();
	});

	it("match with UnauthorizedError error field renders unauthorizedRender boundary", () => {
		const page = makeMatch({
			error: new UnauthorizedError(),
			render: () => <div data-testid="should-not-render">Normal</div>,
			unauthorizedRender: () => <div data-testid="unauthorized-boundary">No access</div>,
			virtualPath: "_root_/forbidden",
		});

		const props = makeProviderProps({ matches: [page] });
		dispose = render(
			() => (
				<FlareProvider {...props}>
					<Outlet />
				</FlareProvider>
			),
			container,
		);

		expect(container.querySelector("[data-testid='unauthorized-boundary']")).not.toBeNull();
		expect(container.querySelector("[data-testid='unauthorized-boundary']")?.textContent).toBe("No access");
		expect(container.querySelector("[data-testid='should-not-render']")).toBeNull();
	});
});

describe("global boundary fallbacks", () => {
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

	it("generic Error at depth 0, no match boundary, no global boundary renders default fallback", () => {
		const page = makeMatch({
			error: new Error("unhandled"),
			render: () => <div>Normal</div>,
			virtualPath: "_root_/broken",
		});

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

	it("NotFoundError at depth 0, no boundary renders default not-found fallback", () => {
		const page = makeMatch({
			error: new NotFoundError(),
			render: () => <div>Normal</div>,
			virtualPath: "_root_/missing",
		});

		const props = makeProviderProps({ matches: [page] });
		dispose = render(
			() => (
				<FlareProvider {...props}>
					<Outlet />
				</FlareProvider>
			),
			container,
		);

		expect(container.textContent).toContain("Page not found");
	});
});

describe("children prop behavior", () => {
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

	it("page match (type render) does NOT receive children", () => {
		let receivedChildren: unknown = "sentinel";
		const page: ClientMatch = {
			_type: "render",
			loaderData: null,
			render: (props: RenderProps) => {
				receivedChildren = props.children;
				return <div data-testid="page">page</div>;
			},
			variablePath: "/home",
			virtualPath: "_root_/home",
		};

		const providerProps = makeProviderProps({ matches: [page] });
		dispose = render(
			() => (
				<FlareProvider {...providerProps}>
					<Outlet />
				</FlareProvider>
			),
			container,
		);

		expect(receivedChildren).toBeUndefined();
	});

	it("layout match (type layout) receives children in render props", () => {
		let receivedChildren: unknown;
		const layout: ClientMatch = {
			_type: "layout",
			loaderData: null,
			render: (props: RenderProps) => {
				receivedChildren = props.children;
				return <div data-testid="layout">{props.children}</div>;
			},
			variablePath: "/",
			virtualPath: "_root_",
		};
		const page = makeMatch({ virtualPath: "_root_/home" });

		const providerProps = makeProviderProps({ matches: [layout, page] });
		dispose = render(
			() => (
				<FlareProvider {...providerProps}>
					<Outlet />
				</FlareProvider>
			),
			container,
		);

		expect(receivedChildren).toBeDefined();
	});
});

describe("invalidate() function", () => {
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

	it("calling invalidate() triggers matchCache.invalidate()", () => {
		const matchCache = createMatchCache();
		const invalidateSpy = vi.spyOn(matchCache, "invalidate");

		let ctx: FlareProviderContext | undefined;
		const providerProps = makeProviderProps({ matchCache });

		dispose = render(
			() => (
				<FlareProvider {...providerProps}>
					{(() => {
						ctx = useRouterContext();
						return null;
					})()}
				</FlareProvider>
			),
			container,
		);

		ctx?.invalidate();

		expect(invalidateSpy).toHaveBeenCalledTimes(1);
		expect(invalidateSpy).toHaveBeenCalledWith(undefined);
	});

	it("invalidate with options passes them through to matchCache", () => {
		const matchCache = createMatchCache();
		const invalidateSpy = vi.spyOn(matchCache, "invalidate");

		let ctx: FlareProviderContext | undefined;
		const providerProps = makeProviderProps({ matchCache });

		dispose = render(
			() => (
				<FlareProvider {...providerProps}>
					{(() => {
						ctx = useRouterContext();
						return null;
					})()}
				</FlareProvider>
			),
			container,
		);

		const options = { matchId: "test-match-123" };
		ctx?.invalidate(options);

		expect(invalidateSpy).toHaveBeenCalledTimes(1);
		expect(invalidateSpy).toHaveBeenCalledWith(options);
	});
});

describe("notFound=true with empty matches", () => {
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

	it("notFound=true, empty matches → renders global notFound boundary", () => {
		const props = makeProviderProps({
			boundaries: {
				notFound: () => <div data-testid="global-404">Global Not Found</div>,
			},
			matches: [],
		});
		dispose = render(() => {
			let ctx: FlareProviderContext | undefined;
			return (
				<FlareProvider
					{...props}
					onContextReady={(c) => {
						ctx = c;
						queueMicrotask(() => ctx?.setNotFound(true));
					}}
				>
					<Outlet />
				</FlareProvider>
			);
		}, container);

		/* Wait for queueMicrotask to fire */
		return new Promise<void>((resolve) => {
			setTimeout(() => {
				expect(container.querySelector("[data-testid='global-404']")).not.toBeNull();
				expect(container.querySelector("[data-testid='global-404']")?.textContent).toBe("Global Not Found");
				resolve();
			}, 10);
		});
	});

	it("notFound=true, empty matches, no global boundary → renders default", () => {
		const props = makeProviderProps({ matches: [] });
		dispose = render(() => {
			return (
				<FlareProvider
					{...props}
					onContextReady={(ctx) => {
						queueMicrotask(() => ctx.setNotFound(true));
					}}
				>
					<Outlet />
				</FlareProvider>
			);
		}, container);

		return new Promise<void>((resolve) => {
			setTimeout(() => {
				expect(container.textContent).toContain("Page not found");
				resolve();
			}, 10);
		});
	});

	it("fuzzy mode: layout matches + synthetic notFound page renders layout shell + boundary", () => {
		const layout = makeLayoutMatch("_root_", {
			notFoundRender: () => <div data-testid="layout-404">Layout Not Found</div>,
			render: (props: RenderProps) => <div data-testid="layout-shell">{props.children}</div>,
		});
		const syntheticNotFound = makeMatch({
			_type: "render",
			error: new NotFoundError(),
			render: () => null,
			virtualPath: "_root_/__notfound",
		});

		const props = makeProviderProps({ matches: [layout, syntheticNotFound] });
		dispose = render(
			() => (
				<FlareProvider {...props}>
					<Outlet />
				</FlareProvider>
			),
			container,
		);

		expect(container.querySelector("[data-testid='layout-shell']")).not.toBeNull();
		expect(container.querySelector("[data-testid='layout-404']")).not.toBeNull();
	});
});

describe("multiple matches nesting", () => {
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

	it("3 matches: layout -> layout -> page renders nested with correct loaderData", () => {
		const rootLayout = makeLayoutMatch("_root_", {
			loaderData: "root-data",
			render: (props: RenderProps) => (
				<div data-testid="root-layout">
					<span data-testid="root-data">{String(props.loaderData)}</span>
					{props.children}
				</div>
			),
		});
		const innerLayout = makeLayoutMatch("_root_/(dashboard)", {
			loaderData: "dashboard-data",
			render: (props: RenderProps) => (
				<div data-testid="inner-layout">
					<span data-testid="inner-data">{String(props.loaderData)}</span>
					{props.children}
				</div>
			),
		});
		const page = makeMatch({
			loaderData: "page-data",
			render: (props: RenderProps) => (
				<div data-testid="leaf-page">
					<span data-testid="page-data">{String(props.loaderData)}</span>
				</div>
			),
			virtualPath: "_root_/(dashboard)/settings",
		});

		const providerProps = makeProviderProps({
			matches: [rootLayout, innerLayout, page],
		});
		dispose = render(
			() => (
				<FlareProvider {...providerProps}>
					<Outlet />
				</FlareProvider>
			),
			container,
		);

		const rootEl = container.querySelector("[data-testid='root-layout']");
		const innerEl = container.querySelector("[data-testid='inner-layout']");
		const pageEl = container.querySelector("[data-testid='leaf-page']");

		expect(rootEl).not.toBeNull();
		expect(innerEl).not.toBeNull();
		expect(pageEl).not.toBeNull();

		/* Nesting structure */
		expect(rootEl?.contains(innerEl)).toBe(true);
		expect(innerEl?.contains(pageEl)).toBe(true);

		/* Correct loaderData at each depth */
		expect(container.querySelector("[data-testid='root-data']")?.textContent).toBe("root-data");
		expect(container.querySelector("[data-testid='inner-data']")?.textContent).toBe("dashboard-data");
		expect(container.querySelector("[data-testid='page-data']")?.textContent).toBe("page-data");
	});

	it("empty matches renders nothing", () => {
		const providerProps = makeProviderProps({ matches: [] });
		dispose = render(
			() => (
				<FlareProvider {...providerProps}>
					<Outlet />
				</FlareProvider>
			),
			container,
		);

		expect(container.innerHTML).toBe("");
	});
});
