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

describe.each(ENGINES)("%s", { timeout: 60_000 }, (engine) => {
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
})
