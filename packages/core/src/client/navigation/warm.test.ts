import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { createRouter, type RouteModule } from "../../shared/router/create-router.ts"
import { createPage } from "../../shared/route-builder/page.ts"
import { unmountAll } from "./navigate.fixture.ts"
import { anchor, home, hover, root, routerOf, setup } from "./prefetch.fixture.ts"
import { hopProtocol } from "./warm.ts"

// The idle warm-up keeps at most two requests in flight and yields to the user's own work, so over HTTP/1.1, six
// connections to a host, the user's request never waits behind the whole wave (BUGS.md 520, decision B127).

const FILES = ["/a.js", "/b.js", "/c.js", "/d.js", "/e.js"]
const chunks = Object.fromEntries(FILES.map((file, index) => [`_root_/x${index}`, file]))

beforeEach(() => vi.useFakeTimers())

afterEach(() => {
	vi.useRealTimers()
	unmountAll()
	for (const link of document.head.querySelectorAll('link[rel="prefetch"]')) link.remove()
	document.body.replaceChildren()
})

function linked(): HTMLLinkElement[] {
	return [...document.head.querySelectorAll<HTMLLinkElement>('link[rel="prefetch"]')]
}

// Two links at a time, each low priority; the next goes in when one loads or fails.
it("warm two at a time", async () => {
	const app = setup(routerOf({ chunks }))
	app.prefetcher.all()
	expect(linked().map((link) => [link.getAttribute("href"), link.getAttribute("fetchpriority")])).toEqual([
		["/a.js", "low"],
		["/b.js", "low"],
	])
	linked()[0]?.dispatchEvent(new Event("load"))
	await vi.advanceTimersByTimeAsync(0)
	expect(linked().map((link) => link.getAttribute("href"))).toEqual(["/a.js", "/b.js", "/c.js"])
	linked()[1]?.dispatchEvent(new Event("error"))
	linked()[2]?.dispatchEvent(new Event("load"))
	await vi.advanceTimersByTimeAsync(0)
	expect(linked().map((link) => link.getAttribute("href"))).toEqual(FILES)
})

// While the user's own work is in flight nothing new is issued; the warm resumes the moment it ends, and once an entry
// passes the bound, so a call that never settles cannot hold it.
it("warm yields to user work", async () => {
	const app = setup(routerOf({ chunks }))
	const done = app.work.begin()
	app.prefetcher.all()
	await vi.advanceTimersByTimeAsync(500)
	expect(linked()).toHaveLength(0)
	done()
	expect(linked()).toHaveLength(2)
	const stuck = setup(routerOf({ chunks: { "_root_/y": "/y.js" } }))
	for (const link of linked()) link.remove()
	stuck.work.begin()
	stuck.prefetcher.all()
	await vi.advanceTimersByTimeAsync(1000)
	expect(linked()).toHaveLength(0)
	stuck.clock.now = 30_001
	await vi.advanceTimersByTimeAsync(30_001)
	expect(linked().map((link) => link.getAttribute("href"))).toEqual(["/y.js"])
})

// Where rel=prefetch is missing (Safari), the warm imports at most `cap` route modules at a time, the next once one
// settles.
it("warm imports a few at a time", async () => {
	const pending = FILES.map(() => Promise.withResolvers<RouteModule>())
	const imports = pending.map((each) => vi.fn<() => Promise<RouteModule>>(() => each.promise))
	const router = createRouter({
		layouts: { _root_: root },
		routeTree: [
			{ id: "_root_/", path: "/", module: home },
			...imports.map((module, index) => ({ id: `_root_/x${index}`, path: `/x${index}`, module })),
		],
	})
	const app = setup(router, { env: { relPrefetch: false } })
	app.prefetcher.all()
	await vi.advanceTimersByTimeAsync(0)
	const started = () => imports.filter((module) => module.mock.calls.length > 0).length
	const first = started()
	expect(first).toBeGreaterThan(0)
	expect(first).toBeLessThanOrEqual(2)
	pending[0]?.resolve(createPage("_root_/x0").render(() => "x"))
	await vi.advanceTimersByTimeAsync(0)
	expect(started()).toBe(first + 1)
	for (const [index, each] of pending.entries()) each.resolve(createPage(`_root_/x${index}`).render(() => "x"))
	await vi.advanceTimersByTimeAsync(0)
	expect(started()).toBe(FILES.length)
})

// A link's own prefetch, which the user's hover or focus fired, is user work: the warm waits for it.
it("intent prefetch is user work", async () => {
	const app = setup(routerOf({ chunks }))
	const link = anchor()
	app.prefetcher.watch(link, "/about", { modules: "intent" })
	hover(link)
	expect(app.work.busy()).toBe(true)
	app.prefetcher.all()
	expect(linked()).toHaveLength(0)
	await vi.advanceTimersByTimeAsync(0)
	expect(app.work.busy()).toBe(false)
	expect(linked()).toHaveLength(2)
})

// Items that settle while the user's work is in flight wait once, not once each: the next items go in once.
it("warm looks again once", async () => {
	const app = setup(routerOf({ chunks }))
	app.prefetcher.all()
	const done = app.work.begin()
	for (const link of linked()) link.dispatchEvent(new Event("load"))
	await vi.advanceTimersByTimeAsync(0)
	expect(vi.getTimerCount()).toBe(1)
	done()
	expect(linked().map((link) => link.getAttribute("href"))).toEqual(FILES.slice(0, 4))
})

// Over h2 or h3 one connection multiplexes every request, so nothing waits behind the warm for a connection: it keeps
// six in flight. Over HTTP/1.1, an empty or unknown protocol, or no navigation entry, it keeps two (decision B127).
it("warm cap by protocol", () => {
	const many = Object.fromEntries(Array.from({ length: 9 }, (_, index) => [`_root_/m${index}`, `/m${index}.js`]))
	const open = (protocol: string | undefined): number => {
		for (const link of linked()) link.remove()
		setup(routerOf({ chunks: many }), { env: protocol === undefined ? {} : { protocol } }).prefetcher.all()
		return linked().length
	}
	expect(["h2", "h3", "http/1.1", "", "spdy/3", undefined].map(open)).toEqual([6, 6, 2, 2, 2, 2])
	expect(hopProtocol([{ nextHopProtocol: "h2" }])).toBe("h2")
	expect(hopProtocol([])).toBe("")
})
