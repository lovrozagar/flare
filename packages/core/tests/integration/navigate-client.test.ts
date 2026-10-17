import { dirname, resolve } from "node:path"
import type { Page } from "@playwright/test"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { appFrom } from "./harness-app.ts"
import type { AppCase } from "./hydrate.app.ts"
import { ENGINES, startHarness, type AppResult, type Engine, type Harness } from "./hydrate.harness.ts"

// dx/navigate.md's `navigate()` options, its hooks, the blocker, the outlet, and arrival focus in each engine (B96): a
// real document `createServer(...).fetch` serves, hydrated by the real `createClient`, driven through `useNavigate()`.

let harness: Harness | undefined

beforeAll(async () => {
	harness = await startHarness(resolve(dirname(expect.getState().testPath ?? ""), "../.."))
})

afterAll(async () => {
	await harness?.close()
})

function run(engine: Engine, visit: Pick<AppCase, "path" | "steps" | "init">): Promise<AppResult> {
	if (harness === undefined) throw new Error("the harness did not start")
	return harness.app(engine, { app: NAV, ...visit, client() {} })
}

// The root hands the page's `useNavigate()` to the steps and registers a blocker that records what it is asked and
// refuses while `__flareAllow` is false. /users/[id] is tall, with `#part` far down, and shows every data hook; its
// loader counts its runs on the server, and each side counts the layout's and the page's mounts. A client cache of a
// minute keeps a visited page fresh.
const NAV = appFrom(`
const onWindow = (run) => { if (typeof window !== "undefined") run(window) }
const mounted = (key) => onWindow((w) => { w.__flareMounts ??= {}; w.__flareMounts[key] = (w.__flareMounts[key] ?? 0) + 1 })
const runs = {}
const Controls = () => {
	const navigate = api.outletNodes.useNavigate()
	api.blocker.useBlocker((args) => {
		onWindow((w) => (w.__flareBlocker ??= []).push(args))
		return typeof window === "undefined" || window.__flareAllow !== false
	})
	onWindow((w) => (w.__flareNavigate = navigate))
	return ""
}
const root = api.rootLayout.createRootLayout("_root_").render((props) => {
	mounted("root")
	return api.h("html", "doc", () => [
		api.h("head", "head"),
		api.h("body", "body", () => [props.children, api.solid.createComponent(Controls, {})]),
	])
})
const home = api.page.createPage("_root_/").render(() => api.h("main", "page", () => "home"))
const user = api.page.createPage("_root_/users/[id]")
	.preloader(() => ({ who: "user" }))
	.loader((ctx) => ({ run: (runs[ctx.params.id] = (runs[ctx.params.id] ?? 0) + 1) }))
	.render((props) => {
		mounted("user")
		const from = { from: "_root_/users/[id]" }
		const params = api.outletNodes.useParams(from)
		const search = api.outletNodes.useSearch(from)
		const location = api.outletNodes.useLocation()
		const match = api.outletNodes.useMatch(from)
		const data = api.outletNodes.useLoaderData(from)
		const preloader = api.outletNodes.usePreloaderContext(from)
		const hooks = () => JSON.stringify({
			params, search, match: match.id, run: data.run, preloader,
			location: { pathname: location.pathname, search: location.search, hash: location.hash, params: location.params },
		})
		return api.solid.createComponent(api.web.Dynamic, {
			component: "main", id: "page", style: "height: 6000px",
			get children() {
				return [
					api.h("h1", "heading", () => "user " + props.params.id),
					api.h("p", "run", () => "run " + props.loaderData.run),
					api.h("p", "hooks", hooks),
					api.solid.createComponent(api.web.Dynamic, { component: "p", id: "part", style: "margin-top: 3000px", children: "part" }),
				]
			},
		})
	})
const routeTree = [
	{ id: "_root_/", path: "/", module: home },
	{ id: "_root_/users/[id]", path: "/users/[id]", module: user },
]
return { router: api.router.createRouter({ layouts: { _root_: root }, routeTree, cache: { client: { staleTime: "1m" } }, prefetch: false }) }
`)

async function remember(tab: Page, value: unknown): Promise<void> {
	await tab.evaluate((item) => (Reflect.get(window, "__flareRecord") as unknown[]).push(item), value)
}

async function go(tab: Page, options: Record<string, unknown>): Promise<void> {
	await tab.waitForFunction(() => typeof Reflect.get(window, "__flareNavigate") === "function")
	await tab.evaluate(
		(given) => (Reflect.get(window, "__flareNavigate") as (options: unknown) => Promise<void>)(given),
		options,
	)
}

// The user page once it shows `id` at its `run`, and the URL the bar shows.
async function shows(tab: Page, id: string, run = 1): Promise<string> {
	await tab.waitForFunction(
		([want, times]) =>
			document.getElementById("heading")?.textContent === `user ${want}` &&
			document.getElementById("run")?.textContent === `run ${times}`,
		[id, run] as const,
	)
	return tab.evaluate(() => `${location.pathname}${location.search}${location.hash}`)
}

const hooks = (tab: Page): Promise<unknown> =>
	tab.evaluate(() => JSON.parse(document.getElementById("hooks")?.textContent ?? "null") as unknown)

// The data requests from now on, as their paths.
function dataRequests(tab: Page): string[] {
	const seen: string[] = []
	tab.on("request", (request) => {
		const url = new URL(request.url())
		if (url.searchParams.get("_flare") === "data")
			seen.push(`${url.pathname}${url.search.replace(/[?&]_flare=data/, "")}`)
	})
	return seen
}

// `to`, `params`, `search`, and `hash` write one URL; the page reads it through every hook, scrolls to the hash's
// element, and focus moves there. A push without a hash focuses the page's heading and announces it.
async function targetSteps(tab: Page): Promise<void> {
	await go(tab, { to: "_root_/users/[id]", params: { id: "7" }, search: { q: "a b" }, hash: "part" })
	const url = await shows(tab, "7")
	await tab.waitForFunction(() => scrollY > 1000)
	await remember(tab, { url, hooks: await hooks(tab), focused: await tab.evaluate(() => document.activeElement?.id) })
	await go(tab, { to: "_root_/users/[id]", params: { id: "8" } })
	await shows(tab, "8")
	await remember(
		tab,
		await tab.evaluate(() => ({
			focused: document.activeElement?.id,
			announced: document.getElementById("flare-announcer")?.textContent,
			top: scrollY,
		})),
	)
}

// A push adds an entry carrying `state`; `replace` swaps the entry; Back steps over the replaced one.
async function historySteps(tab: Page): Promise<void> {
	const start = await tab.evaluate(() => history.length)
	await go(tab, { to: "_root_/users/[id]", params: { id: "2" }, state: { k: 1 } })
	await shows(tab, "2")
	const pushed = await tab.evaluate(() => [history.length, (history.state as { usr?: unknown }).usr] as const)
	await go(tab, { to: "_root_/users/[id]", params: { id: "3" }, replace: true, state: { k: 2 } })
	await shows(tab, "3")
	const replaced = await tab.evaluate(() => [history.length, (history.state as { usr?: unknown }).usr] as const)
	await tab.evaluate(() => history.back())
	await shows(tab, "1")
	await remember(tab, { pushed: [pushed[0] - start, pushed[1]], replaced: [replaced[0] - start, replaced[1]] })
}

// `scroll: false` keeps the position; the default goes to the top.
async function scrollSteps(tab: Page): Promise<void> {
	await shows(tab, "1")
	await tab.evaluate(() => window.scrollTo(0, 600))
	await tab.waitForFunction(() => Math.round(scrollY) === 600)
	await go(tab, { to: "_root_/users/[id]", params: { id: "2" }, scroll: false })
	await shows(tab, "2")
	const kept = await tab.evaluate(() => Math.round(scrollY))
	await go(tab, { to: "_root_/users/[id]", params: { id: "3" } })
	await shows(tab, "3")
	await remember(tab, { kept, top: await tab.evaluate(() => Math.round(scrollY)) })
}

// Inside the cache's minute the same URL asks for nothing, and `revalidate` asks again; `shallow` writes the search
// and asks for nothing. Each sees the page's own mount: a search change keeps it, as the layout stays.
async function freshSteps(tab: Page): Promise<void> {
	await shows(tab, "1")
	const requests = dataRequests(tab)
	await go(tab, { to: "_root_/users/[id]", params: { id: "1" } })
	await go(tab, { to: "_root_/users/[id]", params: { id: "1" }, revalidate: true })
	await shows(tab, "1", 2)
	await go(tab, { to: "_root_/users/[id]", params: { id: "1" }, search: { q: "z" }, shallow: true })
	await tab.waitForFunction(() => location.search === "?q=z")
	const search = ((await hooks(tab)) as { search: unknown }).search
	await remember(tab, { requests: [...requests], search })
}

// The outlet keeps the root and remounts the page for other params; a search change keeps the page.
async function outletSteps(tab: Page): Promise<void> {
	await shows(tab, "1")
	await go(tab, { to: "_root_/users/[id]", params: { id: "1" }, search: { q: "x" } })
	await tab.waitForFunction(() => location.search === "?q=x")
	const searched = await tab.evaluate(() => ({ ...(Reflect.get(window, "__flareMounts") as object) }))
	await go(tab, { to: "_root_/users/[id]", params: { id: "2" } })
	await shows(tab, "2")
	await remember(tab, { searched, moved: await tab.evaluate(() => Reflect.get(window, "__flareMounts") as unknown) })
}

// The blocker reads both sides, params included, and the trigger; `false` keeps the URL and the page.
async function blockerSteps(tab: Page): Promise<void> {
	await shows(tab, "1")
	await tab.evaluate(() => Reflect.set(window, "__flareAllow", false))
	await go(tab, { to: "_root_/users/[id]", params: { id: "2" }, search: { q: "b" } })
	const stayed = await tab.evaluate(() => `${location.pathname}${location.search}`)
	await tab.evaluate(() => Reflect.set(window, "__flareAllow", true))
	await go(tab, { to: "_root_/users/[id]", params: { id: "2" } })
	await shows(tab, "2")
	await remember(tab, { stayed, asked: await tab.evaluate(() => Reflect.get(window, "__flareBlocker") as unknown) })
}

const place = (pathname: string, id: string, search = "") => ({ pathname, search, hash: "", params: { id } })

describe.each(ENGINES)("%s", (engine) => {
	it("navigate target", async () => {
		const result = await run(engine, { path: "/", steps: targetSteps })
		expect(result.problems).toEqual([])
		expect(result.record).toEqual([
			{
				url: "/users/7?q=a%20b#part",
				hooks: {
					params: { id: "7" },
					search: { q: "a b" },
					match: "id=7&q=a%20b",
					run: 1,
					preloader: { who: "user" },
					location: { pathname: "/users/7", search: { q: "a b" }, hash: "#part", params: { id: "7" } },
				},
				focused: "part",
			},
			{ focused: "heading", announced: "user 8", top: 0 },
		])
	})

	it("navigate history and state", async () => {
		const result = await run(engine, { path: "/users/1", steps: historySteps })
		expect(result.problems).toEqual([])
		expect(result.record).toEqual([{ pushed: [1, { k: 1 }], replaced: [1, { k: 2 }] }])
	})

	it("navigate scroll", async () => {
		const result = await run(engine, { path: "/users/1", steps: scrollSteps })
		expect(result.record).toEqual([{ kept: 600, top: 0 }])
	})

	it("navigate revalidate and shallow", async () => {
		const result = await run(engine, { path: "/users/1", steps: freshSteps })
		expect(result.problems).toEqual([])
		expect(result.record).toEqual([{ requests: ["/users/1"], search: { q: "z" } }])
	})

	it("outlet mounts", async () => {
		const result = await run(engine, { path: "/users/1", steps: outletSteps })
		expect(result.record).toEqual([{ searched: { root: 1, user: 1 }, moved: { root: 1, user: 2 } }])
	})

	it("blocker", async () => {
		const result = await run(engine, { path: "/users/1", steps: blockerSteps })
		expect(result.problems).toEqual([])
		expect(result.record).toEqual([
			{
				stayed: "/users/1",
				asked: [
					{ current: place("/users/1", "1"), next: place("/users/2", "2", "?q=b"), trigger: "navigation" },
					{ current: place("/users/1", "1"), next: place("/users/2", "2"), trigger: "navigation" },
				],
			},
		])
	})
})
