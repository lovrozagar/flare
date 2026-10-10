/** @vitest-environment node */
import { describe, expect, it, vi } from "vitest";
import TEST_BUILD_ID from "virtual:flare-build";
import { createRouter, type MarkedRouterConfig } from "../../../src/router-config/index.ts";
import type { RouteData, TreeNode } from "../../../src/router-primitives/index.ts";
import { createTreeNode, insertRoute } from "../../../src/router-primitives/index.ts";
import type { RouteMetaStatic } from "../../../src/router-primitives/types.ts";
import {
	createServerHandler,
	type HandlerCacheConfig,
	type ServerHandlerConfig,
} from "../../../src/server-handler/index.ts";
import {
	type FlareStore,
	type FlareStoreEntry,
	type StaticEntryData,
	staticStoreKey,
} from "../../../src/store/index.ts";

vi.mock("../../../src/ssr/index.tsx", async (importOriginal) => {
	const actual = await importOriginal<typeof import("../../../src/ssr/index.tsx")>();
	return {
		...actual,
		renderToStream: () => ({
			body: new ReadableStream<Uint8Array>({
				start(controller) {
					controller.enqueue(new TextEncoder().encode("<html><body>fresh render</body></html>"));
					controller.close();
				},
			}),
			headers: new Headers({ "content-type": "text/html; charset=utf-8" }),
			status: 200,
		}),
	};
});

/* ── Helpers ──────────────────────────────────────────────────────────── */

function makeStore(
	entries: Record<string, FlareStoreEntry> = {},
): FlareStore & { get: ReturnType<typeof vi.fn>; set: ReturnType<typeof vi.fn> } {
	const map = new Map(Object.entries(entries));
	return {
		delete: vi.fn(async (key: string) => {
			map.delete(key);
		}),
		deleteByTags: vi.fn(async () => {}),
		get: vi.fn(async (key: string) => map.get(key) ?? null),
		set: vi.fn(async (key: string, entry: FlareStoreEntry) => {
			map.set(key, entry);
		}),
	};
}

function makeStaticEntry(
	overrides?: Partial<StaticEntryData> & { storedAt?: number; tags?: string[] },
): FlareStoreEntry {
	return {
		data: {
			headers: { "content-type": "text/html; charset=utf-8" },
			html: "<html><body>cached</body></html>",
			ndjson: '{"t":"d","k":"_root_/about","d":{"title":"cached"}}\n',
			...overrides,
		},
		storedAt: overrides?.storedAt ?? Date.now(),
		tags: overrides?.tags,
	};
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

function makeISRRouteData(staticMeta: RouteMetaStatic, path = "/about", overrides?: Partial<RouteData>): RouteData {
	const vPath = `_root_${path}`;
	return makeRouteData({
		e: path,
		o: { static: staticMeta },
		v: vPath,
		x: vPath,
		...overrides,
	});
}

function makeTreeWithRoute(path: string, routeData: RouteData): TreeNode {
	const tree = createTreeNode();
	insertRoute(tree, path, routeData);
	return tree;
}

function makeRouter(overrides?: Partial<MarkedRouterConfig>): MarkedRouterConfig {
	return createRouter({
		layouts: {},
		routeTree: createTreeNode(),
		...overrides,
	});
}

function makeHandler(
	routePath: string,
	routeData: RouteData,
	cache?: HandlerCacheConfig,
	extra?: Partial<ServerHandlerConfig>,
): ReturnType<typeof createServerHandler> {
	const tree = makeTreeWithRoute(routePath, routeData);
	const router = makeRouter({ layouts: {}, routeTree: tree });
	return createServerHandler({ cache, router, ...extra });
}

function req(url = "http://localhost/about", headers?: Record<string, string>): Request {
	return new Request(url, { headers });
}

/* ── Build-scoped keys ───────────────────────────────────────────────── */

describe("ISR store keys are scoped to the build", () => {
	it("staticStoreKey puts the build between prefix and path", () => {
		expect(staticStoreKey("abc123", "/about")).toBe("static:abc123:/about");
	});

	it("an entry from another build is never served; the page renders fresh and is stored under this build", async () => {
		const store = makeStore({
			[staticStoreKey("old-build", "/about")]: makeStaticEntry({ html: "<html><body>OLD BUILD</body></html>" }),
		});
		const background: Promise<unknown>[] = [];
		const handler = makeHandler(
			"/about",
			makeISRRouteData({ mode: "isr", revalidate: 300 }),
			{ store },
			{ waitUntil: (p: Promise<unknown>) => void background.push(p) },
		);

		const response = await handler.fetch(req(), {});
		const body = await response.text();
		await Promise.allSettled(background);

		expect(body).not.toContain("OLD BUILD");
		expect(body).toContain("fresh render");
		expect(store.set.mock.calls.map((c) => c[0])).toContain(staticStoreKey(TEST_BUILD_ID, "/about"));
	});

	it("an entry from this build is served", async () => {
		const store = makeStore({
			[staticStoreKey(TEST_BUILD_ID, "/about")]: makeStaticEntry({ html: "<html><body>THIS BUILD</body></html>" }),
		});
		const handler = makeHandler("/about", makeISRRouteData({ mode: "isr", revalidate: 300 }), { store });

		const response = await handler.fetch(req(), {});

		expect(await response.text()).toContain("THIS BUILD");
	});
});
