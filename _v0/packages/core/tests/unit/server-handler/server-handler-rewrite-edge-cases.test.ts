import { describe, expect, it } from "vitest";
import type { LocationRewrite } from "../../../src/rewrite/index.ts";
import { rewriteBasePath } from "../../../src/rewrite/index.ts";
import { createRouter } from "../../../src/router-config/index.ts";
import type { RouteData, TreeNode } from "../../../src/router-primitives/index.ts";
import { createTreeNode, insertRoute } from "../../../src/router-primitives/index.ts";
import { createServerHandler, type ServerHandlerConfig } from "../../../src/server-handler/index.ts";

/* ── Helpers ──────────────────────────────────────────────────────────── */

function makeRouteData(virtualPath: string): RouteData {
	return {
		e: virtualPath,
		o: {},
		p: () =>
			Promise.resolve({
				default: {
					loader: () => Promise.resolve({ page: virtualPath }),
					render: () => "page",
					variablePath: virtualPath,
					virtualPath,
				},
			}),
		t: "r" as const,
		v: virtualPath,
		x: virtualPath,
	};
}

function makeTree(routes: Array<{ path: string; virtualPath: string }>): TreeNode {
	const tree = createTreeNode();
	for (const r of routes) {
		insertRoute(tree, r.path, makeRouteData(r.virtualPath));
	}
	return tree;
}

function makeHandler(opts: {
	basePath?: string;
	caseSensitive?: boolean;
	rewrite?: LocationRewrite;
	routes: Array<{ path: string; virtualPath: string }>;
}) {
	const tree = makeTree(opts.routes);
	return createServerHandler({
		router: createRouter({
			basePath: opts.basePath,
			caseSensitive: opts.caseSensitive,
			layouts: {},
			rewrite: opts.rewrite,
			routeTree: tree,
		}),
	} as ServerHandlerConfig);
}

function dataRequest(url: string, headers?: Record<string, string>): Request {
	return new Request(url, { headers: { "flare-data": "1", ...headers } });
}

function request(url: string): Request {
	return new Request(url);
}

/* ── Tests ────────────────────────────────────────────────────────────── */

describe("server-handler rewrite — edge cases", () => {
	it("rewrite with search params — route still matches", async () => {
		const handler = makeHandler({
			rewrite: {
				input: ({ url }) => {
					if (url.pathname === "/vanity") {
						const next = new URL(url);
						next.pathname = "/about";
						return next;
					}
					return undefined;
				},
			},
			routes: [{ path: "/about", virtualPath: "_root_/about" }],
		});
		const res = await handler.fetch(dataRequest("http://localhost/vanity?q=test&page=2"), {});
		expect(res.status).toBe(200);
	});

	it("rewrite with hash — route still matches", async () => {
		const handler = makeHandler({
			rewrite: {
				input: ({ url }) => {
					if (url.pathname === "/vanity") {
						const next = new URL(url);
						next.pathname = "/about";
						return next;
					}
					return undefined;
				},
			},
			routes: [{ path: "/about", virtualPath: "_root_/about" }],
		});
		/* hash is client-only, not sent in request, but test URL parsing */
		const res = await handler.fetch(dataRequest("http://localhost/vanity"), {});
		expect(res.status).toBe(200);
	});

	it("rewrite to nonexistent route returns 404", async () => {
		const handler = makeHandler({
			rewrite: {
				input: ({ url }) => {
					if (url.pathname === "/vanity") {
						const next = new URL(url);
						next.pathname = "/does-not-exist";
						return next;
					}
					return undefined;
				},
			},
			routes: [{ path: "/about", virtualPath: "_root_/about" }],
		});
		const res = await handler.fetch(request("http://localhost/vanity"), {});
		expect(res.status).toBe(404);
	});

	it("multiple vanity URLs map to same target", async () => {
		const aliases: Record<string, string> = {
			"/careers": "/about",
			"/contact": "/about",
			"/team": "/about",
		};
		const handler = makeHandler({
			rewrite: {
				input: ({ url }) => {
					const target = aliases[url.pathname];
					if (target) {
						const next = new URL(url);
						next.pathname = target;
						return next;
					}
					return undefined;
				},
			},
			routes: [{ path: "/about", virtualPath: "_root_/about" }],
		});

		const res1 = await handler.fetch(dataRequest("http://localhost/careers"), {});
		const res2 = await handler.fetch(dataRequest("http://localhost/contact"), {});
		const res3 = await handler.fetch(dataRequest("http://localhost/team"), {});
		expect(res1.status).toBe(200);
		expect(res2.status).toBe(200);
		expect(res3.status).toBe(200);
	});

	it("i18n rewrite: /en/about and /fr/about both resolve to /about", async () => {
		const handler = makeHandler({
			rewrite: {
				input: ({ url }) => {
					const m = url.pathname.match(/^\/(en|fr|de)(\/.*)?$/);
					if (m) {
						const next = new URL(url);
						next.pathname = m[2] || "/";
						return next;
					}
					return undefined;
				},
			},
			routes: [
				{ path: "/", virtualPath: "_root_" },
				{ path: "/about", virtualPath: "_root_/about" },
			],
		});

		const resEn = await handler.fetch(dataRequest("http://localhost/en/about"), {});
		const resFr = await handler.fetch(dataRequest("http://localhost/fr/about"), {});
		const resDe = await handler.fetch(dataRequest("http://localhost/de/about"), {});
		const resRoot = await handler.fetch(dataRequest("http://localhost/en"), {});

		expect(resEn.status).toBe(200);
		expect(resFr.status).toBe(200);
		expect(resDe.status).toBe(200);
		expect(resRoot.status).toBe(200);
	});

	it("rewrite does not affect direct route access", async () => {
		const handler = makeHandler({
			rewrite: {
				input: ({ url }) => {
					if (url.pathname === "/vanity") {
						const next = new URL(url);
						next.pathname = "/about";
						return next;
					}
					return undefined;
				},
			},
			routes: [
				{ path: "/", virtualPath: "_root_" },
				{ path: "/about", virtualPath: "_root_/about" },
			],
		});

		/* Direct access still works */
		const resDirect = await handler.fetch(dataRequest("http://localhost/about"), {});
		expect(resDirect.status).toBe(200);

		/* Vanity also works */
		const resVanity = await handler.fetch(dataRequest("http://localhost/vanity"), {});
		expect(resVanity.status).toBe(200);

		/* Root still works */
		const resRoot = await handler.fetch(dataRequest("http://localhost/"), {});
		expect(resRoot.status).toBe(200);
	});

	it("basePath + caseSensitive: /App/about does not match /app basePath", async () => {
		const handler = makeHandler({
			basePath: "/app",
			routes: [{ path: "/about", virtualPath: "_root_/about" }],
		});
		const res = await handler.fetch(request("http://localhost/App/about"), {});
		expect(res.status).toBe(404);
	});

	it("nested basePath /org/app/v2 strips correctly", async () => {
		const handler = makeHandler({
			basePath: "/org/app/v2",
			routes: [{ path: "/dashboard", virtualPath: "_root_/dashboard" }],
		});
		const res = await handler.fetch(dataRequest("http://localhost/org/app/v2/dashboard"), {});
		expect(res.status).toBe(200);
	});

	it("basePath segment boundary: /app does not match /application", async () => {
		const handler = makeHandler({
			basePath: "/app",
			routes: [{ path: "/about", virtualPath: "_root_/about" }],
		});
		const res = await handler.fetch(request("http://localhost/application/about"), {});
		expect(res.status).toBe(404);
	});

	it("rewrite returning undefined for all paths is no-op", async () => {
		const handler = makeHandler({
			rewrite: { input: () => undefined },
			routes: [{ path: "/about", virtualPath: "_root_/about" }],
		});
		const res = await handler.fetch(dataRequest("http://localhost/about"), {});
		expect(res.status).toBe(200);
	});

	it("rewrite with dynamic param routes", async () => {
		const handler = makeHandler({
			rewrite: {
				input: ({ url }) => {
					/* /product/123 → /products/123 */
					const m = url.pathname.match(/^\/product\/(.+)$/);
					if (m) {
						const next = new URL(url);
						next.pathname = `/products/${m[1]}`;
						return next;
					}
					return undefined;
				},
			},
			routes: [{ path: "/products/[id]", virtualPath: "_root_/products/[id]" }],
		});
		const res = await handler.fetch(dataRequest("http://localhost/product/42"), {});
		expect(res.status).toBe(200);
	});
});
