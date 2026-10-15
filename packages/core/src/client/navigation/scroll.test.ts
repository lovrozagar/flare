import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { encodeFrame, type Frame } from "../../shared/protocol/index.ts"
import { createPage } from "../../shared/route-builder/page.ts"
import { createRootLayout } from "../../shared/route-builder/root-layout.ts"
import { createRouter } from "../../shared/router/create-router.ts"
import { mountNavigator, unmountAll } from "./navigate.fixture.ts"
import { createScroll, isHashOnly, pageGrowth, type ScrollEnv, type ScrollOptions } from "./scroll.ts"

type Spot = { left: number; top: number; behavior: ScrollBehavior }

function env(position: {
	x: number
	y: number
}): ScrollEnv & { moves: Spot[]; history: { scrollRestoration: string } } {
	const moves: Spot[] = []
	return {
		moves,
		history: { scrollRestoration: "auto" },
		storage: sessionStorage,
		position: () => position,
		scrollTo: (spot) => moves.push(spot),
		element: (id) => document.getElementById(id),
	}
}

const at = (pathname: string, hash = ""): { pathname: string; search: string; hash: string } => ({
	pathname,
	search: "",
	hash,
})

const defaults: ScrollOptions = { enabled: true, behavior: "instant", maxEntries: 50 }

beforeEach(() => {
	sessionStorage.clear()
})

it("restore", () => {
	const place = { x: 0, y: 40 }
	const window = env(place)
	const scroll = createScroll(defaults, window)
	scroll.save(2, at("/two"))
	place.y = 0
	scroll.restore(2, at("/two"))
	expect(window.moves).toEqual([{ left: 0, top: 40, behavior: "instant" }])
	scroll.restore(9, at("/never"))
	expect(window.moves).toHaveLength(2)
	expect(window.moves[1]).toEqual({ left: 0, top: 0, behavior: "instant" })
})

it("storage", () => {
	createScroll(defaults, env({ x: 3, y: 4 })).save(1, at("/a"))
	expect(Object.keys(sessionStorage)).toEqual(["flare_scroll"])
})

it("behavior", () => {
	const window = env({ x: 0, y: 10 })
	const scroll = createScroll({ ...defaults, behavior: "smooth" }, window)
	scroll.save(1, at("/a"))
	scroll.restore(1, at("/a"))
	expect(window.moves[0].behavior).toBe("smooth")
})

it("cap", () => {
	expect(() => createScroll({ ...defaults, maxEntries: 0 }, env({ x: 0, y: 0 }))).toThrow(/MaxEntries/)
	expect(() => createScroll({ ...defaults, maxEntries: 201 }, env({ x: 0, y: 0 }))).toThrow(/MaxEntries/)
	const place = { x: 0, y: 0 }
	const window = env(place)
	const scroll = createScroll(defaults, window)
	for (let index = 0; index <= 50; index += 1) {
		place.y = index
		scroll.save(index, at(`/${index}`))
	}
	scroll.restore(0, at("/0"))
	scroll.restore(50, at("/50"))
	expect(window.moves.map((spot) => spot.top)).toEqual([0, 50])
	expect(JSON.parse(sessionStorage.getItem("flare_scroll") ?? "[]")).toHaveLength(50)
})

it("custom key", () => {
	const place = { x: 0, y: 10 }
	const window = env(place)
	const scroll = createScroll({ ...defaults, key: () => "shared" }, window)
	scroll.save(1, at("/a"))
	place.y = 20
	scroll.save(2, at("/b"))
	scroll.restore(1, at("/a"))
	expect(window.moves[0].top).toBe(20)
})

it("no scroll", () => {
	const window = env({ x: 0, y: 30 })
	createScroll(defaults, window).afterCommit({ hash: "", scroll: false })
	expect(window.moves).toEqual([])
})

it("hash", () => {
	document.body.innerHTML = '<h2 id="part">Part</h2>'
	const target = document.getElementById("part")
	if (target === null) throw new Error("fixture")
	const into = vi.fn<() => void>()
	target.scrollIntoView = into
	const window = env({ x: 0, y: 0 })
	const scroll = createScroll(defaults, window)
	scroll.afterCommit({ hash: "#part", scroll: true })
	expect(into).toHaveBeenCalledOnce()
	scroll.afterCommit({ hash: "#missing", scroll: true })
	scroll.afterCommit({ hash: "", scroll: true })
	expect(window.moves).toEqual([
		{ left: 0, top: 0, behavior: "instant" },
		{ left: 0, top: 0, behavior: "instant" },
	])
	expect(isHashOnly(at("/a"), at("/a", "#x"))).toBe(true)
	expect(isHashOnly(at("/a"), at("/b", "#x"))).toBe(false)
	expect(isHashOnly(at("/a", "#x"), at("/a", "#x"))).toBe(false)
})

it("document load", () => {
	const getItem = vi.spyOn(Storage.prototype, "getItem")
	const window = env({ x: 0, y: 0 })
	createScroll(defaults, window).setup()
	expect(window.history.scrollRestoration).toBe("manual")
	expect(getItem).not.toHaveBeenCalled()
	const off = env({ x: 0, y: 0 })
	const disabled = createScroll({ ...defaults, enabled: false }, off)
	disabled.setup()
	disabled.save(1, at("/a"))
	disabled.restore(1, at("/a"))
	expect(off.history.scrollRestoration).toBe("auto")
	expect(sessionStorage.length).toBe(0)
	expect(off.moves).toEqual([])
	vi.restoreAllMocks()
})

it("recent kept", () => {
	const place = { x: 0, y: 0 }
	const window = env(place)
	const scroll = createScroll({ ...defaults, maxEntries: 2 }, window)
	for (const index of [5, 9, 5, 7]) {
		place.y = index * 10
		scroll.save(index, at(`/${index}`))
	}
	scroll.restore(5, at("/5"))
	scroll.restore(7, at("/7"))
	scroll.restore(9, at("/9"))
	expect(window.moves.map((spot) => spot.top)).toEqual([50, 70, 0])
})

it("bad storage", () => {
	sessionStorage.setItem("flare_scroll", "{not json")
	const window = env({ x: 0, y: 12 })
	const scroll = createScroll(defaults, window)
	scroll.restore(1, at("/a"))
	expect(window.moves).toEqual([{ left: 0, top: 0, behavior: "instant" }])
	scroll.save(1, at("/a"))
	scroll.restore(1, at("/a"))
	expect(window.moves[1].top).toBe(12)
	sessionStorage.setItem("flare_scroll", '{"1":{"x":0,"y":5}}')
	scroll.restore(1, at("/a"))
	expect(window.moves[2].top).toBe(0)
	const broken: Storage = {
		...sessionStorage,
		getItem: () => {
			throw new Error("SecurityError")
		},
		setItem: () => {
			throw new Error("QuotaExceededError")
		},
	}
	const locked = { ...env({ x: 0, y: 3 }), storage: broken }
	const guarded = createScroll(defaults, locked)
	expect(() => guarded.save(1, at("/a"))).not.toThrow()
	expect(() => guarded.restore(1, at("/a"))).not.toThrow()
	expect(locked.moves).toEqual([{ left: 0, top: 0, behavior: "instant" }])
})

it("encoded hash", () => {
	document.body.innerHTML = '<h2 id="café">Café</h2><h2 id="%E0">Bad</h2>'
	const [cafe, bad] = document.querySelectorAll("h2")
	const intoCafe = vi.fn<() => void>()
	const intoBad = vi.fn<() => void>()
	cafe.scrollIntoView = intoCafe
	bad.scrollIntoView = intoBad
	const scroll = createScroll(defaults, env({ x: 0, y: 0 }))
	scroll.afterCommit({ hash: "#caf%C3%A9", scroll: true })
	scroll.afterCommit({ hash: "#%E0", scroll: true })
	expect(intoCafe).toHaveBeenCalledOnce()
	expect(intoBad).toHaveBeenCalledOnce()
})

const root = createRootLayout("_root_").render((props) => ["root[", props.children, "]"])
const page = (id: string) => createPage(id as never).render(() => id)
const transitioned = createRouter({
	layouts: { _root_: root },
	routeTree: [
		{ id: "_root_/", path: "/", module: page("_root_/") },
		{ id: "_root_/about", path: "/about", module: page("_root_/about") },
	],
	viewTransitions: true,
})

function frames(id: string): Response {
	const list: Frame[] = [{ t: "l", m: "_root_", d: null }, { t: "l", m: id, d: null }, { t: "r" }, { t: "d" }]
	return new Response(list.map(encodeFrame).join(""), { headers: { "content-type": "application/x-ndjson" } })
}

afterEach(() => {
	unmountAll()
	Reflect.deleteProperty(document, "startViewTransition")
})

// Every scroll a navigation makes is final when the view transition's update returns, so the new snapshot shows it:
// the top on a forward step, the saved position on Back. Nothing scrolls after the update (B108, BUGS.md 65).
it("scroll inside transition", async () => {
	history.replaceState(null, "", "/")
	const place = { x: 0, y: 500 }
	const window = env(place)
	window.scrollTo = (spot) => void (place.y = spot.top)
	const atUpdate: number[] = []
	Reflect.set(document, "startViewTransition", (update: () => void) => {
		update()
		atUpdate.push(place.y)
		const done = Promise.resolve()
		return { ready: done, updateCallbackDone: done, finished: done, skipTransition: () => undefined }
	})
	const scroll = createScroll(defaults, window)
	const app = await mountNavigator(
		transitioned,
		async (url) => frames(url.includes("/about") ? "_root_/about" : "_root_/"),
		{
			extra: { scroll },
		},
	)
	await app.navigator.navigate({ to: "_root_/about" })
	expect(atUpdate).toEqual([0])
	expect(place.y).toBe(0)
	const popped = new Promise((resolve) => globalThis.addEventListener("popstate", resolve, { once: true }))
	history.back()
	await popped
	// As the client's popstate handler does: the history index follows the browser, then the step restores.
	app.deps.history.pop(history.state)
	await app.navigator.restore("/", app.deps.history.index())
	expect(atUpdate).toEqual([0, 500])
	expect(place.y).toBe(500)
})

// A saved position deeper than the page can scroll at commit is restored as far as it can be, then again each time the
// page grows, until it is reached; the next navigation's scroll ends the wait (B108).
it("restore grows", () => {
	const page = { height: 300 }
	const place = { x: 0, y: 500 }
	const window = env(place)
	window.scrollTo = (spot) => void (place.y = Math.min(spot.top, page.height))
	let grow: (() => void) | undefined
	const stop = vi.fn<() => void>()
	window.grown = (onGrow) => {
		grow = onGrow
		return stop
	}
	const scroll = createScroll(defaults, window)
	scroll.save(4, at("/four"))
	place.y = 0
	scroll.restore(4, at("/four"))
	expect(place.y).toBe(300)
	page.height = 400
	grow?.()
	expect(place.y).toBe(400)
	expect(stop).not.toHaveBeenCalled()
	page.height = 900
	grow?.()
	expect(place.y).toBe(500)
	expect(stop).toHaveBeenCalledOnce()
	// A restore still waiting ends at the next navigation's scroll.
	page.height = 300
	scroll.restore(4, at("/four"))
	scroll.afterCommit({ hash: "", scroll: false })
	expect(stop).toHaveBeenCalledTimes(2)
	scroll.save(5, at("/five"))
	expect(stop).toHaveBeenCalledTimes(2)
})

// The window's growth signal: the document element's size, until user input or 10 s; none without ResizeObserver.
it("page growth", () => {
	vi.useFakeTimers()
	const observed: Element[] = []
	let resized: (() => void) | undefined
	const disconnect = vi.fn<() => void>()
	class Observer {
		constructor(callback: () => void) {
			resized = callback
		}
		observe(element: Element) {
			observed.push(element)
		}
		disconnect = disconnect
	}
	vi.stubGlobal("ResizeObserver", Observer)
	const grown = pageGrowth(globalThis)
	const onGrow = vi.fn<() => void>()
	const stop = grown?.(onGrow)
	expect(observed).toEqual([document.documentElement])
	resized?.()
	expect(onGrow).toHaveBeenCalledOnce()
	globalThis.dispatchEvent(new Event("wheel"))
	expect(disconnect).toHaveBeenCalledOnce()
	grown?.(onGrow)
	vi.advanceTimersByTime(10_000)
	expect(disconnect).toHaveBeenCalledTimes(2)
	stop?.()
	vi.unstubAllGlobals()
	vi.useRealTimers()
	expect(pageGrowth({ ...globalThis, ResizeObserver: undefined } as unknown as typeof globalThis)).toBeUndefined()
})
