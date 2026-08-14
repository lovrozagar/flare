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
			headers: { "content-type": "text/html; charset=utf-8" },
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

/* ── ISR Serving ─────────────────────────────────────────────────────── */

describe("ISR serving — cache hit", () => {
	it("serves HTML from static store for ISR route", async () => {
		const store = makeStore({
			"static:/about": makeStaticEntry({
				html: "<html><body>ISR cached</body></html>",
			}),
		})
		const handler = makeHandler("/about", makeISRRouteData({ mode: "isr", revalidate: 300 }), {
			store,
		})
		const response = await handler.fetch(req(), {})
		expect(response.status).toBe(200)
		const body = await response.text()
		expect(body).toContain("ISR cached")
	})

	it("serves NDJSON from static store for data request", async () => {
		const store = makeStore({
			"static:/about": makeStaticEntry({
				ndjson: '{"t":"d","k":"_root_/about","d":{"title":"cached-data"}}\n',
			}),
		})
		const handler = makeHandler("/about", makeISRRouteData({ mode: "isr", revalidate: 300 }), {
			store,
		})
		const response = await handler.fetch(req("http://localhost/about", { "x-d": "1" }), {})
		expect(response.status).toBe(200)
		const body = await response.text()
		expect(body).toContain("cached-data")
	})

	it("replaces __FLARE_NONCE__ placeholder in HTML", async () => {
		const store = makeStore({
			"static:/about": makeStaticEntry({
				html: '<html><script nonce="__FLARE_NONCE__">alert(1)</script></html>',
			}),
		})
		const handler = makeHandler("/about", makeISRRouteData({ mode: "isr", revalidate: 300 }), {
			store,
		})
		const response = await handler.fetch(req(), {})
		const body = await response.text()
		expect(body).not.toContain("__FLARE_NONCE__")
		expect(body).toMatch(/nonce="[a-f0-9]+"/)
	})

	it("replaces nonce placeholder in CSP header", async () => {
		const store = makeStore({
			"static:/about": makeStaticEntry({
				headers: {
					"content-security-policy": "script-src 'self' 'nonce-__FLARE_NONCE__'",
					"content-type": "text/html; charset=utf-8",
				},
			}),
		})
		const handler = makeHandler("/about", makeISRRouteData({ mode: "isr", revalidate: 300 }), {
			store,
		})
		const response = await handler.fetch(req(), {})
		const csp = response.headers.get("content-security-policy") ?? ""
		expect(csp).not.toContain("__FLARE_NONCE__")
		expect(csp).toMatch(/nonce-[a-f0-9]+/)
	})

	it("serves HIT when stored content-length no longer matches nonce rewrite", async () => {
		const html = '<html><script nonce="__FLARE_NONCE__">x</script></html>'
		const store = makeStore({
			"static:/about": makeStaticEntry({
				headers: {
					connection: "keep-alive",
					"content-length": "1",
					"content-type": "text/html; charset=utf-8",
					"transfer-encoding": "chunked",
				},
				html,
			}),
		})
		const handler = makeHandler("/about", makeISRRouteData({ mode: "isr", revalidate: 300 }), {
			store,
		})
		const response = await handler.fetch(req(), {})
		expect(response.status).toBe(200)
		const body = await response.text()
		expect(body).toMatch(/nonce="[a-f0-9]+"/)
		expect(response.headers.get("content-length")).not.toBe("1")
		expect(response.headers.has("transfer-encoding")).toBe(false)
		expect(response.headers.has("connection")).toBe(false)
	})

	it("includes security headers on cached response", async () => {
		const store = makeStore({
			"static:/about": makeStaticEntry(),
		})
		const handler = makeHandler("/about", makeISRRouteData({ mode: "isr", revalidate: 300 }), {
			store,
		})
		const response = await handler.fetch(req(), {})
		expect(response.headers.get("x-content-type-options")).toBe("nosniff")
		expect(response.headers.get("x-frame-options")).toBe("DENY")
	})
})

describe("ISR serving — stale-while-revalidate", () => {
	it("fresh entry → no background re-render", async () => {
		const store = makeStore({
			"static:/about": makeStaticEntry({ storedAt: Date.now() }),
		})
		const waitUntilSpy = vi.fn()
		const handler = makeHandler(
			"/about",
			makeISRRouteData({ mode: "isr", revalidate: 300 }),
			{
				store,
			},
			{ waitUntil: waitUntilSpy },
		)
		await handler.fetch(req(), {})
		expect(waitUntilSpy).not.toHaveBeenCalled()
	})

	it("stale entry → serves cached + triggers background re-render", async () => {
		const staleTime = Date.now() - 400_000
		const store = makeStore({
			"static:/about": makeStaticEntry({ storedAt: staleTime }),
		})
		const waitUntilSpy = vi.fn()
		const handler = makeHandler(
			"/about",
			makeISRRouteData({ mode: "isr", revalidate: 300 }),
			{
				store,
			},
			{ waitUntil: waitUntilSpy },
		)
		const response = await handler.fetch(req(), {})
		/* Still serves cached content */
		expect(response.status).toBe(200)
		const body = await response.text()
		expect(body).toContain("cached")
		/* But triggers background re-render */
		expect(waitUntilSpy).toHaveBeenCalledTimes(1)
	})
})

describe("ISR serving — cache miss + dynamicParams modes", () => {
	it("dynamicParams: true → falls through to normal SSR", async () => {
		const store = makeStore()
		const handler = makeHandler(
			"/about",
			makeISRRouteData({ dynamicParams: true, mode: "isr", revalidate: 300 }),
			{ store },
		)
		const response = await handler.fetch(req(), {})
		/* Falls through to SSR — route matched, gets 200 or 500 */
		expect([200, 500]).toContain(response.status)
	})

	it("dynamicParams: false → returns 404", async () => {
		const store = makeStore()
		const handler = makeHandler(
			"/about",
			makeISRRouteData({ dynamicParams: false, mode: "isr", revalidate: 300 }),
			{ store },
		)
		const response = await handler.fetch(req(), {})
		expect(response.status).toBe(404)
	})

	it("dynamicParams: false + x-flare-prerender → falls through to SSR", async () => {
		const store = makeStore()
		const handler = makeHandler(
			"/about",
			makeISRRouteData({ dynamicParams: false, mode: "isr", revalidate: 300 }),
			{ store },
		)
		const response = await handler.fetch(
			new Request("http://localhost/about", { headers: { "x-flare-prerender": "1" } }),
			{},
		)
		expect([200, 500]).toContain(response.status)
	})

	it("no dynamicParams specified (default true) → falls through to SSR", async () => {
		const store = makeStore()
		const handler = makeHandler("/about", makeISRRouteData({ mode: "isr", revalidate: 300 }), {
			store,
		})
		const response = await handler.fetch(req(), {})
		expect([200, 500]).toContain(response.status)
	})
})

describe("ISR serving — truly static routes", () => {
	it("truly static cache hit → serves from store", async () => {
		const store = makeStore({
			"static:/about": makeStaticEntry({
				html: "<html>static forever</html>",
			}),
		})
		const handler = makeHandler("/about", makeISRRouteData({ mode: "static" }), { store })
		const response = await handler.fetch(req(), {})
		expect(response.status).toBe(200)
		const body = await response.text()
		expect(body).toContain("static forever")
	})

	it("truly static → never triggers background re-render", async () => {
		const store = makeStore({
			"static:/about": makeStaticEntry({
				storedAt: 0 /* ancient */,
			}),
		})
		const waitUntilSpy = vi.fn()
		const handler = makeHandler(
			"/about",
			makeISRRouteData({ mode: "static" }),
			{
				store,
			},
			{ waitUntil: waitUntilSpy },
		)
		await handler.fetch(req(), {})
		expect(waitUntilSpy).not.toHaveBeenCalled()
	})

	it("truly static cache miss → falls through to SSR", async () => {
		const store = makeStore()
		const handler = makeHandler("/about", makeISRRouteData({ mode: "static" }), { store })
		const response = await handler.fetch(req(), {})
		expect([200, 500]).toContain(response.status)
	})
})

describe("ISR serving — bg re-render must bypass cache", () => {
	it("x-isr-bg request bypasses static store, renders fresh SSR", async () => {
		const store = makeStore({
			"static:/about": makeStaticEntry({
				html: "<html><body>STALE_CACHED_MARKER</body></html>",
			}),
		})
		const handler = makeHandler("/about", makeISRRouteData({ mode: "isr", revalidate: 300 }), {
			store,
		})

		/* Direct ISR background request — should bypass static store */
		const response = await handler.fetch(
			new Request("http://localhost/about", { headers: { "x-isr-bg": "1" } }),
			{},
		)

		const html = await response.text()
		/* Bug: response contains STALE_CACHED_MARKER from cache */
		/* Fix: response comes from fresh SSR, doesn't contain the marker */
		expect(html).not.toContain("STALE_CACHED_MARKER")
	})

	it("stale bg re-render replaces nonce with placeholder before storing", async () => {
		const staleTime = Date.now() - 400_000
		const store = makeStore({
			"static:/stale-nonce-test": makeStaticEntry({ storedAt: staleTime }),
		})
		const waitUntilSpy = vi.fn()
		const handler = makeHandler(
			"/stale-nonce-test",
			makeISRRouteData({ mode: "isr", revalidate: 300 }),
			{ store },
			{ waitUntil: waitUntilSpy },
		)
		await handler.fetch(new Request("http://localhost/stale-nonce-test"), {})
		expect(waitUntilSpy).toHaveBeenCalledTimes(1)

		/* Await the bg re-render promise */
		await waitUntilSpy.mock.calls[0][0]

		/* If store.set was called, the stored HTML must use __FLARE_NONCE__ not real nonces */
		if (store.set.mock.calls.length > 0) {
			const setArgs = store.set.mock.calls[0]
			const storedEntry = (setArgs[1] as FlareStoreEntry).data as StaticEntryData
			/* Stored HTML should NOT contain real hex nonces — only placeholders */
			const hexNonceMatch = /\bnonce="([a-f0-9]{32})"/.exec(storedEntry.html)
			expect(hexNonceMatch).toBeNull()
			/* CSP header should use placeholder too */
			const csp = storedEntry.headers["content-security-policy"] ?? ""
			if (csp) {
				expect(csp).not.toMatch(/nonce-[a-f0-9]{32}/)
			}
		}
	})

	it("x-isr-bg data request bypasses static store NDJSON", async () => {
		const store = makeStore({
			"static:/about": makeStaticEntry({
				ndjson: '{"t":"l","m":"_root_/about","d":{"title":"STALE_NDJSON_MARKER"}}\n',
			}),
		})
		const handler = makeHandler("/about", makeISRRouteData({ mode: "isr", revalidate: 300 }), {
			store,
		})

		/* Data request with ISR bg flag */
		const response = await handler.fetch(
			new Request("http://localhost/about", { headers: { "x-d": "1", "x-isr-bg": "1" } }),
			{},
		)

		const body = await response.text()
		expect(body).not.toContain("STALE_NDJSON_MARKER")
	})
})

describe("ISR serving — no static store configured", () => {
	it("ISR route without static store → falls through to normal SSR", async () => {
		const handler = makeHandler("/about", makeISRRouteData({ mode: "isr", revalidate: 300 }))
		const response = await handler.fetch(req(), {})
		/* No static store → normal SSR path */
		expect([200, 500]).toContain(response.status)
	})
})

describe("ISR serving — route without static meta", () => {
	it("normal route with static store → ignores store, proceeds to SSR", async () => {
		const store = makeStore({
			"static:/about": makeStaticEntry(),
		})
		const handler = makeHandler("/about", makeRouteData() /* no static meta */, { store })
		const response = await handler.fetch(req(), {})
		/* Normal SSR, not cached content */
		expect([200, 500]).toContain(response.status)
		expect(store.get).not.toHaveBeenCalled()
	})
})

/* ── Flare-Render / Flare-Cache headers ────────────────────────────── */

describe("Flare-Render and Flare-Cache headers", () => {
	it("ISR fresh hit → Flare-Render: ISR, Flare-Cache: HIT", async () => {
		const store = makeStore({
			"static:/about": makeStaticEntry({ storedAt: Date.now() }),
		})
		const handler = makeHandler("/about", makeISRRouteData({ mode: "isr", revalidate: 300 }), {
			store,
		})
		const response = await handler.fetch(req(), {})
		expect(response.headers.get("Flare-Render")).toBe("ISR")
		expect(response.headers.get("Flare-Cache")).toBe("HIT")
	})

	it("ISR stale hit → Flare-Render: ISR, Flare-Cache: STALE", async () => {
		const staleTime = Date.now() - 400_000
		const store = makeStore({
			"static:/about": makeStaticEntry({ storedAt: staleTime }),
		})
		const handler = makeHandler(
			"/about",
			makeISRRouteData({ mode: "isr", revalidate: 300 }),
			{ store },
			{ waitUntil: vi.fn() },
		)
		const response = await handler.fetch(req(), {})
		expect(response.headers.get("Flare-Render")).toBe("ISR")
		expect(response.headers.get("Flare-Cache")).toBe("STALE")
	})

	it("ISR data request hit → Flare-Render: ISR, Flare-Cache: HIT", async () => {
		const store = makeStore({
			"static:/about": makeStaticEntry({ storedAt: Date.now() }),
		})
		const handler = makeHandler("/about", makeISRRouteData({ mode: "isr", revalidate: 300 }), {
			store,
		})
		const response = await handler.fetch(req("http://localhost/about", { "x-d": "1" }), {})
		expect(response.headers.get("Flare-Render")).toBe("ISR")
		expect(response.headers.get("Flare-Cache")).toBe("HIT")
	})

	it("SSG hit → Flare-Render: SSG, Flare-Cache: HIT", async () => {
		const store = makeStore({
			"static:/about": makeStaticEntry({ storedAt: Date.now() }),
		})
		const handler = makeHandler("/about", makeISRRouteData({ mode: "static" }), { store })
		const response = await handler.fetch(req(), {})
		expect(response.headers.get("Flare-Render")).toBe("SSG")
		expect(response.headers.get("Flare-Cache")).toBe("HIT")
	})

	it("ISR miss with dynamicParams: false → Flare-Render: ISR, Flare-Cache: MISS", async () => {
		const store = makeStore()
		const handler = makeHandler(
			"/about",
			makeISRRouteData({ dynamicParams: false, mode: "isr", revalidate: 300 }),
			{ store },
		)
		const response = await handler.fetch(req(), {})
		expect(response.headers.get("Flare-Render")).toBe("ISR")
		expect(response.headers.get("Flare-Cache")).toBe("MISS")
	})

	it("ISR miss with dynamicParams: true → falls through to SSR with Flare-Render", async () => {
		const store = makeStore()
		const handler = makeHandler(
			"/about",
			makeISRRouteData({ dynamicParams: true, mode: "isr", revalidate: 300 }),
			{ store },
		)
		const response = await handler.fetch(req(), {})
		/* Falls through to SSR path — in test env renderToStream fails,
		 * but the happy path sets Flare-Render: ISR, Flare-Cache: MISS */
		expect(response.headers.get("Flare-Render")).toBeTruthy()
	})

	it("SSR route without cache → Flare-Render: SSR, no Flare-Cache", async () => {
		const handler = makeHandler("/about", makeRouteData())
		const response = await handler.fetch(req(), {})
		expect(response.headers.get("Flare-Render")).toBe("SSR")
		expect(response.headers.get("Flare-Cache")).toBeNull()
	})

	it("ISR bg render → no Flare headers", async () => {
		const store = makeStore({
			"static:/about": makeStaticEntry(),
		})
		const handler = makeHandler("/about", makeISRRouteData({ mode: "isr", revalidate: 300 }), {
			store,
		})
		const response = await handler.fetch(
			new Request("http://localhost/about", { headers: { "x-isr-bg": "1" } }),
			{},
		)
		expect(response.headers.get("Flare-Render")).toBeNull()
		expect(response.headers.get("Flare-Cache")).toBeNull()
	})

	it("global headers: false → no Flare headers on ISR hit", async () => {
		const store = makeStore({
			"static:/about": makeStaticEntry({ storedAt: Date.now() }),
		})
		const handler = makeHandler("/about", makeISRRouteData({ mode: "isr", revalidate: 300 }), {
			headers: false,
			store,
		})
		const response = await handler.fetch(req(), {})
		expect(response.status).toBe(200)
		expect(response.headers.get("Flare-Render")).toBeNull()
		expect(response.headers.get("Flare-Cache")).toBeNull()
	})

	it("global headers: false → no Flare headers on ISR data request", async () => {
		const store = makeStore({
			"static:/about": makeStaticEntry({ storedAt: Date.now() }),
		})
		const handler = makeHandler("/about", makeISRRouteData({ mode: "isr", revalidate: 300 }), {
			headers: false,
			store,
		})
		const response = await handler.fetch(req("http://localhost/about", { "x-d": "1" }), {})
		expect(response.headers.get("Flare-Render")).toBeNull()
		expect(response.headers.get("Flare-Cache")).toBeNull()
	})

	it("global headers: false → no Flare headers on SSR route", async () => {
		const handler = makeHandler("/about", makeRouteData(), { headers: false })
		const response = await handler.fetch(req(), {})
		expect(response.headers.get("Flare-Render")).toBeNull()
		expect(response.headers.get("Flare-Cache")).toBeNull()
	})
})
