import { dirname, resolve } from "node:path"
import type { Page } from "@playwright/test"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { appFrom } from "./harness-app.ts"
import type { AppCase } from "./hydrate.app.ts"
import { ENGINES, startHarness, type AppResult, type Engine, type Harness } from "./hydrate.harness.ts"

// dx/cache.md's `client` rows: a route's own `cache.client` in the browser, through the hydrate harness with the real
// createServer and createClient (B96). The page's clock is moved with Playwright's `clock.setFixedTime`, so an age
// passes with no real wait. Each loader returns how many times the server ran it.

let harness: Harness | undefined

beforeAll(async () => {
	harness = await startHarness(resolve(dirname(expect.getState().testPath ?? ""), "../.."))
}, 60_000)

afterAll(async () => {
	await harness?.close()
})

// The page's own clock, installed before it loads so the client's captured `Date.now` is the controlled one, and left
// to run as the real one does until a case moves it.
async function clocked(tab: Page): Promise<void> {
	await tab.clock.install()
	await tab.clock.resume()
}

function run(engine: Engine, visit: Pick<AppCase, "app" | "path" | "steps">): Promise<AppResult> {
	if (harness === undefined) throw new Error("the harness did not start")
	return harness.app(engine, { ...visit, init: clocked, client() {} })
}

const APP = appFrom(`
const id = (to) => "to" + to.replace(/\\W/g, "-")
// A Link by route id: only one names a route, so only one prefetches.
const anchor = (to) => api.solid.createComponent(api.link.Link, { to: "_root_" + to, id: id(to), children: to })
const paths = ["/away", "/kept", "/swept", "/soon", "/brief", "/filled", "/holed"]
const root = api.rootLayout.createRootLayout("_root_").render((props) => api.h("html", "doc", () => [
	api.h("head", "head"),
	api.h("body", "body", () => [...paths.map(anchor), api.h("main", "slot", () => props.children)]),
]))
const count = (key) => (globalThis[key] = (globalThis[key] ?? 0) + 1)
const text = (props) => api.h("span", "text", () => props.loaderData.text)
const counted = (route, client) => api.page.createPage(route)
	.cache({ client })
	.loader(() => ({ text: "run " + count("__flareClient" + route) }))
	.render(text)
const deferring = (route, cacheDeferred) => api.page.createPage(route)
	.cache({ client: { staleTime: "10m", cacheDeferred } })
	.loader(({ defer }) => ({
		text: "run " + count("__flareClient" + route),
		late: defer(() => new Promise((resolve) => setTimeout(() => resolve("late"), 10))),
	}))
	.render((props) => {
		const late = api.deferred.useDeferred(() => props.loaderData.late)
		return api.h("span", "text", () => [props.loaderData.text, " ", api.solid.createComponent(api.solid.Loading, { fallback: "wait", get children() { return late() } })])
	})
// The node carries the route's \`cache.client\`, as codegen copies it, so a prefetch reads it before the import.
const page = (route, module, client) => ({ id: route, path: route.slice(6), module, ...(client && { client }) })
const soon = { prefetch: "intent", prefetchStaleTime: "5s" }
const brief = { prefetch: "intent", prefetchGcTime: "1s" }
const routeTree = [
	page("_root_/away", api.page.createPage("_root_/away").render(() => "away")),
	page("_root_/kept", counted("_root_/kept", { staleTime: "1m" })),
	page("_root_/swept", counted("_root_/swept", { staleTime: "10m", gcTime: "1m" })),
	page("_root_/soon", counted("_root_/soon", soon), soon),
	page("_root_/brief", counted("_root_/brief", brief), brief),
	page("_root_/filled", deferring("_root_/filled", true)),
	page("_root_/holed", deferring("_root_/holed", false)),
]
return { router: api.router.createRouter({ layouts: { _root_: root }, routeTree, prefetch: false }) }
`)

const idOf = (to: string): string => `to${to.replace(/\W/g, "-")}`

// The loader's run number in the slot, once the URL is `path` and the slot reads `want`.
async function runAt(tab: Page, path: string, want = "run"): Promise<number> {
	await tab.waitForFunction(
		([at, text]) => location.pathname === at && document.getElementById("slot")?.textContent?.includes(text) === true,
		[path, want],
	)
	return Number(await tab.evaluate(() => /run (\d+)/.exec(document.getElementById("slot")?.textContent ?? "")?.[1]))
}

async function click(tab: Page, to: string): Promise<void> {
	await tab.evaluate((id) => document.getElementById(id)?.click(), idOf(to))
}

async function remember(tab: Page, value: unknown): Promise<void> {
	await tab.evaluate((item) => (Reflect.get(window, "__flareRecord") as unknown[]).push(item), value)
}

// Moves the page's clock `ms` ahead; it keeps running from there.
async function later(tab: Page, ms: number): Promise<void> {
	if (ms > 0) await tab.clock.fastForward(ms)
}

// Away and back to `path`, `ms` later each time: how many more times the loader ran, each round.
async function rounds(tab: Page, path: string, ages: readonly number[]): Promise<void> {
	const runs: number[] = []
	let last = await runAt(tab, path)
	for (const ms of ages) {
		await later(tab, ms)
		await click(tab, "/away")
		await runAt(tab, "/away", "")
		await click(tab, path)
		const now = await runAt(tab, path)
		runs.push(now - last)
		last = now
	}
	await remember(tab, runs)
}

// Hovers the link to `path`, waits `ms` on the page's clock, clicks it: the prefetch and data requests for it.
async function prefetched(tab: Page, path: string, ms: number): Promise<void> {
	await Promise.all([
		tab.waitForResponse((response) => response.url().includes("_flare=prefetch"), { timeout: 5000 }),
		tab.hover(`#${idOf(path)}`),
	])
	await new Promise((resolve) => setTimeout(resolve, 50))
	await later(tab, ms)
	await click(tab, path)
	await runAt(tab, path)
}

const kinds = (result: AppResult) => result.requests.map((url) => /_flare=(\w+)/.exec(url)?.[1])

// To `path` once its deferred value is in, then away and back.
function settledRound(path: string): (tab: Page) => Promise<void> {
	return async (tab) => {
		await click(tab, path)
		await runAt(tab, path, "late")
		await rounds(tab, path, [0])
	}
}

describe.each(ENGINES)("%s", { timeout: 60_000 }, (engine) => {
	// `staleTime` on the route: back within it the loader does not run; past it, it does.
	it("route staleTime", async () => {
		const result = await run(engine, { app: APP, path: "/kept", steps: (tab) => rounds(tab, "/kept", [0, 61_000]) })
		expect(result.problems).toEqual([])
		expect(result.record).toEqual([[0, 1]])
	})

	// `gcTime` on the route: an entry nobody read for longer is dropped, though its 10-minute staleTime has not passed.
	it("route gcTime", async () => {
		const result = await run(engine, {
			app: APP,
			path: "/swept",
			steps: (tab) => rounds(tab, "/swept", [30_000, 61_000]),
		})
		expect(result.problems).toEqual([])
		expect(result.record).toEqual([[0, 1]])
	})

	// The route's `prefetch: "intent"` prefetches its data on hover, over the router's `false`; a click inside
	// prefetchStaleTime takes that landing whole, and one after it asks again. prefetchGcTime drops the entry sooner.
	it("route prefetch", async () => {
		const fresh = await run(engine, { app: APP, path: "/away", steps: (tab) => prefetched(tab, "/soon", 0) })
		const stale = await run(engine, { app: APP, path: "/away", steps: (tab) => prefetched(tab, "/soon", 6000) })
		const swept = await run(engine, { app: APP, path: "/away", steps: (tab) => prefetched(tab, "/brief", 2000) })
		expect(kinds(fresh)).toEqual(["prefetch"])
		expect(kinds(stale)).toEqual(["prefetch", "data"])
		expect(kinds(swept)).toEqual(["prefetch", "data"])
	})

	// `cacheDeferred: true`: once its deferred values settled, a page is held like any other; `false` never reuses one.
	it("route cacheDeferred", async () => {
		const filled = await run(engine, { app: APP, path: "/away", steps: settledRound("/filled") })
		const holed = await run(engine, { app: APP, path: "/away", steps: settledRound("/holed") })
		expect(filled.problems).toEqual([])
		expect([filled.record, holed.record]).toEqual([[[0]], [[1]]])
	})
})
