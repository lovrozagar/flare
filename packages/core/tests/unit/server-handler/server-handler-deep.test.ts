import { afterEach, describe, expect, it, vi } from "vitest";
import type { ServerFnRegistration } from "../../../src/server-fn/index.ts";

const devRef = vi.hoisted(() => ({ current: true }));
vi.mock("virtual:flare-is-dev", () => ({
	get default() {
		return devRef.current;
	},
}));

const fnRef = vi.hoisted(() => ({
	current: new Map() as Map<string, ServerFnRegistration>,
}));
vi.mock("virtual:flare-server-fn-map", () => ({
	get default() {
		return fnRef.current;
	},
}));

afterEach(() => {
	devRef.current = true;
	fnRef.current = new Map();
});

import {
	NotFoundError,
	RedirectResponse,
	ServerFnValidationError,
	UnauthenticatedError,
	UnauthorizedError,
} from "../../../src/errors/index.ts";
import { createRouter, type MarkedRouterConfig } from "../../../src/router-config/index.ts";
import type { RouteData, TreeNode } from "../../../src/router-primitives/index.ts";
import { createTreeNode, insertRoute } from "../../../src/router-primitives/index.ts";
import { buildCspHeader, createServerHandler, type ServerHandlerConfig } from "../../../src/server-handler/index.ts";

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

/* ── Redirect loop in catch block ────────────────────────────────────── */

describe("redirect loop in catch block", () => {
	it("thrown redirect within limit returns redirect response with Location header", async () => {
		const handler = createServerHandler(
			makeConfig({
				middlewareEntries: [
					{
						middlewares: [
							() => {
								throw new RedirectResponse({ to: "/target" });
							},
						],
					},
				],
			}),
		);
		const response = await handler.fetch(makeRequest(), {});
		expect(response.status).toBe(303);
		expect(response.headers.get("Location")).toBe("/target");
	});

	it("thrown redirect with custom status preserves status code", async () => {
		const handler = createServerHandler(
			makeConfig({
				middlewareEntries: [
					{
						middlewares: [
							() => {
								throw new RedirectResponse({ status: 307, to: "/moved" });
							},
						],
					},
				],
			}),
		);
		const response = await handler.fetch(makeRequest(), {});
		expect(response.status).toBe(307);
		expect(response.headers.get("Location")).toBe("/moved");
	});

	it("pipeline redirect in SSR path returns 303 Location header", async () => {
		const tree = makeTreeWithRoute(
			"/protected",
			makeRouteData({
				e: "/protected",
				p: () =>
					Promise.resolve({
						default: {
							loader: () => {
								throw new RedirectResponse({ to: "/login" });
							},
							variablePath: "_root_/protected",
							virtualPath: "_root_/protected",
						},
					}),
				v: "_root_/protected",
				x: "_root_/protected",
			}),
		);
		const router = makeRouter({ layouts: {}, routeTree: tree });
		const handler = createServerHandler({ router });
		const response = await handler.fetch(makeRequest("http://localhost/protected"), {});
		expect(response.status).toBe(303);
		expect(response.headers.get("Location")).toBe("/login");
	});
});

/* ── Fallback HTML variants ──────────────────────────────────────────── */

describe("fallback HTML variants", () => {
	it("UnauthenticatedError returns 401 fallback with security headers", async () => {
		const handler = createServerHandler(
			makeConfig({
				middlewareEntries: [
					{
						middlewares: [
							() => {
								throw new UnauthenticatedError();
							},
						],
					},
				],
			}),
		);
		const response = await handler.fetch(makeRequest(), {});
		expect(response.status).toBe(401);
		const body = await response.text();
		expect(body).toContain("401");
		expect(body).toContain("Unauthorized");
		expect(response.headers.get("Content-Security-Policy")).toBeTruthy();
		expect(response.headers.get("X-Frame-Options")).toBe("DENY");
		expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
	});

	it("UnauthorizedError returns 403 fallback with security headers", async () => {
		const handler = createServerHandler(
			makeConfig({
				middlewareEntries: [
					{
						middlewares: [
							() => {
								throw new UnauthorizedError();
							},
						],
					},
				],
			}),
		);
		const response = await handler.fetch(makeRequest(), {});
		expect(response.status).toBe(403);
		const body = await response.text();
		expect(body).toContain("403");
		expect(body).toContain("Forbidden");
		expect(response.headers.get("Content-Security-Policy")).toBeTruthy();
	});

	it("dev mode 500 includes error.message in body", async () => {
		const handler = createServerHandler(
			makeConfig({
				middlewareEntries: [
					{
						middlewares: [
							() => {
								throw new Error("unique-dev-error-msg");
							},
						],
					},
				],
			}),
		);
		const response = await handler.fetch(makeRequest(), {});
		expect(response.status).toBe(500);
		const body = await response.text();
		expect(body).toContain("unique-dev-error-msg");
	});
});

/* ── CSP edge cases ──────────────────────────────────────────────────── */

describe("CSP edge cases", () => {
	it("boolean false override removes directive", () => {
		const csp = buildCspHeader("n", { "upgrade-insecure-requests": false });
		expect(csp).not.toContain("upgrade-insecure-requests");
	});

	it("array override on non-existing directive creates new directive", () => {
		const csp = buildCspHeader("n", { "worker-src": ["'self'", "blob:"] });
		expect(csp).toContain("worker-src 'self' blob:");
	});

	it("undefined value in override is skipped", () => {
		const baselineCsp = buildCspHeader("n");
		const cspWithUndefined = buildCspHeader("n", { "font-src": undefined });
		/* font-src not in defaults, undefined should not add it */
		expect(cspWithUndefined).not.toContain("font-src");
		/* rest of CSP should be identical */
		expect(baselineCsp).toBe(cspWithUndefined);
	});
});

/* ── Response handler edge cases ─────────────────────────────────────── */

describe("response handler edge cases", () => {
	it("response handler transforms body via onResponse", async () => {
		const handler = createServerHandler(
			makeConfig({
				middlewareEntries: [
					{
						middlewares: [
							async (ctx) => {
								ctx.onResponse(async (res) => {
									const text = await res.text();
									return new Response(`${text}__marker__`, {
										headers: res.headers,
										status: res.status,
									});
								});
								return ctx.next();
							},
							(ctx) => Promise.resolve(ctx.respond(new Response("base-body", { status: 200 }))),
						],
					},
				],
			}),
		);
		const response = await handler.fetch(makeRequest(), {});
		const body = await response.text();
		expect(body).toContain("base-body__marker__");
	});

	it("multiple response handlers chain in order", async () => {
		const handler = createServerHandler(
			makeConfig({
				middlewareEntries: [
					{
						middlewares: [
							async (ctx) => {
								ctx.onResponse(async (res) => {
									const text = await res.text();
									return new Response(`${text}[first]`, {
										headers: res.headers,
										status: res.status,
									});
								});
								ctx.onResponse(async (res) => {
									const text = await res.text();
									return new Response(`${text}[second]`, {
										headers: res.headers,
										status: res.status,
									});
								});
								return ctx.next();
							},
							(ctx) => Promise.resolve(ctx.respond(new Response("start", { status: 200 }))),
						],
					},
				],
			}),
		);
		const response = await handler.fetch(makeRequest(), {});
		const body = await response.text();
		expect(body).toBe("start[first][second]");
	});
});

/* ── Server function auth ────────────────────────────────────────────── */

describe("server function auth", () => {
	it("/_flare/server-fn/ path with authenticateFn creates auth wrapper for authenticated fns", async () => {
		const authSpy = vi.fn((..._args: unknown[]) => Promise.resolve({ userId: "u1" }));
		const fnSpy = vi.fn(() => Promise.resolve({ ok: true }));

		const fns = new Map([
			[
				"test-id",
				{
					authenticate: true,
					fn: fnSpy,
					id: "test-id",
					method: "post" as const,
					name: "run",
				},
			],
		]);

		fnRef.current = fns;
		const handler = createServerHandler(
			makeConfig({
				authenticateFn: (ctx) => authSpy(ctx.env, ctx.request),
			}),
		);

		const response = await handler.fetch(
			makeRequest("http://localhost/_flare/server-fn/test-id/run", {
				body: JSON.stringify({ data: 1 }),
				headers: { "Content-Type": "application/json" },
				method: "POST",
			}),
			{ DB: "test" },
		);

		expect(response.status).toBe(200);
		expect(authSpy).toHaveBeenCalled();
		expect(fnSpy).toHaveBeenCalled();
	});

	it("/_flare/server-fn/ path without authenticateFn returns 401 for authenticated fn", async () => {
		const fns = new Map([
			[
				"test-id",
				{
					authenticate: true,
					fn: () => Promise.resolve({ ok: true }),
					id: "test-id",
					method: "post" as const,
					name: "run",
				},
			],
		]);

		fnRef.current = fns;
		const handler = createServerHandler(makeConfig());

		const response = await handler.fetch(
			makeRequest("http://localhost/_flare/server-fn/test-id/run", {
				body: JSON.stringify({}),
				headers: { "Content-Type": "application/json" },
				method: "POST",
			}),
			{},
		);

		expect(response.status).toBe(401);
	});
});

describe("PE POST security headers", () => {
	it("success 303 includes nosniff", async () => {
		fnRef.current = new Map([
			[
				"pe-ok",
				{
					authenticate: false,
					fn: () => Promise.resolve({ ok: true }),
					id: "pe-ok",
					method: "post" as const,
					name: "save",
				},
			],
		]);
		const handler = createServerHandler(makeConfig());
		const form = new FormData();
		form.set("flare_fn", "pe-ok");
		const response = await handler.fetch(
			makeRequest("http://localhost/page", {
				body: form,
				method: "POST",
			}),
			{},
		);
		expect(response.status).toBe(303);
		expect(response.headers.get("x-content-type-options")).toBe("nosniff");
		expect(response.headers.get("location")).toBe("/page");
	});

	it("CSRF 403 includes nosniff", async () => {
		fnRef.current = new Map([
			[
				"pe-csrf",
				{
					authenticate: false,
					fn: () => Promise.resolve({ ok: true }),
					id: "pe-csrf",
					method: "post" as const,
					name: "save",
				},
			],
		]);
		const handler = createServerHandler(makeConfig());
		const form = new FormData();
		form.set("flare_fn", "pe-csrf");
		const response = await handler.fetch(
			makeRequest("http://localhost/page", {
				body: form,
				headers: { Origin: "https://evil.com" },
				method: "POST",
			}),
			{},
		);
		expect(response.status).toBe(403);
		expect(response.headers.get("x-content-type-options")).toBe("nosniff");
	});
});

/* ── Security header non-override ────────────────────────────────────── */

describe("security header non-override", () => {
	it("custom response with CSP is not overwritten by server", async () => {
		const customCsp = "default-src 'none'";
		const handler = createServerHandler(
			makeConfig({
				middlewareEntries: [
					{
						middlewares: [
							(ctx) =>
								Promise.resolve(
									ctx.respond(
										new Response("custom", {
											headers: { "Content-Security-Policy": customCsp },
											status: 200,
										}),
									),
								),
						],
					},
				],
			}),
		);
		const response = await handler.fetch(makeRequest(), {});
		expect(response.headers.get("Content-Security-Policy")).toBe(customCsp);
	});

	it("custom response with X-Frame-Options is not overwritten by server", async () => {
		const handler = createServerHandler(
			makeConfig({
				middlewareEntries: [
					{
						middlewares: [
							(ctx) =>
								Promise.resolve(
									ctx.respond(
										new Response("custom", {
											headers: { "X-Frame-Options": "SAMEORIGIN" },
											status: 200,
										}),
									),
								),
						],
					},
				],
			}),
		);
		const response = await handler.fetch(makeRequest(), {});
		expect(response.headers.get("X-Frame-Options")).toBe("SAMEORIGIN");
	});
});

/* ── Additional error type fallbacks ───────────────────────────────── */

describe("additional error type fallbacks", () => {
	it("NotFoundError thrown → 404 fallback with security headers", async () => {
		const handler = createServerHandler(
			makeConfig({
				middlewareEntries: [
					{
						middlewares: [
							() => {
								throw new NotFoundError("page not found");
							},
						],
					},
				],
			}),
		);
		const response = await handler.fetch(makeRequest(), {});
		expect(response.status).toBe(404);
		const body = await response.text();
		expect(body).toContain("404");
		expect(body).toContain("Not Found");
		expect(response.headers.get("Content-Security-Policy")).toBeTruthy();
	});

	it("ServerFnValidationError thrown → 400 plain text", async () => {
		const handler = createServerHandler(
			makeConfig({
				middlewareEntries: [
					{
						middlewares: [
							() => {
								throw new ServerFnValidationError({
									fieldErrors: { name: ["required"] },
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
		expect(response.headers.get("Content-Type")).toBe("text/plain");
		expect(await response.text()).toBe("Validation error");
	});

	it("dev mode 500 with non-Error thrown → generic fallback HTML", async () => {
		const handler = createServerHandler(
			makeConfig({
				middlewareEntries: [
					{
						middlewares: [
							() => {
								throw "string-error";
							},
						],
					},
				],
			}),
		);
		const response = await handler.fetch(makeRequest(), {});
		expect(response.status).toBe(500);
		const body = await response.text();
		/* Non-Error goes through buildDevErrorHtml fallback → uses FALLBACK_500 */
		expect(body).toContain("500");
		expect(body).not.toContain("string-error");
	});

	it("prod mode 500 → generic fallback without error details", async () => {
		devRef.current = false;
		const handler = createServerHandler(
			makeConfig({
				middlewareEntries: [
					{
						middlewares: [
							() => {
								throw new Error("secret-internal-error");
							},
						],
					},
				],
			}),
		);
		const response = await handler.fetch(makeRequest(), {});
		expect(response.status).toBe(500);
		const body = await response.text();
		expect(body).toContain("500");
		expect(body).not.toContain("secret-internal-error");
	});
});
