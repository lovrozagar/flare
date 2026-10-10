import { expect, it } from "vitest";
import { createRouter } from "./create-router.ts";

const rootNotFound = () => "root";
const blogNotFound = () => "blog";

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

const pages = [{ id: "_root_/blog/post", path: "/blog/post" }] as const;

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
		routeTree: [{ id: "_root_", path: "/" }],
		basePath: "/app",
	});
	expect(router.match("/app").id).toBe("_root_");
	expect(router.match("/app/").id).toBe("_root_");
});

it("theme absent", () => {
	const router = createRouter({ layouts: {}, routeTree: [] });
	expect(router).not.toHaveProperty("theme");
});

it("direction absent", () => {
	const router = createRouter({ layouts: {}, routeTree: [] });
	expect(router).not.toHaveProperty("direction");
});
