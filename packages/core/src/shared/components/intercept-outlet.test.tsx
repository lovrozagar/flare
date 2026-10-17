import { createComponent, createMemo, createSignal, flush } from "solid-js"
import { Dynamic, render, type JSX } from "@solidjs/web"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { mountNavigator, settled, unmountAll, type Fetch } from "../../client/navigation/navigate.fixture.ts"
import type { NavigatorDeps } from "../../client/navigation/navigate.ts"
import { createMatchCache } from "../../client/router/match-cache.ts"
import { createPopstate } from "../../client/navigation/popstate.ts"
import { createRouterStore, snapshotFromState } from "../../client/router/store.ts"
import { encodeFrame, type Frame } from "../protocol/index.ts"
import { createLayout } from "../route-builder/layout.ts"
import { createPage } from "../route-builder/page.ts"
import { createRootLayout } from "../route-builder/root-layout.ts"
import { createRouter } from "../router/create-router.ts"
import { loadChain } from "../router/load-chain.ts"
import { InterceptOutlet, OverlayContext, type InterceptState } from "./intercept-outlet.tsx"
import { Matches } from "./outlet.tsx"
import { matchId } from "../route-tree/index.ts"
import { searchKey } from "../url/index.ts"
import { useLoaderData, useMatch, useParams, useSearch } from "./outlet-nodes.ts"

const counts = { home: 0, photo: 0 }
const seen: { state?: InterceptState; rootData?: unknown; photoProps?: Record<string, unknown> } = {}
let view: (state: InterceptState) => JSX.Element = () => ""

const root = createRootLayout("_root_").render((props) => {
	seen.rootData = useLoaderData({ from: "_root_" })
	return [
		"root[",
		props.children,
		"|",
		createComponent(InterceptOutlet, {
			children: (state: InterceptState) => {
				seen.state = state
				return view(state)
			},
		}),
		"]",
	]
})
const home = createPage("_root_/").render((props) => {
	counts.home += 1
	return [() => `home:${String(props.loaderData)}`]
})
const photo = createPage("_root_/photos/[id]")
	.intercept({ from: ["_root_/"], render: "preview" })
	.render((props) => {
		counts.photo += 1
		seen.photoProps = props
		return [() => `photo:${String(props.loaderData)}`]
	})
// The overlay page reads its own route with its own id: the overlay's params, search, and loader data (B16).
const note = createPage("_root_/notes/[id]")
	.intercept({ from: ["_root_/"], render: "note" })
	.render(() => {
		const params = useParams({ from: "_root_/notes/[id]" })
		const search = useSearch({ from: "_root_/notes/[id]" })
		const data = useLoaderData({ from: "_root_/notes/[id]" })
		return `note:${String(Reflect.get(Object(params), "id"))}:${String(Reflect.get(Object(search), "q"))}:${String(data)}`
	})
// `useMatch` names the overlay page or the background, and each reads its own URL (BUGS.md 317).
const card = createPage("_root_/cards/[id]")
	.intercept({ from: ["_root_/"], render: "card" })
	.render(() => {
		const own = useMatch({ from: "_root_/cards/[id]" })
		const under = useMatch({ from: "_root_/" })
		return [() => `card:${own.id}|under:${under.id}`]
	})
const router = createRouter({
	layouts: { _root_: root },
	routeTree: [
		{ id: "_root_/", path: "/", module: home },
		{ id: "_root_/cards/[id]", path: "/cards/[id]", module: card },
		{ id: "_root_/photos/[id]", path: "/photos/[id]", module: photo },
		{ id: "_root_/notes/[id]", path: "/notes/[id]", module: note },
		{ id: "_root_/bare", path: "/bare", module: { intercept: { from: ["_root_/"], render: "bare" } } },
	],
})

function photoFrames(data: string): Frame[] {
	return [
		{ t: "l", m: "_root_", d: null },
		{ t: "l", m: "_root_/photos/[id]", d: data, p: { album: "a" } },
		{ t: "h", m: "_root_/photos/[id]", d: { title: "Photo" } },
		{ t: "r" },
		{ t: "d" },
	]
}

function ndjson(frames: readonly Frame[]): Response {
	return new Response(frames.map(encodeFrame).join(""), { headers: { "content-type": "application/x-ndjson" } })
}

const stops: (() => void)[] = []

// Popstate reaches the navigator as boot wires it.
async function setup(fetch: Fetch, extra: Partial<NavigatorDeps> = {}) {
	const app = await mountNavigator(router, fetch, { extra })
	const pop = createPopstate({
		history: app.deps.history,
		restore: app.navigator.restore,
		save: () => undefined,
		current: () => `${location.pathname}${location.search}${location.hash}`,
	})
	const onPop = (event: PopStateEvent): void => void pop(event.state)
	window.addEventListener("popstate", onPop)
	stops.push(() => window.removeEventListener("popstate", onPop))
	return app
}

function popped(): Promise<void> {
	return new Promise((resolve) =>
		window.addEventListener("popstate", () => void setTimeout(resolve, 0), { once: true }),
	)
}

function entry(id: string, data: unknown) {
	return { id, params: {}, search: {}, data, preloader: {}, head: null, error: null }
}

const open = { to: "_root_/photos/[id]", params: { id: "1" } }

beforeEach(() => {
	history.replaceState(null, "", "/")
	sessionStorage.clear()
	seen.state = undefined
	view = (state) => [`${state.render}:${String(state.match.loaderData)}:`, state.match.render()]
})

afterEach(() => {
	for (const stop of stops.splice(0)) stop()
	unmountAll()
})

it("shows intercepted", async () => {
	const app = await setup(async () => ndjson(photoFrames("P1")))
	const homes = counts.home
	await app.navigator.navigate(open)
	flush()
	expect(app.text()).toBe("root[home:start|preview:P1:photo:P1]")
	expect(counts.home).toBe(homes)
	expect(location.pathname).toBe("/photos/1")
	expect(seen.state?.params).toEqual({ id: "1" })
	expect(app.store.snapshot().overlay?.preloader).toEqual({ album: "a" })
	expect(seen.state?.search).toEqual({})
	expect(seen.state?.backgroundLocation).toEqual({ pathname: "/", search: "", hash: "", params: {} })
})

it("custom", async () => {
	view = (state) => `card:${String(state.match.loaderData)}`
	const app = await setup(async () => ndjson(photoFrames("P1")))
	const photos = counts.photo
	await app.navigator.navigate(open)
	flush()
	expect(app.text()).toBe("root[home:start|card:P1]")
	expect(counts.photo).toBe(photos)
	view = (state) => [`${state.render}:`, state.match.render()]
	await app.navigator.navigate({ to: "_root_/bare" })
	flush()
	expect(app.text()).toBe("root[home:start|bare:]")
})

// The page's own hooks find the overlay match, and the root, which stays mounted, still reads its own data (B16).
it("page hooks", async () => {
	const frames: Frame[] = [
		{ t: "l", m: "_root_", d: null },
		{ t: "l", m: "_root_/notes/[id]", d: "N1" },
		{ t: "r" },
		{ t: "d" },
	]
	const app = await setup(async () => ndjson(frames))
	const rootData = seen.rootData
	const homes = counts.home
	await app.navigator.navigate({ to: "_root_/notes/[id]", params: { id: "7" }, search: { q: "x" } })
	flush()
	expect(app.text()).toBe("root[home:start|note:N1:note:7:x:N1]")
	expect(location.pathname).toBe("/notes/7")
	expect(counts.home).toBe(homes)
	expect(seen.rootData).toBe(rootData)
})

// A root whose errorRender owns the outlet, and a target whose own layout is not mounted in the overlay (B41).
const guarded = createRootLayout("_root_")
	.render((props) => [
		"root[",
		props.children,
		"|",
		createComponent(InterceptOutlet, { children: (state: InterceptState) => state.match.render() }),
		"]",
	])
	.errorRender((props) => `caught:${props.error.message}`)
const shelf = createLayout("_root_/shelf").render((props) => props.children)
const book = createPage("_root_/shelf/[id]")
	.intercept({ from: ["_root_/"], render: "book" })
	.render(() => String(useLoaderData({ from: "_root_/shelf" })))
const shelved = createRouter({
	layouts: { _root_: guarded, "_root_/shelf": shelf },
	routeTree: [
		{ id: "_root_/", path: "/", module: home },
		{ id: "_root_/shelf/[id]", path: "/shelf/[id]", module: book },
	],
})

it("layout hook throws", async () => {
	const frames: Frame[] = [
		{ t: "l", m: "_root_", d: null },
		{ t: "l", m: "_root_/shelf", d: "S" },
		{ t: "l", m: "_root_/shelf/[id]", d: "B1" },
		{ t: "r" },
		{ t: "d" },
	]
	const app = await mountNavigator(shelved, async () => ndjson(frames))
	await app.navigator.navigate({ to: "_root_/shelf/[id]", params: { id: "1" } })
	flush()
	expect(app.text()).toBe("root[home:start|caught:_root_/shelf is not a route on screen]")
})

// No errorRender on the chain: the built-in div paints, and the dev overlay payload is sent once.
it("child throw reported", async () => {
	const thrown = new Error("child broke")
	view = () => {
		throw thrown
	}
	const reported = vi.fn<(error: unknown) => void>()
	const app = await mountNavigator(router, async () => ndjson(photoFrames("P1")), { onBoundaryError: reported })
	await app.navigator.navigate(open)
	flush()
	expect(app.text()).toBe("root[home:start|Something went wrong]")
	expect(reported).toHaveBeenCalledExactlyOnceWith(thrown)
})

it("no provider", () => {
	const child = vi.fn<(state: InterceptState) => JSX.Element>(() => "card")
	const host = document.createElement("div")
	stops.push(render(() => createComponent(InterceptOutlet, { children: child }), host))
	flush()
	expect(host.textContent).toBe("")
	expect(child).not.toHaveBeenCalled()
})

it("direct visit", async () => {
	const child = vi.fn<(state: InterceptState) => JSX.Element>(() => "card")
	view = child
	const pathname = "/photos/1"
	const chain = await loadChain(router.match(pathname).chain)
	const matches = [entry("_root_", null), { ...entry("_root_/photos/[id]", "P1"), params: { id: "1" } }]
	const store = createRouterStore(
		snapshotFromState({ matches, chain, unknown: false, location: { pathname, search: "", hash: "" } }),
		() => undefined,
	)
	const host = document.createElement("div")
	stops.push(
		render(
			() =>
				createComponent(OverlayContext, {
					value: () => store.snapshot().overlay,
					get children() {
						return createComponent(Matches, { state: store.outlet })
					},
				}),
			host,
		),
	)
	flush()
	expect(host.textContent).toBe("root[photo:P1|]")
	expect(child).not.toHaveBeenCalled()
})

it("reload", async () => {
	history.replaceState({ index: 3, usr: undefined, intercepted: true }, "", "/photos/1")
	const app = await setup(async () => ndjson(photoFrames("P1")))
	expect(app.deps.history.index()).toBe(3)
	expect(app.store.snapshot().overlay).toBeUndefined()
	expect(seen.state).toBeUndefined()
})

it("dismiss", async () => {
	const app = await setup(async () => ndjson(photoFrames("P1")))
	const restore = vi.spyOn(app.deps.scroll, "restore")
	const homes = counts.home
	await app.navigator.navigate(open)
	flush()
	const back = popped()
	seen.state?.dismiss()
	await back
	flush()
	expect(location.pathname).toBe("/")
	expect(app.text()).toBe("root[home:start|]")
	expect(app.deps.fetch).toHaveBeenCalledOnce()
	expect(restore).not.toHaveBeenCalled()
	expect(counts.home).toBe(homes)
})

// The overlay page and the root are both fresh, so Forward reopens the overlay from the cache with no request (B19).
it("forward", async () => {
	const responses = [ndjson(photoFrames("P1"))]
	const app = await setup(async () => responses.shift() ?? ndjson(photoFrames("P3")), {
		cache: createMatchCache({ staleTime: 60_000, gcTime: 60_000 }),
	})
	const homes = counts.home
	await app.navigator.navigate(open)
	const back = popped()
	history.back()
	await back
	const forward = popped()
	history.forward()
	await forward
	await settled()
	expect(location.pathname).toBe("/photos/1")
	expect(app.text()).toBe("root[home:start|preview:P1:photo:P1]")
	expect(app.deps.fetch).toHaveBeenCalledExactlyOnceWith("/photos/1?_flare=data", expect.anything())
	expect(counts.home).toBe(homes)
})

it("fetch fails", async () => {
	const app = await setup(async () => new Response(null, { status: 500 }))
	await app.navigator.navigate(open)
	flush()
	expect(app.text()).toBe("root[Something went wrong|]")
	expect(location.pathname).toBe("/photos/1")
	expect(history.state).toEqual({ index: 1, usr: undefined })
	expect(app.store.snapshot().overlay).toBeUndefined()
})

it("head stays", async () => {
	const responses = [ndjson(photoFrames("P1")), ndjson(photoFrames("P2"))]
	const app = await setup(async () => responses.shift() ?? ndjson(photoFrames("P3")))
	const heads = app.store.snapshot().heads
	const length = history.length
	await app.navigator.navigate({ ...open, replace: true })
	flush()
	expect(app.store.snapshot().heads).toBe(heads)
	expect(history.state).toEqual({ index: 1, usr: undefined, intercepted: true })
	expect(history.length).toBe(length + 1)
	await app.navigator.navigate(open)
	flush()
	expect(history.length).toBe(length + 1)
	expect(app.text()).toBe("root[home:start|preview:P2:photo:P2]")
	const back = popped()
	history.back()
	await back
	flush()
	expect(app.text()).toBe("root[home:start|]")
	expect(app.deps.fetch).toHaveBeenCalledTimes(2)
})

// An overlay takes focus as it opens, keeps Tab inside it, closes on Escape, and gives focus back to the link that
// opened it (plan 21 4.1, B142).
it("overlay focus", async () => {
	view = (state) =>
		createComponent(Dynamic, {
			component: "div",
			id: "dialog",
			get children() {
				return [createComponent(Dynamic, { component: "button", id: "inside", children: "x" }), state.match.render()]
			},
		})
	const app = await setup(async () => ndjson(photoFrames("P1")))
	document.body.append(app.host)
	const opener = document.createElement("a")
	opener.href = "/x"
	opener.id = "opener"
	document.body.append(opener)
	opener.focus()
	await app.navigator.navigate(open)
	flush()
	expect(document.activeElement?.id).toBe("inside")
	const closed = popped()
	document.activeElement?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))
	await closed
	flush()
	expect(location.pathname).toBe("/")
	expect(document.activeElement?.id).toBe("opener")
	opener.remove()
	app.host.remove()
})

// A button whose id is its text.
function button(id: string): JSX.Element {
	return createComponent(Dynamic, { component: "button", id, children: id })
}

// The trap stays up while the overlay's content changes, as compiled JSX changes it, through memos: focus the user
// moved is kept, nothing the overlay shows is rebuilt, and a control that appears later is inside the trap (B142).
it("overlay focus kept", async () => {
	const [count, setCount] = createSignal(0)
	const [more, setMore] = createSignal(false)
	let built = 0
	view = () => {
		built += 1
		const text = createMemo(() => `n:${count()}`)
		const extra = createMemo(() => (more() ? button("later") : ""))
		return [text, button("first"), button("second"), extra]
	}
	const app = await setup(async () => ndjson(photoFrames("P1")))
	document.body.append(app.host)
	await app.navigator.navigate(open)
	flush()
	expect(document.activeElement?.id).toBe("first")
	document.getElementById("second")?.focus()
	setCount(1)
	flush()
	expect(app.text()).toContain("n:1")
	expect(document.activeElement?.id).toBe("second")
	setMore(true)
	flush()
	document.getElementById("later")?.focus()
	document.activeElement?.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true }))
	expect(document.activeElement?.id).toBe("first")
	expect(built).toBe(1)
	app.host.remove()
})

// A revalidation while an overlay is open refreshes it in place: no history entry is written, so one Back still closes
// it (plan 21 10.7).
it("overlay revalidate keeps history", async () => {
	const app = await setup(async () => ndjson(photoFrames("P1")))
	await app.navigator.navigate(open)
	flush()
	const entries = history.length
	await app.navigator.revalidate()
	flush()
	expect([history.length, location.pathname, app.store.snapshot().overlay?.route]).toEqual([
		entries,
		"/photos/1",
		"_root_/photos/[id]",
	])
})

// A revalidation, or a `replace` navigation inside the open overlay, refreshes it in place, as a page on screen is: the
// child and the page are not built again, focus stays where the user put it, and the new values show (BUGS.md 315).
it("overlay refresh keeps child", async () => {
	let built = 0
	view = (state) => {
		built += 1
		return [
			button("first"),
			button("second"),
			() => `search:${String(Reflect.get(Object(state.search), "q"))}`,
			state.match.render(),
		]
	}
	const answers = ["P1", "P2", "P3"]
	const app = await setup(async () => ndjson(photoFrames(answers.shift() ?? "P?")))
	document.body.append(app.host)
	await app.navigator.navigate(open)
	flush()
	const photos = counts.photo
	const second = document.getElementById("second")
	second?.focus()
	await app.navigator.revalidate()
	flush()
	expect([built, counts.photo, document.activeElement === second]).toEqual([1, photos, true])
	expect(app.text()).toContain("photo:P2")
	await app.navigator.navigate({ ...open, search: { q: "a" }, replace: true })
	flush()
	expect([built, counts.photo, document.activeElement === second]).toEqual([1, photos, true])
	expect(app.text()).toContain("search:a")
	expect(app.text()).toContain("photo:P3")
	const { params, search, preloaderContext } = seen.photoProps ?? {}
	expect([params, search, preloaderContext]).toEqual([{ id: "1" }, { q: "a" }, { album: "a" }])
	app.host.remove()
})

// Inside the overlay, `useMatch` with the page's own id is the overlay's match id, its raw params and search; one naming
// the background route is the background's (dx/navigate.md, BUGS.md 317).
it("use match in overlay", async () => {
	const frames: Frame[] = [
		{ t: "l", m: "_root_", d: null },
		{ t: "l", m: "_root_/cards/[id]", d: "C" },
		{ t: "r" },
		{ t: "d" },
	]
	const app = await setup(async () => ndjson(frames))
	await app.navigator.navigate({ to: "_root_/cards/[id]", params: { id: "1" }, search: { x: "2" } })
	flush()
	const own = matchId({ id: "1" }, searchKey("?x=2"))
	expect(app.text()).toContain(`card:${own}|under:${matchId({}, searchKey(""))}`)
})
