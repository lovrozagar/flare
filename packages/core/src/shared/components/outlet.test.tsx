import { createComponent, createSignal, flush, onCleanup } from "solid-js";
import { render, type JSX } from "@solidjs/web";
import { expect, it, vi } from "vitest";
import type { ErrorRender, Located } from "../route-builder/index.ts";
import { createLayout } from "../route-builder/layout.ts";
import { createPage } from "../route-builder/page.ts";
import { createRootLayout } from "../route-builder/root-layout.ts";
import { createRouter, loadChain, notFoundRenderOf, type RouteModule } from "../router/create-router.ts";
import { LocationContext, NavigateContext, RouterContext, type NavigateTo } from "../router/context.ts";
import { Matches, Outlet, type OutletMatch, type OutletState } from "./outlet.tsx";

const root = createRootLayout("_root_").render((props) => ["root[", props.children, "]"]);
const layout = createLayout("_root_/users/[id]").render(() => ["layout[", createComponent(Outlet, {}), "]"]);
const page = createPage("_root_/users/[id]/posts").render((props) => `page:${String(props.loaderData)}`);
const located =
	(name: string) =>
	(props: Located): JSX.Element =>
		`${name}:${String(Reflect.get(Object(props.params), "id"))}`;
const thrower: ErrorRender = () => {
	throw new Error("boundary broke");
};
const report = (): void => undefined;

function entry(id: string, kind: OutletMatch["kind"], module: RouteModule): OutletMatch {
	return { id, kind, module, params: { id: "L" }, search: {}, data: `${id}-data` };
}

function chain(layoutModule: RouteModule, pageModule: RouteModule): OutletMatch[] {
	return [
		entry("_root_", "layout", root),
		entry("_root_/users/[id]", "layout", layoutModule),
		{ ...entry("_root_/users/[id]/posts", "page", pageModule), params: { id: "P" } },
	];
}

function mount(state: () => OutletState): HTMLElement {
	const host = document.createElement("div");
	render(() => createComponent(Matches, { state }), host);
	flush();
	return host;
}

function failing(matches: OutletMatch[], index: number, status: number): () => OutletState {
	return () => ({ matches, failure: { index, status, error: new Error("secret") }, onBoundaryError: report });
}

it("page boundary", () => {
	const own = createPage("_root_/users/[id]/posts")
		.render(() => "page")
		.errorRender(located("page-error"));
	const text = mount(failing(chain(layout, own), 2, 500)).textContent;
	expect(text).toBe("root[layout[page-error:P]]");
});

it("layout chrome", () => {
	const guarded = createLayout("_root_/users/[id]")
		.render(() => ["layout[", createComponent(Outlet, {}), "]"])
		.errorRender(located("layout-error"));
	const text = mount(failing(chain(guarded, page), 2, 500)).textContent;
	expect(text).toBe("root[layout[layout-error:L]]");
});

it("descendant skipped", () => {
	const guarded = createLayout("_root_/users/[id]")
		.render(() => ["layout[", createComponent(Outlet, {}), "]"])
		.errorRender(located("layout-error"));
	const text = mount(failing(chain(guarded, page), 1, 500)).textContent;
	expect(text).toBe("root[layout-error:L]");
});

it("page builtin", () => {
	const host = mount(failing(chain(layout, page), 2, 500));
	expect(host.innerHTML).toBe("root[layout[<div>Something went wrong</div>]]");
	expect(host.innerHTML).not.toContain("secret");
});

it("root builtin", () => {
	expect(mount(failing(chain(layout, page), 0, 500)).innerHTML).toBe("<div>Something went wrong</div>");
});

it("not found own", () => {
	const errorRender = vi.fn<ErrorRender>(() => "error");
	const own = createPage("_root_/users/[id]/posts")
		.render(() => "page")
		.errorRender(errorRender)
		.notFoundRender(located("missing"));
	expect(mount(failing(chain(layout, own), 2, 404)).textContent).toBe("root[layout[missing:P]]");
	expect(errorRender).not.toHaveBeenCalled();
});

it("login", () => {
	const errorRender = vi.fn<ErrorRender>(() => "error");
	const own = createPage("_root_/users/[id]/posts")
		.render(() => "page")
		.errorRender(errorRender);
	expect(mount(failing(chain(layout, own), 2, 401)).innerHTML).toBe("root[layout[<div>Please log in</div>]]");
	expect(errorRender).not.toHaveBeenCalled();
});

it("denied", () => {
	expect(mount(failing(chain(layout, page), 2, 403)).innerHTML).toBe("root[layout[<div>Access denied</div>]]");
});

it("boundary throws", () => {
	const guarded = createLayout("_root_/users/[id]")
		.render(() => ["layout[", createComponent(Outlet, {}), "]"])
		.errorRender(located("layout-error"));
	const own = createPage("_root_/users/[id]/posts")
		.render(() => "page")
		.errorRender(thrower);
	const sender = vi.fn<(error: unknown) => void>();
	const matches = chain(guarded, own);
	const host = mount(() => ({
		matches,
		failure: { index: 2, status: 500, error: new Error("loader") },
		onBoundaryError: sender,
	}));
	expect(host.textContent).toBe("root[layout[layout-error:L]]");
	expect(sender).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ message: "boundary broke" }));
});

async function unknownState(router: ReturnType<typeof createRouter>, path: string): Promise<() => OutletState> {
	const chain = await loadChain(router.match(path).chain);
	const matches = chain.map((link) => entry(link.id, link.kind, link.module));
	return () => ({ matches, unknown: { render: notFoundRenderOf(chain) }, onBoundaryError: report });
}

it("unknown builtin", async () => {
	const router = createRouter({ layouts: { _root_: root }, routeTree: [] });
	expect(mount(await unknownState(router, "/nope")).innerHTML).toBe("root[<div>Page not found</div>]");
});

it("unknown admin", async () => {
	const admin = createRootLayout("_admin_")
		.render((props) => ["admin[", props.children, "]"])
		.notFoundRender(located("admin-missing"));
	const users = createLayout("_admin_/users").render((props) => ["users[", props.children, "]"]);
	const router = createRouter({
		layouts: { _root_: root, _admin_: admin, "_admin_/users": users },
		routeTree: [],
		notFoundMode: "fuzzy",
	});
	expect(mount(await unknownState(router, "/users/nope")).textContent).toBe("admin[users[admin-missing:L]]");
});

function counted(name: string, log: string[]): (props: { loaderData: unknown; children?: JSX.Element }) => JSX.Element {
	return (props) => {
		const id = String(props.loaderData);
		log.push(`mount ${name} ${id}`);
		onCleanup(() => log.push(`cleanup ${name} ${id}`));
		return [`${name}[`, () => String(props.loaderData), props.children, "]"];
	};
}

it("layout stays", () => {
	const log: string[] = [];
	const shell = createLayout("_root_/users/[id]").render(counted("layout", log));
	const first = chain(shell, page);
	const next = [...first.slice(0, 2), { ...entry("_root_/users/[id]/likes", "page", page), params: { id: "P" } }];
	const [state, setState] = createSignal<OutletState>({ matches: first, onBoundaryError: report });
	const host = mount(state);
	setState({ matches: next, onBoundaryError: report });
	flush();
	expect(log).toEqual(["mount layout _root_/users/[id]-data"]);
	expect(host.innerHTML).toBe("root[layout[_root_/users/[id]-datapage:_root_/users/[id]/likes-data]]");
	expect(Outlet.length).toBe(0);
});

it("page remounts", () => {
	const log: string[] = [];
	const counter = createPage("_root_/users/[id]/posts").render(counted("page", log));
	const first = chain(layout, counter);
	const [state, setState] = createSignal<OutletState>({ matches: first, onBoundaryError: report });
	const host = mount(state);
	setState({ matches: [...first.slice(0, 2), { ...first[2], data: "fresh" }], onBoundaryError: report });
	flush();
	expect(host.textContent).toBe("root[layout[page[fresh]]]");
	setState({
		matches: [...first.slice(0, 2), { ...first[2], id: "_root_/users/[id]/likes" }],
		onBoundaryError: report,
	});
	flush();
	expect(log).toEqual([
		"mount page _root_/users/[id]/posts-data",
		"mount page _root_/users/[id]/posts-data",
		"cleanup page _root_/users/[id]/posts-data",
	]);
});

it("no render", () => {
	const matches = [
		entry("_root_", "layout", root),
		entry("_root_/users/[id]", "layout", {}),
		entry("_root_/users/[id]/posts", "page", page),
	];
	expect(mount(() => ({ matches, onBoundaryError: report })).textContent).toBe(
		"root[page:_root_/users/[id]/posts-data]",
	);
});

it("uncaught throw", () => {
	const reported: unknown[] = [];
	const thrower = createPage("_root_/users/[id]/posts").render(() => {
		throw "not an error";
	});
	const matches = chain(layout, thrower);
	const host = mount(() => ({ matches, onBoundaryError: (error) => reported.push(error) }));
	expect(host.innerHTML).toBe("root[layout[<div>Something went wrong</div>]]");
	expect(reported).toEqual(["not an error"]);
});

it("reset wired", () => {
	const resets: (() => void)[] = [];
	const own = createPage("_root_/users/[id]/posts")
		.render(() => "page")
		.errorRender((props) => {
			resets.push(props.reset);
			return "failed";
		});
	// The painted records are an `.input()` output. Reset rebuilds the URL from the raw ones.
	const matches = chain(layout, own).map((match) => ({ ...match, params: { id: 9 }, search: { tab: 1 } }));
	const router = createRouter({
		layouts: { _root_: root },
		routeTree: [{ id: "_root_/users/[id]/posts", path: "/users/[id]/posts", module: own }],
	});
	const location = { pathname: "/users/P/posts", search: "?tab=a&tab=b", hash: "" };
	const navigate = vi.fn<(options: NavigateTo) => Promise<void>>(async () => undefined);
	const host = document.createElement("div");
	const navigated = (): JSX.Element =>
		createComponent(NavigateContext, {
			value: navigate,
			get children() {
				return createComponent(Matches, { state: failing(matches, 2, 500) });
			},
		});
	const located = (): JSX.Element =>
		createComponent(LocationContext, {
			value: () => location,
			get children() {
				return navigated();
			},
		});
	render(
		() =>
			createComponent(RouterContext, {
				value: router,
				get children() {
					return located();
				},
			}),
		host,
	);
	flush();
	expect(host.textContent).toBe("root[layout[failed]]");
	resets[0]();
	expect(navigate).toHaveBeenCalledExactlyOnceWith({
		to: "_root_/users/[id]/posts",
		params: { id: "P" },
		search: { tab: ["a", "b"] },
		replace: true,
		revalidate: true,
	});
	mount(failing(matches, 2, 500));
	expect(() => resets[1]()).not.toThrow();
});

it("layout alone", () => {
	const text = mount(() => ({ matches: [entry("_root_", "layout", root)], onBoundaryError: report })).textContent;
	expect(text).toBe("root[]");
});
