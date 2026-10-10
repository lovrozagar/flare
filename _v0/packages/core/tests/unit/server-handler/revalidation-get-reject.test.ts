/** @vitest-environment node */
import { describe, expect, it, vi } from "vitest";
import { createRouter, type MarkedRouterConfig } from "../../../src/router-config/index.ts";
import type { RouteData } from "../../../src/router-primitives/index.ts";
import { createTreeNode, insertRoute } from "../../../src/router-primitives/index.ts";
import { createServerHandler } from "../../../src/server-handler/index.ts";

/**
 * Bug 53: GET revalidation endpoint leaks secret in URL query params
 *
 * The GET path reads secret from url.searchParams.get("secret"),
 * which gets logged in access logs, browser history, CDN logs,
 * Referer headers — a security anti-pattern.
 *
 * Expected: GET requests to the revalidation endpoint should be rejected.
 */

function makeRouteData(): RouteData {
	return {
		e: "page",
		o: {},
		p: () => Promise.resolve({ default: { render: () => "html" } }),
		t: "r" as const,
		v: "/test",
		x: "_root_/test",
	};
}

function makeRouter(): MarkedRouterConfig {
	const tree = createTreeNode();
	insertRoute(tree, "/test", makeRouteData());
	return createRouter({ layouts: {}, routeTree: tree });
}

describe("Bug 53: GET revalidation endpoint should be rejected", () => {
	it("should reject GET requests to /_flare/revalidate", async () => {
		const handler = createServerHandler({
			cache: {
				revalidateSecret: "test-secret-123",
				store: {
					delete: vi.fn(async () => {}),
					deleteByTags: vi.fn(async () => {}),
					get: vi.fn(async () => null),
					set: vi.fn(async () => {}),
				},
			},
			router: makeRouter(),
		});

		const url = "http://localhost/_flare/revalidate?secret=test-secret-123&tags=foo&tiers=ssr";
		const request = new Request(url, { method: "GET" });
		const response = await handler.fetch(request, {});

		expect(response.status).toBe(405);
	});

	it("should still accept POST requests to /_flare/revalidate", async () => {
		const handler = createServerHandler({
			cache: {
				revalidateSecret: "test-secret-123",
				store: {
					delete: vi.fn(async () => {}),
					deleteByTags: vi.fn(async () => {}),
					get: vi.fn(async () => null),
					set: vi.fn(async () => {}),
				},
			},
			router: makeRouter(),
		});

		const request = new Request("http://localhost/_flare/revalidate", {
			body: JSON.stringify({ tags: ["foo"], tiers: ["ssr"] }),
			headers: {
				"content-type": "application/json",
				"x-revalidation-secret": "test-secret-123",
			},
			method: "POST",
		});
		const response = await handler.fetch(request, {});

		expect(response.status).toBe(200);
	});
});
