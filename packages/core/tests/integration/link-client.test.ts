import { dirname, resolve } from "node:path"
import type { Page } from "@playwright/test"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { appFrom } from "./harness-app.ts"
import type { AppCase } from "./hydrate.app.ts"
import { ENGINES, startHarness, type AppResult, type Engine, type Harness } from "./hydrate.harness.ts"

// dx/link.md's client rows in each engine (B96): a real document `createServer(...).fetch` serves, hydrated by the real
// `createClient`, its real Links clicked and hovered. Where a link sends the browser, what it asks the server for, and
// what the page shows after.

let harness: Harness | undefined

beforeAll(async () => {
	harness = await startHarness(resolve(dirname(expect.getState().testPath ?? ""), "../.."))
})

afterAll(async () => {
	await harness?.close()
})

function run(engine: Engine, visit: Pick<AppCase, "app" | "path" | "steps" | "init">): Promise<AppResult> {
	if (harness === undefined) throw new Error("the harness did not start")
	return harness.app(engine, { ...visit, client() {} })
}

// Pages /a, /b, and /t, tall enough to scroll, each counting its loader runs; /s reads its search back through a
// validator; /feed is a `.response()` page. The root holds one Link per prop under test, and a button that navigates
// with the same values the `values` Link carries. A client cache of a minute keeps visited pages fresh.
const NAVIGATION = appFrom(`
const L = (props) => api.solid.createComponent(api.link.Link, props)
const AT = new Date("2026-10-16T12:00:00.000Z")
const VALUES = { text: "a b&c/%41+", n: 3, at: AT, tag: ["x", "y"], obj: { a: [1] } }
const NavigateButton = () => {
	const navigate = api.solid.useContext(api.routerContext.NavigateContext)
	return api.solid.createComponent(api.web.Dynamic, {
		component: "button", id: "navigate-values", onClick: () => navigate({ to: "_root_/s", search: VALUES }), children: "go",
	})
}
const links = () => [
	L({ to: "_root_/a", id: "to-a", activeClass: "on", inactiveClass: "off", children: "a" }),
	L({ to: "_root_/b", id: "to-b", children: "b" }),
	L({ to: "_root_/t", id: "to-t", children: "t" }),
	L({ to: "_root_/b", id: "replace-b", replace: true, children: "replace" }),
	L({ to: "_root_/b", id: "still-b", scroll: false, children: "still" }),
	L({ to: "_root_/a", id: "force-a", force: true, children: "force" }),
	L({ to: "_root_/b", id: "fresh-b", revalidate: true, children: "fresh" }),
	L({ to: "_root_/a", id: "shallow-a", search: { x: "1" }, shallow: true, children: "shallow" }),
	L({ to: "_root_/b", id: "shallow-b", shallow: true, children: "shallow other" }),
	L({ to: "_root_/b", id: "off-b", disabled: true, children: "off" }),
	L({ to: "_root_/b", id: "blank-b", target: "_blank", children: "blank" }),
	L({ href: "javascript:window.__js=1", id: "js", children: "js" }),
	L({ to: "_root_/feed", id: "feed", children: "feed" }),
	L({ to: "_root_/b", id: "vt-b", viewTransition: true, children: "vt" }),
	L({ to: "_root_/s", id: "values", search: VALUES, children: "values" }),
	api.solid.createComponent(NavigateButton, {}),
	api.h("a", "plain-space", () => "space"),
	api.h("a", "plain-plus", () => "plus"),
	api.h("a", "plain-slash", () => "slash"),
]
const root = api.rootLayout.createRootLayout("_root_").render((props) => api.h("html", "doc", () => [
	api.h("head", "head"),
	api.h("body", "body", () => [api.h("nav", "nav", links), props.children]),
]))
const count = (key) => (globalThis[key] = (globalThis[key] ?? 0) + 1)
const tall = (route) => api.page.createPage(route)
	.loader(() => ({ run: count("__flareLink" + route) }))
	.render((props) => api.solid.createComponent(api.web.Dynamic, {
		component: "main", id: "page", style: "height: 4000px", get children() { return route.slice(6) + " run " + props.loaderData.run },
	}))
const coerce = (raw) => ({
	text: raw.text, n: raw.n === undefined ? undefined : Number(raw.n), at: raw.at === undefined ? undefined : new Date(raw.at),
	tag: raw.tag === undefined ? undefined : [raw.tag].flat(), obj: raw.obj === undefined ? undefined : JSON.parse(raw.obj),
	q: raw.q,
})
const echo = api.page.createPage("_root_/s").input({ searchParams: coerce }).loader(() => ({ run: count("__flareLinkS") }))
	.render((props) => api.h("main", "page", () => "/s " + JSON.stringify(props.search)))
const feed = api.page.createPage("_root_/feed").response(() => new Response("<p id=feed-body>feed</p>", { headers: { "content-type": "text/html" } }))
const page = (route, module) => ({ id: route, path: route.slice(6), module })
const routeTree = [page("_root_/a", tall("_root_/a")), page("_root_/b", tall("_root_/b")), page("_root_/t", tall("_root_/t")), page("_root_/s", echo), page("_root_/feed", feed)]
return { router: api.router.createRouter({ layouts: { _root_: root }, routeTree, cache: { client: { staleTime: "1m" } }, prefetch: false }) }
`)

const PLAIN = { "plain-space": "/s?q=a%20b%2Fc", "plain-plus": "/s?q=a+b/c", "plain-slash": "/s?q=a+b%2fc" }

// The page's text once it reads `want`, at the path the browser shows.
async function landed(tab: Page, path: string, want = path): Promise<void> {
	await tab.waitForFunction(
		([at, text]) => location.pathname === at && document.getElementById("page")?.textContent?.startsWith(text) === true,
		[path, want],
	)
}

async function click(tab: Page, id: string): Promise<void> {
	await tab.evaluate((target) => document.getElementById(target)?.click(), id)
}

async function remember(tab: Page, value: unknown): Promise<void> {
	await tab.evaluate((item) => (Reflect.get(window, "__flareRecord") as unknown[]).push(item), value)
}

// The data requests from now on, as `path?search` without the protocol keys.
function dataRequests(tab: Page): string[] {
	const seen: string[] = []
	tab.on("request", (request) => {
		const url = new URL(request.url())
		if (url.searchParams.get("_flare") !== "data") return
		url.searchParams.delete("_flare")
		url.searchParams.delete("_flare_stale")
		seen.push(`${url.pathname}${url.search}`)
	})
	return seen
}

// A marker on the window: a full document load drops it.
const mark = (tab: Page) => tab.evaluate(() => Reflect.set(window, "__flareSame", true))
const same = (tab: Page) => tab.evaluate(() => Reflect.get(window, "__flareSame") === true)

// A push adds a history entry and `replace` does not; neither reloads the document.
async function historySteps(tab: Page): Promise<void> {
	await mark(tab)
	const start = await tab.evaluate(() => history.length)
	await click(tab, "to-b")
	await landed(tab, "/b")
	const pushed = await tab.evaluate(() => history.length)
	await click(tab, "to-t")
	await landed(tab, "/t")
	await click(tab, "replace-b")
	await landed(tab, "/b")
	await remember(tab, { pushed: pushed - start, replaced: (await tab.evaluate(() => history.length)) - pushed - 1 })
	await remember(tab, await same(tab))
}

// `scroll: false` keeps the position; the default goes to the top.
async function scrollSteps(tab: Page): Promise<void> {
	await tab.evaluate(() => window.scrollTo(0, 600))
	await tab.waitForFunction(() => Math.round(scrollY) === 600)
	await click(tab, "still-b")
	await landed(tab, "/b")
	await remember(tab, await tab.evaluate(() => Math.round(scrollY)))
	await click(tab, "to-a")
	await landed(tab, "/a")
	await tab.waitForFunction(() => scrollY === 0)
	await remember(tab, await tab.evaluate(() => Math.round(scrollY)))
}

// The loader run the page shows.
const runOf = async (tab: Page): Promise<number> =>
	Number(/run (\d+)/.exec((await tab.evaluate(() => document.getElementById("page")?.textContent)) ?? "")?.[1])

// Clicks `id` and waits for `path` to show a loader run after `after` (or any run when `after` is undefined).
async function rerun(tab: Page, step: { id: string; path: string; after?: number }): Promise<number> {
	await click(tab, step.id)
	await tab.waitForFunction(
		([at, last]) => {
			const text = document.getElementById("page")?.textContent ?? ""
			const run = Number(/run (\d+)/.exec(text)?.[1])
			return location.pathname === at && text.startsWith(at) && (last === null || run > last)
		},
		[step.path, step.after ?? null] as const,
	)
	return runOf(tab)
}

// On /a scrolled down: the active link does nothing, `force` navigates there anyway (to the top, from the fresh
// cache); /b once, then a fresh /b from the cache, and from /a again a `revalidate` link refetches it.
async function freshSteps(tab: Page): Promise<void> {
	const requests = dataRequests(tab)
	await tab.evaluate(() => window.scrollTo(0, 600))
	await tab.waitForFunction(() => Math.round(scrollY) === 600)
	await click(tab, "to-a")
	await tab.waitForTimeout(100)
	const kept = await tab.evaluate(() => Math.round(scrollY) === 600)
	await click(tab, "force-a")
	await tab.waitForFunction(() => scrollY === 0)
	const b = await rerun(tab, { id: "to-b", path: "/b" })
	await rerun(tab, { id: "to-a", path: "/a" })
	await rerun(tab, { id: "to-b", path: "/b" })
	const cached = await runOf(tab)
	await rerun(tab, { id: "to-a", path: "/a" })
	await rerun(tab, { id: "fresh-b", path: "/b", after: b })
	await remember(tab, { kept, cached: cached === b, requests: [...requests] })
}

// `shallow` writes the URL and runs no loader; to another route it throws and leaves the page.
async function shallowSteps(tab: Page): Promise<void> {
	const requests = dataRequests(tab)
	await click(tab, "shallow-a")
	await tab.waitForFunction(() => location.search === "?x=1")
	await remember(tab, { path: await tab.evaluate(() => location.pathname + location.search), requests: [...requests] })
	await click(tab, "shallow-b")
	await tab.waitForTimeout(200)
	await remember(tab, await tab.evaluate(() => location.pathname + location.search))
}

// A disabled link, a dangerous href, and `_blank` leave the tab where it is; `_blank` opens a tab.
async function inertSteps(tab: Page): Promise<void> {
	await mark(tab)
	await click(tab, "off-b")
	await click(tab, "js")
	const opened = tab.context().waitForEvent("page")
	await click(tab, "blank-b")
	const popup = await opened
	await popup.waitForLoadState()
	const popupPath = new URL(popup.url()).pathname
	await popup.close()
	await tab.waitForTimeout(100)
	await remember(tab, {
		path: await tab.evaluate(() => location.pathname),
		js: await tab.evaluate(() => Reflect.get(window, "__js") ?? null),
		same: await same(tab),
		popupPath,
	})
}

// A `.response()` page is a document load: the client navigator hands it to the browser.
async function documentSteps(tab: Page): Promise<void> {
	const loads: string[] = []
	tab.on("request", (request) => {
		if (request.isNavigationRequest()) loads.push(new URL(request.url()).pathname)
	})
	await click(tab, "feed")
	await tab.waitForFunction(() => document.getElementById("feed-body") !== null)
	await tab.waitForLoadState("load")
	// The new document holds no record for the harness to read, so the case checks here.
	expect(loads).toEqual(["/feed"])
}

// The active class and aria-current follow the location.
async function activeSteps(tab: Page): Promise<void> {
	const state = () =>
		tab.evaluate(() => {
			const a = document.getElementById("to-a")
			return { cls: a?.getAttribute("class"), current: a?.getAttribute("aria-current") }
		})
	await remember(tab, await state())
	await click(tab, "to-b")
	await landed(tab, "/b")
	await remember(tab, await state())
}

// A view transition wraps the navigation where the engine has one.
async function transitionSteps(tab: Page): Promise<void> {
	await click(tab, "vt-b")
	await landed(tab, "/b")
	await remember(tab, await tab.evaluate(() => Reflect.get(window, "__flareTransitions") ?? null))
}

// Counts `document.startViewTransition` calls, where the engine has it.
async function countTransitions(tab: Page): Promise<void> {
	await tab.addInitScript(() => {
		const start = Reflect.get(document, "startViewTransition") as ((...args: unknown[]) => unknown) | undefined
		if (typeof start !== "function") return
		Reflect.set(window, "__flareTransitions", 0)
		Reflect.set(document, "startViewTransition", function (this: Document, ...args: unknown[]) {
			Reflect.set(window, "__flareTransitions", Number(Reflect.get(window, "__flareTransitions")) + 1)
			return start.apply(this, args)
		})
	})
}

// The document at /s?q=a%20b%2Fc, then away and back by anchors that spell the same value with `+`, `/`, and a
// lowercase escape: one match, so the fresh entry is reused and no data request goes out (BUGS.md 147).
async function spellingSteps(tab: Page): Promise<void> {
	await tab.evaluate((hrefs) => {
		for (const [id, href] of Object.entries(hrefs)) document.getElementById(id)?.setAttribute("href", href)
	}, PLAIN)
	const requests = dataRequests(tab)
	for (const id of Object.keys(PLAIN)) {
		await click(tab, "to-a")
		await landed(tab, "/a")
		await click(tab, id)
		await landed(tab, "/s", "/s ")
	}
	await remember(
		tab,
		[...requests].filter((path) => path.startsWith("/s")),
	)
	await remember(tab, await tab.evaluate(() => document.getElementById("page")?.textContent))
}

// The Link's values and navigate()'s, read back by /s's validator.
async function valuesSteps(tab: Page): Promise<void> {
	for (const id of ["values", "navigate-values"]) {
		await click(tab, "to-a")
		await landed(tab, "/a")
		await click(tab, id)
		await landed(tab, "/s", '/s {"text"')
		const text = (await tab.evaluate(() => document.getElementById("page")?.textContent)) ?? ""
		await remember(tab, {
			search: await tab.evaluate(() => location.search),
			read: JSON.parse(text.slice(3)) as unknown,
		})
	}
}

const READ = { text: "a b&c/%41+", n: 3, at: "2026-10-16T12:00:00.000Z", tag: ["x", "y"], obj: { a: [1] } }

describe.each(ENGINES)("%s", (engine) => {
	it("history", async () => {
		const result = await run(engine, { app: NAVIGATION, path: "/a", steps: historySteps })
		expect(result.problems).toEqual([])
		expect(result.record).toEqual([{ pushed: 1, replaced: 0 }, true])
	})

	it("scroll", async () => {
		const result = await run(engine, { app: NAVIGATION, path: "/a", steps: scrollSteps })
		expect(result.record).toEqual([600, 0])
	})

	it("revalidate and force", async () => {
		const result = await run(engine, { app: NAVIGATION, path: "/a", steps: freshSteps })
		expect(result.problems).toEqual([])
		expect(result.record).toEqual([{ kept: true, cached: true, requests: ["/b", "/b"] }])
	})

	it("shallow", async () => {
		const result = await run(engine, { app: NAVIGATION, path: "/a", steps: shallowSteps })
		expect(result.record).toEqual([{ path: "/a?x=1", requests: [] }, "/a?x=1"])
		expect(result.problems.join("\n")).toMatch(/shallow/)
	})

	it("inert", async () => {
		const result = await run(engine, { app: NAVIGATION, path: "/a", steps: inertSteps })
		expect(result.record).toEqual([{ path: "/a", js: null, same: true, popupPath: "/b" }])
	})

	it("response page", async () => {
		const result = await run(engine, { app: NAVIGATION, path: "/a", steps: documentSteps })
		expect(result.status).toBe(200)
	})

	it("active", async () => {
		const result = await run(engine, { app: NAVIGATION, path: "/a", steps: activeSteps })
		expect(result.record).toEqual([
			{ cls: "on", current: "page" },
			{ cls: "off", current: null },
		])
	})
})

describe.each(ENGINES)("%s", (engine) => {
	it("view transition", async () => {
		const result = await run(engine, { app: NAVIGATION, path: "/a", init: countTransitions, steps: transitionSteps })
		expect(result.problems).toEqual([])
		expect([null, 1]).toContain(result.record[0])
	})

	it("search spelling", async () => {
		const result = await run(engine, { app: NAVIGATION, path: "/s?q=a%20b%2Fc", steps: spellingSteps })
		expect(result.problems).toEqual([])
		expect(result.record[0]).toEqual([])
		expect(result.record[1]).toBe('/s {"q":"a b/c"}')
	})

	it("url values", async () => {
		const result = await run(engine, { app: NAVIGATION, path: "/a", steps: valuesSteps })
		expect(result.problems).toEqual([])
		const search =
			"?at=2026-10-16T12%3A00%3A00.000Z&n=3&obj=%7B%22a%22%3A%5B1%5D%7D&tag=x&tag=y&text=a%20b%26c%2F%2541%2B"
		expect(result.record).toEqual([
			{ search, read: READ },
			{ search, read: READ },
		])
	})
})

// Pages a Link prefetches: /p1 by an intent link, /p2 by none, /p3 data on intent, /p4 a route whose own prefetch is
// viewport, /lazy unlinked and /lazy-linked linked, both lazy modules that record their import. The router keeps the
// default prefetch, and its `chunks` name /lazy's file, as a client bundle lists it.
const PREFETCH = appFrom(`
const L = (props) => api.solid.createComponent(api.link.Link, props)
const imported = (route) => { if (typeof window !== "undefined") (window.__flareImported ??= []).push(route) }
const plain = (route) => api.page.createPage(route).loader(() => ({ at: route })).render(() => api.h("main", "page", () => route.slice(6)))
const lazy = (route) => () => { imported(route); return Promise.resolve(plain(route)) }
const root = api.rootLayout.createRootLayout("_root_").render((props) => api.h("html", "doc", () => [
	api.h("head", "head"),
	api.h("body", "body", () => [
		L({ to: "_root_/p1", id: "p1", prefetch: "intent", children: "p1" }),
		L({ to: "_root_/p2", id: "p2", prefetch: false, children: "p2" }),
		L({ to: "_root_/p3", id: "p3", prefetch: { data: "intent" }, children: "p3" }),
		L({ to: "_root_/p4", id: "p4", children: "p4" }),
		L({ to: "_root_/lazy-linked", id: "lazy-linked", children: "lazy" }),
		L({ href: "https://other.example/x", id: "foreign", prefetch: "intent", children: "foreign" }),
		props.children,
	]),
]))
const page = (route, module, client) => ({ id: route, path: route.slice(6) || "/", module, ...(client && { client }) })
const routeTree = [
	page("_root_/", plain("_root_/")),
	page("_root_/p1", plain("_root_/p1")),
	page("_root_/p2", plain("_root_/p2")),
	page("_root_/p3", plain("_root_/p3")),
	page("_root_/p4", plain("_root_/p4"), { prefetch: "viewport" }),
	page("_root_/lazy", lazy("_root_/lazy")),
	page("_root_/lazy-linked", lazy("_root_/lazy-linked")),
]
const chunks = { "_root_/lazy": "/src/shared/router/create-router.ts" }
return { router: api.router.createRouter({ layouts: { _root_: root }, routeTree, chunks }) }
`)

// What the idle `modules: "all"` pass warmed: the prefetch links it added, or the modules it imported where the engine
// has no rel=prefetch. `until` is the page-side condition that the pass ran.
async function warmed(tab: Page, until: string): Promise<unknown> {
	await tab.waitForFunction(until)
	await tab.waitForTimeout(300)
	return tab.evaluate(() => ({
		supports: document.createElement("link").relList.supports("prefetch"),
		links: [...document.querySelectorAll('link[rel="prefetch"]')].map((link) => link.getAttribute("href")),
		imported: [...((Reflect.get(window, "__flareImported") as string[] | undefined) ?? [])].sort(),
	}))
}

const ANY_WARM = `document.querySelector('link[rel="prefetch"]') !== null || (window.__flareImported ?? []).includes("_root_/lazy")`

// After idle, the default router warms /lazy; then each link by its setting: hovered, /p2 and the foreign link ask for
// nothing, /p1 and /p3 prefetch their data, and /p4's route prefetches in view without a hover.
async function prefetchSteps(tab: Page): Promise<void> {
	const foreign: string[] = []
	tab.on("request", (request) => {
		if (request.url().includes("other.example")) foreign.push(request.url())
	})
	await remember(tab, await warmed(tab, ANY_WARM))
	await tab.hover("#p2")
	await tab.hover("#foreign")
	await tab.waitForTimeout(300)
	for (const id of ["p1", "p3"]) {
		await Promise.all([
			tab.waitForResponse((response) => response.url().includes(`/${id}?_flare=prefetch`)),
			tab.hover(`#${id}`),
		])
	}
	await remember(tab, foreign)
}

// Data Saver on: no idle pass, so /lazy is neither prefetched nor imported; a link in view prefetches its modules
// instead, so /lazy-linked is imported.
async function saveData(tab: Page): Promise<void> {
	await tab.addInitScript(() => {
		Object.defineProperty(Navigator.prototype, "connection", { configurable: true, get: () => ({ saveData: true }) })
	})
}

async function saveDataSteps(tab: Page): Promise<void> {
	await remember(tab, await warmed(tab, `(window.__flareImported ?? []).includes("_root_/lazy-linked")`))
}

const prefetchPaths = (result: AppResult): string[] =>
	[
		...new Set(result.requests.filter((url) => url.includes("_flare=prefetch")).map((url) => url.split("?")[0] ?? "")),
	].sort()

describe.each(ENGINES)("%s", (engine) => {
	it("prefetch", async () => {
		const result = await run(engine, { app: PREFETCH, path: "/", steps: prefetchSteps })
		expect(result.problems).toEqual([])
		const [warm, foreign] = result.record as [{ supports: boolean; links: string[]; imported: string[] }, string[]]
		expect(warm).toEqual(
			warm.supports
				? { supports: true, links: ["/src/shared/router/create-router.ts"], imported: [] }
				: { supports: false, links: [], imported: ["_root_/lazy", "_root_/lazy-linked"] },
		)
		expect(foreign).toEqual([])
		expect(prefetchPaths(result)).toEqual(["/p1", "/p3", "/p4"])
	})

	it("save data", async () => {
		const result = await run(engine, { app: PREFETCH, path: "/", init: saveData, steps: saveDataSteps })
		expect(result.problems).toEqual([])
		expect(result.record).toEqual([
			{ supports: expect.any(Boolean) as boolean, links: [], imported: ["_root_/lazy-linked"] },
		])
	})
})
