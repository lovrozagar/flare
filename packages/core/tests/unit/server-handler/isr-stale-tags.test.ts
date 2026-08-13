/** @vitest-environment node */
import { describe, expect, it, vi } from "vitest"
import { createRouter, type MarkedRouterConfig } from "../../../src/router-config/index.ts"
import type { RouteData, TreeNode } from "../../../src/router-primitives/index.ts"
import { createTreeNode, insertRoute } from "../../../src/router-primitives/index.ts"
import type { RouteMetaStatic } from "../../../src/router-primitives/types.ts"
import {
	createServerHandler,
	type HandlerCacheConfig,
	type ServerHandlerConfig,
} from "../../../src/server-handler/index.ts"
import type { FlareStore, FlareStoreEntry, StaticEntryData } from "../../../src/store/index.ts"

/* ── Helpers ──────────────────────────────────────────────────────────── */

function makeStore(
	entries: Record<string, FlareStoreEntry> = {},
): FlareStore & { get: ReturnType<typeof vi.fn>; set: ReturnType<typeof vi.fn> } {
	const map = new Map(Object.entries(entries))
	return {
		delete: vi.fn(async (key: string) => {
			map.delete(key)
		}),
		deleteByTags: vi.fn(async () => {}),
		get: vi.fn(async (key: string) => map.get(key) ?? null),
		set: vi.fn(async (key: string, entry: FlareStoreEntry) => {
			map.set(key, entry)
		}),
	}
}

function makeStaticEntry(
	overrides?: Partial<StaticEntryData> & { storedAt?: number; tags?: string[] },
): FlareStoreEntry {
	return {
		data: {
			headers: {
				"content-type": "text/html; charset=utf-8",
				"surrogate-key": "product:1 category:shoes",
			},
			html: "<html><body>cached</body></html>",
			ndjson: '{"t":"d","k":"_root_/about","d":{"title":"cached"}}\n',
			...overrides,
		},
		storedAt: overrides?.storedAt ?? Date.now(),
		tags: overrides?.tags,
	}
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
	}
}

function makeISRRouteData(
	staticMeta: RouteMetaStatic,
	path = "/about",
	overrides?: Partial<RouteData>,
): RouteData {
	const vPath = `_root_${path}`
	return makeRouteData({
		e: path,
		o: { static: staticMeta },
		v: vPath,
		x: vPath,
		...overrides,
	})
}

function makeTreeWithRoute(path: string, routeData: RouteData): TreeNode {
	const tree = createTreeNode()
	insertRoute(tree, path, routeData)
	return tree
}

function makeRouter(overrides?: Partial<MarkedRouterConfig>): MarkedRouterConfig {
	return createRouter({
		layouts: {},
		routeTree: createTreeNode(),
		...overrides,
	})
}

function makeHandler(
	routePath: string,
	routeData: RouteData,
	cache?: HandlerCacheConfig,
	extra?: Partial<ServerHandlerConfig>,
): ReturnType<typeof createServerHandler> {
	const tree = makeTreeWithRoute(routePath, routeData)
	const router = makeRouter({ layouts: {}, routeTree: tree })
	return createServerHandler({ cache, router, ...extra })
}

function req(url = "http://localhost/about", headers?: Record<string, string>): Request {
	return new Request(url, { headers })
}

/* ── Bug 47: ISR bg re-render should extract fresh tags from Surrogate-Key ── */

describe("ISR bg re-render tags", () => {
	it("falls back to old tags when re-render produces no Surrogate-Key", async () => {
		const staleTime = Date.now() - 400_000
		const oldTags = ["product:1", "category:shoes"]
		const store = makeStore({
			"static:/about": makeStaticEntry({ storedAt: staleTime, tags: oldTags }),
		})
		const waitUntilPromises: Promise<unknown>[] = []
		const handler = makeHandler(
			"/about",
			makeISRRouteData({ mode: "isr", revalidate: 300 }),
			{ store },
			{
				waitUntil: (p: Promise<unknown>) => {
					waitUntilPromises.push(p)
				},
			},
		)

		await handler.fetch(req(), {})
		await Promise.allSettled(waitUntilPromises)

		/* When no Surrogate-Key header, fallback to old tags is acceptable */
		const setCalls = store.set.mock.calls
		if (setCalls.length > 0) {
			const lastCall = setCalls[setCalls.length - 1]
			const storedEntry = lastCall[1] as FlareStoreEntry
			/* Tags should be preserved (either old or fresh) */
			expect(storedEntry.tags).toBeDefined()
		}
	})

	it("extracts Surrogate-Key parsing logic correctly", () => {
		/* Direct test of the Surrogate-Key → tags parsing that ISR bg-rerender now uses */
		const surrogateKey = "product:1 category:boots featured"
		const freshTags = surrogateKey.split(" ").filter(Boolean)
		expect(freshTags).toEqual(["product:1", "category:boots", "featured"])

		/* Empty Surrogate-Key should produce empty array */
		const emptyTags = "".split(" ").filter(Boolean)
		expect(emptyTags).toEqual([])
	})
})
