import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { createRouter, type RouteModule } from "../../shared/router/create-router.ts"
import { createPage } from "../../shared/route-builder/page.ts"
import { loadChain } from "../../shared/router/load-chain.ts"
import { settled, unmountAll } from "./navigate.fixture.ts"
import { about, anchor, home, hover, importAbout, root, routerOf, setup, slow } from "./prefetch.fixture.ts"

beforeEach(() => {
	history.replaceState(null, "", "/")
	importAbout.mockClear()
})

afterEach(() => {
	unmountAll()
	for (const link of document.head.querySelectorAll('link[rel="prefetch"], link[rel="modulepreload"]')) link.remove()
	document.body.replaceChildren()
})

// The prefetch links in the head, by href.
function hrefs(): (string | null)[] {
	return [...document.head.querySelectorAll('link[rel="prefetch"]')].map((link) => link.getAttribute("href"))
}

// The idle warm-up, the router's `modules: "all"` (prefetch.ts `all`).
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

// A route whose import is in flight, a viewport or intent prefetch's say, is not warmed again: its files are already on
// their way, and a prefetch link for them would download them a second time (docs-perf `requests`, BUGS.md 482).
it("all skips an import in flight", async () => {
	const pending = Promise.withResolvers<RouteModule>()
	// Its own import, so the module this case loads is no other case's.
	const importLate = vi.fn<() => Promise<RouteModule>>(() => pending.promise)
	const lateRouter = () =>
		createRouter({
			layouts: { _root_: root },
			routeTree: [
				{ id: "_root_/", path: "/", module: home },
				{ id: "_root_/late", path: "/late", module: importLate },
			],
			chunks: { _root_: "/src/root.tsx", "_root_/": "/src/root.tsx", "_root_/late": "/src/late.tsx" },
		})
	const app = setup(lateRouter())
	const started = loadChain(app.router.match("/late").chain)
	app.prefetcher.all()
	expect(document.head.querySelectorAll('link[rel="prefetch"]')).toHaveLength(0)
	const unsupported = setup(lateRouter(), { env: { relPrefetch: false } })
	unsupported.prefetcher.all()
	await settled()
	expect(importLate).toHaveBeenCalledOnce()
	pending.resolve(createPage("_root_/late").render(() => "late"))
	await started
})

// The after-load warm-up is the router's `modules: "all"` and nothing else: a router that turns it off, by `false`, a
// trigger, or an object naming another `modules`, warms no route's code (link.md Prefetch, BUGS.md 305).
it("all only when the router says all", () => {
	const chunks = { _root_: "/src/root.tsx", "_root_/": "/src/root.tsx", "_root_/about": "/src/about.tsx" }
	for (const prefetch of [
		false,
		"intent",
		"viewport",
		{ modules: "intent" },
		{ modules: false, data: "intent" },
	] as const) {
		const app = setup(routerOf({ chunks, prefetch }), { env: { relPrefetch: true } })
		app.prefetcher.all()
		const unsupported = setup(routerOf({ chunks, prefetch }), { env: { relPrefetch: false } })
		unsupported.prefetcher.all()
		expect([
			prefetch,
			document.head.querySelectorAll('link[rel="prefetch"]').length,
			importAbout.mock.calls.length,
		]).toEqual([prefetch, 0, 0])
	}
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
	// Two at a time (BUGS.md 520): the third goes in once one of the first two has loaded.
	expect(hrefs()).toEqual(["/assets/a.js", "/assets/a-dep.js"])
	document.head.querySelector('link[rel="prefetch"]')?.dispatchEvent(new Event("load"))
	await settled()
	expect(hrefs()).toEqual(["/assets/a.js", "/assets/a-dep.js", "/assets/x.js"])
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
