import { dirname, resolve } from "node:path"
import type { Page } from "@playwright/test"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { appFrom } from "./harness-app.ts"
import { ENGINES, startHarness, type Harness } from "./hydrate.harness.ts"

// An open overlay through the real createServer and createClient (B96): a navigation inside it with `replace` replaces
// the overlay entry, so one Back closes it, however many searches it held (plan 21 13.12, BUGS.md 214). The keyboard
// opens it, stays in it, and closes it with Escape (plan 21 4.1, B142). The child reads every field the outlet hands it.

let harness: Harness | undefined

beforeAll(async () => {
	harness = await startHarness(resolve(dirname(expect.getState().testPath ?? ""), "../.."))
})

afterAll(async () => {
	await harness?.close()
})

const APP = appFrom(`
const anchor = (to) => api.solid.createComponent(api.web.Dynamic, { component: "a", href: to, id: "to-" + to.slice(1), children: to })
const root = api.rootLayout.createRootLayout("_root_").render((props) => api.h("html", "doc", () => [
	api.h("head", "head"),
	api.h("body", "body", () => [
		api.h("main", "slot", () => props.children),
		api.solid.createComponent(api.intercept.InterceptOutlet, {
			children: (state) => api.h("aside", "overlay", () => state.match.render()),
		}),
	]),
]))
const gallery = api.page.createPage("_root_/gallery").render(() => api.h("section", "gallery", () => ["gallery ", anchor("/photo")]))
const photo = api.page.createPage("_root_/photo")
	.intercept({ from: ["_root_/gallery"], render: "modal" })
	.input({ searchParams: (raw) => ({ n: typeof raw.n === "string" ? raw.n : "1" }) })
	.render((props) => {
		const navigate = api.outletNodes.useNavigate()
		const next = () => navigate({ to: "_root_/photo", search: { n: String(Number(props.search.n) + 1) }, replace: true })
		return api.h("p", "photo", () => ["photo ", props.search.n, " ", api.solid.createComponent(api.web.Dynamic, { component: "button", id: "next", onClick: next, children: "next" })])
	})
const routeTree = [
	{ id: "_root_/gallery", path: "/gallery", module: gallery },
	{ id: "_root_/photo", path: "/photo", module: photo },
]
return { router: api.router.createRouter({ layouts: { _root_: root }, routeTree }) }
`)

async function overlayShows(tab: Page, text: string): Promise<void> {
	await tab.waitForFunction((want) => document.getElementById("overlay")?.textContent?.includes(want) === true, text)
}

// Open, search twice inside, then one Back.
async function steps(tab: Page): Promise<void> {
	await tab.evaluate(() => document.getElementById("to-photo")?.click())
	await overlayShows(tab, "photo 1")
	await tab.evaluate(() => document.getElementById("next")?.click())
	await overlayShows(tab, "photo 2")
	await tab.evaluate(() => document.getElementById("next")?.click())
	await overlayShows(tab, "photo 3")
	await tab.goBack()
	await new Promise((resolve) => setTimeout(resolve, 300))
	await tab.evaluate(() => {
		const shown = { path: location.pathname + location.search, overlay: document.getElementById("overlay") !== null }
		;(Reflect.get(window, "__flareRecord") as unknown[]).push(shown)
	})
}

// From the keyboard: Enter on the link opens the overlay with focus on its button, Tab stays inside, Escape closes it,
// and focus is back on the link.
async function keyboard(tab: Page): Promise<void> {
	const active = () => tab.evaluate(() => document.activeElement?.id ?? "")
	const seen: unknown[] = []
	await tab.focus("#to-photo")
	await tab.keyboard.press("Enter")
	await overlayShows(tab, "photo 1")
	await tab.waitForFunction(() => document.activeElement?.id === "next")
	seen.push(await active())
	await tab.keyboard.press("Tab")
	seen.push(await active())
	await tab.keyboard.press("Escape")
	await tab.waitForFunction(() => document.getElementById("overlay") === null && location.pathname === "/gallery")
	await tab.waitForFunction(() => document.activeElement?.id === "to-photo")
	seen.push(await active())
	await tab.evaluate((all) => (Reflect.get(window, "__flareRecord") as unknown[]).push(...all), seen)
}

// /cards/[id] opened over /shelf: the child shows every field the outlet hands it, the page's loader data through
// `match`, and a button that calls `dismiss()`.
const FIELDS = appFrom(`
const root = api.rootLayout.createRootLayout("_root_").render((props) => api.h("html", "doc", () => [
	api.h("head", "head"),
	api.h("body", "body", () => [
		api.solid.createComponent(api.link.Link, { to: "_root_/cards/[id]", params: { id: "4" }, search: { side: "back" }, id: "to-card", children: "card" }),
		api.h("main", "slot", () => props.children),
		api.solid.createComponent(api.intercept.InterceptOutlet, {
			children: (state) => api.h("aside", "overlay", () => [
				api.h("p", "fields", () => JSON.stringify({
					render: state.render, params: state.params, search: state.search,
					background: state.backgroundLocation, data: state.match.loaderData,
				})),
				api.h("div", "card-page", () => state.match.render()),
				api.solid.createComponent(api.web.Dynamic, { component: "button", id: "dismiss", onClick: () => state.dismiss(), children: "close" }),
			]),
		}),
	]),
]))
const shelf = api.page.createPage("_root_/shelf").render(() => api.h("section", "shelf", () => "shelf"))
const card = api.page.createPage("_root_/cards/[id]")
	.intercept({ from: ["_root_/shelf"], render: "sheet" })
	.loader((ctx) => ({ card: ctx.params.id }))
	.render((props) => api.h("p", "card", () => "card " + props.params.id))
const routeTree = [
	{ id: "_root_/shelf", path: "/shelf", module: shelf },
	{ id: "_root_/cards/[id]", path: "/cards/[id]", module: card },
]
return { router: api.router.createRouter({ layouts: { _root_: root }, routeTree, prefetch: false }) }
`)

// Open the card over the shelf, read the fields and the page it renders, then close it through `dismiss()`.
async function fieldSteps(tab: Page): Promise<void> {
	await tab.waitForSelector("html[data-flare-hydrated]", { state: "attached" })
	await tab.evaluate(() => document.getElementById("to-card")?.click())
	await tab.waitForFunction(() => document.getElementById("card")?.textContent === "card 4")
	const shown = await tab.evaluate(() => ({
		url: location.pathname + location.search,
		fields: JSON.parse(document.getElementById("fields")?.textContent ?? "null") as unknown,
		under: document.getElementById("shelf") !== null,
	}))
	await tab.evaluate(() => document.getElementById("dismiss")?.click())
	await tab.waitForFunction(() => document.getElementById("overlay") === null && location.pathname === "/shelf")
	await tab.evaluate((seen) => (Reflect.get(window, "__flareRecord") as unknown[]).push(seen), shown)
}

describe.each(ENGINES)("%s", (engine) => {
	// The child's fields: its label, the overlay page's params, search, and loader data, and the page underneath; the
	// page renders through `match.render()`; `dismiss()` goes Back and closes it (dx/navigate.md InterceptOutlet).
	it("overlay fields", async () => {
		if (harness === undefined) throw new Error("the harness did not start")
		const result = await harness.app(engine, { app: FIELDS, path: "/shelf", client() {}, steps: fieldSteps })
		expect(result.problems).toEqual([])
		expect(result.record).toEqual([
			{
				url: "/cards/4?side=back",
				fields: {
					render: "sheet",
					params: { id: "4" },
					search: { side: "back" },
					background: { pathname: "/shelf", search: "", hash: "", params: {} },
					data: { card: "4" },
				},
				under: true,
			},
		])
	})

	it("overlay keyboard", async () => {
		if (harness === undefined) throw new Error("the harness did not start")
		const result = await harness.app(engine, { app: APP, path: "/gallery", client() {}, steps: keyboard })
		expect(result.problems).toEqual([])
		expect(result.record).toEqual(["next", "next", "to-photo"])
	})

	it("replace inside an overlay", async () => {
		if (harness === undefined) throw new Error("the harness did not start")
		const result = await harness.app(engine, { app: APP, path: "/gallery", client() {}, steps })
		expect(result.problems).toEqual([])
		expect(result.record).toEqual([{ path: "/gallery", overlay: false }])
	})
})
