/** @vitest-environment node */
import { describe, expect, it, vi } from "vitest";

vi.mock("virtual:flare-client-entry", () => ({ default: "/entry.js" }));
vi.mock("virtual:flare-generated", () => ({ layoutModuleIds: {} }));
vi.mock("virtual:flare-is-dev", () => ({ default: false }));
vi.mock("virtual:flare-module-preloads", () => ({
	clientManifest: null,
	entryPreloads: { css: [], js: [] },
}));
vi.mock("virtual:flare-server-fn-map", () => ({ default: {} }));
vi.mock("../../../src/dedupe", () => ({
	disableFetchDedupe: vi.fn(),
	enableFetchDedupe: vi.fn(),
}));
vi.mock("../../../src/server-context", () => ({
	generateNonce: () => "testnonce",
	getFormActionContext: vi.fn(),
	getServerContext: () => ({}),
	getServerLogs: () => [],
	runWithServerContext: (_ctx: unknown, fn: () => unknown) => fn(),
	serverLog: vi.fn(),
	setFormActionContext: vi.fn(),
}));

import { createTreeNode, insertRoute } from "../../../src/router-primitives/tree.ts";
import type { TreeNode } from "../../../src/router-primitives/types.ts";
import { createServerHandler } from "../../../src/server-handler/index.ts";

function makeRouteData(virtualPath: string, variablePath: string, mod: Record<string, unknown>) {
	return {
		e: "page",
		f: `src/routes/${virtualPath}.tsx`,
		o: {},
		p: () => Promise.resolve({ default: mod }),
		t: "r" as const,
		v: variablePath,
		x: virtualPath,
	};
}

function buildTree(routes: Array<{ data: ReturnType<typeof makeRouteData>; path: string }>): TreeNode {
	const tree = createTreeNode();
	for (const r of routes) {
		insertRoute(tree, r.path, r.data);
	}
	return tree;
}

function makeHandler(routeTree: TreeNode, layouts: Record<string, () => Promise<{ default: unknown }>> = {}) {
	return createServerHandler({
		router: {
			layouts,
			routeTree,
			[Symbol.for("flare/router-config")]: true,
		} as never,
	});
}

describe("getStaticParams", () => {
	it("ssg: true on [locale] route expands from router.locale.locales", async () => {
		const pageMod = {
			_type: "render",
			cache: { ssg: true },
			render: () => null,
		};
		const route = makeRouteData("_root_/[locale]/ssg-about", "/[locale]/ssg-about", pageMod);
		const tree = buildTree([{ data: route, path: "/:locale/ssg-about" }]);

		const result = await createServerHandler({
			router: {
				layouts: {},
				locale: { defaultLocale: "en", locales: ["en", "fr"], paramName: "locale" },
				routeTree: tree,
				[Symbol.for("flare/router-config")]: true,
			} as never,
		}).getStaticParams();

		expect(result.get("_root_/[locale]/ssg-about")).toEqual([{ locale: "en" }, { locale: "fr" }]);
	});

	it("optional [[locale]] route is collected and expanded", async () => {
		const pageMod = {
			_type: "render",
			cache: { ssg: { params: () => [{ locale: "en" }, { locale: "hr" }] } },
			render: () => null,
		};
		const route = makeRouteData("[[locale]]/_root_/about", "/[[locale]]/about", pageMod);
		const tree = buildTree([{ data: route, path: "/[[locale]]/about" }]);

		const result = await makeHandler(tree).getStaticParams();
		expect(result.get("[[locale]]/_root_/about")).toEqual([{ locale: "en" }, { locale: "hr" }]);
	});

	it("page-only params → correct expansion", async () => {
		const pageMod = {
			_type: "render",
			cache: { ssg: { params: () => [{ slug: "hello" }, { slug: "world" }] } },
			render: () => null,
		};
		const route = makeRouteData("_root_/blog/[slug]", "/blog/:slug", pageMod);
		const tree = buildTree([{ data: route, path: "/blog/:slug" }]);

		const handler = makeHandler(tree);
		const result = await handler.getStaticParams();
		expect(result.size).toBe(1);
		const params = result.get("_root_/blog/[slug]");
		expect(params).toHaveLength(2);
		expect(params?.[0]).toEqual({ slug: "hello" });
		expect(params?.[1]).toEqual({ slug: "world" });
	});

	it("layout + page → cartesian product", async () => {
		const layoutMod = {
			_type: "layout",
			cache: { ssg: { params: () => [{ locale: "en" }, { locale: "fr" }] } },
			render: () => null,
		};
		const pageMod = {
			_type: "render",
			cache: {
				ssg: { params: () => [{ slug: "hello" }, { slug: "world" }] },
			},
			render: () => null,
		};

		const route = makeRouteData("_root_/[locale]/[slug]", "/[locale]/[slug]", pageMod);
		const tree = buildTree([{ data: route, path: "/:locale/:slug" }]);

		const handler = makeHandler(tree, {
			"_root_/[locale]": () => Promise.resolve({ default: layoutMod }),
		});

		const result = await handler.getStaticParams();
		const params = result.get("_root_/[locale]/[slug]");
		expect(params).toHaveLength(4);
		expect(params).toEqual([
			{ locale: "en", slug: "hello" },
			{ locale: "en", slug: "world" },
			{ locale: "fr", slug: "hello" },
			{ locale: "fr", slug: "world" },
		]);
	});

	it("layout params, page inherits (ssg: true) → layout params used", async () => {
		const layoutMod = {
			_type: "layout",
			cache: { ssg: { params: () => [{ locale: "en" }, { locale: "fr" }] } },
			render: () => null,
		};
		const pageMod = {
			_type: "render",
			cache: { ssg: true },
			render: () => null,
		};

		const route = makeRouteData("_root_/[locale]/about", "/[locale]/about", pageMod);
		const tree = buildTree([{ data: route, path: "/:locale/about" }]);

		const handler = makeHandler(tree, {
			"_root_/[locale]": () => Promise.resolve({ default: layoutMod }),
		});

		const result = await handler.getStaticParams();
		const params = result.get("_root_/[locale]/about");
		expect(params).toHaveLength(2);
		expect(params).toEqual([{ locale: "en" }, { locale: "fr" }]);
	});

	it("no params fns in chain → not in map", async () => {
		const pageMod = {
			_type: "render",
			cache: { ssg: true },
			render: () => null,
		};

		const route = makeRouteData("_root_/[slug]", "/[slug]", pageMod);
		const tree = buildTree([{ data: route, path: "/:slug" }]);

		const handler = makeHandler(tree);
		const result = await handler.getStaticParams();
		expect(result.has("_root_/[slug]")).toBe(false);
	});

	it("no dynamic segments → not processed", async () => {
		const pageMod = {
			_type: "render",
			cache: { ssg: true },
			render: () => null,
		};

		const route = makeRouteData("_root_/about", "/about", pageMod);
		const tree = buildTree([{ data: route, path: "/about" }]);

		const handler = makeHandler(tree);
		const result = await handler.getStaticParams();
		expect(result.size).toBe(0);
	});

	it("params fn error → logged, skipped", async () => {
		const pageMod = {
			_type: "render",
			cache: {
				ssg: {
					params: () => {
						throw new Error("DB connection failed");
					},
				},
			},
			render: () => null,
		};

		const route = makeRouteData("_root_/blog/[slug]", "/blog/[slug]", pageMod);
		const tree = buildTree([{ data: route, path: "/blog/:slug" }]);

		const handler = makeHandler(tree);
		const result = await handler.getStaticParams();
		expect(result.has("_root_/blog/[slug]")).toBe(false);
	});

	it("async params fns work correctly", async () => {
		const pageMod = {
			_type: "render",
			cache: { ssg: { params: async () => [{ slug: "async-post" }] } },
			render: () => null,
		};

		const route = makeRouteData("_root_/blog/[slug]", "/blog/[slug]", pageMod);
		const tree = buildTree([{ data: route, path: "/blog/:slug" }]);

		const handler = makeHandler(tree);
		const result = await handler.getStaticParams();
		expect(result.get("_root_/blog/[slug]")).toEqual([{ slug: "async-post" }]);
	});

	it("ssg shorthand fn (ssg: fn) extracts correctly", async () => {
		const pageMod = {
			_type: "render",
			cache: { ssg: () => [{ id: "1" }, { id: "2" }] },
			render: () => null,
		};

		const route = makeRouteData("_root_/users/[id]", "/users/[id]", pageMod);
		const tree = buildTree([{ data: route, path: "/users/:id" }]);

		const handler = makeHandler(tree);
		const result = await handler.getStaticParams();
		const params = result.get("_root_/users/[id]");
		expect(params).toHaveLength(2);
		expect(params?.[0]).toEqual({ id: "1" });
	});

	it("isr.params extracts correctly", async () => {
		const pageMod = {
			_type: "render",
			cache: { isr: { params: () => [{ slug: "featured" }], revalidate: 60 } },
			render: () => null,
		};

		const route = makeRouteData("_root_/posts/[slug]", "/posts/[slug]", pageMod);
		const tree = buildTree([{ data: route, path: "/posts/:slug" }]);

		const handler = makeHandler(tree);
		const result = await handler.getStaticParams();
		expect(result.get("_root_/posts/[slug]")).toEqual([{ slug: "featured" }]);
	});

	it("root + layout + page → three levels", async () => {
		const rootMod = {
			_type: "root-layout",
			cache: { ssg: { params: () => [{ locale: "en" }, { locale: "de" }] } },
			render: () => null,
		};
		const layoutMod = {
			_type: "layout",
			cache: {
				ssg: { params: () => [{ category: "tech" }, { category: "news" }] },
			},
			render: () => null,
		};
		const pageMod = {
			_type: "render",
			cache: { ssg: { params: () => [{ id: "1" }] } },
			render: () => null,
		};

		const route = makeRouteData("_root_/[locale]/[category]/[id]", "/[locale]/[category]/[id]", pageMod);
		const tree = buildTree([{ data: route, path: "/:locale/:category/:id" }]);

		const handler = makeHandler(tree, {
			_root_: () => Promise.resolve({ default: rootMod }),
			"_root_/[locale]/[category]": () => Promise.resolve({ default: layoutMod }),
		});

		const result = await handler.getStaticParams();
		const params = result.get("_root_/[locale]/[category]/[id]");
		expect(params).toHaveLength(4);
		expect(params).toEqual([
			{ category: "tech", id: "1", locale: "en" },
			{ category: "news", id: "1", locale: "en" },
			{ category: "tech", id: "1", locale: "de" },
			{ category: "news", id: "1", locale: "de" },
		]);
	});
});
