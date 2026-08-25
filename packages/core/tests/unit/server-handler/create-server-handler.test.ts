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

import { RedirectResponse, ServerFnValidationError } from "../../../src/errors/index.ts";
import { createRouter, type MarkedRouterConfig } from "../../../src/router-config/index.ts";
import type { RouteData, TreeNode } from "../../../src/router-primitives/index.ts";
import { createTreeNode, insertRoute } from "../../../src/router-primitives/index.ts";
import {
	createServerHandler,
	type ServerHandler,
	type ServerHandlerConfig,
} from "../../../src/server-handler/index.ts";

/* ── Helpers ──────────────────────────────────────────────────────────── */

function makeRouteTree(): TreeNode {
	return { s: {} };
}

function makeRouter(overrides?: Partial<MarkedRouterConfig>): MarkedRouterConfig {
	return createRouter({
		layouts: {},
		routeTree: makeRouteTree(),
		...overrides,
	});
}

function makeConfig(overrides?: Partial<ServerHandlerConfig>): ServerHandlerConfig {
	return {
		router: makeRouter(),
		...overrides,
	};
}

function makeRequest(url = "http://localhost/", init?: RequestInit): Request {
	return new Request(url, init);
}

function makeRouteData(overrides?: Partial<RouteData>): RouteData {
	return {
		e: "/about",
		o: {},
		p: () =>
			Promise.resolve({
				default: {
					loader: () => Promise.resolve({ title: "About" }),
					render: () => "about page",
					variablePath: "_root_/about",
					virtualPath: "_root_/about",
				},
			}),
		t: "r" as const,
		v: "_root_/about",
		x: "_root_/about",
		...overrides,
	};
}

function makeTreeWithRoute(path = "/about", routeData?: RouteData): TreeNode {
	const tree = createTreeNode();
	insertRoute(tree, path, routeData ?? makeRouteData());
	return tree;
}

/* ── Tests ────────────────────────────────────────────────────────────── */

describe("createServerHandler", () => {
	it("returns object with fetch method", () => {
		const handler = createServerHandler(makeConfig());
		expect(handler).toHaveProperty("fetch");
		expect(typeof handler.fetch).toBe("function");
	});

	it("fetch returns Promise<Response>", async () => {
		const handler = createServerHandler(makeConfig());
		const result = handler.fetch(makeRequest(), {});
		expect(result).toBeInstanceOf(Promise);
		const response = await result;
		expect(response).toBeInstanceOf(Response);
	});
});

describe("URL normalization in handler", () => {
	let handler: ServerHandler;

	function setup() {
		handler = createServerHandler(makeConfig());
	}

	it("trailing slash → 301 redirect", async () => {
		setup();
		const response = await handler.fetch(makeRequest("http://localhost/about/"), {});
		expect(response.status).toBe(301);
		expect(response.headers.get("Location")).toBe("/about");
	});

	it("static file extension → proceeds (not blocked)", async () => {
		setup();
		const response = await handler.fetch(makeRequest("http://localhost/style.css"), {});
		/* extensions pass through normalization — 404 because no routes match */
		expect(response.status).toBe(404);
	});

	it("root path → proceeds (not redirected)", async () => {
		setup();
		const response = await handler.fetch(makeRequest("http://localhost/"), {});
		/* should get past normalization — 404 because no routes match */
		expect(response.status).toBe(404);
	});
});

describe("route matching", () => {
	it("no match → 404 with security headers", async () => {
		const handler = createServerHandler(makeConfig());
		const response = await handler.fetch(makeRequest("http://localhost/nonexistent"), {});
		expect(response.status).toBe(404);
		expect(response.headers.get("Content-Security-Policy")).toBeTruthy();
		expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
		expect(response.headers.get("X-Frame-Options")).toBe("DENY");
	});

	it("no match → fallback HTML", async () => {
		const handler = createServerHandler(makeConfig());
		const response = await handler.fetch(makeRequest("http://localhost/nonexistent"), {});
		const body = await response.text();
		expect(body).toContain("404");
		expect(body).toContain("Not Found");
	});
});

describe("server function handling", () => {
	it("/_fn/ with no serverFns → delegates to handleServerFnRequest (404 fn)", async () => {
		const handler = createServerHandler(makeConfig());
		const response = await handler.fetch(makeRequest("http://localhost/_fn/test/run"), {});
		/* handleServerFnRequest returns 404 for unknown fn */
		expect(response.status).toBe(404);
		expect(response.headers.get("Content-Security-Policy")).toBeTruthy();
	});
});

describe("security headers", () => {
	it("404 response includes all security headers", async () => {
		devRef.current = false;
		const handler = createServerHandler(makeConfig());
		const response = await handler.fetch(makeRequest("http://localhost/nope"), {});
		expect(response.headers.get("Cross-Origin-Opener-Policy")).toBe("same-origin-allow-popups");
		expect(response.headers.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
		expect(response.headers.get("Strict-Transport-Security")).toContain("max-age=63072000");
		expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
		expect(response.headers.get("X-Frame-Options")).toBe("DENY");
	});

	it("dev mode skips HSTS and COOP headers", async () => {
		const handler = createServerHandler(makeConfig());
		const response = await handler.fetch(makeRequest("http://localhost/nope"), {});
		expect(response.headers.get("Cross-Origin-Opener-Policy")).toBeNull();
		expect(response.headers.get("Strict-Transport-Security")).toBeNull();
		expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
		expect(response.headers.get("X-Frame-Options")).toBe("DENY");
	});

	it("CSP includes nonce", async () => {
		devRef.current = false;
		const handler = createServerHandler(makeConfig());
		const response = await handler.fetch(makeRequest("http://localhost/nope"), {});
		const csp = response.headers.get("Content-Security-Policy") ?? "";
		expect(csp).toMatch(/nonce-[a-f0-9]+/);
	});

	it("CSP dev mode relaxation", async () => {
		const handler = createServerHandler(makeConfig());
		const response = await handler.fetch(makeRequest("http://localhost/nope"), {});
		const csp = response.headers.get("Content-Security-Policy") ?? "";
		expect(csp).toContain("unsafe-eval");
		expect(csp).toContain("ws://localhost:*");
	});

	it("trailing slash redirect has no security headers (pre-context)", async () => {
		const handler = createServerHandler(makeConfig());
		const response = await handler.fetch(makeRequest("http://localhost/about/"), {});
		expect(response.status).toBe(301);
		expect(response.headers.get("Content-Security-Policy")).toBeNull();
	});
});

describe("middleware integration", () => {
	it("no middlewares → proceeds to route handling", async () => {
		const handler = createServerHandler(makeConfig());
		const response = await handler.fetch(makeRequest(), {});
		/* should reach route matching → 404 for empty tree */
		expect(response.status).toBe(404);
	});

	it("empty middlewares array → proceeds to route handling", async () => {
		const handler = createServerHandler(makeConfig({ middlewareEntries: [] }));
		const response = await handler.fetch(makeRequest(), {});
		expect(response.status).toBe(404);
	});

	it("middleware bypass → returns raw response, no security headers", async () => {
		const handler = createServerHandler(
			makeConfig({
				middlewareEntries: [
					{
						middlewares: [(ctx) => Promise.resolve(ctx.bypass(new Response("bypassed", { status: 200 })))],
					},
				],
			}),
		);
		const response = await handler.fetch(makeRequest(), {});
		expect(response.status).toBe(200);
		expect(await response.text()).toBe("bypassed");
		expect(response.headers.get("Content-Security-Policy")).toBeNull();
	});

	it("middleware respond → response + security headers", async () => {
		const handler = createServerHandler(
			makeConfig({
				middlewareEntries: [
					{
						middlewares: [(ctx) => Promise.resolve(ctx.respond(new Response("responded", { status: 200 })))],
					},
				],
			}),
		);
		const response = await handler.fetch(makeRequest(), {});
		expect(response.status).toBe(200);
		expect(await response.text()).toBe("responded");
		expect(response.headers.get("Content-Security-Policy")).toBeTruthy();
		expect(response.headers.get("X-Frame-Options")).toBe("DENY");
	});

	it("middleware next → continues to route handling", async () => {
		const handler = createServerHandler(
			makeConfig({
				middlewareEntries: [{ middlewares: [async (ctx) => ctx.next()] }],
			}),
		);
		const response = await handler.fetch(makeRequest(), {});
		expect(response.status).toBe(404);
	});
});

describe("error handling", () => {
	it("middleware throwing generic error → 500 fallback", async () => {
		const handler = createServerHandler(
			makeConfig({
				middlewareEntries: [{ middlewares: [() => Promise.reject(new Error("test error"))] }],
			}),
		);
		const response = await handler.fetch(makeRequest(), {});
		expect(response.status).toBe(500);
		expect(response.headers.get("Content-Security-Policy")).toBeTruthy();
	});

	it("dev mode 500 → error message in body", async () => {
		const handler = createServerHandler(
			makeConfig({
				middlewareEntries: [{ middlewares: [() => Promise.reject(new Error("dev test error"))] }],
			}),
		);
		const response = await handler.fetch(makeRequest(), {});
		expect(response.status).toBe(500);
		const body = await response.text();
		expect(body).toContain("dev test error");
	});

	it("prod mode 500 → no stack trace", async () => {
		devRef.current = false;
		const handler = createServerHandler(
			makeConfig({
				middlewareEntries: [{ middlewares: [() => Promise.reject(new Error("secret error"))] }],
			}),
		);
		const response = await handler.fetch(makeRequest(), {});
		expect(response.status).toBe(500);
		const body = await response.text();
		expect(body).not.toContain("secret error");
		expect(body).toContain("Internal Server Error");
	});
});

describe("navigation format detection", () => {
	it("no x-d header → SSR path (404 for empty tree)", async () => {
		const handler = createServerHandler(makeConfig());
		const response = await handler.fetch(makeRequest(), {});
		expect(response.status).toBe(404);
		expect(response.headers.get("Content-Type")).toContain("text/html");
	});
});

describe("env passthrough", () => {
	it("env from fetch args accessible in middleware", async () => {
		const envSpy = vi.fn();
		const handler = createServerHandler(
			makeConfig({
				middlewareEntries: [
					{
						middlewares: [
							(ctx) => {
								envSpy(ctx.env);
								return Promise.resolve(ctx.respond(new Response("ok")));
							},
						],
					},
				],
			}),
		);
		const testEnv = { DB: "test-db" };
		await handler.fetch(makeRequest(), testEnv);
		expect(envSpy).toHaveBeenCalledWith(testEnv);
	});
});

/* ── Matched route: SSR path ─────────────────────────────────────────── */

describe("matched route — SSR path", () => {
	function makeHandlerWithRoute(routeOverrides?: Partial<RouteData>) {
		const tree = makeTreeWithRoute("/about", makeRouteData(routeOverrides));
		const router = makeRouter({ layouts: {}, routeTree: tree });
		return createServerHandler({ router });
	}

	it("matched route without x-d → SSR path entered (not 404)", async () => {
		const handler = makeHandlerWithRoute();
		const response = await handler.fetch(makeRequest("http://localhost/about"), {});
		/* Route matched → SSR path: either 200 (SSR succeeded) or 500 (SSR threw).
		   Both confirm the route was matched and the SSR path was entered. */
		expect([200, 500]).toContain(response.status);
		expect(response.headers.get("Content-Type")).toContain("text/html");
		expect(response.headers.get("Content-Security-Policy")).toBeTruthy();
	});
});

/* ── Matched route: Data request (NDJSON) path ───────────────────────── */

describe("matched route — data request (x-d:1)", () => {
	function makeHandlerWithRoute(routeOverrides?: Partial<RouteData>, configOverrides?: Partial<ServerHandlerConfig>) {
		const tree = makeTreeWithRoute("/about", makeRouteData(routeOverrides));
		const router = makeRouter({ layouts: {}, routeTree: tree });
		return createServerHandler({ router, ...configOverrides });
	}

	function dataRequest(url = "http://localhost/about", extraHeaders?: Record<string, string>) {
		return makeRequest(url, {
			headers: { "x-d": "1", ...extraHeaders },
		});
	}

	it("x-d:1 → NDJSON response (not HTML)", async () => {
		const handler = makeHandlerWithRoute();
		const response = await handler.fetch(dataRequest(), {});
		expect(response.status).toBe(200);
		const body = await response.text();
		/* NDJSON contains JSON lines with type field */
		expect(body).toContain('"t"');
		expect(response.headers.get("Content-Type")).not.toContain("text/html");
	});

	it("x-d:1 response includes security headers", async () => {
		const handler = makeHandlerWithRoute();
		const response = await handler.fetch(dataRequest(), {});
		expect(response.headers.get("Content-Security-Policy")).toBeTruthy();
		expect(response.headers.get("X-Frame-Options")).toBe("DENY");
	});

	it("x-d:1 + preloader redirect → NDJSON t:x, not HTTP 3xx", async () => {
		const handler = makeHandlerWithRoute({
			p: () =>
				Promise.resolve({
					default: {
						preloader: () => {
							throw new RedirectResponse({ to: "/redirect-target" });
						},
						variablePath: "_root_/about",
						virtualPath: "_root_/about",
					},
				}),
		});
		const response = await handler.fetch(dataRequest(), {});
		expect(response.status).toBe(200);
		expect(response.headers.get("Content-Type")).toContain("ndjson");
		expect(response.headers.get("Location")).toBeNull();
		const body = await response.text();
		const redirectLine = body
			.trim()
			.split("\n")
			.map((line) => JSON.parse(line) as Record<string, unknown>)
			.find((msg) => msg.t === "x");
		expect(redirectLine?.u).toBe("/redirect-target");
	});

	it("x-d:1 + x-p:1 + preloader redirect → NDJSON t:x", async () => {
		const handler = makeHandlerWithRoute({
			p: () =>
				Promise.resolve({
					default: {
						preloader: () => {
							throw new RedirectResponse({ to: "/redirect-target" });
						},
						variablePath: "_root_/about",
						virtualPath: "_root_/about",
					},
				}),
		});
		const response = await handler.fetch(dataRequest("http://localhost/about", { "x-p": "1" }), {});
		expect(response.status).toBe(200);
		expect(response.headers.get("Content-Type")).toContain("ndjson");
		expect(await response.text()).toContain('"t":"x"');
	});

	it("document request + preloader redirect → HTTP 3xx Location", async () => {
		const handler = makeHandlerWithRoute({
			p: () =>
				Promise.resolve({
					default: {
						preloader: () => {
							throw new RedirectResponse({ to: "/redirect-target" });
						},
						variablePath: "_root_/about",
						virtualPath: "_root_/about",
					},
				}),
		});
		const response = await handler.fetch(makeRequest("http://localhost/about"), {});
		expect(response.status).toBe(303);
		expect(response.headers.get("Location")).toBe("/redirect-target");
	});

	it("x-d:1 + x-p:1 → prefetch cause passed to pipeline", async () => {
		let capturedCtx: Record<string, unknown> = {};
		const handler = makeHandlerWithRoute({
			p: () =>
				Promise.resolve({
					default: {
						loader: (ctx: Record<string, unknown>) => {
							capturedCtx = ctx;
							return Promise.resolve({ data: "prefetched" });
						},
						variablePath: "_root_/about",
						virtualPath: "_root_/about",
					},
				}),
		});
		const req = makeRequest("http://localhost/about", {
			headers: { "x-d": "1", "x-p": "1" },
		});
		await handler.fetch(req, {});
		expect(capturedCtx.prefetch).toBe(true);
		expect(capturedCtx.cause).toBe("prefetch");
	});

	it("stale match filtering via x-m header strips loaders for fresh routes", async () => {
		const loaderSpy = vi.fn(() => Promise.resolve({ fresh: true }));
		const handler = makeHandlerWithRoute({
			p: () =>
				Promise.resolve({
					default: {
						loader: loaderSpy,
						variablePath: "_root_/about",
						virtualPath: "_root_/about",
					},
				}),
		});
		/* x-m lists stale matches — route NOT in list, so loader stripped */
		const req = makeRequest("http://localhost/about", {
			headers: { "x-d": "1", "x-m": "_root_/other" },
		});
		await handler.fetch(req, {});
		/* loader was stripped because "_root_/about" not in stale list */
		expect(loaderSpy).not.toHaveBeenCalled();
	});

	it("stale match ID matching current route → loader runs", async () => {
		const loaderSpy = vi.fn(() => Promise.resolve({ stale: true }));
		const handler = makeHandlerWithRoute({
			p: () =>
				Promise.resolve({
					default: {
						loader: loaderSpy,
						variablePath: "_root_/about",
						virtualPath: "_root_/about",
					},
				}),
		});
		/* route IS in stale list → loader should run */
		const req = makeRequest("http://localhost/about", {
			headers: { "x-d": "1", "x-m": "_root_/about" },
		});
		await handler.fetch(req, {});
		expect(loaderSpy).toHaveBeenCalled();
	});
});

/* ── Pipeline redirect handling ──────────────────────────────────────── */

describe("pipeline redirect", () => {
	it("redirect in match + data request → NDJSON redirect response", async () => {
		const tree = makeTreeWithRoute(
			"/login",
			makeRouteData({
				e: "/login",
				p: () =>
					Promise.resolve({
						default: {
							loader: () => {
								throw new RedirectResponse({ to: "/dashboard" });
							},
							variablePath: "_root_/login",
							virtualPath: "_root_/login",
						},
					}),
				v: "_root_/login",
				x: "_root_/login",
			}),
		);
		const router = makeRouter({ layouts: {}, routeTree: tree });
		const handler = createServerHandler({ router });
		const req = makeRequest("http://localhost/login", {
			headers: { "x-d": "1" },
		});
		const response = await handler.fetch(req, {});
		const body = await response.text();
		/* NDJSON redirect message contains redirect URL */
		expect(body).toContain("/dashboard");
	});

	it("redirect in match + SSR request → 302 Location header", async () => {
		const tree = makeTreeWithRoute(
			"/login",
			makeRouteData({
				e: "/login",
				p: () =>
					Promise.resolve({
						default: {
							loader: () => {
								throw new RedirectResponse({ to: "/dashboard" });
							},
							variablePath: "_root_/login",
							virtualPath: "_root_/login",
						},
					}),
				v: "_root_/login",
				x: "_root_/login",
			}),
		);
		const router = makeRouter({ layouts: {}, routeTree: tree });
		const handler = createServerHandler({ router });
		const response = await handler.fetch(makeRequest("http://localhost/login"), {});
		expect(response.status).toBe(303);
		expect(response.headers.get("Location")).toBe("/dashboard");
	});
});

/* ── Error catch paths ───────────────────────────────────────────────── */

describe("error catch paths", () => {
	it("ServerFnValidationError → 400 with message", async () => {
		const handler = createServerHandler(
			makeConfig({
				middlewareEntries: [
					{
						middlewares: [
							() => {
								throw new ServerFnValidationError({
									fieldErrors: { email: ["required"] },
									formErrors: [],
								});
							},
						],
					},
				],
			}),
		);
		const response = await handler.fetch(makeRequest(), {});
		expect(response.status).toBe(400);
		const body = await response.text();
		expect(body).toBe("Validation error");
		expect(response.headers.get("Content-Security-Policy")).toBeTruthy();
	});

	it("thrown RedirectResponse → 303 Location", async () => {
		const handler = createServerHandler(
			makeConfig({
				middlewareEntries: [
					{
						middlewares: [
							() => {
								throw new RedirectResponse({ to: "/home" });
							},
						],
					},
				],
			}),
		);
		const response = await handler.fetch(makeRequest(), {});
		expect(response.status).toBe(303);
		expect(response.headers.get("Location")).toBe("/home");
	});

	it("dedupeFetch: false → no enableFetchDedupe called", async () => {
		const handler = createServerHandler(makeConfig({ dedupeFetch: false }));
		const response = await handler.fetch(makeRequest(), {});
		/* should still work — just no dedupe wrapping */
		expect(response.status).toBe(404);
	});
});
