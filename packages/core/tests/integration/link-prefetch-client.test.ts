import { dirname, resolve } from "node:path"
import type { Page } from "@playwright/test"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { appFrom } from "./harness-app.ts"
import type { AppCase } from "./hydrate.app.ts"
import { ENGINES, startHarness, type AppResult, type Engine, type Harness } from "./hydrate.harness.ts"

// dx/link.md's prefetch layers in each engine (B96): a real document `createServer(...).fetch` serves, hydrated by the
// real `createClient`. Under a router that turns prefetch off: what warms after load, what each Link asks for when
// hovered or in view, and a nav Link watched on its own URL plus a hash (BUGS.md 305, 309). Under the default router:
// the warm-up's order, links, and skips, and 2G.

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

// A router with `prefetch: false` and a chunk for /lazy, so a warm-up would show. /rt's lazy route prefetches on
// intent; /mi and /di are lazy pages the hovered links ask for modules or data, /vm one a link in view asks for its
// modules; /x is a page a nav Link names.
const LAYERS = appFrom(`
const L = (props) => api.solid.createComponent(api.link.Link, props)
const imported = (route) => { if (typeof window !== "undefined") (window.__flareImported ??= []).push(route) }
const plain = (route) => api.page.createPage(route).loader(() => ({ at: route })).render(() => api.h("main", "page", () => route.slice(6)))
const lazy = (route) => () => { imported(route); return Promise.resolve(plain(route)) }
const root = api.rootLayout.createRootLayout("_root_").render((props) => api.h("html", "doc", () => [
	api.h("head", "head"),
	api.h("body", "body", () => [
		L({ to: "_root_/", id: "home", children: "home" }),
		L({ to: "_root_/lazy", id: "lazy-link", children: "lazy" }),
		L({ to: "_root_/rt", id: "rt", children: "rt" }),
		L({ to: "_root_/rt", id: "rt-off", prefetch: false, children: "rt off" }),
		L({ to: "_root_/rt", id: "rt-disabled", disabled: true, children: "rt disabled" }),
		L({ to: "_root_/mi", id: "mi", prefetch: { modules: "intent" }, children: "mi" }),
		L({ to: "_root_/di", id: "di", prefetch: { data: "intent" }, children: "di" }),
		L({ to: "_root_/vm", id: "vm", prefetch: { modules: "viewport" }, children: "vm" }),
		L({ to: "_root_/x", id: "x-nav", prefetch: "intent", children: "x" }),
		props.children,
	]),
]))
const page = (route, module, client) => ({ id: route, path: route.slice(6) || "/", module, ...(client && { client }) })
const routeTree = [
	page("_root_/", plain("_root_/")),
	page("_root_/lazy", lazy("_root_/lazy")),
	page("_root_/rt", lazy("_root_/rt"), { prefetch: "intent" }),
	page("_root_/mi", lazy("_root_/mi")),
	page("_root_/di", lazy("_root_/di")),
	page("_root_/vm", lazy("_root_/vm")),
	page("_root_/x", plain("_root_/x")),
]
const chunks = { "_root_/lazy": "/src/shared/router/create-router.ts" }
return { router: api.router.createRouter({ layouts: { _root_: root }, routeTree, chunks, prefetch: false }) }
`)

async function remember(tab: Page, value: unknown): Promise<void> {
	await tab.evaluate((item) => (Reflect.get(window, "__flareRecord") as unknown[]).push(item), value)
}

async function prefetches(tab: Page): Promise<number> {
	return tab.evaluate(
		() => performance.getEntriesByType("resource").filter((entry) => entry.name.includes("_flare=prefetch")).length,
	)
}

async function imports(tab: Page): Promise<string[]> {
	return tab.evaluate(() => [...((Reflect.get(window, "__flareImported") as string[] | undefined) ?? [])].sort())
}

// Past load and idle: nothing warmed, and `{ modules: "viewport" }` imported /vm, in view, with no data request. Then
// the hovered links by their layer: the link's `false` and `disabled` over the route's intent ask for nothing, the
// route's intent prefetches /rt, `{ modules: "intent" }` imports /mi with no data request, and `{ data: "intent" }`
// prefetches /di's data, which loads its module too.
async function layerSteps(tab: Page): Promise<void> {
	await tab.waitForSelector("html[data-flare-hydrated]", { state: "attached" })
	await tab.waitForFunction(() =>
		(Reflect.get(window, "__flareImported") as string[] | undefined)?.includes("_root_/vm"),
	)
	await tab.waitForTimeout(1500)
	const links = await tab.evaluate(() => document.querySelectorAll('link[rel="prefetch"]').length)
	await remember(tab, { links, imported: await imports(tab) })
	await tab.hover("#rt-off")
	await tab.hover("#rt-disabled")
	await tab.waitForTimeout(300)
	await remember(tab, { imported: await imports(tab), prefetches: await prefetches(tab) })
	await Promise.all([
		tab.waitForResponse((response) => response.url().includes("/rt?_flare=prefetch")),
		tab.hover("#rt"),
	])
	await tab.hover("#mi")
	await tab.waitForFunction(() =>
		(Reflect.get(window, "__flareImported") as string[] | undefined)?.includes("_root_/mi"),
	)
	await Promise.all([
		tab.waitForResponse((response) => response.url().includes("/di?_flare=prefetch")),
		tab.hover("#di"),
	])
	await remember(tab, await imports(tab))
}

// Opened on /x#part, the nav Link to /x is a hash move; after a client navigation home, a hover prefetches /x.
async function hashSteps(tab: Page): Promise<void> {
	await tab.waitForSelector("html[data-flare-hydrated]", { state: "attached" })
	await tab.hover("#x-nav")
	await tab.waitForTimeout(300)
	// The pointer leaves the link for home, so the next hover enters it again.
	await tab.click("#home")
	await tab.waitForFunction(() => location.pathname === "/" && document.getElementById("page")?.textContent === "/")
	await Promise.all([
		tab.waitForResponse((response) => response.url().includes("/x?_flare=prefetch")),
		tab.hover("#x-nav"),
	])
}

// The default router, opened on lazy /lazy. Its chunks and /other's share fold.ts, as a production bundle's shared
// chunk; /rd is a page a Link prefetches on render, and the link to /other has no prefetch of its own.
const WARM = appFrom(`
const L = (props) => api.solid.createComponent(api.link.Link, props)
const imported = (route) => { if (typeof window !== "undefined") (window.__flareImported ??= []).push(route) }
const plain = (route) => api.page.createPage(route).loader(() => ({ at: route })).render(() => api.h("main", "page", () => route.slice(6)))
const lazy = (route) => () => { imported(route); return Promise.resolve(plain(route)) }
const root = api.rootLayout.createRootLayout("_root_").render((props) => api.h("html", "doc", () => [
	api.h("head", "head"),
	api.h("body", "body", () => [
		L({ to: "_root_/other", id: "other", children: "other" }),
		L({ to: "_root_/rd", id: "rd", prefetch: "render", children: "rd" }),
		props.children,
	]),
]))
const page = (route, module) => ({ id: route, path: route.slice(6) || "/", module })
const routeTree = [page("_root_/lazy", lazy("_root_/lazy")), page("_root_/other", lazy("_root_/other")), page("_root_/rd", plain("_root_/rd"))]
const dir = "/src/shared/router/"
const chunks = { "_root_/lazy": [dir + "create-router.ts", dir + "fold.ts"], "_root_/other": [dir + "load-chain.ts", dir + "fold.ts"] }
return { router: api.router.createRouter({ layouts: { _root_: root }, routeTree, chunks }) }
`)

// An image that answers after 1.5 s holds the window's load event; the page records what the warm-up had added when
// it fired.
async function heldLoad(tab: Page): Promise<void> {
	await tab.route("**/held.gif", async (route) => {
		await new Promise((done) => setTimeout(done, 1500))
		await route.fulfill({ status: 204 })
	})
	await tab.addInitScript(() => {
		new Image().src = "/held.gif"
		addEventListener("load", () => {
			const links = document.querySelectorAll('link[rel="prefetch"]').length
			const imported = ((Reflect.get(window, "__flareImported") as string[] | undefined) ?? []).length
			Reflect.set(window, "__flareAtLoad", { links, imported, late: performance.now() > 1400 })
		})
	})
}

async function slow(tab: Page): Promise<void> {
	await tab.addInitScript(() => {
		Object.defineProperty(Navigator.prototype, "connection", {
			configurable: true,
			get: () => ({ effectiveType: "2g" }),
		})
	})
}

// After load and idle: the prefetch links with their attributes, any modulepreload, and the modules imported.
async function warmSteps(tab: Page): Promise<void> {
	await tab.waitForFunction(
		() =>
			document.querySelector('link[rel="prefetch"]') !== null ||
			(Reflect.get(window, "__flareImported") as string[] | undefined)?.includes("_root_/other"),
	)
	await tab.waitForTimeout(300)
	await remember(
		tab,
		await tab.evaluate(() => ({
			atLoad: Reflect.get(window, "__flareAtLoad") as unknown,
			supports: document.createElement("link").relList.supports("prefetch"),
			links: [...document.querySelectorAll('link[rel="prefetch"]')].map((link) =>
				Object.fromEntries(["rel", "as", "crossorigin", "href"].map((name) => [name, link.getAttribute(name)])),
			),
			preloads: document.querySelectorAll('link[rel="modulepreload"][href*="/src/shared/router/"]').length,
			imported: [...((Reflect.get(window, "__flareImported") as string[] | undefined) ?? [])].sort(),
		})),
	)
}

const LINK = { rel: "prefetch", as: "script", crossorigin: "" }

const prefetched = (result: AppResult): string[] =>
	result.requests.filter((url) => url.includes("_flare=prefetch")).map((url) => url.split("?")[0] ?? "")

describe.each(ENGINES)("%s", (engine) => {
	it("router prefetch off", async () => {
		const result = await run(engine, { app: LAYERS, path: "/", steps: layerSteps })
		expect(result.problems).toEqual([])
		expect(result.record).toEqual([
			{ links: 0, imported: ["_root_/vm"] },
			{ imported: ["_root_/vm"], prefetches: 0 },
			["_root_/di", "_root_/mi", "_root_/rt", "_root_/vm"],
		])
		expect([...new Set(prefetched(result))].sort()).toEqual(["/di", "/rt"])
	})

	it("hash on screen, then another page", async () => {
		const result = await run(engine, { app: LAYERS, path: "/x#part", steps: hashSteps })
		expect(result.problems).toEqual([])
		expect(prefetched(result)).toEqual(["/x"])
	})

	// The warm-up waits for load, then idle: when the held load fired, nothing was added. Then rel=prefetch links carry
	// `as="script"` and `crossorigin` and name only /other's own file, since /lazy loaded fold.ts too, with no
	// modulepreload; an engine without rel=prefetch imports /other instead. The render link prefetched /rd.
	it("warm after load", async () => {
		const result = await run(engine, { app: WARM, path: "/lazy", init: heldLoad, steps: warmSteps })
		expect(result.problems).toEqual([])
		const [warm] = result.record as [{ supports: boolean }]
		const atLoad = { links: 0, imported: 1, late: true }
		const own = { ...LINK, href: "/src/shared/router/load-chain.ts" }
		expect(warm).toEqual(
			warm.supports
				? { atLoad, supports: true, links: [own], preloads: 0, imported: ["_root_/lazy"] }
				: { atLoad, supports: false, links: [], preloads: 0, imported: ["_root_/lazy", "_root_/other"] },
		)
		expect(prefetched(result)).toEqual(["/rd"])
	})

	// On 2G nothing warms; the link in view imports /other's modules instead.
	it("2g", async () => {
		const result = await run(engine, { app: WARM, path: "/lazy", init: slow, steps: warmSteps })
		expect(result.problems).toEqual([])
		expect(result.record).toEqual([
			{ supports: expect.any(Boolean) as boolean, links: [], preloads: 0, imported: ["_root_/lazy", "_root_/other"] },
		])
	})
})
