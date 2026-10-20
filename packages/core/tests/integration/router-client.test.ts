import { dirname, resolve } from "node:path"
import type { Page } from "@playwright/test"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { createRouter } from "../../src/shared/router/create-router.ts"
import { ENGINES, startHarness, type Api, type AppResult, type Engine, type Harness } from "./hydrate.harness.ts"
import { appFrom } from "./harness-app.ts"

// dx/router.md's client rows: a real document `createServer(...).fetch` serves, hydrated by the real `createClient`
// in each engine (hydrate.app.ts), navigated by clicking real anchors and Back (B96). Each app is compiled into both
// sides from its own source, so each router configuration is its own function.

let harness: Harness | undefined

beforeAll(async () => {
	harness = await startHarness(resolve(dirname(expect.getState().testPath ?? ""), "../.."))
})

afterAll(async () => {
	await harness?.close()
})

type Visit = { app: (api: Api) => { router: unknown }; path: string; steps: (tab: Page) => Promise<void> }

function run(engine: Engine, visit: Visit): Promise<AppResult> {
	if (harness === undefined) throw new Error("the harness did not start")
	return harness.app(engine, { ...visit, client() {} })
}

// Pages /, /a, /b, and /c, tall enough to scroll, each with anchors to the others and to /old, and a loader. The harness
// compiles an app from its source into both sides, so the pages are one source each router configuration completes.
const PAGES = `
const link = (to) => api.solid.createComponent(api.web.Dynamic, {
	component: "a", href: to, id: "to-" + (to.slice(1) || "home"), children: to,
})
const root = api.rootLayout.createRootLayout("_root_").render((props) =>
	api.h("html", "doc", () => [
		api.h("head", "head"),
		api.h("body", "body", () => [link("/"), link("/a"), link("/b"), link("/c"), link("/old"), props.children]),
	]),
)
const page = (id, path) => ({
	id,
	path,
	module: api.page.createPage(id).loader(() => ({ at: path })).render(() =>
		api.solid.createComponent(api.web.Dynamic, { component: "main", id: "page", style: "height: 4000px", children: path }),
	),
})
const pages = {
	layouts: { _root_: root },
	routeTree: [page("_root_/", "/"), page("_root_/a", "/a"), page("_root_/b", "/b"), page("_root_/c", "/c")],
}`

// An app whose router is the pages plus `options`, a source fragment of createRouter options.
function appWith(options: string): (api: Api) => { router: unknown } {
	return appFrom(`${PAGES}\nreturn { router: api.router.createRouter({ ...pages, ${options} }) }`)
}

// The defaults; a custom key with a cap of two; no restoration; a fresh client cache with the default cap and with a
// cap of one; no client cache; and a rewrite of /old to /b.
const defaultsApp = appWith("")
const keyedApp = appWith(
	'getScrollRestorationKey: (location) => "k:" + location.pathname, scrollRestorationMaxEntries: 2',
)
const offApp = appWith("scrollRestoration: false")
const freshApp = appWith('cache: { client: { staleTime: "1m" } }')
const cappedApp = appWith('cache: { client: { staleTime: "1m" } }, routeCacheMaxEntries: 1')
const uncachedApp = appWith("cache: { client: false }")
const rewriteApp = appWith(
	'rewrite: (location) => (location.pathname === "/old" ? { ...location, pathname: "/b" } : undefined)',
)
const smoothApp = appWith('scrollRestorationBehavior: "smooth"')
// A rewrite that counts its calls on the client and throws for /c.
const countedApp = appWith(`rewrite: (location) => {
	if (typeof window !== "undefined") window.__rewrites = (window.__rewrites ?? 0) + 1
	if (location.pathname === "/c") throw new Error("rewrite boom")
	return location.pathname === "/old" ? { ...location, pathname: "/b" } : undefined
}`)

async function landed(tab: Page, path: string): Promise<void> {
	await tab.waitForFunction((want) => document.getElementById("page")?.textContent === want, path)
}

// From the page, as a person's click on a link in view: Playwright's own click would first scroll the anchor into view
// and move the position the navigation saves.
async function go(tab: Page, to: string, path = to): Promise<void> {
	await tab.evaluate((id) => document.getElementById(id)?.click(), `to-${to.slice(1) || "home"}`)
	await landed(tab, path)
}

async function remember(tab: Page, value: unknown): Promise<void> {
	await tab.evaluate((item) => (Reflect.get(window, "__flareRecord") as unknown[]).push(item), value)
}

// The data requests a navigation makes from now on, by path.
function dataRequests(tab: Page): string[] {
	const paths: string[] = []
	tab.on("request", (request) => {
		const url = new URL(request.url())
		if (url.searchParams.get("_flare") === "data") paths.push(url.pathname)
	})
	return paths
}

// Back after leaving /a at 600 (router.md scrollRestoration).
async function restoreSteps(tab: Page): Promise<void> {
	await tab.evaluate(() => window.scrollTo(0, 600))
	await tab.waitForFunction(() => Math.round(scrollY) === 600)
	await go(tab, "/b")
	await tab.goBack()
	await landed(tab, "/a")
	await tab.waitForFunction(() => Math.abs(scrollY - 600) < 2)
	const y = await tab.evaluate(() => Math.round(scrollY))
	await remember(tab, { y, mode: await tab.evaluate(() => history.scrollRestoration) })
}

// Three navigations, then the stored keys (router.md getScrollRestorationKey, scrollRestorationMaxEntries).
async function keySteps(tab: Page): Promise<void> {
	await go(tab, "/b")
	await go(tab, "/c")
	await go(tab, "/a")
	const stored = await tab.evaluate(() => sessionStorage.getItem("flare_scroll") ?? "[]")
	await remember(
		tab,
		(JSON.parse(stored) as [string][]).map(([key]) => key),
	)
}

// One navigation, then what is stored and the browser's mode (router.md scrollRestoration false).
async function offSteps(tab: Page): Promise<void> {
	await go(tab, "/b")
	const stored = await tab.evaluate(() => sessionStorage.getItem("flare_scroll"))
	await remember(tab, { stored, mode: await tab.evaluate(() => history.scrollRestoration) })
}

// `/` → `/a` → `/b`, then the data requests the way back to `/a` makes (router.md cache, routeCacheMaxEntries).
async function cacheSteps(tab: Page): Promise<void> {
	await go(tab, "/a")
	await go(tab, "/b")
	const requests = dataRequests(tab)
	await go(tab, "/a")
	await remember(tab, requests)
}

// An anchor to /old, then the page shown (router.md rewrite).
async function rewriteSteps(tab: Page): Promise<void> {
	await go(tab, "/old", "/b")
	await remember(tab, await tab.evaluate(() => document.getElementById("page")?.textContent))
}

// Back after leaving /a at 600, with every `scrollTo` call's `behavior` recorded (router.md
// scrollRestorationBehavior).
async function smoothSteps(tab: Page): Promise<void> {
	await tab.evaluate(() => {
		const behaviors: unknown[] = []
		Reflect.set(window, "__behaviors", behaviors)
		const scroll = window.scrollTo.bind(window)
		window.scrollTo = ((...args: unknown[]) => {
			const [first] = args
			if (typeof first === "object" && first !== null) behaviors.push(Reflect.get(first, "behavior"))
			Reflect.apply(scroll, window, args)
		}) as typeof window.scrollTo
		scroll(0, 600)
	})
	await tab.waitForFunction(() => Math.round(scrollY) === 600)
	await go(tab, "/b")
	await tab.goBack()
	await landed(tab, "/a")
	// The restore's call is what this reads; a smooth scroll's landing is the engine's, and timing it is not.
	await tab.waitForFunction(() => (Reflect.get(window, "__behaviors") as unknown[]).includes("smooth"))
	await remember(tab, await tab.evaluate(() => Reflect.get(window, "__behaviors")))
}

// An anchor to /old, then one to /c whose rewrite throws: the address bar and the rewrite calls each made (router.md
// rewrite: the address bar shows the rewritten URL, once per navigation, and a throw keeps the URL).
async function countedSteps(tab: Page): Promise<void> {
	const calls = () => tab.evaluate(() => Number(Reflect.get(window, "__rewrites") ?? 0))
	const before = await calls()
	await go(tab, "/old", "/b")
	const after = await calls()
	await remember(tab, [await tab.evaluate(() => location.pathname), after - before])
	await tab.evaluate(() => document.getElementById("to-c")?.click())
	await tab.waitForTimeout(300)
	await remember(tab, [
		await tab.evaluate(() => location.pathname),
		await tab.evaluate(() => document.getElementById("page")?.textContent),
	])
}

describe.each(ENGINES)("%s", (engine) => {
	// Back restores the position the page was left at, from sessionStorage keyed by history index.
	it("scroll restore", async () => {
		const result = await run(engine, { app: defaultsApp, path: "/a", steps: restoreSteps })
		expect(result.problems).toEqual([])
		expect(result.record).toEqual([{ y: 600, mode: "manual" }])
	})

	// A custom key names each stored position, and past the cap the oldest drop.
	it("scroll key and cap", async () => {
		expect((await run(engine, { app: keyedApp, path: "/a", steps: keySteps })).record).toEqual([["k:/b", "k:/c"]])
	})

	// Off, nothing is stored and the browser keeps its own restoration.
	it("scroll off", async () => {
		const result = await run(engine, { app: offApp, path: "/a", steps: offSteps })
		expect(result.record).toEqual([{ stored: null, mode: "auto" }])
	})

	// A page the client cache holds fresh is shown again without a request; a cap of one has evicted it for the next
	// page, and `cache: { client: false }` keeps nothing.
	it("client cache", async () => {
		expect((await run(engine, { app: freshApp, path: "/", steps: cacheSteps })).record).toEqual([[]])
		expect((await run(engine, { app: cappedApp, path: "/", steps: cacheSteps })).record).toEqual([["/a"]])
		expect((await run(engine, { app: uncachedApp, path: "/", steps: cacheSteps })).record).toEqual([["/a"]])
	})

	// Back restores the position with the configured behavior, passed to `scrollTo`.
	it("scroll behavior", async () => {
		const result = await run(engine, { app: smoothApp, path: "/a", steps: smoothSteps })
		expect(result.record).toEqual([expect.arrayContaining(["smooth"])])
	})

	// The rewritten URL is the address bar's, the rewrite runs once for the navigation, and a throw keeps the URL.
	it("rewrite address", async () => {
		const result = await run(engine, { app: countedApp, path: "/", steps: countedSteps })
		expect(result.record).toEqual([
			["/b", 1],
			["/b", "/b"],
		])
	})

	// The client rewrite runs before match: an anchor to /old lands the /b page.
	it("rewrite", async () => {
		const result = await run(engine, { app: rewriteApp, path: "/", steps: rewriteSteps })
		expect(result.problems).toEqual([])
		expect(result.record).toEqual(["/b"])
	})
})

// The rows whose outcome is the router's stored config, read by the client parts other files test: the defaults, and
// what a call sets (router.md prefetch, viewTransitions, scrollRestorationBehavior).
it("router config", () => {
	const router = createRouter({ layouts: {}, routeTree: [] })
	expect(router.prefetch).toEqual({ modules: "all", data: false })
	expect(router.viewTransitions).toBe(false)
	expect(router.scrollRestorationBehavior).toBe("instant")
	const set = createRouter({
		layouts: {},
		routeTree: [],
		prefetch: { data: "intent" },
		viewTransitions: { scope: "document" },
		scrollRestorationBehavior: "smooth",
	})
	expect(set.prefetch).toEqual({ modules: "all", data: "intent" })
	expect(set.viewTransitions).toEqual({ scope: "document" })
	expect(set.scrollRestorationBehavior).toBe("smooth")
})
