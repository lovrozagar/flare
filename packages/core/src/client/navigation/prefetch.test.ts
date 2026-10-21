import { flush } from "solid-js"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import type { Frame } from "../../shared/protocol/index.ts"
import { createRouter } from "../../shared/router/create-router.ts"
import { mountNavigator, settled, unmountAll, type Fetch } from "./navigate.fixture.ts"
import { observeViewport } from "./prefetch.ts"
import { about, aboutFrames, anchor, hover, importAbout, ndjson, root, routerOf, setup } from "./prefetch.fixture.ts"

beforeEach(() => {
	history.replaceState(null, "", "/")
	importAbout.mockClear()
})

afterEach(() => {
	unmountAll()
	for (const link of document.head.querySelectorAll('link[rel="prefetch"], link[rel="modulepreload"]')) link.remove()
	document.body.replaceChildren()
})

it("intent", async () => {
	const app = setup()
	const link = anchor()
	app.prefetcher.watch(link, "/about", "intent")
	expect(importAbout).not.toHaveBeenCalled()
	hover(link)
	hover(link)
	await settled()
	expect(importAbout).toHaveBeenCalled()
	expect(app.fetch).toHaveBeenCalledExactlyOnceWith("/about?_flare=prefetch", expect.anything())
	const foreign = anchor()
	const stopForeign = app.prefetcher.watch(foreign, "https://evil.example/", "intent")
	hover(foreign)
	stopForeign()
	// A URL that does not parse prefetches nothing, and does not throw where URL.canParse is missing (decision B123).
	const unparsed = anchor()
	app.prefetcher.watch(unparsed, "http://[", "intent")
	hover(unparsed)
	const stopped = anchor()
	app.prefetcher.watch(stopped, "/about?again=1", "intent")()
	hover(stopped)
	await settled()
	expect(app.fetch).toHaveBeenCalledOnce()
})

it("object leaves the other field", async () => {
	const app = setup()
	const link = anchor()
	app.prefetcher.watch(link, "/about", { data: "intent" })
	expect(app.env.observe).not.toHaveBeenCalled()
	expect(app.fetch).not.toHaveBeenCalled()
	hover(link)
	await settled()
	expect(app.fetch).toHaveBeenCalledExactlyOnceWith("/about?_flare=prefetch", expect.anything())
	expect(importAbout).toHaveBeenCalled()
})

it("route string", async () => {
	const app = setup(routerOf({}, { client: { prefetch: "viewport" } }))
	const link = anchor()
	app.prefetcher.watch(link, "/about")
	hover(link)
	await settled()
	expect(app.fetch).not.toHaveBeenCalled()
	expect(app.env.observe).toHaveBeenCalledOnce()
	app.observed[0]()
	await settled()
	expect(importAbout).toHaveBeenCalled()
	expect(app.fetch).toHaveBeenCalledExactlyOnceWith("/about?_flare=prefetch", expect.anything())
	app.prefetcher.watch(anchor(), "/about?tab=2", "render")
	app.prefetcher.watch(anchor(), "/about?tab=3", "render")()
	expect(app.fetch).toHaveBeenCalledOnce()
	for (const run of app.idle) run()
	await settled()
	expect(app.fetch).toHaveBeenLastCalledWith("/about?tab=2&_flare=prefetch", expect.anything())
	expect(app.fetch).toHaveBeenCalledTimes(2)
})

it("defer not run", async () => {
	const placeholder: Frame[] = [
		{ t: "l", m: "_root_", d: null },
		{ t: "l", m: "_root_/slow", d: { late: { __deferred: true, key: "d0" } } },
		{ t: "r" },
		{ t: "d" },
	]
	const app = setup(routerOf(), { fetch: async () => ndjson(placeholder) })
	const link = anchor()
	app.prefetcher.watch(link, "/slow", "intent")
	app.prefetcher.watch(anchor(), "javascript:alert(1)", "intent")
	hover(link)
	const landing = await app.prefetcher.prefetched("/slow?_flare=data")
	expect(app.fetch).toHaveBeenCalledExactlyOnceWith("/slow?_flare=prefetch", expect.anything())
	expect(JSON.stringify(landing?.data["_root_/slow"])).toContain('"__deferred":true')
})

it("save data", async () => {
	const chunks = { "_root_/about": "/src/about.tsx" }
	for (const connection of [{ saveData: true }, { effectiveType: "2g" }, { effectiveType: "slow-2g" }]) {
		importAbout.mockClear()
		const app = setup(routerOf({ chunks }), { env: { network: { connection } } })
		app.prefetcher.all()
		expect(document.head.querySelectorAll('link[rel="prefetch"]')).toHaveLength(0)
		app.prefetcher.watch(anchor(), "/about")
		expect(app.env.observe).toHaveBeenCalledOnce()
		app.observed[0]()
		await settled()
		expect(importAbout).toHaveBeenCalled()
		expect(app.fetch).not.toHaveBeenCalled()
	}
	// A fresh router: the loop above imported `/about`, whose chunk is then loaded and not prefetched (BUGS.md 80).
	const fresh = createRouter({
		layouts: { _root_: root },
		routeTree: [{ id: "_root_/about", path: "/about", module: async () => about }],
		chunks,
	})
	const plain = setup(fresh, { env: { network: { connection: { effectiveType: "4g" } } } })
	plain.prefetcher.all()
	expect(document.head.querySelectorAll('link[rel="prefetch"]')).toHaveLength(1)
})

// Whether `/about`'s intent prefetch is still held `at` ms after it landed.
async function held(router: ReturnType<typeof routerOf>, at: number): Promise<boolean> {
	const app = setup(router)
	const link = anchor()
	app.prefetcher.watch(link, "/about", "intent")
	hover(link)
	await settled()
	app.clock.now = at
	return app.prefetcher.prefetched("/about?_flare=data") !== undefined
}

// `prefetchGcTime` defaults to `gcTime`, the route's, else the router's: a prefetched entry never outlives it
// (BUGS.md 398).
it("prefetch gc default", async () => {
	const route = routerOf({}, { client: { gcTime: "100ms" } })
	const router = routerOf({ cache: { client: { gcTime: "100ms" } } })
	expect([await held(route, 100), await held(route, 101), await held(router, 101)]).toEqual([true, false, false])
	expect(await held(routerOf({ cache: { client: false } }), 29_999)).toBe(true)
})

it("prefetch stale", async () => {
	const capped = setup(routerOf({}, { client: { prefetchGcTime: "100ms" } }))
	const once = anchor()
	capped.prefetcher.watch(once, "/about", "intent")
	hover(once)
	await settled()
	capped.clock.now = 101
	expect(capped.prefetcher.prefetched("/about?_flare=data")).toBeUndefined()
	const many = setup()
	for (let index = 0; index <= 100; index += 1) {
		const link = anchor()
		many.prefetcher.watch(link, `/about?n=${index}`, "intent")
		hover(link)
	}
	await settled()
	expect(many.prefetcher.prefetched("/about?n=0&_flare=data")).toBeUndefined()
	expect(await many.prefetcher.prefetched("/about?n=100&_flare=data")).toBeDefined()
	const app = setup(routerOf({}, { client: { staleTime: "1m", prefetchStaleTime: "1s" } }))
	const link = anchor()
	app.prefetcher.watch(link, "/about", "intent")
	hover(link)
	await settled()
	app.clock.now = 999
	hover(link)
	expect(app.fetch).toHaveBeenCalledOnce()
	app.clock.now = 1001
	expect(app.prefetcher.prefetched("/about?_flare=data")).toBeUndefined()
	hover(link)
	await settled()
	expect(app.fetch).toHaveBeenCalledTimes(2)
	app.clock.now = 1500
	expect(await app.prefetcher.prefetched("/about?_flare=data")).toEqual({
		data: { _root_: null, "_root_/about": "fresh" },
		heads: {},
	})
	expect(app.prefetcher.prefetched("/about?_flare=data")).toBeUndefined()
})

it("prefetch default", async () => {
	const app = setup()
	const navigation = vi.fn<Fetch>(async () => ndjson(aboutFrames))
	const mounted = await mountNavigator(app.router, navigation, {
		extra: { prefetched: app.prefetcher.prefetched },
	})
	const link = anchor()
	app.prefetcher.watch(link, "/about", "intent")
	hover(link)
	await settled()
	app.clock.now = 2000
	await mounted.navigator.navigate({ to: "_root_/about" })
	flush()
	expect(mounted.text()).toBe("root[about:fresh]")
	expect(navigation).not.toHaveBeenCalled()
	await mounted.navigator.navigate({ to: "_root_/" })
	hover(link)
	await settled()
	app.clock.now = 32_001
	await mounted.navigator.navigate({ to: "_root_/about" })
	expect(navigation).toHaveBeenLastCalledWith("/about?_flare=data", expect.anything())
})

it("no commit", async () => {
	const app = setup()
	const mounted = await mountNavigator(app.router, vi.fn<Fetch>())
	const length = history.length
	const link = anchor()
	app.prefetcher.watch(link, "/about", "intent")
	hover(link)
	expect(mounted.deps.navigation.pending()).toBe(false)
	await settled()
	flush()
	expect(mounted.text()).toBe("root[home:start]")
	expect(location.pathname).toBe("/")
	expect(history.length).toBe(length)
})

it("replaced in flight", async () => {
	const first = Promise.withResolvers<Response>()
	const responses = [() => first.promise, async () => ndjson(aboutFrames)]
	const app = setup(routerOf(), { fetch: () => (responses.shift() ?? responses[0])() })
	const link = anchor()
	app.prefetcher.watch(link, "/about", "intent")
	hover(link)
	const taken = app.prefetcher.prefetched("/about?_flare=data")
	hover(link)
	first.resolve(new Response(null, { status: 500 }))
	expect(await taken).toBeUndefined()
	await settled()
	expect(await app.prefetcher.prefetched("/about?_flare=data")).toEqual({
		data: { _root_: null, "_root_/about": "fresh" },
		heads: {},
	})
})

it("failed prefetch", async () => {
	const responses: Array<() => Promise<Response>> = [
		async () => new Response(null, { status: 500 }),
		() => Promise.reject(new TypeError("Failed to fetch")),
		async () => ndjson(aboutFrames, { "flare-build": "b2" }),
		async () => ndjson([{ t: "l", m: "_root_", d: null }]),
	]
	const app = setup(routerOf(), { fetch: () => (responses.shift() ?? (async () => ndjson(aboutFrames)))() })
	const link = anchor()
	app.prefetcher.watch(link, "/about", "intent")
	for (let attempt = 0; attempt < 4; attempt += 1) {
		hover(link)
		expect(await app.prefetcher.prefetched("/about?_flare=data")).toBeUndefined()
	}
	expect(app.fetch).toHaveBeenCalledTimes(4)
	const retry = setup(routerOf(), { fetch: async () => new Response(null, { status: 500 }) })
	const again = anchor()
	retry.prefetcher.watch(again, "/about", "intent")
	hover(again)
	await settled()
	hover(again)
	expect(retry.fetch).toHaveBeenCalledTimes(2)
	const broken = createRouter({
		layouts: { _root_: root },
		routeTree: [{ id: "_root_/x", path: "/x", module: () => Promise.reject(new Error("Loading chunk 1 failed")) }],
	})
	const lazy = setup(broken)
	const target = anchor()
	lazy.prefetcher.watch(target, "/x", { modules: "intent" })
	hover(target)
	await settled()
	expect(lazy.fetch).not.toHaveBeenCalled()
})

it("viewport observer", () => {
	const observers: { callback: (entries: { isIntersecting: boolean }[]) => void; disconnect: () => void }[] = []
	class Observer {
		readonly disconnect = vi.fn<() => void>()
		constructor(callback: (entries: { isIntersecting: boolean }[]) => void) {
			observers.push({ callback, disconnect: this.disconnect })
		}
		observe(): void {}
	}
	vi.stubGlobal("IntersectionObserver", Observer)
	const run = vi.fn<() => void>()
	const stop = observeViewport(anchor(), run)
	const [observer] = observers
	observer.callback([{ isIntersecting: false }])
	expect(run).not.toHaveBeenCalled()
	observer.callback([{ isIntersecting: true }])
	expect(run).toHaveBeenCalledOnce()
	expect(observer.disconnect).toHaveBeenCalledOnce()
	stop()
	expect(observer.disconnect).toHaveBeenCalledTimes(2)
	vi.unstubAllGlobals()
})

// `forget` drops every held landing, one still in flight too, so a navigation after it asks the server again (B133).
it("forget", async () => {
	const app = setup()
	for (const href of ["/about", "/about?n=1"]) {
		const link = anchor()
		app.prefetcher.watch(link, href, "intent")
		hover(link)
	}
	await settled()
	const late = anchor()
	app.prefetcher.watch(late, "/about?n=2", "intent")
	hover(late)
	app.prefetcher.forget()
	await settled()
	for (const url of ["/about?_flare=data", "/about?n=1&_flare=data", "/about?n=2&_flare=data"]) {
		expect(app.prefetcher.prefetched(url)).toBeUndefined()
	}
})

// A Link watched while the page shows its own URL with a hash, a nav Link on `/about#part`, is a hash move then, and
// a navigation once the page changes: its trigger resolves the target when it fires (BUGS.md 309). Last in the file:
// the hover loads `/about`'s module, which every later case would then find loaded.
it("hash on screen, then another page", async () => {
	const at = { current: { pathname: "/about", search: "", hash: "#part" } }
	const app = setup(routerOf({ prefetch: "intent" }), { current: () => at.current })
	const link = anchor()
	app.prefetcher.watch(link, "/about")
	hover(link)
	await settled()
	expect(app.fetch).not.toHaveBeenCalled()
	at.current = { pathname: "/", search: "", hash: "" }
	hover(link)
	await settled()
	expect(app.fetch.mock.calls.map(([url]) => String(url))).toEqual([expect.stringContaining("/about?_flare=prefetch")])
})
