import { expect, it } from "vitest";
import { createRouter, loadChain, loadedModule, notFoundRenderOf, type Match } from "./create-router.ts";

async function notFoundOf(match: Match): Promise<unknown> {
	return notFoundRenderOf(await loadChain(match.chain));
}

const rootNotFound = () => "root";
const blogNotFound = () => "blog";
const localeNotFound = () => "locale";
const groupNotFound = () => "group";

const layouts = {
	_root_: { boundaries: { notFoundRender: rootNotFound } },
	"_root_/blog": { boundaries: { notFoundRender: blogNotFound } },
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

it("not found root", async () => {
	const router = createRouter({ layouts, routeTree: pages });
	expect(await notFoundOf(router.match("/missing"))).toBe(rootNotFound);
});

it("not found fuzzy", async () => {
	const router = createRouter({ layouts, routeTree: pages, notFoundMode: "fuzzy" });
	expect(await notFoundOf(router.match("/blog/missing"))).toBe(blogNotFound);
	expect(await notFoundOf(router.match("/blog"))).toBe(blogNotFound);
	expect(await notFoundOf(router.match("/blog/drafts/missing"))).toBe(rootNotFound);
	expect(await notFoundOf(router.match("/missing"))).toBe(rootNotFound);
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
		routeTree: [{ id: "_root_/", path: "/", module: {} }],
		basePath: "/app",
	});
	expect(router.match("/app").id).toBe("_root_/");
	expect(router.match("/app/").id).toBe("_root_/");
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
	const home = createRouter({ layouts: { _root_: {} }, routeTree: [{ id: "_root_/", path: "/", module: post }] });
	expect(home.match("/").chain.map((entry) => [entry.id, entry.kind])).toEqual([
		["_root_", "layout"],
		["_root_/", "page"],
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

it("not found roots", async () => {
	const locale = createRouter({
		layouts: { "[locale]/_root_": { boundaries: { notFoundRender: localeNotFound } } },
		routeTree: [{ id: "[locale]/_root_/about", path: "/[locale]/about", module: {} }],
	});
	expect(locale.match("/en/about").chain.map((entry) => entry.id)).toEqual([
		"[locale]/_root_",
		"[locale]/_root_/about",
	]);
	const missing = locale.match("/en/missing");
	expect(missing.chain.map((entry) => entry.id)).toEqual(["[locale]/_root_"]);
	expect(await notFoundOf(missing)).toBe(localeNotFound);
	expect(locale.match("/").chain).toEqual([]);
	expect(await notFoundOf(locale.match("/"))).toBeUndefined();
	const admin = createRouter({ layouts: { _admin_: {} }, routeTree: [], notFoundMode: "fuzzy" });
	expect(admin.match("/x").chain.map((entry) => entry.id)).toEqual(["_admin_"]);
	const both = createRouter({
		layouts: { _admin_: {}, _root_: { boundaries: { notFoundRender: rootNotFound } } },
		routeTree: [],
	});
	expect(both.match("/x").chain.map((entry) => entry.id)).toEqual(["_root_"]);
});

it("fuzzy group", async () => {
	const router = createRouter({
		layouts: {
			_root_: { boundaries: { notFoundRender: rootNotFound } },
			"_root_/(blog)": { boundaries: { notFoundRender: groupNotFound } },
		},
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
	expect(await notFoundOf(missing)).toBe(groupNotFound);
});

it("prefixed root", async () => {
	const router = createRouter({
		layouts: { "site/_root_": { boundaries: { notFoundRender: rootNotFound } } },
		routeTree: [{ id: "site/_root_/about", path: "/about", module: {} }],
	});
	const missing = router.match("/missing");
	expect(missing.chain.map((entry) => entry.id)).toEqual(["site/_root_"]);
	expect(await notFoundOf(missing)).toBe(rootNotFound);
});

it("lazy chain", async () => {
	const root = { boundaries: { notFoundRender: rootNotFound } };
	const page = { loader: () => "page" };
	const router = createRouter({
		layouts: { _root_: () => Promise.resolve(root) },
		routeTree: [{ id: "_root_/a", path: "/a", module: () => Promise.resolve(page) }],
		chunks: { _root_: "/src/routes/_root_/root.root-layout.tsx" },
	});
	const match = router.match("/a");
	expect(match.chain.map((entry) => typeof entry.module)).toEqual(["function", "function"]);
	expect(match.chain.map((entry) => loadedModule(entry.module))).toEqual([undefined, undefined]);
	expect((await loadChain(match.chain)).map((entry) => entry.module)).toEqual([root, page]);
	expect(match.chain.map((entry) => loadedModule(entry.module))).toEqual([root, page]);
	expect(loadedModule(page)).toBe(page);
	expect(await notFoundOf(router.match("/nope"))).toBe(rootNotFound);
	expect(router.chunks).toEqual({ _root_: "/src/routes/_root_/root.root-layout.tsx" });
	expect(createRouter({ layouts: {}, routeTree: [] }).chunks).toEqual({});
	const broken = createRouter({
		layouts: { _root_: () => Promise.reject(new Error("Failed to fetch dynamically imported module")) },
		routeTree: [],
	});
	await expect(loadChain(broken.match("/x").chain)).rejects.toThrow(/dynamically imported/);
});

it("prefetch option", () => {
	const tree = { layouts: {}, routeTree: [] };
	expect(createRouter({ ...tree, prefetch: "intent" }).prefetch).toEqual({ modules: "intent", data: "intent" });
	expect(createRouter({ ...tree, prefetch: { data: "viewport" } }).prefetch).toEqual({
		modules: "all",
		data: "viewport",
	});
	expect(createRouter({ ...tree, prefetch: false }).prefetch).toEqual({ modules: false, data: false });
	const page = { cache: { client: { prefetch: "render" as const } } };
	const router = createRouter({
		layouts: { _root_: {} },
		routeTree: [
			{ id: "_root_/a", path: "/a", module: page },
			{ id: "_root_/b", path: "/b", client: { prefetch: "intent" }, module: () => Promise.resolve(page) },
			{ id: "_root_/c", path: "/c", module: {} },
		],
	});
	expect(router.match("/a").client).toEqual({ prefetch: "render" });
	expect(router.match("/b").client).toEqual({ prefetch: "intent" });
	expect(router.match("/c")).not.toHaveProperty("client");
});
