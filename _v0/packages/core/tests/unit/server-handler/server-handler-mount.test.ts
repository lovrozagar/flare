import { describe, expect, it, vi } from "vitest";

vi.mock("virtual:flare-is-dev", () => ({
	get default() {
		return true;
	},
}));

import type { MountConfig } from "../../../src/mount/index.ts";
import { createRouter, type MarkedRouterConfig } from "../../../src/router-config/index.ts";
import type { TreeNode } from "../../../src/router-primitives/index.ts";
import { createServerHandler, type ServerHandlerConfig } from "../../../src/server-handler/index.ts";

/* ── Helpers ──────────────────────────────────────────────────────────── */

function makeRouter(overrides?: Partial<MarkedRouterConfig>): MarkedRouterConfig {
	return createRouter({
		layouts: {},
		routeTree: { s: {} } as TreeNode,
		...overrides,
	});
}

function makeConfig(overrides?: Partial<ServerHandlerConfig>): ServerHandlerConfig {
	return {
		router: makeRouter(),
		...overrides,
	};
}

function jsonMount(prefix: string, body: Record<string, unknown>): MountConfig {
	return {
		fetch: () =>
			new Response(JSON.stringify(body), {
				headers: { "Content-Type": "application/json" },
			}),
		prefix,
	};
}

/* ── Mount config in createServerHandler ──────────────────────────────── */

describe("mount config acceptance", () => {
	it("accepts single mount config", () => {
		const handler = createServerHandler(makeConfig({ mount: jsonMount("/api", { ok: true }) }));
		expect(handler).toHaveProperty("fetch");
	});

	it("accepts array of mount configs", () => {
		const handler = createServerHandler(
			makeConfig({
				mount: [jsonMount("/api", { ok: true }), jsonMount("/admin", { admin: true })],
			}),
		);
		expect(handler).toHaveProperty("fetch");
	});

	it("accepts undefined mount (optional)", () => {
		const handler = createServerHandler(makeConfig());
		expect(handler).toHaveProperty("fetch");
	});
});

/* ── Mount dispatch ───────────────────────────────────────────────────── */

describe("mount dispatch", () => {
	it("request to mount prefix returns mount response", async () => {
		const handler = createServerHandler(makeConfig({ mount: jsonMount("/api", { mounted: true }) }));
		const response = await handler.fetch(new Request("http://localhost/api/users"), {});
		const json = (await response.json()) as { mounted: boolean };
		expect(json.mounted).toBe(true);
	});

	it("mount receives stripped pathname", async () => {
		let receivedUrl = "";
		const mount: MountConfig = {
			fetch: (req) => {
				receivedUrl = new URL(req.url).pathname;
				return new Response("ok");
			},
			prefix: "/api",
		};
		const handler = createServerHandler(makeConfig({ mount }));
		await handler.fetch(new Request("http://localhost/api/users/123"), {});
		expect(receivedUrl).toBe("/users/123");
	});

	it("mount receives env", async () => {
		let receivedEnv: unknown;
		const mount: MountConfig = {
			fetch: (_req, env) => {
				receivedEnv = env;
				return new Response("ok");
			},
			prefix: "/api",
		};
		const handler = createServerHandler(makeConfig({ mount }));
		const testEnv = { DB: "test" };
		await handler.fetch(new Request("http://localhost/api"), testEnv);
		expect(receivedEnv).toBe(testEnv);
	});

	it("mount receives waitUntil ctx", async () => {
		let hasWaitUntil = false;
		const mount: MountConfig = {
			fetch: (_req, _env, ctx) => {
				hasWaitUntil = typeof ctx.waitUntil === "function";
				return new Response("ok");
			},
			prefix: "/api",
		};
		const waitUntil = vi.fn();
		const handler = createServerHandler(makeConfig({ mount, waitUntil }));
		await handler.fetch(new Request("http://localhost/api"), {});
		expect(hasWaitUntil).toBe(true);
	});

	it("non-mount requests fall through to page routing", async () => {
		const handler = createServerHandler(makeConfig({ mount: jsonMount("/api", { ok: true }) }));
		const response = await handler.fetch(new Request("http://localhost/about"), {});
		/* no route matches → 404 HTML */
		expect(response.status).toBe(404);
		expect(response.headers.get("Content-Type")).toContain("text/html");
	});

	it("exact prefix match dispatches to mount", async () => {
		const handler = createServerHandler(makeConfig({ mount: jsonMount("/api", { exact: true }) }));
		const response = await handler.fetch(new Request("http://localhost/api"), {});
		const json = (await response.json()) as { exact: boolean };
		expect(json.exact).toBe(true);
	});
});

/* ── normalizeUrl skip ────────────────────────────────────────────────── */

describe("mount skips normalizeUrl", () => {
	it(".json extension does not 404 on mount path", async () => {
		const handler = createServerHandler(makeConfig({ mount: jsonMount("/api", { json: true }) }));
		const response = await handler.fetch(new Request("http://localhost/api/data.json"), {});
		expect(response.status).toBe(200);
		const json = (await response.json()) as { json: boolean };
		expect(json.json).toBe(true);
	});

	it(".xml extension does not 404 on mount path", async () => {
		const handler = createServerHandler(makeConfig({ mount: jsonMount("/api", { xml: true }) }));
		const response = await handler.fetch(new Request("http://localhost/api/feed.xml"), {});
		expect(response.status).toBe(200);
	});

	it("trailing slash on mount path is not redirected", async () => {
		const handler = createServerHandler(makeConfig({ mount: jsonMount("/api", { slash: true }) }));
		const response = await handler.fetch(new Request("http://localhost/api/users/"), {});
		/* should be handled by mount, not redirected */
		expect(response.status).toBe(200);
	});

	it("non-mount .json path still 404s", async () => {
		const handler = createServerHandler(makeConfig({ mount: jsonMount("/api", { ok: true }) }));
		const response = await handler.fetch(new Request("http://localhost/data.json"), {});
		expect(response.status).toBe(404);
	});
});

/* ── Middleware + mount interaction ────────────────────────────────────── */

describe("middleware runs before mount", () => {
	it("middleware onResponse runs on mount response", async () => {
		const handler = createServerHandler(
			makeConfig({
				middlewareEntries: [
					{
						middlewares: [
							(ctx) => {
								ctx.onResponse((response) => {
									const headers = new Headers(response.headers);
									headers.set("x-mw", "ran");
									return new Response(response.body, {
										headers,
										status: response.status,
									});
								});
								return ctx.next();
							},
						],
					},
				],
				mount: jsonMount("/api", { ok: true }),
			}),
		);
		const response = await handler.fetch(new Request("http://localhost/api/test"), {});
		expect(response.headers.get("x-mw")).toBe("ran");
	});

	it("middleware bypass prevents mount dispatch", async () => {
		const mountFn = vi.fn(() => new Response("mount"));
		const handler = createServerHandler(
			makeConfig({
				middlewareEntries: [
					{
						middlewares: [
							() =>
								Promise.resolve({
									response: new Response("bypassed"),
									type: "bypass" as const,
								}),
						],
					},
				],
				mount: { fetch: mountFn, prefix: "/api" },
			}),
		);
		const response = await handler.fetch(new Request("http://localhost/api/test"), {});
		expect(await response.text()).toBe("bypassed");
		expect(mountFn).not.toHaveBeenCalled();
	});

	it("middleware respond prevents mount dispatch", async () => {
		const mountFn = vi.fn(() => new Response("mount"));
		const handler = createServerHandler(
			makeConfig({
				middlewareEntries: [
					{
						middlewares: [
							() =>
								Promise.resolve({
									response: new Response("responded"),
									type: "respond" as const,
								}),
						],
					},
				],
				mount: { fetch: mountFn, prefix: "/api" },
			}),
		);
		const response = await handler.fetch(new Request("http://localhost/api/test"), {});
		expect(await response.text()).toBe("responded");
		expect(mountFn).not.toHaveBeenCalled();
	});
});

/* ── Mount error handling ─────────────────────────────────────────────── */

describe("mount error handling", () => {
	it("mount throwing error returns JSON 500", async () => {
		const mount: MountConfig = {
			fetch: () => {
				throw new Error("mount boom");
			},
			prefix: "/api",
		};
		const handler = createServerHandler(makeConfig({ mount }));
		const response = await handler.fetch(new Request("http://localhost/api/fail"), {});
		expect(response.status).toBe(500);
		const json = (await response.json()) as { error: string; status: number };
		expect(json.error).toBe("Internal Server Error");
		expect(json.status).toBe(500);
	});
});

/* ── Mount API security headers ───────────────────────────────────────── */

describe("mount security headers", () => {
	it("mount response has API security headers (no CSP)", async () => {
		const handler = createServerHandler(makeConfig({ mount: jsonMount("/api", { ok: true }) }));
		const response = await handler.fetch(new Request("http://localhost/api/test"), {});
		expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
		expect(response.headers.get("Strict-Transport-Security")).toContain("max-age=63072000");
		expect(response.headers.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
		/* no CSP on API mount responses */
		expect(response.headers.has("Content-Security-Policy")).toBe(false);
	});
});
