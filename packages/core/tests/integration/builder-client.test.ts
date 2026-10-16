import { dirname, resolve } from "node:path"
import type { Page } from "@playwright/test"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { appFrom } from "./harness-app.ts"
import { ENGINES, startHarness, type Api, type AppResult, type Engine, type Harness } from "./hydrate.harness.ts"

// dx/builder.md's client rows: a real document `createServer(...).fetch` serves, hydrated by the real `createClient`
// in each engine (hydrate.app.ts), navigated by clicking real anchors (B96).

let harness: Harness | undefined

beforeAll(async () => {
	harness = await startHarness(resolve(dirname(expect.getState().testPath ?? ""), "../.."))
}, 60_000)

afterAll(async () => {
	await harness?.close()
})

type Visit = { app: (api: Api) => { router: unknown }; path: string; steps: (tab: Page) => Promise<void> }

function run(engine: Engine, visit: Visit): Promise<AppResult> {
	if (harness === undefined) throw new Error("the harness did not start")
	return harness.app(engine, { ...visit, client() {} })
}

// What the page reported besides the named failure's own 404: Chromium and WebKit log every 4xx response as a console
// error, Firefox does not, and these cases answer one on purpose (decision B132).
function besidesNotFound(problems: readonly string[]): string[] {
	return problems.filter(
		(problem) => problem !== "Failed to load resource: the server responded with a status of 404 (Not Found)",
	)
}

async function remember(tab: Page, value: unknown): Promise<void> {
	await tab.evaluate((item) => (Reflect.get(window, "__flareRecord") as unknown[]).push(item), value)
}

// A root whose own loader throws notFound() on /broken, over / and /broken, with an anchor to /broken.
const ROOT_FAILURE = appFrom(`
const root = api.rootLayout.createRootLayout("_root_")
	.loader(({ request }) => { if (new URL(request.url).pathname === "/broken") throw api.errors.notFound() })
	.render((props) => api.h("html", "doc", () => [
		api.h("head", "head"),
		api.h("body", "body", () => [
			api.solid.createComponent(api.web.Dynamic, { component: "a", href: "/broken", id: "to-broken", children: "broken" }),
			props.children,
		]),
	]))
const page = (id, path) => ({
	id,
	path,
	module: api.page.createPage(id).render(() => api.solid.createComponent(api.web.Dynamic, { component: "main", id: "page", children: path })),
})
return { router: api.router.createRouter({ layouts: { _root_: root }, routeTree: [page("_root_/", "/"), page("_root_/broken", "/broken")] }) }
`)

// After a navigation into a failed root, the page is one standards-mode document whose body is the built-in div: the
// client cannot swap the document in place, so it loads the URL, and the server answers its minimal document.
async function brokenSteps(tab: Page): Promise<void> {
	await Promise.all([tab.waitForEvent("load"), tab.evaluate(() => document.getElementById("to-broken")?.click())])
	await tab.waitForFunction(() => document.body?.textContent?.includes("Page not found") === true)
	await remember(
		tab,
		await tab.evaluate(() => ({
			compatMode: document.compatMode,
			body: document.body.innerHTML
				.replace(/<!--.*?-->/g, "")
				.replace(/<script[^>]*>.*?<\/script>/gs, "")
				.replace(/ _hk="\w+"/g, ""),
			documents: document.getElementsByTagName("html").length,
			path: location.pathname,
		})),
	)
}

// A root, a layout `(area)` whose loader throws notFound() on /gone-layout, and pages under it: /home, /gone-page whose
// loader throws notFound() with its own notFoundRender, and /gone-layout. Anchors to both.
const NAMED_FAILURES = appFrom(`
const anchor = (to) => api.solid.createComponent(api.web.Dynamic, { component: "a", href: to, id: "to-" + to.slice(1), children: to })
const root = api.rootLayout.createRootLayout("_root_").render((props) => api.h("html", "doc", () => [
	api.h("head", "head"),
	api.h("body", "body", () => [anchor("/gone-page"), anchor("/gone-layout"), api.h("main", "slot", () => ["root[", props.children, "]"])]),
]))
const area = api.layout.createLayout("_root_/(area)")
	.loader(({ request }) => {
		if (new URL(request.url).pathname === "/gone-layout") throw api.errors.notFound()
		return {}
	})
	.render((props) => ["area[", props.children, "]"])
	.notFoundRender(() => "area missing")
const page = (id, path, extra) => ({ id, path, module: extra(api.page.createPage(id)) })
const routeTree = [
	page("_root_/(area)/home", "/home", (p) => p.render(() => "home")),
	page("_root_/(area)/gone-page", "/gone-page", (p) =>
		p.loader(() => { throw api.errors.notFound() }).render(() => "never").notFoundRender(() => "page missing")),
	page("_root_/(area)/gone-layout", "/gone-layout", (p) => p.render(() => "never")),
]
return { router: api.router.createRouter({ layouts: { _root_: root, "_root_/(area)": area }, routeTree }) }
`)

// A click to `to`, then what the root's slot shows once it changed.
function failedSteps(to: string): (tab: Page) => Promise<void> {
	return async (tab) => {
		await tab.evaluate((id) => document.getElementById(id)?.click(), `to-${to.slice(1)}`)
		await tab.waitForFunction(
			(path) => location.pathname === path && !document.getElementById("slot")?.textContent?.includes("home"),
			to,
		)
		await tab.waitForFunction(() => document.getElementById("slot")?.textContent?.includes("missing") === true)
		await remember(tab, await tab.evaluate(() => document.getElementById("slot")?.textContent))
	}
}

// A layout with a description over /merged and /replaced, whose head replaces the whole head, with anchors to both.
const HEADS = appFrom(`
const anchor = (to) => api.solid.createComponent(api.web.Dynamic, { component: "a", href: to, id: "to-" + to.slice(1), children: to })
const root = api.rootLayout.createRootLayout("_root_").render((props) => api.h("html", "doc", () => [
	api.h("head", "head"),
	api.h("body", "body", () => [anchor("/merged"), anchor("/replaced"), props.children]),
]))
const area = api.layout.createLayout("_root_/(area)")
	.head(() => ({ title: "Area", description: "area description" }))
	.render((props) => props.children)
const merged = api.page.createPage("_root_/(area)/merged").head(() => ({ title: "Merged" })).render(() => "merged")
const replaced = api.page.createPage("_root_/(area)/replaced")
	.head(() => ({ title: "Replaced" }), { replace: true })
	.render(() => "replaced")
const routeTree = [
	{ id: "_root_/(area)/merged", path: "/merged", module: merged },
	{ id: "_root_/(area)/replaced", path: "/replaced", module: replaced },
]
return { router: api.router.createRouter({ layouts: { _root_: root, "_root_/(area)": area }, routeTree }) }
`)

// The title and whether the layout's description is in the head, once the title reads `title`.
async function headOf(tab: Page, title: string): Promise<{ title: string; description: boolean }> {
	await tab.waitForFunction((want) => document.title === want, title)
	return tab.evaluate(() => ({
		title: document.title,
		description: document.querySelector('meta[name="description"]') !== null,
	}))
}

// Hydrated on /replaced, the head is the route's alone; a navigation to /merged merges again, and back to /replaced
// replaces again (dx/head.md).
async function headSteps(tab: Page): Promise<void> {
	await remember(tab, await headOf(tab, "Replaced"))
	await tab.evaluate(() => document.getElementById("to-merged")?.click())
	await remember(tab, await headOf(tab, "Merged"))
	await tab.evaluate(() => document.getElementById("to-replaced")?.click())
	await remember(tab, await headOf(tab, "Replaced"))
}

// A root whose layout holds an InterceptOutlet, over /gallery and /photo, which /gallery intercepts as "modal".
const INTERCEPT = appFrom(`
const anchor = (to) => api.solid.createComponent(api.web.Dynamic, { component: "a", href: to, id: "to-" + to.slice(1), children: to })
const root = api.rootLayout.createRootLayout("_root_").render((props) => api.h("html", "doc", () => [
	api.h("head", "head"),
	api.h("body", "body", () => [
		api.h("main", "slot", () => props.children),
		api.solid.createComponent(api.intercept.InterceptOutlet, {
			children: (state) => api.h("aside", "overlay", () => [state.render, " ", state.match.render()]),
		}),
	]),
]))
const gallery = api.page.createPage("_root_/gallery").render(() => api.h("section", "gallery", () => ["gallery ", anchor("/photo")]))
const photo = api.page.createPage("_root_/photo").intercept({ from: ["_root_/gallery"], render: "modal" }).render(() => "photo")
const routeTree = [
	{ id: "_root_/gallery", path: "/gallery", module: gallery },
	{ id: "_root_/photo", path: "/photo", module: photo },
]
return { router: api.router.createRouter({ layouts: { _root_: root }, routeTree }) }
`)

// The overlay and the slot as text, and whether the gallery section is still the node the document hydrated.
async function interceptSteps(tab: Page): Promise<void> {
	await tab.evaluate(() => Reflect.set(document.getElementById("gallery") ?? {}, "kept", true))
	await tab.evaluate(() => document.getElementById("to-photo")?.click())
	await tab.waitForFunction(() => document.getElementById("overlay")?.textContent?.includes("photo") === true)
	await remember(
		tab,
		await tab.evaluate(() => ({
			path: location.pathname,
			overlay: document.getElementById("overlay")?.textContent,
			slot: document.getElementById("slot")?.textContent,
			kept: Reflect.get(document.getElementById("gallery") ?? {}, "kept") === true,
		})),
	)
}

// What a direct visit shows: the page in the slot and no overlay.
async function directSteps(tab: Page): Promise<void> {
	await remember(
		tab,
		await tab.evaluate(() => ({
			overlay: document.getElementById("overlay") !== null,
			slot: document.getElementById("slot")?.textContent,
		})),
	)
}

// /flaky's loader fails on every odd run; its errorRender's button calls reset().
const RESET = appFrom(`
const root = api.rootLayout.createRootLayout("_root_").render((props) => api.h("html", "doc", () => [
	api.h("head", "head"),
	api.h("body", "body", () => [api.h("main", "slot", () => props.children)]),
]))
const flaky = api.page.createPage("_root_/flaky")
	.loader(() => {
		globalThis.__flareFlakyRuns = (globalThis.__flareFlakyRuns ?? 0) + 1
		if (globalThis.__flareFlakyRuns % 2 === 1) throw new Error("flaky")
		return { text: "loaded" }
	})
	.render((props) => props.loaderData.text)
	.errorRender((props) => api.solid.createComponent(api.web.Dynamic, { component: "button", id: "reset", onClick: () => props.reset(), children: "reset" }))
return { router: api.router.createRouter({ layouts: { _root_: root }, routeTree: [{ id: "_root_/flaky", path: "/flaky", module: flaky }] }) }
`)

// reset() reruns the loader on the same URL and pushes no history entry.
async function resetSteps(tab: Page): Promise<void> {
	await tab.waitForFunction(() => document.getElementById("reset") !== null)
	const entries = await tab.evaluate(() => history.length)
	await tab.evaluate(() => document.getElementById("reset")?.click())
	await tab.waitForFunction(() => document.getElementById("slot")?.textContent === "loaded")
	await remember(
		tab,
		await tab.evaluate(
			(before) => ({ path: location.href.replace(location.origin, ""), pushed: history.length - before }),
			entries,
		),
	)
}

describe.each(ENGINES)("%s", { timeout: 60_000 }, (engine) => {
	// `.head(fn, { replace: true })` makes the route's object the whole head through hydration and client navigations.
	it("head replace", async () => {
		const result = await run(engine, { app: HEADS, path: "/replaced", steps: headSteps })
		expect(result.problems).toEqual([])
		expect(result.record).toEqual([
			{ title: "Replaced", description: false },
			{ title: "Merged", description: true },
			{ title: "Replaced", description: false },
		])
	})

	// A page loader's notFound() on a client navigation paints the walked notFoundRender, the page's own, in its slot
	// (BUGS.md 134): a bare 404 is a not-found, not a 500.
	it("page not found navigation", async () => {
		const result = await run(engine, { app: NAMED_FAILURES, path: "/home", steps: failedSteps("/gone-page") })
		expect(besidesNotFound(result.problems)).toEqual([])
		expect(result.record).toEqual(["root[area[page missing]]"])
	})

	// A layout loader's notFound() paints at that layout: its own notFoundRender in its slot, so the layout's chrome is
	// gone and the root's stays (B77, BUGS.md 134). The answer names the failed match in `flare-failed`.
	it("layout not found navigation", async () => {
		const result = await run(engine, { app: NAMED_FAILURES, path: "/home", steps: failedSteps("/gone-layout") })
		expect(besidesNotFound(result.problems)).toEqual([])
		expect(result.record).toEqual(["root[area missing]"])
	})

	// A client navigation into a root whose loader failed paints the built-in div as the body of a standards-mode
	// document (B77, BUGS.md 134).
	it("root failure navigation", async () => {
		const result = await run(engine, { app: ROOT_FAILURE, path: "/", steps: brokenSteps })
		expect(besidesNotFound(result.problems)).toEqual([])
		expect(result.record).toEqual([
			{ compatMode: "CSS1Compat", body: "<div>Page not found</div>", documents: 1, path: "/broken" },
		])
	})

	// A client navigation from a `from` route opens the InterceptOutlet over the mounted background; a direct visit
	// renders the page.
	it("intercept", async () => {
		const opened = await run(engine, { app: INTERCEPT, path: "/gallery", steps: interceptSteps })
		expect(opened.problems).toEqual([])
		expect(opened.record).toEqual([{ path: "/photo", overlay: "modal photo", slot: "gallery /photo", kept: true }])
		const direct = await run(engine, { app: INTERCEPT, path: "/photo", steps: directSteps })
		expect(direct.record).toEqual([{ overlay: false, slot: "photo" }])
	})

	// `reset()` on errorRender revalidates the current URL in place: the loader runs again and nothing is pushed.
	it("errorRender reset", async () => {
		const result = await run(engine, { app: RESET, path: "/flaky?q=1", steps: resetSteps })
		expect(result.record).toEqual([{ path: "/flaky?q=1", pushed: 0 }])
	})
})
