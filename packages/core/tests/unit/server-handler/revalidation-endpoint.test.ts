/** @vitest-environment node */
import { describe, expect, it, vi } from "vitest";
import type { CdnPurgeAdapter } from "../../../src/revalidation/index.ts";
import { createRouter, type MarkedRouterConfig } from "../../../src/router-config/index.ts";
import type { RouteData } from "../../../src/router-primitives/index.ts";
import { createTreeNode, insertRoute } from "../../../src/router-primitives/index.ts";
import { createServerHandler, type ServerHandlerConfig } from "../../../src/server-handler/index.ts";
import type { FlareStore } from "../../../src/store/index.ts";

/* ── Helpers ──────────────────────────────────────────────────────── */

function makeRouteData(): RouteData {
	return {
		e: "page",
		o: {},
		p: () =>
			Promise.resolve({
				default: {
					_type: "render",
					loader: () => ({ msg: "ok" }),
					render: () => "html",
					variablePath: "/test",
					virtualPath: "_root_/test",
				},
			}),
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

function makeFlareStore(): FlareStore & { deletedTags: string[][]; deletedKeys: string[][] } {
	const deletedTags: string[][] = [];
	const deletedKeys: string[][] = [];
	return {
		delete: vi.fn(async () => {}),
		deleteByKeys: vi.fn(async (keys: string[]) => {
			deletedKeys.push(keys);
		}),
		deleteByTags: vi.fn(async (tags: string[]) => {
			deletedTags.push(tags);
		}),
		deletedKeys,
		deletedTags,
		get: vi.fn(async () => null),
		set: vi.fn(async () => {}),
	};
}

function makeCdnAdapter(): CdnPurgeAdapter & { purgedTags: string[][]; purgedKeys: string[][] } {
	const purgedTags: string[][] = [];
	const purgedKeys: string[][] = [];
	return {
		purgeByKeys: vi.fn(async (keys: string[]) => {
			purgedKeys.push(keys);
		}),
		purgeByTags: vi.fn(async (tags: string[]) => {
			purgedTags.push(tags);
		}),
		purgedKeys,
		purgedTags,
	};
}

function makeConfig(overrides?: Partial<ServerHandlerConfig>): ServerHandlerConfig {
	return {
		router: makeRouter(),
		...overrides,
	};
}

const SECRET = "test-revalidation-secret";

/* ── Tests ────────────────────────────────────────────────────────── */

describe("/_flare/revalidate endpoint", () => {
	describe("POST requests", () => {
		it("revalidates ssr tier by tags with valid secret", async () => {
			const store = makeFlareStore();
			const handler = createServerHandler(
				makeConfig({
					cache: {
						revalidateSecret: SECRET,
						store,
					},
				}),
			);

			const res = await handler.fetch(
				new Request("http://localhost/_flare/revalidate", {
					body: JSON.stringify({
						tags: ["products", "featured"],
						tiers: ["ssr"],
					}),
					headers: {
						"content-type": "application/json",
						"x-revalidation-secret": SECRET,
					},
					method: "POST",
				}),
				{},
			);

			expect(res.status).toBe(200);
			const json = (await res.json()) as Record<string, unknown>;
			expect(json.revalidated).toBe(true);
			expect(json.tags).toEqual(["products", "featured"]);
			expect(json.tiers).toEqual(["ssr"]);
			expect(store.deleteByTags).toHaveBeenCalledWith(["products", "featured"], undefined);
		});

		it("revalidates CDN by tags", async () => {
			const cdn = makeCdnAdapter();
			const handler = createServerHandler(
				makeConfig({
					cache: {
						cdn,
						revalidateSecret: SECRET,
					},
				}),
			);

			const res = await handler.fetch(
				new Request("http://localhost/_flare/revalidate", {
					body: JSON.stringify({
						tags: ["products"],
						tiers: ["cdn"],
					}),
					headers: {
						"content-type": "application/json",
						"x-revalidation-secret": SECRET,
					},
					method: "POST",
				}),
				{},
			);

			expect(res.status).toBe(200);
			expect(cdn.purgeByTags).toHaveBeenCalledWith(["products"], undefined);
		});

		it("revalidates both tiers", async () => {
			const store = makeFlareStore();
			const cdn = makeCdnAdapter();
			const handler = createServerHandler(
				makeConfig({
					cache: {
						cdn,
						revalidateSecret: SECRET,
						store,
					},
				}),
			);

			const res = await handler.fetch(
				new Request("http://localhost/_flare/revalidate", {
					body: JSON.stringify({
						tags: ["products"],
						tiers: ["ssr", "cdn"],
					}),
					headers: {
						"content-type": "application/json",
						"x-revalidation-secret": SECRET,
					},
					method: "POST",
				}),
				{},
			);

			expect(res.status).toBe(200);
			expect(store.deleteByTags).toHaveBeenCalled();
			expect(cdn.purgeByTags).toHaveBeenCalled();
		});

		it("revalidates by keys", async () => {
			const store = makeFlareStore();
			const handler = createServerHandler(
				makeConfig({
					cache: {
						revalidateSecret: SECRET,
						store,
					},
				}),
			);

			const res = await handler.fetch(
				new Request("http://localhost/_flare/revalidate", {
					body: JSON.stringify({
						keys: ["GET:/products/1", "GET:/products/2"],
						tiers: ["ssr"],
					}),
					headers: {
						"content-type": "application/json",
						"x-revalidation-secret": SECRET,
					},
					method: "POST",
				}),
				{},
			);

			expect(res.status).toBe(200);
			const json = (await res.json()) as Record<string, unknown>;
			expect(json.keys).toEqual(["GET:/products/1", "GET:/products/2"]);
		});
	});

	describe("GET requests rejected (secret leak prevention)", () => {
		it("rejects GET with 405 even with valid secret", async () => {
			const handler = createServerHandler(
				makeConfig({
					cache: {
						revalidateSecret: SECRET,
						store: makeFlareStore(),
					},
				}),
			);

			const res = await handler.fetch(
				new Request(`http://localhost/_flare/revalidate?secret=${SECRET}&tags=products,featured&tiers=ssr`),
				{},
			);

			expect(res.status).toBe(405);
		});
	});

	describe("security", () => {
		it("returns 401 for missing secret (POST)", async () => {
			const handler = createServerHandler(
				makeConfig({
					cache: {
						revalidateSecret: SECRET,
						store: makeFlareStore(),
					},
				}),
			);

			const res = await handler.fetch(
				new Request("http://localhost/_flare/revalidate", {
					body: JSON.stringify({ tags: ["x"], tiers: ["ssr"] }),
					headers: { "content-type": "application/json" },
					method: "POST",
				}),
				{},
			);

			expect(res.status).toBe(401);
		});

		it("returns 401 for wrong secret (POST)", async () => {
			const handler = createServerHandler(
				makeConfig({
					cache: {
						revalidateSecret: SECRET,
						store: makeFlareStore(),
					},
				}),
			);

			const res = await handler.fetch(
				new Request("http://localhost/_flare/revalidate", {
					body: JSON.stringify({ tags: ["x"], tiers: ["ssr"] }),
					headers: {
						"content-type": "application/json",
						"x-revalidation-secret": "wrong-secret",
					},
					method: "POST",
				}),
				{},
			);

			expect(res.status).toBe(401);
		});

		it("rejects GET before checking secret (405 not 401)", async () => {
			const handler = createServerHandler(
				makeConfig({
					cache: {
						revalidateSecret: SECRET,
						store: makeFlareStore(),
					},
				}),
			);

			const res = await handler.fetch(
				new Request("http://localhost/_flare/revalidate?secret=wrong&tags=x&tiers=ssr"),
				{},
			);

			expect(res.status).toBe(405);
		});

		it("secret resolved from function with env", async () => {
			const store = makeFlareStore();
			const handler = createServerHandler(
				makeConfig({
					cache: {
						revalidateSecret: (env: unknown) => (env as Record<string, string>).SECRET,
						store,
					},
				}),
			);

			const res = await handler.fetch(
				new Request("http://localhost/_flare/revalidate", {
					body: JSON.stringify({ tags: ["x"], tiers: ["ssr"] }),
					headers: {
						"content-type": "application/json",
						"x-revalidation-secret": "env-secret",
					},
					method: "POST",
				}),
				{ SECRET: "env-secret" },
			);

			expect(res.status).toBe(200);
		});
	});

	describe("validation", () => {
		it("returns 400 when no tags and no keys", async () => {
			const handler = createServerHandler(
				makeConfig({
					cache: {
						revalidateSecret: SECRET,
						store: makeFlareStore(),
					},
				}),
			);

			const res = await handler.fetch(
				new Request("http://localhost/_flare/revalidate", {
					body: JSON.stringify({ tiers: ["ssr"] }),
					headers: {
						"content-type": "application/json",
						"x-revalidation-secret": SECRET,
					},
					method: "POST",
				}),
				{},
			);

			expect(res.status).toBe(400);
		});

		it("returns 400 when no tiers", async () => {
			const handler = createServerHandler(
				makeConfig({
					cache: {
						revalidateSecret: SECRET,
						store: makeFlareStore(),
					},
				}),
			);

			const res = await handler.fetch(
				new Request("http://localhost/_flare/revalidate", {
					body: JSON.stringify({ tags: ["x"] }),
					headers: {
						"content-type": "application/json",
						"x-revalidation-secret": SECRET,
					},
					method: "POST",
				}),
				{},
			);

			expect(res.status).toBe(400);
		});

		it("returns 400 for invalid tiers", async () => {
			const handler = createServerHandler(
				makeConfig({
					cache: {
						revalidateSecret: SECRET,
						store: makeFlareStore(),
					},
				}),
			);

			const res = await handler.fetch(
				new Request("http://localhost/_flare/revalidate", {
					body: JSON.stringify({ tags: ["x"], tiers: ["invalid"] }),
					headers: {
						"content-type": "application/json",
						"x-revalidation-secret": SECRET,
					},
					method: "POST",
				}),
				{},
			);

			expect(res.status).toBe(400);
		});
	});

	describe("non-string array element filtering", () => {
		it("filters non-string elements from tags", async () => {
			const store = makeFlareStore();
			const handler = createServerHandler(
				makeConfig({
					cache: {
						revalidateSecret: SECRET,
						store,
					},
				}),
			);

			const res = await handler.fetch(
				new Request("http://localhost/_flare/revalidate", {
					body: JSON.stringify({
						tags: [123, null, "valid-tag", {}, true, "another-tag"],
						tiers: ["ssr"],
					}),
					headers: {
						"content-type": "application/json",
						"x-revalidation-secret": SECRET,
					},
					method: "POST",
				}),
				{},
			);

			expect(res.status).toBe(200);
			const json = (await res.json()) as Record<string, unknown>;
			expect(json.tags).toEqual(["valid-tag", "another-tag"]);
			expect(store.deleteByTags).toHaveBeenCalledWith(["valid-tag", "another-tag"], undefined);
		});

		it("filters non-string elements from keys", async () => {
			const store = makeFlareStore();
			const handler = createServerHandler(
				makeConfig({
					cache: {
						revalidateSecret: SECRET,
						store,
					},
				}),
			);

			const res = await handler.fetch(
				new Request("http://localhost/_flare/revalidate", {
					body: JSON.stringify({
						keys: [42, "GET:/products/1", null],
						tiers: ["ssr"],
					}),
					headers: {
						"content-type": "application/json",
						"x-revalidation-secret": SECRET,
					},
					method: "POST",
				}),
				{},
			);

			expect(res.status).toBe(200);
			const json = (await res.json()) as Record<string, unknown>;
			expect(json.keys).toEqual(["GET:/products/1"]);
		});

		it("returns 400 when all tag elements are non-string", async () => {
			const handler = createServerHandler(
				makeConfig({
					cache: {
						revalidateSecret: SECRET,
						store: makeFlareStore(),
					},
				}),
			);

			const res = await handler.fetch(
				new Request("http://localhost/_flare/revalidate", {
					body: JSON.stringify({
						tags: [123, null, {}],
						tiers: ["ssr"],
					}),
					headers: {
						"content-type": "application/json",
						"x-revalidation-secret": SECRET,
					},
					method: "POST",
				}),
				{},
			);

			/* After filtering, no valid tags remain → 400 */
			expect(res.status).toBe(400);
		});
	});

	describe("error handling", () => {
		it("returns JSON 400 for malformed JSON body (not HTML 500)", async () => {
			const handler = createServerHandler(
				makeConfig({
					cache: {
						revalidateSecret: SECRET,
						store: makeFlareStore(),
					},
				}),
			);

			const res = await handler.fetch(
				new Request("http://localhost/_flare/revalidate", {
					body: "not valid json{{{",
					headers: {
						"content-type": "application/json",
						"x-revalidation-secret": SECRET,
					},
					method: "POST",
				}),
				{},
			);

			expect(res.status).toBe(400);
			expect(res.headers.get("content-type")).toBe("application/json; charset=utf-8");
			const json = (await res.json()) as Record<string, unknown>;
			expect(json.error).toBeDefined();
		});
	});

	describe("security headers on revalidation response", () => {
		it("includes X-Content-Type-Options on success response", async () => {
			const store = makeFlareStore();
			const handler = createServerHandler(
				makeConfig({
					cache: {
						revalidateSecret: SECRET,
						store,
					},
				}),
			);

			const res = await handler.fetch(
				new Request("http://localhost/_flare/revalidate", {
					body: JSON.stringify({ tags: ["products"], tiers: ["ssr"] }),
					headers: {
						"content-type": "application/json",
						"x-revalidation-secret": SECRET,
					},
					method: "POST",
				}),
				{},
			);

			expect(res.status).toBe(200);
			expect(res.headers.get("x-content-type-options")).toBe("nosniff");
		});

		it("includes X-Content-Type-Options on 401 response", async () => {
			const handler = createServerHandler(
				makeConfig({
					cache: {
						revalidateSecret: SECRET,
						store: makeFlareStore(),
					},
				}),
			);

			const res = await handler.fetch(
				new Request("http://localhost/_flare/revalidate", {
					body: JSON.stringify({ tags: ["x"], tiers: ["ssr"] }),
					headers: {
						"content-type": "application/json",
						"x-revalidation-secret": "wrong",
					},
					method: "POST",
				}),
				{},
			);

			expect(res.status).toBe(401);
			expect(res.headers.get("x-content-type-options")).toBe("nosniff");
		});
	});

	describe("middleware response handlers", () => {
		it("revalidation endpoint bypasses middleware onResponse handlers", async () => {
			/* Internal endpoints (revalidate, sitemap) skip response handlers —
			 * only security headers are applied. */
			const store = makeFlareStore();
			const handler = createServerHandler(
				makeConfig({
					cache: {
						revalidateSecret: SECRET,
						store,
					},
					middlewareEntries: [
						{
							middlewares: [
								async (ctx) => {
									ctx.onResponse((res) => {
										const cloned = new Response(res.body, res);
										cloned.headers.set("x-custom-middleware", "applied");
										return cloned;
									});
									return ctx.next();
								},
							],
						},
					],
				}),
			);

			const res = await handler.fetch(
				new Request("http://localhost/_flare/revalidate", {
					body: JSON.stringify({ tags: ["products"], tiers: ["ssr"] }),
					headers: {
						"content-type": "application/json",
						"x-revalidation-secret": SECRET,
					},
					method: "POST",
				}),
				{},
			);

			expect(res.status).toBe(200);
			expect(res.headers.get("x-custom-middleware")).toBeNull();
		});
	});

	describe("no revalidation configured", () => {
		it("/_flare/revalidate falls through to normal routing when not configured", async () => {
			const handler = createServerHandler(makeConfig());

			const res = await handler.fetch(new Request("http://localhost/_flare/revalidate"), {});

			/* no revalidation config → endpoint not registered → 404 */
			expect(res.status).toBe(404);
		});
	});
});
