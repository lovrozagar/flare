import { flush } from "solid-js"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { encodeFrame, QUERY_GETTER, type Frame } from "../../shared/protocol/index.ts"
import { dataToWire } from "../../shared/protocol/value.ts"
import { createRouter } from "../../shared/router/create-router.ts"
import { navigate } from "../navigation/active.ts"
import { env, install, routerOf, seen, stops, type Dom, stateText } from "./boot.fixture.ts"
import { bootClient, createClient, devSend, type ClientEnv } from "./create-client.ts"
import { createReady, type ReadyContext } from "./ready.ts"

beforeEach(() => {
	history.replaceState(null, "", "/")
	document.documentElement.removeAttribute("data-flare-hydrated")
})

afterEach(() => {
	for (const stop of stops.splice(0)) stop()
	delete (globalThis as Dom).flare
})

it("adopts history", async () => {
	const host = install()
	history.replaceState({ index: 4 }, "")
	const length = history.length
	stops.push(await bootClient(routerOf(), createReady(), env(host)))
	expect(history.length).toBe(length)
	expect(history.state).toEqual({ index: 4 })
})

it("router context", async () => {
	const host = install()
	const router = routerOf()
	stops.push(await bootClient(router, createReady(), env(host)))
	expect(seen.router).toBe(router)
	expect(history.state).toEqual({ index: 0, usr: undefined })
})

it("hydrates matches", async () => {
	const host = install()
	const ready = createReady()
	const order: string[] = []
	ready.api.onReady(() => order.push(`ready ${document.documentElement.hasAttribute("data-flare-hydrated")}`))
	ready.api.onHydrated(() => order.push(`hydrated ${document.documentElement.hasAttribute("data-flare-hydrated")}`))
	stops.push(await bootClient(routerOf(), ready, env(host)))
	flush()
	expect(host.textContent).toBe("root[home:start]")
	expect(order).toEqual(["ready false", "hydrated true"])
	await new Promise((resolve) => setTimeout(resolve, 30))
	expect(document.title).toBe("Home")
})

// The head the mount sees is the server's sequence; the foreign nodes are back, in place, when the boot returns, and
// they are back even when the mount throws (B120).
it("head guarded", async () => {
	const host = install(undefined, { head: ["meta"] })
	document.head.innerHTML = '<style data-ext></style><meta name="server"><link data-ext>'
	const seenHead: string[][] = []
	const guarded = (throws: boolean): ClientEnv => ({
		...env(host),
		mount: (code, root) => {
			seenHead.push([...document.head.children].map((node) => node.outerHTML))
			if (throws) throw new Error("mount broke")
			return env(host).mount(code, root)
		},
	})
	stops.push(await bootClient(routerOf(), createReady(), guarded(false)))
	expect(seenHead).toEqual([['<meta name="server">']])
	const after = '<style data-ext=""></style><meta name="server"><link data-ext="">'
	expect(document.head.innerHTML.startsWith(after)).toBe(true)
	await expect(bootClient(routerOf(), createReady(), guarded(true))).rejects.toThrow("mount broke")
	expect(document.head.innerHTML.startsWith(after)).toBe(true)
	document.head.innerHTML = ""
})

// A route render that throws while the document hydrates is logged in production, with no dev overlay to show it;
// one after hydrate is the boundary's alone (B120).
it("hydrate failure logged", async () => {
	history.replaceState(null, "", "/broken")
	const broken = { id: "_root_/broken", params: {}, search: {}, data: null, preloader: {}, head: null, error: null }
	const host = install(undefined, {
		matches: [{ id: "_root_", params: {}, search: {}, data: null, preloader: {}, head: null, error: null }, broken],
	})
	const logged = vi.spyOn(console, "error").mockImplementation(() => undefined)
	stops.push(await bootClient(routerOf(), createReady(), env(host)))
	flush()
	expect(host.textContent).toBe("root[Something went wrong]")
	expect(logged).toHaveBeenCalledExactlyOnceWith(
		"[flare] a route failed to hydrate",
		expect.objectContaining({ message: "render broke" }),
	)
	logged.mockRestore()
})

it("keeps capture", async () => {
	const host = install()
	const capture = { events: [], completed: new WeakSet(), r: {}, fe() {} }
	;(globalThis as Dom)._$HY = capture
	stops.push(await bootClient(routerOf(), createReady(), env(host)))
	expect((globalThis as Dom)._$HY).toBe(capture)
})

it("navigates", async () => {
	const host = install()
	const frames = [
		{ t: "l", m: "_root_", d: null },
		{ t: "l", m: "_root_/about", d: "fresh" },
		{ t: "r" },
		{ t: "d" },
	] as const
	const fetch = vi.fn<ClientEnv["fetch"]>(async () => new Response(frames.map(encodeFrame).join("")))
	const ready = createReady()
	const navigates: ReadyContext["navigate"][] = []
	ready.api.onReady((ctx) => navigates.push(ctx.navigate))
	vi.spyOn(window, "scrollTo").mockImplementation(() => undefined)
	stops.push(await bootClient(routerOf(), ready, env(host, fetch)))
	await navigates[0]({ to: "_root_/about", hash: "top" })
	flush()
	expect(host.textContent).toBe("root[about:fresh]")
	expect(location.pathname).toBe("/about")
	expect(window.scrollTo).toHaveBeenCalled()
})

// A data answer that lands the about page with this loader data.
function aboutFetch(data: string): ClientEnv["fetch"] {
	const frames: Frame[] = [
		{ t: "l", m: "_root_", d: null },
		{ t: "l", m: "_root_/about", d: data },
		{ t: "r" },
		{ t: "d" },
	]
	return vi.fn<ClientEnv["fetch"]>(async () => new Response(frames.map(encodeFrame).join("")))
}

// The root `navigate` drives the booted client from outside any component, and stops reaching it once the client is
// disposed (BUGS.md 105).
it("root navigate", async () => {
	const host = install()
	const fetch = aboutFetch("root")
	vi.spyOn(window, "scrollTo").mockImplementation(() => undefined)
	const stop = await bootClient(routerOf(), createReady(), env(host, fetch))
	await navigate({ to: "_root_/about" })
	flush()
	expect(host.textContent).toBe("root[about:root]")
	expect(location.pathname).toBe("/about")
	stop()
	await expect(navigate({ to: "_root_/" })).rejects.toThrow("once createClient has booted")
})

// Leaving a page saves its position under the router's `getScrollRestorationKey`, not the history index (BUGS.md 106).
it("scroll key", async () => {
	const host = install()
	const fetch = aboutFetch("keyed")
	vi.spyOn(window, "scrollTo").mockImplementation(() => undefined)
	const key = vi.fn<(location: { pathname: string }) => string>((location) => `page:${location.pathname}`)
	sessionStorage.clear()
	stops.push(await bootClient({ ...routerOf(), getScrollRestorationKey: key }, createReady(), env(host, fetch)))
	await navigate({ to: "_root_/about" })
	expect(key).toHaveBeenCalledWith(expect.objectContaining({ pathname: "/" }))
	expect(sessionStorage.getItem("flare_scroll")).toContain("page:/")
})

it("create client", async () => {
	install()
	// The root never loads, so this boot stops before it hydrates the test document.
	const pending = createRouter({ layouts: { _root_: () => new Promise(() => undefined) }, routeTree: [] })
	const api = createClient(pending)
	expect(api.onReady(() => undefined)).toBe(api)
	await Promise.resolve()
	expect(() => api.onIdle(() => undefined)).toThrow(/same turn/)
})

it("dev send", () => {
	expect(devSend(undefined)).toBeUndefined()
	const hot = { send: vi.fn<(event: string, payload: unknown) => void>() }
	const payload = { type: "error" as const, err: { message: "m", stack: "" } }
	devSend(hot)?.(payload)
	expect(hot.send).toHaveBeenCalledExactlyOnceWith("flare:error", payload)
})

it("dev report", async () => {
	const host = install()
	const broke = [
		{ t: "l", m: "_root_", d: null },
		{ t: "l", m: "_root_/broken", d: null },
		{ t: "r" },
		{ t: "d" },
	] as const
	const fetch = vi.fn<ClientEnv["fetch"]>(async () => new Response(broke.map(encodeFrame).join("")))
	const send = vi.fn<NonNullable<ClientEnv["send"]>>()
	const ready = createReady()
	const navigates: ReadyContext["navigate"][] = []
	ready.api.onReady((ctx) => navigates.push(ctx.navigate))
	vi.spyOn(window, "scrollTo").mockImplementation(() => undefined)
	const logged = vi.spyOn(console, "error").mockImplementation(() => undefined)
	stops.push(await bootClient(routerOf(), ready, { ...env(host, fetch), dev: true, send }))
	await navigates[0]({ to: "_root_/broken" })
	flush()
	expect(host.textContent).toBe("root[Something went wrong]")
	expect(logged).not.toHaveBeenCalled()
	logged.mockRestore()
	expect(send).toHaveBeenCalledExactlyOnceWith(
		expect.objectContaining({ err: expect.objectContaining({ message: "render broke" }) }),
	)
})

it("chunk reload", async () => {
	const host = install()
	const ready = createReady()
	const navigates: ReadyContext["navigate"][] = []
	ready.api.onReady((ctx) => navigates.push(ctx.navigate))
	const client = env(host)
	sessionStorage.clear()
	stops.push(await bootClient(routerOf(), ready, client))
	await navigates[0]({ to: "_root_/lazy" })
	expect(client.assign).toHaveBeenCalledExactlyOnceWith("/lazy")
})

it("popstate", async () => {
	const host = install()
	const frames = [
		{ t: "l", m: "_root_", d: null },
		{ t: "l", m: "_root_/about", d: "back" },
		{ t: "r" },
		{ t: "d" },
	] as const
	const fetch = vi.fn<ClientEnv["fetch"]>(async () => new Response(frames.map(encodeFrame).join("")))
	vi.spyOn(window, "scrollTo").mockImplementation(() => undefined)
	stops.push(await bootClient(routerOf(), createReady(), env(host, fetch)))
	history.pushState({ index: 1 }, "", "/about")
	window.dispatchEvent(new PopStateEvent("popstate", { state: { index: 1 } }))
	await new Promise((resolve) => setTimeout(resolve, 10))
	flush()
	expect(host.textContent).toBe("root[about:back]")
})

it("prefetch all", async () => {
	const host = install()
	const client = env(
		host,
		vi.fn<ClientEnv["fetch"]>(async () => new Response(null, { status: 500 })),
	)
	const chunks = { "_root_/": "/src/home.tsx", "_root_/lazy": "/src/lazy.tsx" }
	// A browser with rel=prefetch, which jsdom is not (prefetch.test covers the import path, BUGS.md 124.7).
	const supports = vi.spyOn(DOMTokenList.prototype, "supports").mockReturnValue(true)
	stops.push(await bootClient(routerOf(chunks), createReady(), client))
	supports.mockRestore()
	// The hydrated home's file is loaded already, so only the unloaded route's is prefetched (BUGS.md 80).
	const links = [...document.head.querySelectorAll('link[rel="prefetch"]')]
	expect(links.map((link) => link.getAttribute("href"))).toEqual(["/src/lazy.tsx"])
	for (const link of links) link.remove()
	const anchor = document.createElement("a")
	seen.prefetcher?.watch(anchor, "/about", "intent")
	anchor.dispatchEvent(new Event("pointerenter"))
	expect(client.fetch).toHaveBeenCalledExactlyOnceWith("/about?_flare=prefetch", expect.anything())
})

it("delegates", async () => {
	const host = install()
	const frames = [{ t: "l", m: "_root_", d: null }, { t: "l", m: "_root_/about", d: "linked" }, { t: "r" }] as const
	const fetch = vi.fn<ClientEnv["fetch"]>(async () => new Response(frames.map(encodeFrame).join("")))
	vi.spyOn(window, "scrollTo").mockImplementation(() => undefined)
	stops.push(await bootClient(routerOf(), createReady(), env(host, fetch)))
	const anchor = document.createElement("a")
	anchor.setAttribute("href", "/about")
	document.body.append(anchor)
	anchor.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }))
	await new Promise((resolve) => setTimeout(resolve, 0))
	flush()
	expect(fetch).toHaveBeenCalledWith("/about?_flare=data", expect.anything())
	expect(host.textContent).toBe("root[about:linked]")
})

it("overlay", async () => {
	const host = install()
	const frames = [{ t: "l", m: "_root_", d: null }, { t: "l", m: "_root_/photo", d: "P" }, { t: "r" }] as const
	const fetch = vi.fn<ClientEnv["fetch"]>(async () => new Response(frames.map(encodeFrame).join("")))
	const ready = createReady()
	const navigates: ReadyContext["navigate"][] = []
	ready.api.onReady((ctx) => navigates.push(ctx.navigate))
	stops.push(await bootClient(routerOf(), ready, env(host, fetch)))
	await navigates[0]({ to: "_root_/photo" })
	flush()
	expect(host.textContent).toBe("root[home:start|overlay:preview]")
	expect(history.state).toEqual({ index: 1, usr: undefined, intercepted: true })
})

function echoed(): Response {
	return Response.json(dataToWire({ name: "echo", status: 200, data: 1 }))
}

function aboutData(): Response {
	const frames = [encodeFrame({ t: "l", m: "_root_", d: null }), encodeFrame({ t: "l", m: "_root_/about", d: 1 })]
	return new Response([...frames, encodeFrame({ t: "r" })].join(""), {
		headers: { "content-type": "application/x-ndjson" },
	})
}

function tabOf(call: Parameters<ClientEnv["fetch"]> | undefined): string | null {
	return new Headers(call?.[1].headers).get("flare-dev-tab")
}

// In dev the client announces the dev server's tab token and names it on its own requests, so a server bug opens
// the overlay in this tab only. Without a hot channel, as in production, neither happens (dx/plugin.md, B42).
it("dev tab", async () => {
	const echo = { id: "echo", name: "echo", record: { kind: "handler", method: "post", authenticate: false } }
	for (const [hot, meta, token] of [
		[{ send: vi.fn<(event: string, payload: unknown) => void>() }, "T9", "T9"],
		[undefined, "T9", null],
		[{ send: vi.fn<(event: string, payload: unknown) => void>() }, undefined, null],
	] as const) {
		const host = install("b1")
		if (meta !== undefined)
			document.head.insertAdjacentHTML("beforeend", `<meta name="flare-dev-tab" content="${meta}">`)
		const fetch = vi.fn<ClientEnv["fetch"]>(async (url) =>
			String(url).includes("_flare=data") ? aboutData() : echoed(),
		)
		const ready = createReady()
		const navigates: ReadyContext["navigate"][] = []
		ready.api.onReady((ctx) => navigates.push(ctx.navigate))
		stops.push(await bootClient(routerOf(), ready, { ...env(host, fetch), hot }))
		const call: unknown = Reflect.get(Object((globalThis as Dom).flare), "call")
		if (typeof call !== "function") throw new Error("no self.flare.call")
		await Reflect.apply(call, undefined, [echo, null])
		await navigates[0]({ to: "_root_/about" })
		expect(fetch.mock.calls.map((seen) => tabOf(seen))).toEqual([token, token])
		expect(hot?.send.mock.calls ?? []).toEqual(token === null ? [] : [["flare:tab", { token }]])
		document.head.querySelector('meta[name="flare-dev-tab"]')?.remove()
		for (const stop of stops.splice(0)) stop()
	}
})

// The navigator and the transport read the one id the document wrote: both reload on another build's answer.
it("one build", async () => {
	const host = install("b1")
	const fetch = vi.fn<ClientEnv["fetch"]>(async () => new Response("", { headers: { "flare-build": "b2" } }))
	const ready = createReady()
	const navigates: ReadyContext["navigate"][] = []
	ready.api.onReady((ctx) => navigates.push(ctx.navigate))
	const browser = env(host, fetch)
	stops.push(await bootClient(routerOf(), ready, browser))
	await navigates[0]({ to: "_root_/about" })
	expect(browser.assign).toHaveBeenCalledWith("/about")
	const call: unknown = Reflect.get(Object((globalThis as Dom).flare), "call")
	if (typeof call !== "function") throw new Error("no self.flare.call")
	const echo = { id: "echo", name: "echo", record: { method: "post", authenticate: false } }
	await expect(Reflect.apply(call, undefined, [echo, null])).rejects.toThrow("The app was updated")
	expect(browser.assign).toHaveBeenLastCalledWith(window.location.href)
})

// The prefetcher checks the same build. A prefetch a newer deploy answered is dropped, so the navigation makes its
// own request, sees the mismatch, and loads the document once instead of committing the other build's frames (B30).
it("prefetch build", async () => {
	const host = install("b1")
	const frames = [
		{ t: "l", m: "_root_", d: null },
		{ t: "l", m: "_root_/about", d: "newer" },
		{ t: "r" },
		{ t: "d" },
	] as const
	const body = frames.map(encodeFrame).join("")
	const fetch = vi.fn<ClientEnv["fetch"]>(async () => new Response(body, { headers: { "flare-build": "b2" } }))
	const ready = createReady()
	const navigates: ReadyContext["navigate"][] = []
	ready.api.onReady((ctx) => navigates.push(ctx.navigate))
	const browser = env(host, fetch)
	sessionStorage.clear()
	stops.push(await bootClient(routerOf(), ready, browser))
	const anchor = document.createElement("a")
	seen.prefetcher?.watch(anchor, "/about", "intent")
	anchor.dispatchEvent(new Event("pointerenter"))
	await new Promise((resolve) => setTimeout(resolve, 0))
	await navigates[0]({ to: "_root_/about" })
	flush()
	expect(browser.assign).toHaveBeenCalledWith("/about")
	expect(host.textContent).not.toContain("newer")
})

// A stored document that left a `"stream"` hole says so in its state. After hydrate the client sends one
// `_flare=fill` revalidation of the same URL, which writes no history (dx/defer.md). The e2e row sees the value land.
it("fill on hydrate", async () => {
	const host = install()
	const filled = { ...Object((globalThis as Dom).flare), fill: true }
	;(globalThis as Dom).flare = filled
	const script = document.querySelector("script")
	if (script !== null) script.textContent = `${stateText(filled)}`
	const frames = [
		{ t: "l", m: "_root_", d: null },
		{ t: "l", m: "_root_/", d: "filled" },
		{ t: "r" },
		{ t: "d" },
	] as const
	const fetch = vi.fn<ClientEnv["fetch"]>(async () => new Response(frames.map(encodeFrame).join("")))
	const length = history.length
	stops.push(await bootClient(routerOf(), createReady(), env(host, fetch)))
	await vi.waitFor(() => expect(fetch).toHaveBeenCalledWith("/?_flare=fill", expect.anything()))
	await new Promise((resolve) => setTimeout(resolve, 20))
	expect(fetch).toHaveBeenCalledOnce()
	expect(history.length).toBe(length)
	expect(location.pathname).toBe("/")
})

// The boot tells the registered query getter the hydration mount is over, once, after the document says so and the
// app's hydrated callbacks ran. With no getter, or one without `hydrated`, the boot completes (B102).
it("query hydrated", async () => {
	const order: string[] = []
	const hydrated = vi.fn<() => void>(() =>
		order.push(`query ${document.documentElement.hasAttribute("data-flare-hydrated")}`),
	)
	const getter = Object.assign(() => undefined, { dehydrate: () => undefined, hydrated })
	Reflect.set(globalThis, QUERY_GETTER, getter)
	try {
		const ready = createReady()
		ready.api.onHydrated(() => order.push("app hydrated"))
		stops.push(await bootClient(routerOf(), ready, env(install())))
		expect(order).toEqual(["app hydrated", "query true"])
		expect(hydrated).toHaveBeenCalledOnce()
		Reflect.set(
			globalThis,
			QUERY_GETTER,
			Object.assign(() => undefined, { dehydrate: () => undefined }),
		)
		stops.push(await bootClient(routerOf(), createReady(), env(install())))
	} finally {
		Reflect.deleteProperty(globalThis, QUERY_GETTER)
	}
	stops.push(await bootClient(routerOf(), createReady(), env(install())))
})

// After a chunk reload the page is leaving, so the next navigation loads its page as a document; a back-forward cache
// restore (`pageshow` with `persisted`) brings client navigations back, and a dispose stops listening (BUGS.md 129).
it("pageshow", async () => {
	const host = install()
	const frames = [{ t: "l", m: "_root_", d: null }, { t: "l", m: "_root_/about", d: "back" }, { t: "r" }] as const
	const fetch = vi.fn<ClientEnv["fetch"]>(async () => new Response(frames.map(encodeFrame).join("")))
	const ready = createReady()
	const navigates: ReadyContext["navigate"][] = []
	ready.api.onReady((ctx) => navigates.push(ctx.navigate))
	const client = env(host, fetch)
	sessionStorage.clear()
	stops.push(await bootClient(routerOf(), ready, client))
	await navigates[0]({ to: "_root_/lazy" })
	await navigates[0]({ to: "_root_/about" })
	expect(vi.mocked(client.assign).mock.calls).toEqual([["/lazy"], ["/about"]])
	window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true }))
	await navigates[0]({ to: "_root_/about" })
	flush()
	expect(host.textContent).toBe("root[about:back]")
})

// `router` is required and is the object createRouter returns: anything else throws at the call, naming it, before any
// boot is queued, with the check createServer and createTestServer make (dx/client.md, BUGS.md 434).
it("router required", () => {
	for (const value of [undefined, {}, "router", { match: "no" }]) {
		expect(() => createClient(value as never)).toThrow("createClient: router is required")
	}
})
