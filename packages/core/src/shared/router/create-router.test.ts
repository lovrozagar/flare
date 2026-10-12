import { expect, it } from "vitest";
import { createRouter } from "./create-router.ts";

const rootNotFound = () => "root";
const blogNotFound = () => "blog";
const localeNotFound = () => "locale";
const groupNotFound = () => "group";

const layouts = {
	_root_: { notFoundRender: rootNotFound },
	"_root_/blog": { notFoundRender: blogNotFound },
	"_root_/blog/drafts": {},
};

it("defaults", () => {
	const router = createRouter({ layouts: {}, routeTree: [] });
	expect(router).toMatchObject({
		basePath: "/",
		caseSensitive: false,
		trailingSlash: "preserve",
		notFoundMode: "root",
		scrollRestoration: true,
		scrollRestorationBehavior: "instant",
		scrollRestorationMaxEntries: 50,
		routeCacheMaxEntries: 100,
		prefetch: { modules: "all", data: false },
		cache: { client: { staleTime: 0, gcTime: "5m" } },
		viewTransitions: false,
	});
});

const post = { loader: () => "post" };
const pages = [{ id: "_root_/blog/post", path: "/blog/post", module: post }];

it("not found root", () => {
	const router = createRouter({ layouts, routeTree: pages });
	expect(router.match("/missing").notFoundRender).toBe(rootNotFound);
});

it("not found fuzzy", () => {
	const router = createRouter({ layouts, routeTree: pages, notFoundMode: "fuzzy" });
	expect(router.match("/blog/missing").notFoundRender).toBe(blogNotFound);
	expect(router.match("/blog").notFoundRender).toBe(blogNotFound);
	expect(router.match("/blog/drafts/missing").notFoundRender).toBe(rootNotFound);
	expect(router.match("/missing").notFoundRender).toBe(rootNotFound);
});

it("cache client only", () => {
	const router = createRouter({ layouts: {}, routeTree: [] });
	// @ts-expect-error the router cache has no ssr
	const rejected = createRouter({ layouts: {}, routeTree: [], cache: { ssr: { ttl: "1m" } } });
	expect(router.cache.client).toEqual({ staleTime: 0, gcTime: "5m" });
	expect(rejected.cache).not.toHaveProperty("ssr");
});

it("base path is a route", () => {
	const router = createRouter({
		layouts: { _root_: {} },
		routeTree: [{ id: "_root_", path: "/", module: {} }],
		basePath: "/app",
	});
	expect(router.match("/app").id).toBe("_root_");
	expect(router.match("/app/").id).toBe("_root_");
	expect(router.match("/").id).toBeUndefined();
});

it("theme absent", () => {
	const router = createRouter({ layouts: {}, routeTree: [] });
	expect(router).not.toHaveProperty("theme");
});

it("direction absent", () => {
	const router = createRouter({ layouts: {}, routeTree: [] });
	expect(router).not.toHaveProperty("direction");
});

it("matched chain", () => {
	const router = createRouter({ layouts, routeTree: pages });
	expect(router.match("/blog/post").chain).toEqual([
		{ id: "_root_", kind: "layout", module: layouts._root_ },
		{ id: "_root_/blog", kind: "layout", module: layouts["_root_/blog"] },
		{ id: "_root_/blog/post", kind: "page", module: post },
	]);
	const home = createRouter({ layouts: { _root_: {} }, routeTree: [{ id: "_root_", path: "/", module: post }] });
	expect(home.match("/").chain.map((entry) => [entry.id, entry.kind])).toEqual([
		["_root_", "layout"],
		["_root_", "page"],
	]);
});

it("not found chain", () => {
	const root = createRouter({ layouts, routeTree: pages });
	expect(root.match("/blog/missing").chain.map((entry) => entry.id)).toEqual(["_root_"]);
	const fuzzy = createRouter({ layouts, routeTree: pages, notFoundMode: "fuzzy" });
	expect(fuzzy.match("/blog/missing").chain.map((entry) => entry.id)).toEqual(["_root_", "_root_/blog"]);
	expect(fuzzy.match("/blog/drafts/missing").chain.map((entry) => entry.id)).toEqual([
		"_root_",
		"_root_/blog",
		"_root_/blog/drafts",
	]);
	expect(fuzzy.match("/missing").chain.map((entry) => entry.kind)).toEqual(["layout"]);
});

it("params and base path", () => {
	const user = { loader: () => "user" };
	const fresh = { loader: () => "new" };
	const router = createRouter({
		layouts: { _root_: {} },
		routeTree: [
			{ id: "_root_/users/[id]", path: "/users/[id]", module: user },
			{ id: "_root_/users/new", path: "/users/new", module: fresh },
			{ id: "_root_/about", path: "/about", module: {} },
		],
		basePath: "/app",
	});
	expect(router.match("/app/users/42")).toMatchObject({ id: "_root_/users/[id]", params: { id: "42" } });
	expect(router.match("/app/users/new").id).toBe("_root_/users/new");
	expect(router.match("/app/about").id).toBe("_root_/about");
	expect(router.match("/about").id).toBeUndefined();
	expect(router.match("/application/about").id).toBeUndefined();
});

it("not found roots", () => {
	const locale = createRouter({
		layouts: { "[locale]/_root_": { notFoundRender: localeNotFound } },
		routeTree: [{ id: "[locale]/_root_/about", path: "/[locale]/about", module: {} }],
	});
	expect(locale.match("/en/about").chain.map((entry) => entry.id)).toEqual([
		"[locale]/_root_",
		"[locale]/_root_/about",
	]);
	const missing = locale.match("/en/missing");
	expect(missing.chain.map((entry) => entry.id)).toEqual(["[locale]/_root_"]);
	expect(missing.notFoundRender).toBe(localeNotFound);
	expect(locale.match("/").chain).toEqual([]);
	expect(locale.match("/").notFoundRender).toBeUndefined();
	const admin = createRouter({ layouts: { _admin_: {} }, routeTree: [], notFoundMode: "fuzzy" });
	expect(admin.match("/x").chain.map((entry) => entry.id)).toEqual(["_admin_"]);
	const both = createRouter({ layouts: { _admin_: {}, _root_: { notFoundRender: rootNotFound } }, routeTree: [] });
	expect(both.match("/x").chain.map((entry) => entry.id)).toEqual(["_root_"]);
});

it("fuzzy group", () => {
	const router = createRouter({
		layouts: { _root_: { notFoundRender: rootNotFound }, "_root_/(blog)": { notFoundRender: groupNotFound } },
		routeTree: [{ id: "_root_/(blog)/post", path: "/post", module: {} }],
		notFoundMode: "fuzzy",
	});
	expect(router.match("/post").chain.map((entry) => entry.id)).toEqual([
		"_root_",
		"_root_/(blog)",
		"_root_/(blog)/post",
	]);
	const missing = router.match("/post/missing");
	expect(missing.chain.map((entry) => entry.id)).toEqual(["_root_", "_root_/(blog)"]);
	expect(missing.notFoundRender).toBe(groupNotFound);
});
