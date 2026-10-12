import { createComponent, type Context } from "solid-js";
import { renderToString, type JSX } from "@solidjs/web";
import { expect, it } from "vitest";
import { createPage } from "../route-builder/page.ts";
import { createRootLayout } from "../route-builder/root-layout.ts";
import { LocationContext, NavigateContext, RouterContext, type NavigateTo } from "../router/context.ts";
import { createRouter } from "../router/create-router.ts";
import type { Location } from "../url/index.ts";
import { Matches, type OutletMatch } from "./outlet.tsx";
import {
	chooseNodes,
	useLoaderData,
	useLocation,
	useMatch,
	useNavigate,
	useParams,
	usePreloaderContext,
	useSearch,
} from "./outlet-nodes.ts";

const seen: { navigate?: (options: NavigateTo) => Promise<void>; [key: string]: unknown } = {};
const page = "_root_/users/[id]";

const root = createRootLayout("_root_").render((props) => {
	seen.layoutProps = { loaderData: props.loaderData, params: props.params, preloaderContext: props.preloaderContext };
	return ["root[", props.children, "]"];
});
const user = createPage(page).render((props) => {
	seen.pageProps = { ...props };
	seen.layoutData = useLoaderData({ from: "_root_" });
	seen.ownData = useLoaderData({ from: page });
	seen.params = { ...useParams({ from: page }) };
	seen.search = { ...useSearch({ from: page }) };
	seen.preloader = { ...usePreloaderContext({ from: page }) };
	seen.rootPreloader = { ...usePreloaderContext({ from: "_root_" }) };
	const match = useMatch({ from: page });
	seen.match = { id: match.id, routeId: match.routeId };
	const location = useLocation();
	seen.location = {
		pathname: location.pathname,
		search: location.search,
		hash: location.hash,
		params: location.params,
	};
	seen.navigate = useNavigate();
	return "page";
});
const router = createRouter({
	layouts: { _root_: root },
	routeTree: [{ id: page, path: "/users/[id]", module: user }],
});

// The same page under an optional segment, so the location's params drop the absent one.
const optional = createRouter({
	layouts: { _root_: root },
	routeTree: [{ id: page, path: "/users/[id]/[[tab]]", module: user }],
});

const location: Location = { pathname: "/users/7", search: "?tab=a&tag=x&tag=y", hash: "#top" };

const matches: OutletMatch[] = [
	{ id: "_root_", kind: "layout", module: root, params: { id: "7" }, search: {}, data: { section: "people" } },
	{
		id: page,
		kind: "page",
		module: user,
		params: { id: "7" },
		search: { tab: "a", tag: ["x", "y"] },
		data: { name: "Ada" },
		preloader: { role: "admin" },
	},
];

function provide<T>(context: Context<T>, value: T, children: () => JSX.Element): JSX.Element {
	return createComponent(context, {
		value,
		get children() {
			return children();
		},
	});
}

type Html = { navigate?: (options: NavigateTo) => Promise<void>; painted?: OutletMatch[]; at?: Location };

function html(input: Html = {}): string {
	const state = () => ({ matches: input.painted ?? matches, onBoundaryError: () => undefined });
	return renderToString(() =>
		provide(RouterContext, input.at === undefined ? router : optional, () =>
			provide(
				LocationContext,
				() => input.at ?? location,
				() => provide(NavigateContext, input.navigate ?? null, () => createComponent(Matches, { state })),
			),
		),
	);
}

async function navigateStub(): Promise<void> {}

it("matched nodes", () => {
	const nodes = chooseNodes(new Set(["root", "page"]), "page", ["root", "other"]);
	expect(nodes.page).toBe("page");
	expect(nodes.layouts).toEqual(["root"]);
	expect(chooseNodes(new Set(["root"]), "page", ["root"]).page).toBeUndefined();
});

it("page props", () => {
	html();
	expect(seen.pageProps).toEqual({
		loaderData: { name: "Ada" },
		params: { id: "7" },
		search: { tab: "a", tag: ["x", "y"] },
		preloaderContext: { role: "admin" },
	});
});

it("layout children", () => {
	expect(html()).toContain("root[");
	expect(html()).toContain("page");
	expect(seen.layoutProps).toEqual({ loaderData: { section: "people" }, params: { id: "7" }, preloaderContext: {} });
});

it("layout data", () => {
	html();
	expect(seen.layoutData).toEqual({ section: "people" });
	expect(seen.ownData).toEqual({ name: "Ada" });
	html({ painted: [{ ...matches[0], data: null }, matches[1]] });
	expect(seen.layoutData).toBeNull();
});

it("params", () => {
	html();
	expect(seen.params).toEqual({ id: "7" });
	expect(seen.location).toEqual({
		pathname: "/users/7",
		search: { tab: "a", tag: ["x", "y"] },
		hash: "#top",
		params: { id: "7" },
	});
	html({ at: { pathname: "/users/7", search: "", hash: "" } });
	expect(seen.location).toEqual({ pathname: "/users/7", search: {}, hash: "", params: { id: "7" } });
	const stray = createPage("_root_/stray").render(() => useParams({ from: "_root_/missing" }) && "x");
	const strayRouter = createRouter({
		layouts: { _root_: root },
		routeTree: [{ id: "_root_/stray", path: "/stray", module: stray }],
	});
	expect(() =>
		renderToString(() =>
			provide(RouterContext, strayRouter, () =>
				createComponent(Matches, {
					state: () => ({
						matches: [matches[0], { ...matches[1], id: "_root_/stray", module: stray }],
						onBoundaryError: () => undefined,
					}),
				}),
			),
		),
	).toThrow(/_root_\/missing/);
});

it("preloader", () => {
	html();
	expect(seen.preloader).toEqual({ role: "admin" });
	expect(seen.rootPreloader).toEqual({});
});

it("match", async () => {
	html();
	expect(seen.match).toEqual({ id: "id=7&tab=a&tag=x&tag=y", routeId: page });
	await expect(seen.navigate?.({ to: page })).rejects.toThrow(/browser/);
	html({ navigate: navigateStub });
	expect(seen.navigate).toBe(navigateStub);
});

it("search repeated", () => {
	html();
	expect(seen.search).toEqual({ tab: "a", tag: ["x", "y"] });
});

it("live data", () => {
	let painted: OutletMatch[] = [matches[0], { ...matches[1], data: { title: "First" } }];
	const views: { data?: unknown } = {};
	const live = createPage(page).render(() => {
		views.data = useLoaderData({ from: page });
		return "page";
	});
	renderToString(() =>
		provide(RouterContext, router, () =>
			createComponent(Matches, {
				state: () => ({
					matches: painted.map((match, index) => (index === 1 ? { ...match, module: live } : match)),
					onBoundaryError: () => undefined,
				}),
			}),
		),
	);
	expect(views.data).toEqual({ title: "First" });
	painted = [matches[0], { ...matches[1], data: { title: "Second" } }];
	expect(views.data).toEqual({ title: "Second" });
	expect("title" in Object(views.data)).toBe(true);
});
