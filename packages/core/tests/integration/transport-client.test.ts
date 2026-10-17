import { dirname, resolve } from "node:path"
import type { Page } from "@playwright/test"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { appFrom } from "./harness-app.ts"
import { ENGINES, startHarness, type Harness } from "./hydrate.harness.ts"

// One value through every transport, through the real createServer and createClient (B96): the document's state, a
// deferred value in the document and in a navigation, a navigation's data, a prefetch, a stored page, and a server
// function's input, output, GET answer, and stream. The client reads the value the loader or handler returned, with its
// Date, BigInt, Map, Set, undefined field, and NaN (plan 21 5.1, 11.1).

let harness: Harness | undefined

beforeAll(async () => {
	harness = await startHarness(resolve(dirname(expect.getState().testPath ?? ""), "../.."))
})

afterAll(async () => {
	await harness?.close()
})

// `describe` names what arrived: the Date's time, the BigInt, the Map's entry, the Set's member, the undefined key, the
// NaN, and the nested Date.
const APP = appFrom(`
const value = () => ({ at: new Date(5), big: 7n, map: new Map([["k", 1]]), set: new Set(["s"]), gone: undefined, nan: NaN, list: [new Date(9)] })
const describe = (v) => typeof v !== "object" || v === null ? "not an object: " + String(v) : [
	v.at instanceof Date ? v.at.getTime() : typeof v.at,
	typeof v.big === "bigint" ? String(v.big) : typeof v.big,
	v.map instanceof Map ? v.map.get("k") : typeof v.map,
	v.set instanceof Set ? v.set.has("s") : typeof v.set,
	"gone" in v,
	Number.isNaN(v.nan),
	v.list?.[0] instanceof Date ? v.list[0].getTime() : typeof v.list?.[0],
].join(" ")
const anchor = (to) => api.solid.createComponent(api.link.Link, { to: "_root_" + to, id: "to" + to.replace(/\\W/g, "-"), children: to })
const root = api.rootLayout.createRootLayout("_root_").render((props) => api.h("html", "doc", () => [
	api.h("head", "head"),
	api.h("body", "body", () => [anchor("/n"), anchor("/p"), api.h("main", "slot", () => props.children)]),
]))
const page = (id, chain = (route) => route) => chain(api.page.createPage(id))
	.loader(({ defer }) => ({ v: value(), later: defer(async () => value()) }))
	.render((props) => {
		const later = api.deferred.useDeferred(() => props.loaderData.later)
		const client = (key, read) => {
			const shown = describe(read())
			if (typeof window !== "undefined") Object.assign(window, { [key]: { at: id, shown } })
			return shown
		}
		return api.h("p", "shown", () => [
			client("__seen", () => props.loaderData.v),
			api.solid.createComponent(api.solid.Loading, { fallback: "wait", get children() { return client("__later", later) } }),
		])
	})
// A route's validated search, a Date the validator made, as the page reads it after a document load and a navigation.
const dated = { "~standard": { validate: (raw) => ({ value: { at: new Date(Number(raw.at)) } }) } }
const searched = (id) => api.page.createPage(id).input({ searchParams: dated }).render((props) => {
	const shown = () => {
		const at = props.search.at
		const text = at instanceof Date ? "date " + at.getTime() : typeof at
		if (typeof window !== "undefined") Object.assign(window, { __search: { at: id, shown: text } })
		return text
	}
	const link = api.solid.createComponent(api.link.Link, { to: "_root_/w", search: { at: "6" }, id: "to-w", children: "w" })
	return api.h("p", "search", () => [shown(), link])
})
const routeTree = [
	{ id: "_root_/a", path: "/a", module: page("_root_/a") },
	{ id: "_root_/v", path: "/v", module: searched("_root_/v") },
	{ id: "_root_/w", path: "/w", module: searched("_root_/w") },
	{ id: "_root_/n", path: "/n", module: page("_root_/n") },
	{ id: "_root_/p", path: "/p", module: page("_root_/p"), client: { prefetch: "intent" } },
	{ id: "_root_/s", path: "/s", module: page("_root_/s", (route) => route.cache({ isr: true })) },
]
const call = (fn, input) => Reflect.apply(Reflect.get(Object(globalThis.flare), "call"), undefined, [fn, input])
const make = api.serverFn.bindServerFn(call)
const echo = make({ method: "post", __id: "echo000000000000", __name: "echo" })
	.input((input) => input)
	.handler(({ input }) => ({ back: input, made: value() }))
const read = make({ method: "get", __id: "read000000000000", __name: "read" }).handler(() => value())
const ticks = make({ method: "post", __id: "ticks00000000000", __name: "ticks" }).stream(async function* () {
	yield value()
})
if (typeof window !== "undefined") Object.assign(window, { __describe: describe, __value: value, __fns: { echo, read, ticks } })
const serverFns = { [echo.id]: async () => echo, [read.id]: async () => read, [ticks.id]: async () => ticks }
return {
	router: api.router.createRouter({ layouts: { _root_: root }, routeTree, prefetch: false }),
	server: { store: api.memory.createMemoryStore(), serverFns },
}
`)

type Seen = { at: string; shown: string }

// What the page on `id` read on the client: its loader value and its deferred value, read through useDeferred.
async function seen(tab: Page, id: string): Promise<string[]> {
	const read = (key: string) =>
		tab.waitForFunction(
			({ key, at }) => {
				const page = Reflect.get(window, key) as Seen | undefined
				return page?.at === at ? page.shown : undefined
			},
			{ key, at: id },
		)
	return [String(await (await read("__seen")).jsonValue()), String(await (await read("__later")).jsonValue())]
}

// What the page on `id` read as its validated search.
async function searchOf(tab: Page, id: string): Promise<string> {
	const shown = await tab.waitForFunction((at) => {
		const page = Reflect.get(window, "__search") as Seen | undefined
		return page?.at === at ? page.shown : undefined
	}, id)
	return String(await shown.jsonValue())
}

// A server function's input and output, its GET answer, and its stream's one value.
async function calls(tab: Page): Promise<string[]> {
	return tab.evaluate(async () => {
		const describe = Reflect.get(window, "__describe") as (value: unknown) => string
		const value = Reflect.get(window, "__value") as () => unknown
		const fns = Reflect.get(window, "__fns") as Record<"echo" | "read" | "ticks", (input?: unknown) => unknown>
		const echoed = (await fns.echo(value())) as { back: unknown; made: unknown }
		const shown = [describe(echoed.back), describe(echoed.made), describe(await fns.read())]
		for await (const tick of fns.ticks() as AsyncIterable<unknown>) shown.push(describe(tick))
		return shown
	})
}

// The document, a navigation, a prefetch, the server functions, then a stored page: rendered once, then a hit. A
// document load starts a new window, so the notes are kept here and recorded at the end.
async function everyTransport(tab: Page): Promise<void> {
	const notes = await seen(tab, "_root_/a")
	await tab.click("#to-n")
	notes.push(...(await seen(tab, "_root_/n")))
	await Promise.all([
		tab.waitForResponse((response) => response.url().includes("_flare=prefetch"), { timeout: 5000 }),
		tab.hover("#to-p"),
	])
	await tab.click("#to-p")
	notes.push(...(await seen(tab, "_root_/p")), ...(await calls(tab)))
	await tab.goto(`${new URL(tab.url()).origin}/s`)
	await seen(tab, "_root_/s")
	const hit = await tab.reload()
	notes.push(hit?.headers()["flare-cache"] ?? "no answer", ...(await seen(tab, "_root_/s")))
	await tab.goto(`${new URL(tab.url()).origin}/v?at=5`)
	notes.push(await searchOf(tab, "_root_/v"))
	await tab.click("#to-w")
	notes.push(await searchOf(tab, "_root_/w"))
	await tab.evaluate((all) => (Reflect.get(window, "__flareRecord") as unknown[]).push(...all), notes)
}

const SAME = "5 7 1 true true true 9"

describe.each(ENGINES)("%s", (engine) => {
	it("one value everywhere", async () => {
		if (harness === undefined) throw new Error("the harness did not start")
		const result = await harness.app(engine, { app: APP, path: "/a", steps: everyTransport, client() {} })
		expect(result.problems).toEqual([])
		// The document, its deferred value; a navigation, its deferred value; a prefetch, its deferred value.
		// The server function's input, output, GET answer, and stream; then the stored page's hit and its two values;
		// then a validated search after a document load and after a navigation.
		const values = [SAME, SAME, SAME, SAME, SAME, SAME, SAME, SAME, SAME, SAME, "hit", SAME, SAME]
		expect(result.record).toEqual([...values, "date 5", "date 6"])
	})
})
