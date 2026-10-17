import { flush } from "solid-js"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { encodeFrame, type Frame } from "../../shared/protocol/index.ts"
import { createPage } from "../../shared/route-builder/page.ts"
import { createRootLayout } from "../../shared/route-builder/root-layout.ts"
import { createRouter } from "../../shared/router/create-router.ts"
import { mountNavigator, unmountAll, type Fetch } from "./navigate.fixture.ts"

// A navigation whose pages and layouts are all fresh in the client cache, each on its own clock, sends no request
// (dx/cache.md, B19). A mounted layout is not fresh by being mounted.
const fresh = { client: { staleTime: "30s" } } as const
const root = createRootLayout("_root_")
	.cache(fresh)
	.render((props) => ["root[", props.children, "]"])
const home = createPage("_root_/")
	.cache(fresh)
	.render((props) => [() => `home:${String(props.loaderData)}`])
const other = createPage("_root_/a")
	.cache(fresh)
	.render((props) => [() => `a:${String(props.loaderData)}:${String(Reflect.get(Object(props.search), "v"))}`])
const routes = [
	{ id: "_root_/", path: "/", module: home },
	{ id: "_root_/a", path: "/a", module: other },
]
const router = createRouter({ layouts: { _root_: root }, routeTree: routes })
// The same pages under a root at the default `staleTime`, 0.
const plainRoot = createRootLayout("_root_").render((props) => ["root[", props.children, "]"])
const plain = createRouter({ layouts: { _root_: plainRoot }, routeTree: routes })

function frames(page: string, data: string): Response {
	const list: Frame[] = [
		{ t: "l", m: "_root_", d: `root-${data}` },
		{ t: "l", m: page, d: data, v: { params: {}, search: { v: data } } },
		{ t: "h", m: page, d: { title: data } },
		{ t: "r" },
		{ t: "d" },
	]
	return new Response(list.map(encodeFrame).join(""), { headers: { "content-type": "application/x-ndjson" } })
}

beforeEach(() => {
	history.replaceState(null, "", "/")
	sessionStorage.clear()
})

afterEach(unmountAll)

it("fresh no request", async () => {
	let served = 0
	const fetch = vi.fn<Fetch>(async (url) => {
		served += 1
		return url.startsWith("/a") ? frames("_root_/a", `A${served}`) : frames("_root_/", `H${served}`)
	})
	const app = await mountNavigator(router, fetch)
	await app.navigator.navigate({ to: "_root_/a" })
	await app.navigator.navigate({ to: "_root_/" })
	await app.navigator.navigate({ to: "_root_/a" })
	flush()
	expect(fetch).toHaveBeenCalledTimes(2)
	expect(location.pathname).toBe("/a")
	expect(app.text()).toBe("root[a:A1:A1]")
	expect(app.store.snapshot().heads.at(-1)).toEqual({ title: "A1" })
	// The root's entry is keyed by its match id, which `/` and `/a` share, so the fresh copy is the latest landing's.
	expect(app.store.snapshot().matches[0]?.data).toBe("root-H2")
	await app.navigator.navigate({ to: "_root_/a", revalidate: true })
	flush()
	expect(fetch).toHaveBeenCalledTimes(3)
	expect(app.text()).toBe("root[a:A3:A3]")
	// `revalidate()`, which `invalidate()` runs, refetches the page on screen in place, fresh or not (B133).
	const entries = history.length
	await app.navigator.revalidate()
	flush()
	expect([fetch.mock.calls.length, location.pathname, history.length]).toEqual([4, "/a", entries])
	expect(app.text()).toBe("root[a:A4:A4]")
})

// `/` and `/a` share the root's match id (no params, no search), and the root stays mounted, but at `staleTime` 0 it
// is never fresh, so the last navigation still asks the server (dx/cache.md, B19).
it("mounted layout stale", async () => {
	let served = 0
	const fetch = vi.fn<Fetch>(async (url) => {
		served += 1
		return url.startsWith("/a") ? frames("_root_/a", `A${served}`) : frames("_root_/", `H${served}`)
	})
	const app = await mountNavigator(plain, fetch)
	await app.navigator.navigate({ to: "_root_/a" })
	await app.navigator.navigate({ to: "_root_/" })
	await app.navigator.navigate({ to: "_root_/a" })
	flush()
	expect(fetch).toHaveBeenCalledTimes(3)
	expect(fetch).toHaveBeenLastCalledWith("/a?_flare=data&_flare_stale=%26", expect.anything())
	expect(app.store.snapshot().matches[0]?.data).toBe("root-A3")
})

// `visit` follows a URL the server built. A server function's redirect follows a mutation, so it visits with
// `revalidate`: its target loads fresh though the client holds it inside `staleTime`. A plain visit keeps the fresh
// entry (plan 21 8.6, BUGS.md 200).
it("visit revalidates", async () => {
	let served = 0
	const fetch = vi.fn<Fetch>(async (url) => {
		served += 1
		return url.startsWith("/a") ? frames("_root_/a", `A${served}`) : frames("_root_/", `H${served}`)
	})
	const app = await mountNavigator(router, fetch)
	await app.navigator.visit("/a", false)
	await app.navigator.visit("/", false)
	await app.navigator.visit("/a", false)
	flush()
	expect([fetch.mock.calls.length, app.text()]).toEqual([2, "root[a:A1:A1]"])
	await app.navigator.visit("/", false)
	await app.navigator.visit("/a", true, true)
	flush()
	expect([fetch.mock.calls.length, app.text()]).toEqual([3, "root[a:A3:A3]"])
})

// One Back step, as the browser takes it: history moves, then the navigator restores that entry.
async function back(app: Awaited<ReturnType<typeof mountNavigator>>): Promise<void> {
	const popped = new Promise((resolve) => addEventListener("popstate", resolve, { once: true }))
	history.back()
	await popped
	await app.navigator.restore(`${location.pathname}${location.search}`, app.deps.history.index())
}

// Back to an entry whose matches the client cache holds paints them at once, before any request, whatever their
// staleTime, as bfcache would. A match past its staleTime then revalidates once, in place, with no history write;
// one still fresh sends nothing (plan 21 16.9, decision B137).
it("back paints held", async () => {
	for (const [routes, requests] of [
		[plain, 3],
		[router, 2],
	] as const) {
		let served = 0
		const screens: string[] = []
		const fetch = vi.fn<Fetch>(async (url) => {
			served += 1
			screens.push(app.text())
			return url.startsWith("/a") ? frames("_root_/a", `A${served}`) : frames("_root_/", `H${served}`)
		})
		const app = await mountNavigator(routes, fetch)
		await app.navigator.navigate({ to: "_root_/a" })
		await app.navigator.navigate({ to: "_root_/" })
		const entries = history.length
		const painted = back(app)
		await painted
		flush()
		expect(location.pathname).toBe("/a")
		expect(screens.slice(2)).toEqual(requests === 3 ? ["root[a:A1:A1]"] : [])
		await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(requests))
		await new Promise((resolve) => setTimeout(resolve, 20))
		flush()
		expect([fetch.mock.calls.length, location.pathname, history.length]).toEqual([requests, "/a", entries])
		expect(app.text()).toBe(requests === 3 ? "root[a:A3:A3]" : "root[a:A1:A1]")
		unmountAll()
		history.replaceState(null, "", "/")
	}
})

// A navigation that puts another pathname on screen tells the arrival step, a Back step included, so focus moves and the
// title is announced (B141); a search-only change, a revalidation, and a hash move keep focus where it is.
it("arrived", async () => {
	const arrived = vi.fn<(location: { pathname: string }) => void>()
	const fetch = vi.fn<Fetch>(async (url) => (url.startsWith("/a") ? frames("_root_/a", "A") : frames("_root_/", "H")))
	const app = await mountNavigator(plain, fetch, { extra: { arrived } })
	await app.navigator.navigate({ to: "_root_/a" })
	await app.navigator.navigate({ to: "_root_/a", search: { v: "2" } } as never)
	await app.navigator.revalidate()
	await app.navigator.navigate({ to: "_root_/a", hash: "x" } as never)
	expect(arrived.mock.calls.map(([at]) => at.pathname)).toEqual(["/a"])
	await app.navigator.navigate({ to: "_root_/" })
	await back(app)
	expect(arrived.mock.calls.map(([at]) => at.pathname)).toEqual(["/a", "/", "/a"])
})
