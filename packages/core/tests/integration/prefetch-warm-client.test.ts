import { dirname, resolve } from "node:path"
import type { Page } from "@playwright/test"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { appFrom } from "./harness-app.ts"
import { ENGINES, startHarness, type Engine, type Harness } from "./hydrate.harness.ts"

// The idle warm-up of every route module against an HTTP/1.1 server, six connections to a host, whose chunk answers
// are held: a server function the page calls while the warm is held must still reach the server (BUGS.md 520, B127).
// Each chunk answer waits until the page's `ping` arrives (or 15 s), so a warm that holds every connection keeps the
// ping out, and the call does not answer. The server also counts the chunk requests open at once.

let harness: Harness | undefined

beforeAll(async () => {
	harness = await startHarness(resolve(dirname(expect.getState().testPath ?? ""), "../.."))
})

afterAll(async () => {
	await harness?.close()
})

// Eighteen lazy routes, each its own chunk under /held. Where rel=prefetch is supported the warm links the chunks;
// where it is not (WebKit) it imports the route modules, which import the held files. Each run has its own count.
const WARM = appFrom(`
const isServer = typeof window === "undefined"
// One state per run: each engine's page carries its own run id, which the mount reads from the request's URL, else
// its Referer (a link prefetch sends the page as Referer, a module import the importing script).
const runs = (globalThis.__warmHeld ??= new Map())
const stateOf = (run) => {
	if (!runs.has(run)) runs.set(run, { waiting: [], open: 0, max: 0, released: false })
	return runs.get(run)
}
const runOf = (url) => (url ? new URL(url).searchParams.get("run") ?? "" : "")
const release = (state) => {
	state.released = true
	for (const go of state.waiting.splice(0)) go()
}
const root = api.rootLayout.createRootLayout("_root_").render((props) =>
	api.h("html", "doc", () => [api.h("head", "head"), api.h("body", "body", () => props.children)]),
)
const plain = (route) => api.page.createPage(route).render(() => api.h("main", "page", () => route))
const imported = (route) => { if (!isServer) (window.__flareImported ??= []).push(route) }
const lazy = (route, index) => () => {
	imported(route)
	// A module's import sends the importing script as its Referer, so the run rides on the URL.
	const run = new URL(location.href).searchParams.get("run") ?? ""
	return import(/* @vite-ignore */ "/held/m" + index + ".js?run=" + run).then(() => plain(route))
}
const N = 18
const routes = Array.from({ length: N }, (_, index) => "_root_/r" + index)
const routeTree = [
	{ id: "_root_/", path: "/", module: plain("_root_/") },
	...routes.map((route, index) => ({ id: route, path: "/r" + index, module: lazy(route, index) })),
]
const chunks = Object.fromEntries(routes.map((route, index) => [route, "/held/c" + index + ".js"]))
const held = {
	prefix: "/held",
	fetch: async (request) => {
		const state = stateOf(runOf(request.url) || runOf(request.headers.get("referer")))
		state.open += 1
		state.max = Math.max(state.max, state.open)
		if (!state.released) await new Promise((go) => { state.waiting.push(go); setTimeout(go, 15000) })
		state.open -= 1
		return new Response("export const held = 1", {
			headers: { "content-type": "text/javascript", "cache-control": "no-store" },
		})
	},
}
const call = (fn, input) => Reflect.apply(Reflect.get(Object(globalThis.flare), "call"), undefined, [fn, input])
const make = api.serverFn.bindServerFn(call)
const ping = make({ method: "post", __id: "ping000000000000", __name: "ping" })
	.input((input) => input)
	.handler(({ input }) => {
		release(stateOf(input))
		return { max: stateOf(input).max }
	})
const stats = make({ method: "post", __id: "stats00000000000", __name: "stats" })
	.input((input) => input)
	.handler(({ input }) => ({ max: stateOf(input).max }))
if (!isServer) Object.assign(window, { __fns: { ping, stats } })
return {
	router: api.router.createRouter({ layouts: { _root_: root }, routeTree, chunks }),
	server: { serverFns: { [ping.id]: async () => ping, [stats.id]: async () => stats }, mounts: [held] },
}
`)

// Once the warm has started, the page calls `ping` and gives it 5 s; then, the chunks released, it reads how many
// chunk requests were open at once.
async function pingDuringWarm(tab: Page): Promise<void> {
	await tab.waitForFunction(
		() =>
			document.querySelector('link[rel="prefetch"]') !== null ||
			((Reflect.get(window, "__flareImported") as string[] | undefined)?.length ?? 0) > 0,
	)
	const result = await tab.evaluate(async () => {
		const fns = Reflect.get(window, "__fns") as Record<"ping" | "stats", (run: string) => Promise<{ max: number }>>
		const run = new URL(location.href).searchParams.get("run") ?? ""
		const ping = await Promise.race([
			fns.ping(run).then(() => "answered"),
			new Promise<string>((done) => setTimeout(() => done("not answered in 5 s"), 5000)),
		])
		const { max } = await fns.stats(run)
		return { ping, max }
	})
	await tab.evaluate((item) => (Reflect.get(window, "__flareRecord") as unknown[]).push(item), result)
}

describe.each(ENGINES)("%s", (engine: Engine) => {
	// The ping answers while the wave is held, and at most two chunk requests were open at once, leaving four of the
	// six connections free. The open count is logged per engine (the reviewer's condition).
	it("user request past the warm", async () => {
		if (harness === undefined) throw new Error("the harness did not start")
		const path = `/?run=${engine}-${Date.now()}`
		const result = await harness.app(engine, { app: WARM, path, steps: pingDuringWarm, client() {} })
		const [seen] = result.record as [{ ping: string; max: number }]
		console.log(`[520] ${engine}: ping ${seen.ping}, at most ${seen.max} chunk requests open at once`)
		expect(seen).toEqual({ ping: "answered", max: expect.toSatisfy((max: number) => max >= 1 && max <= 3) })
	}, 60_000)
})
