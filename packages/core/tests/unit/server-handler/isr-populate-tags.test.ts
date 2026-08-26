/** @vitest-environment node */
import { describe, expect, it, vi } from "vitest";
import { createRouter, type MarkedRouterConfig } from "../../../src/router-config/index.ts";
import type { RouteData, TreeNode } from "../../../src/router-primitives/index.ts";
import { createTreeNode, insertRoute } from "../../../src/router-primitives/index.ts";
import type { RouteMetaStatic } from "../../../src/router-primitives/types.ts";
import {
	createServerHandler,
	type HandlerCacheConfig,
	type ServerHandlerConfig,
} from "../../../src/server-handler/index.ts";
import type { FlareStore, FlareStoreEntry } from "../../../src/store/index.ts";

vi.mock("../../../src/ssr/index.tsx", async (importOriginal) => {
	const actual = await importOriginal<typeof import("../../../src/ssr/index.tsx")>();
	return {
		...actual,
		renderToStream: () => ({
			body: new ReadableStream<Uint8Array>({
				start(controller) {
					controller.enqueue(new TextEncoder().encode("<html><body>fresh isr</body></html>"));
					controller.close();
				},
			}),
			headers: new Headers({
				"content-type": "text/html; charset=utf-8",
				"surrogate-key": "product:1 category:shoes",
			}),
			status: 200,
		}),
	};
});

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

function makeRouteData(overrides?: Partial<RouteData>): RouteData {
	return {
		e: "/about",
		o: {},
		p: () =>
			Promise.resolve({
				default: {
					cache: { cdn: { tags: ["product:1", "category:shoes"] } },
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

function makeISRRouteData(staticMeta: RouteMetaStatic, path = "/about"): RouteData {
	const vPath = `_root_${path}`;
	return makeRouteData({
		e: path,
		o: { static: staticMeta },
		v: vPath,
		x: vPath,
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

describe("ISR on-demand first populate tags", () => {
	it("copies Surrogate-Key onto the first store.set tags", async () => {
		const store = makeStore();
		const waitUntilPromises: Promise<unknown>[] = [];
		const handler = makeHandler(
			"/about",
			makeISRRouteData({ mode: "isr", revalidate: 300 }),
			{ store },
			{
				waitUntil: (p: Promise<unknown>) => {
					waitUntilPromises.push(p);
				},
			},
		);

		const response = await handler.fetch(new Request("http://localhost/about"), {});
		expect([200, 500]).toContain(response.status);
		await Promise.allSettled(waitUntilPromises);

		const populate = store.set.mock.calls.find((call) => call[0] === "static:/about");
		expect(populate).toBeDefined();
		const stored = populate?.[1] as FlareStoreEntry;
		expect(stored.tags).toEqual(["product:1", "category:shoes"]);
	});
});
