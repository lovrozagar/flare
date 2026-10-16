import { flush } from "solid-js"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { encodeFrame, type Frame } from "../../shared/protocol/index.ts"
import { createPage } from "../../shared/route-builder/page.ts"
import { createRootLayout } from "../../shared/route-builder/root-layout.ts"
import type { Effects } from "../../shared/route-builder/index.ts"
import { createRouter, type Router } from "../../shared/router/create-router.ts"
import { env, stops, type Dom } from "./boot.fixture.ts"
import { bootClient, type ClientEnv } from "./create-client.ts"
import { createReady, type ReadyContext } from "./ready.ts"

// After hydrate the document's matches are in the match cache on the document's own clock, and the cache plans once
// with "initial" (dx/navigate.md, dx/cache.md, BUGS.md 139).

beforeEach(() => {
	history.replaceState(null, "", "/")
	document.documentElement.removeAttribute("data-flare-hydrated")
})

afterEach(() => {
	for (const stop of stops.splice(0)) stop()
	delete (globalThis as Dom).flare
})

const MINUTE = 60_000

type Home = { client?: false; shouldRefetch?: Effects["shouldRefetch"] }

// `/` holds its loader data for a minute, or not at all, and may ask to refetch. `/about` is a plain page.
function routerOf(home: Home = {}): Router {
	const root = createRootLayout("_root_").render((props) => ["root[", props.children, "]"])
	const chain = createPage("_root_/").cache({ client: home.client ?? { staleTime: "1m" } })
	const page = (home.shouldRefetch === undefined ? chain : chain.effects({ shouldRefetch: home.shouldRefetch })).render(
		// A reactive child, so a same-route commit repaints it.
		(props) => [() => `home:${String(props.loaderData)}`],
	)
	const about = createPage("_root_/about").render((props) => `about:${String(props.loaderData)}`)
	return createRouter({
		layouts: { _root_: root },
		routeTree: [
			{ id: "_root_/", path: "/", module: page },
			{ id: "_root_/about", path: "/about", module: about },
		],
	})
}

// The document's state: `/` rendered with `data` at `at`, and `extra` fields. `error` fails the page.
function install(data: unknown, extra: Record<string, unknown> = {}, error: unknown = null): HTMLElement {
	const matches = [
		{ id: "_root_", params: {}, search: {}, data: null, preloader: {}, head: null, error: null },
		{ id: "_root_/", params: {}, search: {}, data, preloader: {}, head: { title: "Home" }, error },
	]
	const state = { matches, nonce: "", ...extra }
	document.body.innerHTML = `<script>self.flare=${JSON.stringify(state)}</script><div id="app"></div>`
	;(globalThis as Dom).flare = { ...state }
	return document.getElementById("app") as HTMLElement
}

// A data answer for `page` with `data`.
function answer(page: string, data: unknown): Response {
	const frames: Frame[] = [{ t: "l", m: "_root_", d: null }, { t: "l", m: page, d: data }, { t: "r" }, { t: "d" }]
	return new Response(frames.map(encodeFrame).join(""))
}

async function boot(router: Router, host: HTMLElement, fetch: ClientEnv["fetch"]): Promise<ReadyContext["navigate"]> {
	const ready = createReady()
	const navigates: ReadyContext["navigate"][] = []
	ready.api.onReady((ctx) => navigates.push(ctx.navigate))
	vi.spyOn(window, "scrollTo").mockImplementation(() => undefined)
	stops.push(await bootClient(router, ready, env(host, fetch)))
	return navigates[0] as ReadyContext["navigate"]
}

// Away to /about and back to /: the URLs the back trip asks for.
async function backHome(
	home: Home,
	at: number | undefined,
	doc: { data?: unknown; error?: unknown } = {},
): Promise<string[]> {
	const host = install(doc.data ?? "doc", at === undefined ? {} : { at }, doc.error ?? null)
	const fetch = vi.fn<ClientEnv["fetch"]>(async (url) =>
		answer(url.startsWith("/about") ? "_root_/about" : "_root_/", "net"),
	)
	const navigate = await boot(routerOf(home), host, fetch)
	await navigate({ to: "_root_/about" })
	flush()
	fetch.mockClear()
	await navigate({ to: "_root_/" })
	flush()
	return fetch.mock.calls.map(([url]) => url)
}

const STALE = "/?_flare=data&_flare_stale=%26"

// The document's page is held from its render time: back within its staleTime, the server skips its loader. A render
// older than that, a route with `cache.client: false`, and data with a placeholder are not held. A state with no `at`
// is as old as the hydration, and a render time ahead of the client's clock counts as now.
it("seeds", async () => {
	expect(await backHome({}, Date.now() - 1000)).toEqual([STALE])
	expect(await backHome({}, Date.now() - 10 * MINUTE)).toEqual(["/?_flare=data"])
	expect(await backHome({ client: false }, Date.now())).toEqual(["/?_flare=data"])
	expect(await backHome({}, Date.now(), { data: { __deferred: true, key: "d0" } })).toEqual(["/?_flare=data"])
	expect(await backHome({}, undefined)).toEqual([STALE])
	expect(await backHome({}, Date.now() + 10 * MINUTE)).toEqual([STALE])
})

// A page the document painted as failed was not rendered, so it is not held.
it("failed not held", async () => {
	expect(await backHome({}, Date.now(), { data: null, error: { message: "missing", name: "NotFoundError" } })).toEqual([
		"/?_flare=data",
	])
})

// A page whose shouldRefetch returns true for "initial" is refetched once after hydrate, in place: no history entry and
// no blocker. It is asked once, with the current location.
it("asks initial", async () => {
	const host = install("doc", { at: Date.now() })
	const fetch = vi.fn<ClientEnv["fetch"]>(async () => answer("_root_/", "fresh"))
	const shouldRefetch = vi.fn<NonNullable<Effects["shouldRefetch"]>>(({ trigger }) => trigger === "initial")
	const length = history.length
	await boot(routerOf({ shouldRefetch }), host, fetch)
	await vi.waitFor(() => expect(host.textContent).toBe("root[home:fresh]"))
	expect(fetch.mock.calls.map(([url]) => url)).toEqual(["/?_flare=data"])
	expect(shouldRefetch).toHaveBeenCalledOnce()
	expect(shouldRefetch).toHaveBeenCalledWith(expect.objectContaining({ trigger: "initial", search: {} }))
	expect(history.length).toBe(length)
	expect(location.pathname).toBe("/")
})

// No page asks: hydrate sends nothing.
it("none asks", async () => {
	const host = install("doc", { at: Date.now() })
	const fetch = vi.fn<ClientEnv["fetch"]>()
	await boot(routerOf({ shouldRefetch: () => false }), host, fetch)
	await new Promise((resolve) => setTimeout(resolve, 20))
	expect(fetch).not.toHaveBeenCalled()
	expect(host.textContent).toBe("root[home:doc]")
})

// A stored page with holes sends its fill, which runs every loader live: an asking page adds no second request.
it("fill wins", async () => {
	const host = install("doc", { at: Date.now(), fill: true })
	const fetch = vi.fn<ClientEnv["fetch"]>(async () => answer("_root_/", "filled"))
	await boot(routerOf({ shouldRefetch: () => true }), host, fetch)
	await vi.waitFor(() => expect(host.textContent).toBe("root[home:filled]"))
	await new Promise((resolve) => setTimeout(resolve, 20))
	expect(fetch.mock.calls.map(([url]) => url)).toEqual(["/?_flare=fill"])
})

// shouldRefetch's location carries the params of the page on screen and of the target: on hydrate both are the
// document's page; away to /users/8 and back to the held /users/7, the current is 8 and the next 7. Its search is
// the URL's search string (BUGS.md 139.3).
it("refetch location", async () => {
	const seen: unknown[] = []
	const user = createPage("_root_/users/[id]")
		.cache({ client: { staleTime: "1m" } })
		.effects({
			shouldRefetch: ({ trigger, location }) => {
				seen.push({
					trigger,
					current: location.current.params,
					next: location.next.params,
					search: location.next.search,
				})
				return false
			},
		})
		.render((props) => [() => `user:${String(props.loaderData)}`])
	const root = createRootLayout("_root_").render((props) => ["root[", props.children, "]"])
	const router = createRouter({
		layouts: { _root_: root },
		routeTree: [{ id: "_root_/users/[id]", path: "/users/[id]", module: user }],
	})
	history.replaceState(null, "", "/users/7?tab=a")
	const matches = [
		{ id: "_root_", params: { id: "7" }, search: { tab: "a" }, data: null, preloader: {}, head: null, error: null },
		{
			id: "_root_/users/[id]",
			params: { id: "7" },
			search: { tab: "a" },
			data: "7",
			preloader: {},
			head: null,
			error: null,
		},
	]
	const state = { matches, nonce: "", at: Date.now() }
	document.body.innerHTML = `<script>self.flare=${JSON.stringify(state)}</script><div id="app"></div>`
	;(globalThis as Dom).flare = { ...state }
	const host = document.getElementById("app") as HTMLElement
	const fetch = vi.fn<ClientEnv["fetch"]>(async () => answer("_root_/users/[id]", "net"))
	const navigate = await boot(router, host, fetch)
	await navigate({ to: "_root_/users/[id]", params: { id: "8" } })
	flush()
	await navigate({ to: "_root_/users/[id]", params: { id: "7" }, search: { tab: "a" } })
	flush()
	expect(seen).toEqual([
		{ trigger: "initial", current: { id: "7" }, next: { id: "7" }, search: "?tab=a" },
		{ trigger: "navigation", current: { id: "8" }, next: { id: "7" }, search: "?tab=a" },
	])
})
