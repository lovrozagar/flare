/** @vitest-environment node */
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
import type { TreeNode } from "../../../src/router-primitives/index.ts";
import {
	createServerHandler,
	type ServerHandlerConfig,
	type SitemapSubmitConfig,
} from "../../../src/server-handler/index.ts";

vi.mock("../../../src/search-engine/google", () => ({
	submitSitemapToGoogle: vi.fn(async () => ({ ok: true })),
}));
vi.mock("../../../src/search-engine/bing", () => ({
	submitUrlsToBing: vi.fn(async () => ({ ok: true })),
}));
vi.mock("../../../src/search-engine/index-now", () => ({
	submitIndexNow: vi.fn(async () => ({ ok: true })),
}));

const SECRET = "test-integration-secret";

function makeRouter(): MarkedRouterConfig {
	return createRouter({
		layouts: {},
		routeTree: { s: {} } as TreeNode,
	});
}

function makeSitemap(): SitemapSubmitConfig {
	return {
		engines: {
			google: {
				credentials: { clientEmail: "t@t.com", privateKey: "k" },
				siteUrl: "https://example.com",
			},
		},
		secret: SECRET,
		sitemapUrl: "https://example.com/sitemap.xml",
	};
}

function makeConfig(overrides?: Partial<ServerHandlerConfig>): ServerHandlerConfig {
	return {
		router: makeRouter(),
		sitemap: makeSitemap(),
		...overrides,
	};
}

function makeSubmitRequest(method: "GET" | "POST" = "POST"): Request {
	if (method === "GET") {
		return new Request(`http://localhost/_flare/sitemap/submit?secret=${SECRET}`);
	}
	return new Request("http://localhost/_flare/sitemap/submit", {
		headers: { "x-sitemap-secret": SECRET },
		method: "POST",
	});
}

/* ── Middleware interaction ─────────────────────────────────────────── */

describe("sitemap submit — middleware integration", () => {
	it("middleware bypass prevents sitemap handler from running", async () => {
		const handler = createServerHandler(
			makeConfig({
				middlewareEntries: [
					{
						middlewares: [(ctx) => Promise.resolve(ctx.bypass(new Response("blocked", { status: 403 })))],
					},
				],
			}),
		);
		const res = await handler.fetch(makeSubmitRequest(), {});
		expect(res.status).toBe(403);
		expect(await res.text()).toBe("blocked");
	});

	it("middleware respond still gets security headers applied", async () => {
		const handler = createServerHandler(
			makeConfig({
				middlewareEntries: [
					{
						middlewares: [(ctx) => Promise.resolve(ctx.respond(new Response("intercepted", { status: 200 })))],
					},
				],
			}),
		);
		const res = await handler.fetch(makeSubmitRequest(), {});
		expect(res.status).toBe(200);
		expect(await res.text()).toBe("intercepted");
		expect(res.headers.get("x-content-type-options")).toBe("nosniff");
	});

	it("middleware next allows sitemap handler to run", async () => {
		const handler = createServerHandler(
			makeConfig({
				middlewareEntries: [{ middlewares: [(ctx) => ctx.next()] }],
			}),
		);
		const res = await handler.fetch(makeSubmitRequest(), {});
		expect(res.status).toBe(200);
		const body = (await res.json()) as { submitted: boolean };
		expect(body.submitted).toBe(true);
	});
});

/* ── CSP nonce in sitemap response ─────────────────────────────────── */

describe("sitemap submit — CSP nonce", () => {
	it("response includes CSP header with nonce", async () => {
		devRef.current = false;
		const handler = createServerHandler(makeConfig());
		const res = await handler.fetch(makeSubmitRequest(), {});
		const csp = res.headers.get("content-security-policy");
		expect(csp).toBeTruthy();
		expect(csp).toMatch(/nonce-[a-f0-9]+/);
	});

	it("CSP overrides applied to sitemap response", async () => {
		const handler = createServerHandler(makeConfig({ csp: { "frame-ancestors": ["https://trusted.com"] } }));
		const res = await handler.fetch(makeSubmitRequest(), {});
		const csp = res.headers.get("content-security-policy");
		expect(csp).toContain("frame-ancestors");
		expect(csp).toContain("https://trusted.com");
	});
});

/* ── Full security header set ──────────────────────────────────────── */

describe("sitemap submit — full security headers", () => {
	it("includes all standard security headers", async () => {
		const handler = createServerHandler(makeConfig());
		const res = await handler.fetch(makeSubmitRequest(), {});
		expect(res.headers.get("x-content-type-options")).toBe("nosniff");
		expect(res.headers.get("x-frame-options")).toBe("DENY");
		expect(res.headers.get("content-security-policy")).toBeTruthy();
	});

	it("401 response includes security headers", async () => {
		const handler = createServerHandler(makeConfig());
		const res = await handler.fetch(
			new Request("http://localhost/_flare/sitemap/submit", {
				headers: { "x-sitemap-secret": "wrong" },
				method: "POST",
			}),
			{},
		);
		expect(res.status).toBe(401);
		expect(res.headers.get("x-frame-options")).toBe("DENY");
		expect(res.headers.get("content-security-policy")).toBeTruthy();
	});
});

/* ── GET vs POST flow ──────────────────────────────────────────────── */

describe("sitemap submit — GET/POST integration", () => {
	it("GET rejected with 405 (POST-only endpoint)", async () => {
		const handler = createServerHandler(makeConfig());
		const res = await handler.fetch(makeSubmitRequest("GET"), {});
		expect(res.status).toBe(405);
	});

	it("POST with header secret succeeds", async () => {
		const handler = createServerHandler(makeConfig());
		const res = await handler.fetch(makeSubmitRequest("POST"), {});
		expect(res.status).toBe(200);
		const body = (await res.json()) as { submitted: boolean };
		expect(body.submitted).toBe(true);
	});
});

/* ── Env-derived secret ────────────────────────────────────────────── */

describe("sitemap submit — env-derived config", () => {
	it("secret as function resolves from env", async () => {
		const handler = createServerHandler(
			makeConfig({
				sitemap: {
					engines: {
						google: {
							credentials: { clientEmail: "t@t.com", privateKey: "k" },
							siteUrl: "https://example.com",
						},
					},
					secret: (env: { SITEMAP_SECRET: string }) => env.SITEMAP_SECRET,
					sitemapUrl: "https://example.com/sitemap.xml",
				} as SitemapSubmitConfig,
			}),
		);
		const res = await handler.fetch(
			new Request("http://localhost/_flare/sitemap/submit", {
				headers: { "x-sitemap-secret": "env-secret-123" },
				method: "POST",
			}),
			{ SITEMAP_SECRET: "env-secret-123" },
		);
		expect(res.status).toBe(200);
	});

	it("wrong env secret returns 401", async () => {
		const handler = createServerHandler(
			makeConfig({
				sitemap: {
					engines: {
						google: {
							credentials: { clientEmail: "t@t.com", privateKey: "k" },
							siteUrl: "https://example.com",
						},
					},
					secret: (env: { SITEMAP_SECRET: string }) => env.SITEMAP_SECRET,
					sitemapUrl: "https://example.com/sitemap.xml",
				} as SitemapSubmitConfig,
			}),
		);
		const res = await handler.fetch(
			new Request("http://localhost/_flare/sitemap/submit", {
				headers: { "x-sitemap-secret": "wrong" },
				method: "POST",
			}),
			{ SITEMAP_SECRET: "real-secret" },
		);
		expect(res.status).toBe(401);
	});
});
