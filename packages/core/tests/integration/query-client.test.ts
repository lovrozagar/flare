import { dirname, resolve } from "node:path"
import type { Page } from "@playwright/test"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { appFrom } from "./harness-app.ts"
import type { AppResult } from "./hydrate.app.ts"
import { ENGINES, startHarness, type Engine, type Harness } from "./hydrate.harness.ts"

// B134 in the browser: a loader's `ctx.queryClient` prefetch reaches the client on a client navigation, in the data
// answer's `q` frame, so the page's `useSuspenseQuery` paints the server's result and the query never runs in the
// browser, whether the click fetches the page or takes a hovered prefetch (plan 21 3.15).

let harness: Harness | undefined

beforeAll(async () => {
	harness = await startHarness(resolve(dirname(expect.getState().testPath ?? ""), "../.."))
})

afterAll(async () => {
	await harness?.close()
})

// The query function counts its runs on the side that runs it, and names that side in its result.
const APP = appFrom(`
const c = api.solid.createComponent
const getQueryClient = api.query.createQueryClientGetter()
const greeting = () => ({
	queryKey: ["greeting"],
	staleTime: 60000,
	queryFn: async () => {
		const runs = (globalThis.__flareQueryRuns ?? 0) + 1
		globalThis.__flareQueryRuns = runs
		return (typeof window === "undefined" ? "server " : "client ") + runs
	},
})
const link = (id, to, prefetch) => c(api.link.Link, { to, id, children: id, prefetch })
const root = api.rootLayout.createRootLayout("_root_").render((props) =>
	c(api.tanstack.QueryClientProvider, {
		client: getQueryClient(),
		get children() {
			return api.h("html", "doc", () => [
				api.h("head", "head"),
				api.h("body", "body", () => [
					link("to-q", "_root_/q", "intent"),
					link("plain-q", "_root_/q", false),
					api.h("main", "slot", () => props.children),
				]),
			])
		},
	}),
)
const home = api.page.createPage("_root_/").render(() => "home")
const q = api.page.createPage("_root_/q")
	.loader(async (ctx) => {
		await ctx.queryClient.prefetchQuery(greeting())
		return {}
	})
	.render(() => {
		const query = api.query.useSuspenseQuery(() => greeting())
		return c(api.solid.Loading, { fallback: "wait", get children() { return api.h("span", "greeting", () => String(query.data)) } })
	})
const routeTree = [
	{ id: "_root_/", path: "/", module: home },
	{ id: "_root_/q", path: "/q", module: q },
]
return { router: api.router.createRouter({ layouts: { _root_: root }, routeTree, prefetch: false }) }
`)

// After the step, the greeting on screen and the query's runs in the browser.
async function greeted(tab: Page): Promise<void> {
	await tab.waitForFunction(() => /server \d+/.test(document.getElementById("greeting")?.textContent ?? ""))
	await new Promise((resolve) => setTimeout(resolve, 100))
	await tab.evaluate(() => {
		const record = Reflect.get(window, "__flareRecord") as unknown[]
		record.push(document.getElementById("greeting")?.textContent, Reflect.get(globalThis, "__flareQueryRuns") ?? 0)
	})
}

async function clicked(tab: Page): Promise<void> {
	await tab.click("#plain-q")
	await greeted(tab)
}

async function hovered(tab: Page): Promise<void> {
	await Promise.all([
		tab.waitForResponse((response) => response.url().includes("_flare=prefetch"), { timeout: 5000 }),
		tab.hover("#to-q"),
	])
	await tab.click("#to-q")
	await greeted(tab)
}

function run(engine: Engine, steps: (tab: Page) => Promise<void>): Promise<AppResult> {
	if (harness === undefined) throw new Error("the harness did not start")
	return harness.app(engine, { app: APP, path: "/", client() {}, steps })
}

const kinds = (result: AppResult) => result.requests.map((url) => /_flare=(\w+)/.exec(url)?.[1])

describe.each(ENGINES)("%s", (engine) => {
	it("click navigation", async () => {
		const result = await run(engine, clicked)
		expect(result.problems).toEqual([])
		expect(result.record).toEqual([expect.stringMatching(/^server \d+$/), 0])
		expect(kinds(result)).toEqual(["data"])
	})

	it("hover then click", async () => {
		const result = await run(engine, hovered)
		expect(result.problems).toEqual([])
		expect(result.record).toEqual([expect.stringMatching(/^server \d+$/), 0])
		expect(kinds(result)).toEqual(["prefetch"])
	})
})
