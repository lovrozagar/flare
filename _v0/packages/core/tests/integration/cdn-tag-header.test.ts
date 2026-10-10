/**
 * @vitest-environment node
 *
 * CDNs read cache tags from different headers: Fastly `Surrogate-Key` (space-separated, the
 * default), Cloudflare `Cache-Tag` (comma-separated). The purge adapter names its header.
 */
import { describe, expect, it, vi } from "vitest";
import TEST_BUILD_ID from "virtual:flare-build";

vi.mock("virtual:flare-is-dev", () => ({ default: false }));
vi.mock("../../src/ssr/index.tsx", async (importOriginal) => {
	const actual = await importOriginal<typeof import("../../src/ssr/index.tsx")>();
	return {
		...actual,
		renderToStream: (config: Parameters<typeof actual.renderToStream>[0]) => {
			const headers = new Headers({ "Content-Type": "text/html; charset=utf-8" });
			const last = config.matches.at(-1);
			if (last?.responseHeaders) actual.applyResponseHeaders(headers, last.responseHeaders);
			return { body: new Response("<html>RENDERED</html>").body, headers, status: 200 };
		},
	};
});

import { tagsFromSurrogateKey } from "../../src/prerender/index.ts";
import type { CdnPurgeAdapter } from "../../src/revalidation/index.ts";
import { createRouter } from "../../src/router-config/index.ts";
import { createTreeNode, insertRoute } from "../../src/router-primitives/index.ts";
import type { RouteMetaStatic } from "../../src/router-primitives/types.ts";
import { createServerHandler } from "../../src/server-handler/index.ts";
import { type FlareStore, type FlareStoreEntry, staticStoreKey } from "../../src/store/index.ts";
import { makeRequest } from "./fixtures.ts";

function handlerWith(cdn: CdnPurgeAdapter | undefined, opts: { static?: RouteMetaStatic; store?: FlareStore } = {}) {
	const tree = createTreeNode();
	insertRoute(tree, "/page", {
		e: "_root_/page",
		o: opts.static ? { static: opts.static } : {},
		p: () =>
			Promise.resolve({
				default: {
					_type: "render",
					cache: { cdn: { maxAge: 60, tags: ["posts", "feed"] } },
					loader: () => ({ ok: true }),
					variablePath: "_root_/page",
					virtualPath: "_root_/page",
				},
			}),
		t: "r" as const,
		v: "_root_/page",
		x: "_root_/page",
	});
	return createServerHandler({
		cache: { cdn, store: opts.store },
		router: createRouter({ layouts: {}, routeTree: tree }),
	});
}

const purge = { purgeByTags: vi.fn(async () => {}) };

describe("cache tag header", () => {
	it("defaults to Surrogate-Key, space-separated", async () => {
		const response = await handlerWith(purge).fetch(makeRequest("/page"), {});

		expect(response.headers.get("Surrogate-Key")).toBe("posts feed");
		expect(response.headers.get("Cache-Tag")).toBeNull();
	});

	it("the adapter's tagHeader renames it; Cache-Tag is comma-separated", async () => {
		const response = await handlerWith({ ...purge, tagHeader: "Cache-Tag" }).fetch(makeRequest("/page"), {});

		expect(response.headers.get("Cache-Tag")).toBe("posts,feed");
		expect(response.headers.get("Surrogate-Key")).toBeNull();
	});

	it("data responses carry the same header", async () => {
		const response = await handlerWith({ ...purge, tagHeader: "Cache-Tag" }).fetch(
			makeRequest(`/page?_flare=${TEST_BUILD_ID}`, { headers: { "flare-data": "1" } }),
			{},
		);

		expect(response.headers.get("Cache-Tag")).toBe("posts,feed");
	});

	it("ISR records store tags from the configured header", async () => {
		const map = new Map<string, FlareStoreEntry>();
		const store: FlareStore = {
			delete: async (k) => void map.delete(k),
			deleteByTags: async () => {},
			get: async (k) => map.get(k) ?? null,
			set: async (k, e) => void map.set(k, e),
		};
		const background: Promise<unknown>[] = [];
		const handler = createServerHandler({
			cache: { cdn: { ...purge, tagHeader: "Cache-Tag" }, store },
			router: createRouter({
				layouts: {},
				routeTree: (() => {
					const tree = createTreeNode();
					insertRoute(tree, "/page", {
						e: "_root_/page",
						o: { static: { mode: "isr", revalidate: 60 } },
						p: () =>
							Promise.resolve({
								default: {
									_type: "render",
									cache: { cdn: { maxAge: 60, tags: ["posts", "feed"] } },
									loader: () => ({ ok: true }),
									variablePath: "_root_/page",
									virtualPath: "_root_/page",
								},
							}),
						t: "r" as const,
						v: "_root_/page",
						x: "_root_/page",
					});
					return tree;
				})(),
			}),
			waitUntil: (p) => void background.push(p),
		});

		await (await handler.fetch(makeRequest("/page"), {})).text();
		await Promise.allSettled(background);

		expect(map.get(staticStoreKey(TEST_BUILD_ID, "/page"))?.tags).toEqual(["posts", "feed"]);
	});
});

describe("tagsFromSurrogateKey", () => {
	it("reads the named header with its separator, defaulting to Surrogate-Key", () => {
		expect(tagsFromSurrogateKey({ "surrogate-key": "a b" })).toEqual(["a", "b"]);
		expect(tagsFromSurrogateKey({ "cache-tag": "a,b" }, "Cache-Tag")).toEqual(["a", "b"]);
		expect(tagsFromSurrogateKey({ "surrogate-key": "a b" }, "Cache-Tag")).toEqual(["a", "b"]);
	});
});
