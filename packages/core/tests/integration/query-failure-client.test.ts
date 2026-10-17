import { dirname, resolve } from "node:path"
import type { Page } from "@playwright/test"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { appFrom } from "./harness-app.ts"
import { ENGINES, startHarness, type Harness } from "./hydrate.harness.ts"

// A query that fails on a client navigation, as a server function answering 500 does, then Back: the app keeps
// navigating, and the next page renders its data, not only its static shell (plan 21 12.3, BUGS.md 247).

let harness: Harness | undefined

beforeAll(async () => {
	harness = await startHarness(resolve(dirname(expect.getState().testPath ?? ""), "../.."))
})

afterAll(async () => {
	await harness?.close()
})

const APP = appFrom(`
const c = api.solid.createComponent
const getQueryClient = api.query.createQueryClientGetter()
const link = (id, to) => c(api.link.Link, { to, id, children: id })
const root = api.rootLayout.createRootLayout("_root_").render((props) =>
	c(api.tanstack.QueryClientProvider, {
		client: getQueryClient(),
		get children() {
			return api.h("html", "doc", () => [
				api.h("head", "head"),
				api.h("body", "body", () => [link("to-bad", "_root_/bad"), link("to-good", "_root_/good"), api.h("main", "slot", () => props.children)]),
			])
		},
	}),
)
const home = api.page.createPage("_root_/").render(() => api.h("p", "home", () => "home"))
const bad = api.page.createPage("_root_/bad")
	.render(() => {
		const query = api.query.useSuspenseQuery(() => ({
			queryKey: ["bad"],
			retry: false,
			queryFn: () => Promise.reject(Object.assign(new Error("Internal Server Error"), { status: 500 })),
		}))
		return c(api.solid.Loading, { fallback: "wait", get children() { return api.h("span", "bad-data", () => String(query.data)) } })
	})
	.errorRender(() => api.h("p", "bad-error", () => "bad failed"))
const good = api.page.createPage("_root_/good")
	.loader(() => ({ text: "good data" }))
	.render((props) => api.h("p", "good", () => props.loaderData.text))
const routeTree = [
	{ id: "_root_/", path: "/", module: home },
	{ id: "_root_/bad", path: "/bad", module: bad },
	{ id: "_root_/good", path: "/good", module: good },
]
return { router: api.router.createRouter({ layouts: { _root_: root }, routeTree, prefetch: false }) }
`)

// To the failing page, Back home, then to a page with loader data: what the slot shows at each step.
async function steps(tab: Page): Promise<void> {
	const slot = () => tab.evaluate(() => document.getElementById("slot")?.textContent ?? "")
	const seen: string[] = []
	await tab.click("#to-bad")
	await tab.waitForFunction(() => location.pathname === "/bad")
	await tab.waitForFunction(() => document.getElementById("bad-error") !== null, undefined, { timeout: 10_000 })
	seen.push(await slot())
	await tab.goBack()
	await tab.waitForFunction(() => document.getElementById("home") !== null, undefined, { timeout: 10_000 })
	seen.push(await slot())
	await tab.click("#to-good")
	await tab.waitForFunction(() => document.getElementById("good") !== null, undefined, { timeout: 10_000 })
	seen.push(await slot())
	await tab.evaluate((all) => (Reflect.get(window, "__flareRecord") as unknown[]).push(...all), seen)
}

describe.each(ENGINES)("%s", (engine) => {
	it("navigates after a failed query", async () => {
		if (harness === undefined) throw new Error("the harness did not start")
		const result = await harness.app(engine, { app: APP, path: "/", steps, client() {} })
		expect(result.record).toEqual(["bad failed", "home", "good data"])
	})
})
