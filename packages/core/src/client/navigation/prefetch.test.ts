import { flush } from "solid-js"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { encodeFrame, type Frame } from "../../shared/protocol/index.ts"
import { createPage } from "../../shared/route-builder/page.ts"
import { createRootLayout } from "../../shared/route-builder/root-layout.ts"
import { createRouter, type RouteModule, type RouterOptions } from "../../shared/router/create-router.ts"
import { loadChain } from "../../shared/router/load-chain.ts"
import { mountNavigator, settled, unmountAll, type Fetch } from "./navigate.fixture.ts"
import { createPrefetcher, observeViewport, type PrefetchEnv } from "./prefetch.ts"

const root = createRootLayout("_root_").render((props) => ["root[", props.children, "]"])
const home = createPage("_root_/").render((props) => `home:${String(props.loaderData)}`)
const about = createPage("_root_/about").render((props) => `about:${String(props.loaderData)}`)
const slow = createPage("_root_/slow").render(() => "slow")
const importAbout = vi.fn<() => Promise<RouteModule>>(async () => about)

const aboutFrames: Frame[] = [
	{ t: "l", m: "_root_", d: null },
	{ t: "l", m: "_root_/about", d: "fresh" },
	{ t: "r" },
	{ t: "d" },
]

function ndjson(frames: readonly Frame[], headers: Record<string, string> = {}): Response {
	return new Response(frames.map(encodeFrame).join(""), {
		headers: { "content-type": "application/x-ndjson", ...headers },
	})
}

function routerOf(options: Partial<RouterOptions> = {}, aboutClient?: RouteModule["cache"]) {
	const client = aboutClient?.client
	return createRouter({
		layouts: { _root_: root },
		routeTree: [
			{ id: "_root_/", path: "/", module: home },
			{ id: "_root_/about", path: "/about", module: importAbout, ...(client === undefined ? {} : { client }) },
			{ id: "_root_/slow", path: "/slow", module: slow },
		],
		...options,
	})
}

type Setup = { fetch?: Fetch; env?: Partial<PrefetchEnv> }

function setup(router = routerOf(), options: Setup = {}) {
	const fetch = vi.fn<Fetch>(options.fetch ?? (async () => ndjson(aboutFrames)))
	const observed: (() => void)[] = []
	const idle: (() => void)[] = []
	const clock = { now: 0 }
	const env: PrefetchEnv = {
		network: {},
		observe: vi.fn<PrefetchEnv["observe"]>((_element, run) => {
			observed.push(run)
			return () => undefined
		}),
		idle: (run) => void idle.push(run),
		head: document.head,
		now: () => clock.now,
		relPrefetch: true,
		...options.env,
	}
	const prefetcher = createPrefetcher({
		router,
		origin: location.origin,
		current: () => ({ pathname: "/", search: "", hash: "" }),
		fetch,
		build: "b1",
		land: { dev: false },
		env,
	})
	return { prefetcher, fetch, observed, idle, env, clock, router }
}

function anchor(): HTMLAnchorElement {
	const element = document.createElement("a")
	document.body.append(element)
	return element
}

function hover(element: Element): void {
	element.dispatchEvent(new Event("pointerenter"))
}

beforeEach(() => {
	history.replaceState(null, "", "/")
	importAbout.mockClear()
})

afterEach(() => {
	unmountAll()
	for (const link of document.head.querySelectorAll('link[rel="prefetch"], link[rel="modulepreload"]')) link.remove()
	document.body.replaceChildren()
})

it("all modules", async () => {
	const chunks = { _root_: "/src/root.tsx", "_root_/": "/src/root.tsx", "_root_/about": "/src/about.tsx" }
	const app = setup(routerOf({ chunks }))
	const link = anchor()
	app.prefetcher.watch(link, "/about")
	hover(link)
	await settled()
	expect(app.env.observe).not.toHaveBeenCalled()
	expect(importAbout).not.toHaveBeenCalled()
	// The root's and home's records are loaded (static here), so only `/about`'s file is prefetched (BUGS.md 80).
	app.prefetcher.all()
	const links = [...document.head.querySelectorAll('link[rel="prefetch"]')]
	expect(
		links.map((node) => [node.getAttribute("href"), node.getAttribute("as"), node.hasAttribute("crossorigin")]),
	).toEqual([["/src/about.tsx", "script", true]])
	expect(app.fetch).not.toHaveBeenCalled()
})

// Safari has no rel=prefetch through 26.x (`relList.supports("prefetch")` is false), so "all" imports each unloaded
// route and layout module there, as intent prefetch does: the module map holds it and its imports for the next
// navigation. No link: a modulepreload Safari does not use within seconds of load is a console warning per chunk
// (BUGS.md 124.7).
it("all without prefetch support", async () => {
	const chunks = { _root_: "/src/root.tsx", "_root_/": "/src/root.tsx", "_root_/about": "/src/about.tsx" }
	const app = setup(routerOf({ chunks }), { env: { relPrefetch: false } })
	app.prefetcher.all()
	await settled()
	expect(document.head.querySelectorAll('link[rel="prefetch"], link[rel="modulepreload"]')).toHaveLength(0)
	expect(importAbout).toHaveBeenCalledOnce()
	expect(app.fetch).not.toHaveBeenCalled()
})

// A built chunks map gives each route its chunk and the chunks it imports, so "all" prefetches that whole closure, each
// file once: a navigation then downloads neither the route's chunk nor its imports. A file in a loaded route's closure
// is in the module map already and is skipped (BUGS.md 80, 124.6).
it("all closures", async () => {
	const chunks = {
		_root_: ["/assets/root.js", "/assets/shared.js"],
		"_root_/": ["/assets/root.js", "/assets/shared.js"],
		"chunk-a": ["/assets/a.js", "/assets/shared.js", "/assets/a-dep.js"],
		"chunk-x": ["/assets/x.js", "/assets/a-dep.js"],
	}
	const app = setup(routerOf({ chunks }))
	app.prefetcher.all()
	await settled()
	const hrefs = [...document.head.querySelectorAll('link[rel="prefetch"]')].map((link) => link.getAttribute("href"))
	expect(hrefs).toEqual(["/assets/a.js", "/assets/a-dep.js", "/assets/x.js"])
})

// A chunk the client already imported is not prefetched again: the browser holds it in its module map, and a prefetch
// would fetch it a second time. A file that also holds an unloaded route's module counts as loaded (BUGS.md 80).
it("loaded chunks skipped", async () => {
	const router = createRouter({
		layouts: { _root_: async () => root },
		routeTree: [
			{ id: "_root_/", path: "/", module: async () => home },
			{ id: "_root_/about", path: "/about", module: async () => about },
			{ id: "_root_/slow", path: "/slow", module: async () => slow },
		],
		chunks: {
			_root_: "/assets/root.js",
			"_root_/": "/assets/home.js",
			"_root_/about": "/assets/about.js",
			"_root_/slow": "/assets/home.js",
		},
	})
	await loadChain(router.match("/").chain)
	setup(router).prefetcher.all()
	expect([...document.head.querySelectorAll('link[rel="prefetch"]')].map((node) => node.getAttribute("href"))).toEqual([
		"/assets/about.js",
	])
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
