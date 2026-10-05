/**
 * @vitest-environment node
 *
 * HTML is never cached by shared caches unless a route opts in (cache.cdn); opted-in routes are
 * cached by CDNs (s-maxage) but revalidated by browsers (max-age=0), so a deploy or purge reaches
 * every visitor. A Cache-Control the app sets itself always wins.
 */
import { describe, expect, it, vi } from "vitest";
import TEST_BUILD_ID from "virtual:flare-build";

vi.mock("virtual:flare-is-dev", () => ({ default: false }));

/* Render stub with the real header contract: HTML content type plus the last match's headers. */
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

import { createRouter } from "../../src/router-config/index.ts";
import { createTreeNode, insertRoute } from "../../src/router-primitives/index.ts";
import type { RouteMetaStatic } from "../../src/router-primitives/types.ts";
import { createServerHandler } from "../../src/server-handler/index.ts";
import { type FlareStore, type FlareStoreEntry, staticStoreKey } from "../../src/store/index.ts";
import { makeRequest } from "./fixtures.ts";

function handlerFor(module: Record<string, unknown>, opts: { static?: RouteMetaStatic; store?: FlareStore } = {}) {
	const tree = createTreeNode();
	insertRoute(tree, "/page", {
		e: "_root_/page",
		o: opts.static ? { static: opts.static } : {},
		p: () =>
			Promise.resolve({
				default: {
					_type: "render",
					loader: () => ({ ok: true }),
					variablePath: "_root_/page",
					virtualPath: "_root_/page",
					...module,
				},
			}),
		t: "r" as const,
		v: "_root_/page",
		x: "_root_/page",
	});
	return createServerHandler({ cache: { store: opts.store }, router: createRouter({ layouts: {}, routeTree: tree }) });
}

function data(path: string): Request {
	return makeRequest(`${path}?_flare=${TEST_BUILD_ID}`, { headers: { "flare-data": "1" } });
}

function memoryStore(entries: Record<string, FlareStoreEntry>): FlareStore {
	const map = new Map(Object.entries(entries));
	return {
		delete: async (k) => void map.delete(k),
		deleteByTags: async () => {},
		get: async (k) => map.get(k) ?? null,
		set: async (k, e) => void map.set(k, e),
	};
}

describe("default Cache-Control", () => {
	it("HTML without cache.cdn: never stored by shared caches, revalidated by browsers", async () => {
		const response = await handlerFor({}).fetch(makeRequest("/page"), {});

		expect(response.headers.get("Content-Type")).toContain("text/html");
		expect(response.headers.get("Cache-Control")).toBe("private, no-cache");
	});

	it("data without cache.cdn: not stored anywhere", async () => {
		const response = await handlerFor({}).fetch(data("/page"), {});

		expect(response.headers.get("Cache-Control")).toBe("no-store");
	});

	it("a Cache-Control set by the route wins", async () => {
		const response = await handlerFor({ headers: () => ({ "Cache-Control": "public, max-age=5" }) }).fetch(
			makeRequest("/page"),
			{},
		);

		expect(response.headers.get("Cache-Control")).toBe("public, max-age=5");
	});
});

describe("cache.cdn routes", () => {
	it("HTML and its data share the CDN policy: s-maxage for shared caches, max-age=0 for browsers", async () => {
		const handler = handlerFor({ cache: { cdn: { maxAge: 300, swr: 60 } } });

		const html = await handler.fetch(makeRequest("/page"), {});
		const ndjson = await handler.fetch(data("/page"), {});

		const expected = "public, max-age=0, s-maxage=300, stale-while-revalidate=60";
		expect(html.headers.get("Cache-Control")).toBe(expected);
		expect(ndjson.headers.get("Cache-Control")).toBe(expected);
	});
});

function storedPage(headers: Record<string, string>): FlareStoreEntry {
	return {
		data: {
			headers: { "content-type": "text/html; charset=utf-8", ...headers },
			html: "<html>STORED</html>",
			ndjson: '{"t":"d"}\n',
		},
		storedAt: Date.now(),
	};
}

describe("store hits", () => {
	it("a stored page without a CDN policy gets the browser-safe default", async () => {
		const store = memoryStore({ [staticStoreKey(TEST_BUILD_ID, "/page")]: storedPage({}) });
		const handler = handlerFor({}, { static: { mode: "static" }, store });

		const html = await handler.fetch(makeRequest("/page"), {});
		const ndjson = await handler.fetch(data("/page"), {});

		expect(await html.text()).toContain("STORED");
		expect(html.headers.get("Cache-Control")).toBe("private, no-cache");
		expect(ndjson.headers.get("Cache-Control")).toBe("no-store");
	});

	it("a stored page keeps the CDN policy it was rendered with, for HTML and data", async () => {
		const policy = "public, max-age=0, s-maxage=300";
		const store = memoryStore({ [staticStoreKey(TEST_BUILD_ID, "/page")]: storedPage({ "cache-control": policy }) });
		const handler = handlerFor({}, { static: { mode: "static" }, store });

		const html = await handler.fetch(makeRequest("/page"), {});
		const ndjson = await handler.fetch(data("/page"), {});

		expect(html.headers.get("Cache-Control")).toBe(policy);
		expect(ndjson.headers.get("Cache-Control")).toBe(policy);
	});
});
