import { dirname, resolve } from "node:path"
import type { Page } from "@playwright/test"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { appFrom } from "./harness-app.ts"
import { ENGINES, startHarness, type Harness } from "./hydrate.harness.ts"

// dx/router.md `basePath`: every route is under it, on the client too. Link, `navigate()`, and `setLocale` build their
// URLs under the base, so a client navigation asks for its data under the base and lands there (plan 21 3.7).

let harness: Harness | undefined

beforeAll(async () => {
	harness = await startHarness(resolve(dirname(expect.getState().testPath ?? ""), "../.."))
})

afterAll(async () => {
	await harness?.close()
})

const APP = appFrom(`
const locale = { locales: ["en", "hr"], defaultLocale: "en" }
const c = api.solid.createComponent
const link = (id, to) => c(api.link.Link, { to, id, children: id })
const button = (id, onClick) => c(api.web.Dynamic, { component: "button", id, onClick, children: id })
const Panel = () => {
	const loc = api.i18n.useLocale()
	return [
		link("to-about", "[[locale]]/_root_/about"),
		button("go-home", () => api.active.navigate({ to: "[[locale]]/_root_/home" })),
		button("to-hr", () => loc.setLocale("hr")),
	]
}
const root = api.rootLayout.createRootLayout("[[locale]]/_root_").render((props) =>
	c(api.i18n.LocaleProvider, {
		config: locale,
		get initial() { return props.params.locale },
		get children() {
			return api.h("html", "doc", () => [
				api.h("head", "head"),
				api.h("body", "body", () => [c(Panel, {}), api.h("main", "slot", () => props.children)]),
			])
		},
	}),
)
const page = (name) => api.page.createPage("[[locale]]/_root_/" + name).render(() => name)
const routeTree = ["home", "about"].map((name) => ({
	id: "[[locale]]/_root_/" + name,
	path: "/[[locale]]/" + name,
	module: page(name),
}))
return {
	router: api.router.createRouter({ basePath: "/app", layouts: { "[[locale]]/_root_": root }, routeTree, locale }),
}
`)

// The slot's text once the URL is `path`.
async function landed(tab: Page, path: string, text: string): Promise<void> {
	await tab.waitForFunction(
		([at, want]) => location.pathname === at && document.getElementById("slot")?.textContent === want,
		[path, text],
	)
}

async function steps(tab: Page): Promise<void> {
	await tab.click("#to-about")
	await landed(tab, "/app/about", "about")
	await tab.click("#go-home")
	await landed(tab, "/app/home", "home")
	await tab.click("#to-hr")
	await landed(tab, "/app/hr/home", "home")
}

describe.each(ENGINES)("%s", (engine) => {
	it("base path navigation", async () => {
		if (harness === undefined) throw new Error("the harness did not start")
		const result = await harness.app(engine, { app: APP, path: "/app/home", client() {}, steps })
		expect(result.problems).toEqual([])
		expect(result.requests).toEqual(["/app/about?_flare=data", "/app/home?_flare=data", "/app/hr/home?_flare=data"])
	})
})
