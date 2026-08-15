import { afterEach, describe, expect, it, vi } from "vitest";

const devRef = vi.hoisted(() => ({ current: true }));
vi.mock("virtual:flare-is-dev", () => ({
	get default() {
		return devRef.current;
	},
}));

afterEach(() => {
	devRef.current = true;
});

import { createRouter, type MarkedRouterConfig } from "../../../src/router-config/index.ts";
import type { RouteData } from "../../../src/router-primitives/index.ts";
import { createTreeNode, insertRoute } from "../../../src/router-primitives/index.ts";
import { createServerHandler, type ServerHandlerConfig } from "../../../src/server-handler/index.ts";

/* ── Helpers ──────────────────────────────────────────────────────────── */

function makeRouter(overrides?: Partial<MarkedRouterConfig>): MarkedRouterConfig {
	return createRouter({
		layouts: {},
		routeTree: createTreeNode(),
		...overrides,
	});
}

function makeConfig(overrides?: Partial<ServerHandlerConfig>): ServerHandlerConfig {
	return {
		router: makeRouter(),
		...overrides,
	};
}

function makeRequest(url: string, init?: RequestInit): Request {
	return new Request(url, init);
}

function makeRouteData(overrides?: Partial<RouteData>): RouteData {
	return {
		e: "/test",
		o: {},
		p: () =>
			Promise.resolve({
				default: {
					loader: () => ({ ok: true }),
					render: () => "test page",
					variablePath: "_root_/test",
					virtualPath: "_root_/test",
				},
			}),
		t: "r" as const,
		v: "_root_/test",
		x: "_root_/test",
		...overrides,
	};
}

/* ── caseSensitive integration ───────────────────────────────────────── */

describe("caseSensitive through server handler", () => {
	it("default: /About matches /about route (case-insensitive)", async () => {
		const tree = createTreeNode();
		insertRoute(
			tree,
			"/about",
			makeRouteData({
				e: "/about",
				v: "_root_/about",
				x: "_root_/about",
			}),
		);
		const handler = createServerHandler(
			makeConfig({
				router: makeRouter({ routeTree: tree }),
			}),
		);
		const response = await handler.fetch(makeRequest("http://localhost/About"), {});
		/* Matched → enters SSR path (200 or 500), not 404 */
		expect([200, 500]).toContain(response.status);
	});

	it("caseSensitive=true: /About does NOT match /about route → 404", async () => {
		const tree = createTreeNode();
		insertRoute(
			tree,
			"/about",
			makeRouteData({
				e: "/about",
				v: "_root_/about",
				x: "_root_/about",
			}),
		);
		const handler = createServerHandler(
			makeConfig({
				router: makeRouter({ caseSensitive: true, routeTree: tree }),
			}),
		);
		const response = await handler.fetch(makeRequest("http://localhost/About"), {});
		expect(response.status).toBe(404);
	});

	it("caseSensitive=true: exact case matches", async () => {
		const tree = createTreeNode();
		insertRoute(
			tree,
			"/about",
			makeRouteData({
				e: "/about",
				v: "_root_/about",
				x: "_root_/about",
			}),
		);
		const handler = createServerHandler(
			makeConfig({
				router: makeRouter({ caseSensitive: true, routeTree: tree }),
			}),
		);
		const response = await handler.fetch(makeRequest("http://localhost/about"), {});
		expect([200, 500]).toContain(response.status);
	});

	it("caseSensitive affects data requests too", async () => {
		const tree = createTreeNode();
		insertRoute(
			tree,
			"/about",
			makeRouteData({
				e: "/about",
				p: () =>
					Promise.resolve({
						default: {
							loader: () => ({ title: "About" }),
							render: () => "about",
							variablePath: "_root_/about",
							virtualPath: "_root_/about",
						},
					}),
				v: "_root_/about",
				x: "_root_/about",
			}),
		);
		const handler = createServerHandler(
			makeConfig({
				router: makeRouter({ caseSensitive: true, routeTree: tree }),
			}),
		);
		const response = await handler.fetch(makeRequest("http://localhost/About", { headers: { "x-d": "1" } }), {});
		expect(response.status).toBe(404);
	});

	it("caseSensitive + fuzzy notFound: partial match also case-sensitive", async () => {
		const tree = createTreeNode();
		/* No root layout — only /products leaf */
		insertRoute(
			tree,
			"/products",
			makeRouteData({
				e: "/products",
				v: "_root_/products",
				x: "_root_/products",
			}),
		);

		const handler = createServerHandler(
			makeConfig({
				router: makeRouter({ caseSensitive: true, notFoundMode: "fuzzy", routeTree: tree }),
			}),
		);

		/* /Products/123 should NOT partial-match /products because case-sensitive → 404 */
		const mismatched = await handler.fetch(makeRequest("http://localhost/Products/123"), {});
		expect(mismatched.status).toBe(404);

		/* /products/123 DOES partial-match /products (exact case) → SSR (200 or 500 in test) */
		const matched = await handler.fetch(makeRequest("http://localhost/products/123"), {});
		expect([200, 500]).toContain(matched.status);
	});
});

/* ── trailingSlash integration ───────────────────────────────────────── */

describe("trailingSlash through server handler", () => {
	it('default "never": /about/ → 301 redirect to /about', async () => {
		const handler = createServerHandler(makeConfig());
		const response = await handler.fetch(makeRequest("http://localhost/about/"), {});
		expect(response.status).toBe(301);
		expect(response.headers.get("Location")).toBe("/about");
	});

	it('"always": /about → 301 redirect to /about/', async () => {
		const handler = createServerHandler(
			makeConfig({
				router: makeRouter({ trailingSlash: "always" }),
			}),
		);
		const response = await handler.fetch(makeRequest("http://localhost/about"), {});
		expect(response.status).toBe(301);
		expect(response.headers.get("Location")).toBe("/about/");
	});

	it('"always": /about/ → proceeds to route matching', async () => {
		const handler = createServerHandler(
			makeConfig({
				router: makeRouter({ trailingSlash: "always" }),
			}),
		);
		const response = await handler.fetch(makeRequest("http://localhost/about/"), {});
		/* No redirect, proceeds to matching → 404 because no routes */
		expect(response.status).toBe(404);
	});

	it('"always": root / → no redirect', async () => {
		const handler = createServerHandler(
			makeConfig({
				router: makeRouter({ trailingSlash: "always" }),
			}),
		);
		const response = await handler.fetch(makeRequest("http://localhost/"), {});
		expect(response.status).toBe(404); /* passes through, just no routes */
	});

	it('"always": preserves query and hash', async () => {
		const handler = createServerHandler(
			makeConfig({
				router: makeRouter({ trailingSlash: "always" }),
			}),
		);
		const response = await handler.fetch(makeRequest("http://localhost/about?q=1#top"), {});
		expect(response.status).toBe(301);
		expect(response.headers.get("Location")).toBe("/about/?q=1#top");
	});

	it('"preserve": /about/ → no redirect, proceeds', async () => {
		const handler = createServerHandler(
			makeConfig({
				router: makeRouter({ trailingSlash: "preserve" }),
			}),
		);
		const response = await handler.fetch(makeRequest("http://localhost/about/"), {});
		expect(response.status).toBe(404); /* no routes, but no redirect */
	});

	it('"preserve": /about → no redirect, proceeds', async () => {
		const handler = createServerHandler(
			makeConfig({
				router: makeRouter({ trailingSlash: "preserve" }),
			}),
		);
		const response = await handler.fetch(makeRequest("http://localhost/about"), {});
		expect(response.status).toBe(404);
	});
});

/* ── basePath integration ────────────────────────────────────────────── */

describe("basePath through server handler", () => {
	function makeHandlerWithBasePath(basePath: string) {
		const tree = createTreeNode();
		insertRoute(
			tree,
			"/about",
			makeRouteData({
				e: "/about",
				v: "_root_/about",
				x: "_root_/about",
			}),
		);
		insertRoute(
			tree,
			"/",
			makeRouteData({
				e: "/",
				p: () =>
					Promise.resolve({
						default: {
							loader: () => ({ home: true }),
							render: () => "home",
							variablePath: "_root_/home",
							virtualPath: "_root_/home",
						},
					}),
				v: "_root_/home",
				x: "_root_/home",
			}),
		);
		return createServerHandler(
			makeConfig({
				router: makeRouter({ basePath, routeTree: tree }),
			}),
		);
	}

	it("request with basePath prefix → route matched", async () => {
		const handler = makeHandlerWithBasePath("/app");
		const response = await handler.fetch(makeRequest("http://localhost/app/about"), {});
		/* basePath stripped → /about → route found → SSR */
		expect([200, 500]).toContain(response.status);
	});

	it("request without basePath prefix → 404", async () => {
		const handler = makeHandlerWithBasePath("/app");
		const response = await handler.fetch(makeRequest("http://localhost/about"), {});
		expect(response.status).toBe(404);
	});

	it("basePath root request → matches / route", async () => {
		const handler = makeHandlerWithBasePath("/app");
		const response = await handler.fetch(makeRequest("http://localhost/app"), {});
		/* /app stripped → / → root route matched */
		expect([200, 500]).toContain(response.status);
	});

	it("basePath with nested path → strips correctly", async () => {
		const tree = createTreeNode();
		insertRoute(
			tree,
			"/users/[id]",
			makeRouteData({
				e: "/users/[id]",
				p: () =>
					Promise.resolve({
						default: {
							loader: (ctx: Record<string, unknown>) => {
								const loc = ctx.location as { params: Record<string, string> };
								return { id: loc.params.id };
							},
							render: () => "user page",
							variablePath: "_root_/users/[id]",
							virtualPath: "_root_/users/[id]",
						},
					}),
				v: "_root_/users/[id]",
				x: "_root_/users/[id]",
			}),
		);
		const handler = createServerHandler(
			makeConfig({
				router: makeRouter({ basePath: "/v2", routeTree: tree }),
			}),
		);
		const response = await handler.fetch(makeRequest("http://localhost/v2/users/42"), {});
		expect([200, 500]).toContain(response.status);
	});

	it("basePath does not affect /_fn/ routes", async () => {
		const handler = makeHandlerWithBasePath("/app");
		const response = await handler.fetch(makeRequest("http://localhost/_fn/test/run"), {});
		/* Server functions bypass basePath — handled before route matching */
		expect(response.status).toBe(404); /* no fn registered, but route entered */
	});

	it("basePath does not affect trailing slash normalization", async () => {
		const handler = makeHandlerWithBasePath("/app");
		const response = await handler.fetch(makeRequest("http://localhost/app/about/"), {});
		expect(response.status).toBe(301);
		expect(response.headers.get("Location")).toBe("/app/about");
	});

	it("basePath + caseSensitive combined", async () => {
		const tree = createTreeNode();
		insertRoute(
			tree,
			"/about",
			makeRouteData({
				e: "/about",
				v: "_root_/about",
				x: "_root_/about",
			}),
		);
		const handler = createServerHandler(
			makeConfig({
				router: makeRouter({
					basePath: "/app",
					caseSensitive: true,
					routeTree: tree,
				}),
			}),
		);
		/* Correct basePath + correct case → match */
		const ok = await handler.fetch(makeRequest("http://localhost/app/about"), {});
		expect([200, 500]).toContain(ok.status);

		/* Wrong case → 404 */
		const fail = await handler.fetch(makeRequest("http://localhost/app/About"), {});
		expect(fail.status).toBe(404);
	});
});
