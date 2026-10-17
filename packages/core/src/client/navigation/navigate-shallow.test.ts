import { flush } from "solid-js"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { useSearch } from "../../shared/components/index.ts"
import { encodeFrame } from "../../shared/protocol/index.ts"
import { createPage } from "../../shared/route-builder/page.ts"
import { createRootLayout } from "../../shared/route-builder/root-layout.ts"
import { createRouter } from "../../shared/router/create-router.ts"
import { mountNavigator, unmountAll, type Fetch } from "./navigate.fixture.ts"

// A shallow navigation changes the URL and the page's search, and asks the server for nothing (BUGS.md B18).
const root = createRootLayout("_root_").render((props) => ["root[", props.children, "]"])
const home = createPage("_root_/").render((props) => {
	const search = useSearch({ from: "_root_/" })
	return [() => `home:${String(props.loaderData)}:${String(Reflect.get(Object(search), "q"))}`]
})
const about = createPage("_root_/about").render((props) => `about:${String(props.loaderData)}`)
const router = createRouter({
	layouts: { _root_: root },
	routeTree: [
		{ id: "_root_/", path: "/", module: home },
		{ id: "_root_/about", path: "/about", module: about },
	],
})

beforeEach(() => {
	history.replaceState(null, "", "/")
	sessionStorage.clear()
})

afterEach(unmountAll)

it("shallow", async () => {
	const fetch = vi.fn<Fetch>(async () => new Response(""))
	const app = await mountNavigator(router, fetch)
	const begin = vi.spyOn(app.deps.navigation, "begin")
	const stored = vi.spyOn(app.deps.cache, "store")
	const length = history.length
	await app.navigator.navigate({ to: "_root_/", search: { q: "a" }, shallow: true })
	flush()
	expect(location.search).toBe("?q=a")
	expect(history.length).toBe(length + 1)
	expect(app.text()).toBe("root[home:start:a]")
	expect(app.store.snapshot().matches.at(-1)?.search).toEqual({ q: "a" })
	await app.navigator.navigate({ to: "_root_/", search: { q: "b" }, shallow: true, replace: true })
	flush()
	expect(location.search).toBe("?q=b")
	expect(history.length).toBe(length + 1)
	expect(app.text()).toBe("root[home:start:b]")
	expect(fetch).not.toHaveBeenCalled()
	expect(begin).not.toHaveBeenCalled()
	expect(stored).not.toHaveBeenCalled()
	expect(app.deps.navigation.pending()).toBe(false)
})

it("shallow blocked", async () => {
	const fetch = vi.fn<Fetch>(async () => new Response(""))
	const app = await mountNavigator(router, fetch)
	const blocker = vi.fn<() => boolean>(() => false)
	app.deps.blockers.register(blocker)
	const length = history.length
	await app.navigator.navigate({ to: "_root_/", search: { q: "a" }, shallow: true })
	flush()
	expect(blocker).toHaveBeenCalledOnce()
	expect(location.search).toBe("")
	expect(history.length).toBe(length)
	expect(app.text()).toBe("root[home:start:undefined]")
	expect(app.store.snapshot().matches.at(-1)?.search).toEqual({})
	expect(fetch).not.toHaveBeenCalled()
})

// A hash or shallow move is the latest navigation: the data request still in flight is aborted and never commits over
// it (dx/navigate.md, BUGS.md 311).
it("in-place move supersedes a pending one", async () => {
	for (const move of [{ hash: "x" }, { search: { q: "1" }, shallow: true }]) {
		history.replaceState(null, "", "/")
		const held = Promise.withResolvers<Response>()
		const signals: AbortSignal[] = []
		const app = await mountNavigator(router, (_url, init) => {
			signals.push(init.signal as AbortSignal)
			return held.promise
		})
		const slow = app.navigator.navigate({ to: "_root_/about" })
		await app.navigator.navigate({ to: "_root_/", ...move })
		const url = `${location.pathname}${location.search}${location.hash}`
		expect(signals[0]?.aborted).toBe(true)
		const frames = [{ t: "l", m: "_root_", d: null }, { t: "l", m: "_root_/about", d: "late" }, { t: "r" }, { t: "d" }]
		held.resolve(new Response(frames.map((frame) => encodeFrame(frame as never)).join("")))
		await slow
		flush()
		expect([`${location.pathname}${location.search}${location.hash}`, app.text().startsWith("root[home")]).toEqual([
			url,
			true,
		])
		unmountAll()
	}
})

// A hash move asks the blocker before the history write, as a shallow one does; a Back or Forward step onto a hash
// entry, which the browser already took, does not (dx/navigate.md, BUGS.md 312).
it("hash blocked", async () => {
	const fetch = vi.fn<Fetch>(async () => new Response(""))
	const app = await mountNavigator(router, fetch)
	const blocker = vi.fn<() => boolean>(() => false)
	app.deps.blockers.register(blocker)
	const length = history.length
	await app.navigator.navigate({ to: "_root_/", hash: "x" })
	expect([blocker.mock.calls.length, location.hash, history.length]).toEqual([1, "", length])
	expect(app.store.snapshot().location.hash).toBe("")
	history.pushState({ index: 1 }, "", "/#y")
	await app.navigator.restore("/#y", 1)
	expect([blocker.mock.calls.length, app.store.snapshot().location.hash]).toEqual([1, "#y"])
})
