import { dirname, resolve } from "node:path"
import type { Page } from "@playwright/test"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { appFrom } from "./harness-app.ts"
import { ENGINES, startHarness, type Harness } from "./hydrate.harness.ts"

// dx/navigate.md's `useNavigation()` and `useNavigationProgress()` in each engine (B96): a real document
// `createServer(...).fetch` serves, hydrated by the real `createClient`, with a data request held until the creep is capped.

let harness: Harness | undefined

beforeAll(async () => {
	harness = await startHarness(resolve(dirname(expect.getState().testPath ?? ""), "../.."))
})

afterAll(async () => {
	await harness?.close()
})

// The root records every value `useNavigation().pending` and two progress hooks take: one creeping every 16 ms, one
// holding `1` until 2.5 s after the start. /slow is a page the steps link to.
const PROGRESS = appFrom(`
const onWindow = (run) => { if (typeof window !== "undefined") run(window) }
const Bar = () => {
	const navigation = api.pending.useNavigation()
	const creep = api.progress.useNavigationProgress({ trickle: 16 })
	const held = api.progress.useNavigationProgress({ trickle: 16, minDisplay: 2500 })
	api.solid.createEffect(() => [navigation.pending, creep.pending, creep.value], (seen) => onWindow((w) => (w.__flareCreep ??= []).push(seen)))
	api.solid.createEffect(() => held.value, (value) => onWindow((w) => (w.__flareHeld ??= []).push([value, Math.round(performance.now())])))
	return api.h("p", "bar", () => String(creep.value))
}
const root = api.rootLayout.createRootLayout("_root_").render((props) => api.h("html", "doc", () => [
	api.h("head", "head"),
	api.h("body", "body", () => [
		api.solid.createComponent(api.link.Link, { to: "_root_/slow", id: "to-slow", children: "slow" }),
		props.children,
		api.solid.createComponent(Bar, {}),
	]),
]))
const page = (route) => api.page.createPage(route).loader(() => ({ route })).render(() => api.h("main", "page", () => route.slice(6)))
const routeTree = [{ id: "_root_/", path: "/", module: page("_root_/") }, { id: "_root_/slow", path: "/slow", module: page("_root_/slow") }]
return { router: api.router.createRouter({ layouts: { _root_: root }, routeTree, prefetch: false }) }
`)

// The data request answers once the creep has reached its cap, not after a fixed time: a slow runner's timers fire
// late, and a fixed two seconds ended the navigation 4 and 36 steps short on CI's macOS runner. The steps record when
// the click went out and every value seen.
async function slowSteps(tab: Page): Promise<void> {
	const capped = Promise.withResolvers<void>()
	await tab.route("**/slow?_flare=data*", async (route) => {
		await capped.promise
		await route.continue()
	})
	await tab.waitForSelector("html[data-flare-hydrated]", { state: "attached" })
	const start = await tab.evaluate(() => {
		document.getElementById("to-slow")?.click()
		return Math.round(performance.now())
	})
	await tab.waitForFunction(
		() => (Reflect.get(window, "__flareCreep") as unknown[][] | undefined)?.at(-1)?.[2] === 0.994,
	)
	capped.resolve()
	await tab.waitForFunction(() => document.getElementById("page")?.textContent === "/slow")
	await tab.waitForFunction(() => (Reflect.get(window, "__flareHeld") as unknown[][]).at(-1)?.[0] === null, undefined, {
		timeout: 10_000,
	})
	await tab.evaluate(
		(at) =>
			(Reflect.get(window, "__flareRecord") as unknown[]).push({
				start: at,
				creep: Reflect.get(window, "__flareCreep"),
				held: Reflect.get(window, "__flareHeld"),
			}),
		start,
	)
}

// The creep the table gives from 0.08, one add per tick, as far as `ticks`, then held at 0.994.
function creep(ticks: number): number[] {
	const values = [0.08]
	for (let tick = 0; tick < ticks; tick += 1) {
		const value = values.at(-1) ?? 0
		const add = value < 0.2 ? 0.1 : value < 0.5 ? 0.04 : value < 0.8 ? 0.02 : value < 0.994 ? 0.005 : 0
		const next = Math.min(0.994, value + add)
		if (next !== value) values.push(next)
	}
	return values
}

type Seen = { start: number; creep: [boolean, boolean, number | null][]; held: [number | null, number][] }

describe.each(ENGINES)("%s", (engine) => {
	// Idle, then pending with 0.08 and every creep step of the table to the 0.994 cap, then `1` as pending falls, then
	// idle. Both hooks read the one pending flag. With `minDisplay`, `1` holds until that long after the start.
	it("progress creep and hold", async () => {
		if (harness === undefined) throw new Error("the harness did not start")
		const result = await harness.app(engine, { app: PROGRESS, path: "/", steps: slowSteps, client() {} })
		expect(result.problems).toEqual([])
		const [seen] = result.record as [Seen]
		expect(seen.creep[0]).toEqual([false, false, null])
		const pending = seen.creep.filter(([flag]) => flag)
		expect(pending.every(([flag, own]) => flag === own)).toBe(true)
		const values = pending.map(([, , value]) => Math.round((value ?? 0) * 1000) / 1000)
		const table = creep(200).map((value) => Math.round(value * 1000) / 1000)
		expect(values).toEqual(table)
		expect(seen.creep.slice(-2)).toEqual([
			[false, false, 1],
			[false, false, null],
		])
		const [one, idle] = seen.held.slice(-2)
		expect([one?.[0], idle?.[0]]).toEqual([1, null])
		// The hook times the hold from its own start, a few milliseconds after the click; without the hold, idle comes as
		// the page lands, once the creep is capped: about one second in here.
		expect((idle?.[1] ?? 0) - seen.start).toBeGreaterThanOrEqual(2400)
	})
})
