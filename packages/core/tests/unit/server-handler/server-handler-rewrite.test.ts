import { describe, expect, it } from "vitest";
import type { LocationRewrite } from "../../../src/rewrite/index.ts";
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
	rewrite?: LocationRewrite;
	routes: Array<{ path: string; virtualPath: string }>;
}) {
	const tree = makeTree(opts.routes);
	return createServerHandler({
		router: createRouter({
			basePath: opts.basePath,
			layouts: {},
			rewrite: opts.rewrite,
			routeTree: tree,
		}),
	} as ServerHandlerConfig);
}

/* data request avoids SSR (renderToStream fails in jsdom) */
function dataRequest(url: string): Request {
	return new Request(url, { headers: { "x-d": "1" } });
}

function request(url: string): Request {
	return new Request(url);
}

/* ── Tests ────────────────────────────────────────────────────────────── */

describe("server-handler rewrite integration", () => {
	it("no rewrite, no basePath — matches route normally", async () => {
		const handler = makeHandler({
			routes: [{ path: "/about", virtualPath: "_root_/about" }],
		});
		const res = await handler.fetch(dataRequest("http://localhost/about"), {});
		expect(res.status).toBe(200);
		expect(res.headers.get("content-type")).toContain("ndjson");
	});

	it("no rewrite, no basePath — 404 for unknown route", async () => {
		const handler = makeHandler({
			routes: [{ path: "/about", virtualPath: "_root_/about" }],
		});
		const res = await handler.fetch(request("http://localhost/nope"), {});
		expect(res.status).toBe(404);
	});

	it("rewrite input transforms pathname for route matching", async () => {
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
		const res = await handler.fetch(dataRequest("http://localhost/vanity"), {});
		expect(res.status).toBe(200);
	});

	it("rewrite input — non-matching paths unaffected", async () => {
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
		const res = await handler.fetch(request("http://localhost/other"), {});
		expect(res.status).toBe(404);
	});

	it("basePath strips prefix via rewrite pipeline", async () => {
		const handler = makeHandler({
			basePath: "/app",
			routes: [{ path: "/about", virtualPath: "_root_/about" }],
		});
		const res = await handler.fetch(dataRequest("http://localhost/app/about"), {});
		expect(res.status).toBe(200);
	});

	it("basePath — root request matches /", async () => {
		const handler = makeHandler({
			basePath: "/app",
			routes: [{ path: "/", virtualPath: "_root_" }],
		});
		const res = await handler.fetch(dataRequest("http://localhost/app"), {});
		expect(res.status).toBe(200);
	});

	it("basePath — request outside basePath returns 404", async () => {
		const handler = makeHandler({
			basePath: "/app",
			routes: [{ path: "/about", virtualPath: "_root_/about" }],
		});
		const res = await handler.fetch(request("http://localhost/other/about"), {});
		expect(res.status).toBe(404);
	});

	it("basePath + rewrite compose — basePath strips first, then user rewrite", async () => {
		const handler = makeHandler({
			basePath: "/app",
			rewrite: {
				input: ({ url }) => {
					const match = url.pathname.match(/^\/(en|fr)(\/.*)/);
					if (match) {
						const next = new URL(url);
						next.pathname = match[2] ?? "/";
						return next;
					}
					return undefined;
				},
			},
			routes: [{ path: "/about", virtualPath: "_root_/about" }],
		});
		/* /app/en/about → strip /app → /en/about → strip locale → /about */
		const res = await handler.fetch(dataRequest("http://localhost/app/en/about"), {});
		expect(res.status).toBe(200);
	});

	it("basePath + rewrite — base path without locale still works", async () => {
		const handler = makeHandler({
			basePath: "/app",
			rewrite: {
				input: ({ url }) => {
					const match = url.pathname.match(/^\/(en|fr)(\/.*)/);
					if (match) {
						const next = new URL(url);
						next.pathname = match[2] ?? "/";
						return next;
					}
					return undefined;
				},
			},
			routes: [{ path: "/about", virtualPath: "_root_/about" }],
		});
		/* /app/about → strip /app → /about → no locale match → /about */
		const res = await handler.fetch(dataRequest("http://localhost/app/about"), {});
		expect(res.status).toBe(200);
	});
});
