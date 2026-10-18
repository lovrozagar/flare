import { createComponent, Loading, type Element } from "solid-js"
import { Dynamic } from "@solidjs/web"
import { dirname, resolve } from "node:path"
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import { createMemoryStore } from "../../src/server/cache/memory.ts"
import { createServer } from "../../src/server/lifecycle/create.ts"
import { useDeferred } from "../../src/shared/components/use-deferred.ts"
import { createPage } from "../../src/shared/route-builder/page.ts"
import type { Deferred } from "../../src/shared/route-builder/register.ts"
import { createRootLayout } from "../../src/shared/route-builder/root-layout.ts"
import { createRouter, type RouteModule } from "../../src/shared/router/create-router.ts"
import { ENGINES, startHarness, type Api, type AppResult, type Engine, type Harness } from "./hydrate.harness.ts"
import type { AppCase } from "./hydrate.app.ts"
import { serve } from "./builder-app.ts"
import { appFrom } from "./harness-app.ts"
import { framesIn, stateIn } from "../../src/server/wire.fixture.ts"

// `defer` through the real `createServer(...).fetch` (B96, dx/defer.md): a value the loader defers streams after the
// shell, a prefetch never runs it, a buffered document waits for it, and a stored page resolves or keeps a hole by its
// mode.

afterEach(() => vi.unstubAllEnvs())

const SITE = "https://flare.test"

function element(component: string, children: Element): Element {
	return createComponent(Dynamic, {
		component,
		get children() {
			return children
		},
	})
}

// A full document, as a stored page must be (B46).
function documentOf(children: Element): Element {
	return element("html", [element("head", []), element("body", children)])
}

// The read dx/defer.md prescribes: `useDeferred` inside `<Loading>`, so the document streams the value.
function shown(read: () => Deferred<string>): Element {
	const value = useDeferred(read)
	return createComponent(Loading, {
		fallback: "waiting",
		get children() {
			return element("p", value())
		},
	})
}

const root = createRootLayout("_root_").render((props) => documentOf(props.children))

function serverFor(
	page: RouteModule,
	options: Partial<Parameters<typeof createServer>[0]> = {},
): ReturnType<typeof createServer> {
	const router = createRouter({ layouts: { _root_: root }, routeTree: [{ id: "_root_/p", path: "/p", module: page }] })
	return createServer({ router, ...options })
}

const later = <T>(value: T, ms: number): Promise<T> => new Promise((resolve) => setTimeout(() => resolve(value), ms))

// A data answer's frames as the client decodes them (B145).
const frames = framesIn

// A response that is not stored: the loader data holds `{ __deferred, key }` placeholders, a named key and the first
// unnamed one `d0`; the data response sends the `l` frames, `r`, then one `c` frame per value as it settles, then `d`.
// The document's shell carries the placeholder, and the value follows in the same stream.
it("not stored", async () => {
	const page = createPage("_root_/p")
		.loader(({ defer }) => ({
			reviews: defer(() => later("five stars", 40), { key: "reviews" }),
			plain: defer(async () => "plain"),
		}))
		.render((props) => shown(() => props.loaderData.reviews))
	const server = serverFor(page)
	expect(frames(await (await server.fetch(new Request(`${SITE}/p?_flare=data`))).text())).toEqual([
		{ t: "l", m: "_root_", d: null },
		{
			t: "l",
			m: "_root_/p",
			d: { reviews: { __deferred: true, key: "reviews" }, plain: { __deferred: true, key: "d0" } },
		},
		{ t: "r" },
		{ t: "c", m: "_root_/p", k: "d0", d: "plain" },
		{ t: "c", m: "_root_/p", k: "reviews", d: "five stars" },
		{ t: "d" },
	])
	const reader = (await server.fetch(new Request(`${SITE}/p`))).body?.getReader()
	const decoder = new TextDecoder()
	const first = decoder.decode((await reader?.read())?.value)
	expect(stateIn(first).at(-1)?.["data"]).toMatchObject({ reviews: { __deferred: true, key: "reviews" } })
	expect(first).not.toContain("five stars")
	let rest = ""
	for (let chunk = await reader?.read(); chunk !== undefined && !chunk.done; chunk = await reader?.read()) {
		rest += decoder.decode(chunk.value)
	}
	expect(rest).toContain("five stars")
})

// Two calls with one key return the first promise and never call the second function; a prefetch calls none of them.
it("key and prefetch", async () => {
	const calls: string[] = []
	const page = createPage("_root_/p")
		.loader(({ defer }) => ({
			first: defer(async () => (calls.push("first"), "one"), { key: "shared" }),
			second: defer(async () => (calls.push("second"), "two"), { key: "shared" }),
		}))
		.render(() => "page")
	const server = serverFor(page)
	const prefetch = frames(await (await server.fetch(new Request(`${SITE}/p?_flare=prefetch`))).text())
	expect(calls).toEqual([])
	expect(prefetch.some((frame) => Reflect.get(Object(frame), "t") === "c")).toBe(false)
	const data = frames(await (await server.fetch(new Request(`${SITE}/p?_flare=data`))).text())
	expect(calls).toEqual(["first"])
	expect(data.filter((frame) => Reflect.get(Object(frame), "t") === "c")).toEqual([
		{ t: "c", m: "_root_/p", k: "shared", d: "one" },
	])
})

// `documentResponseDefer: "buffer"` holds the document until the value settles: its first chunk already has it.
it("document buffer", async () => {
	const page = createPage("_root_/p")
		.loader(({ defer }) => ({ reviews: defer(() => later("five stars", 40), { key: "reviews" }) }))
		.render((props) => shown(() => props.loaderData.reviews))
	const response = await serverFor(page, { documentResponseDefer: "buffer" }).fetch(new Request(`${SITE}/p`))
	const reader = response.body?.getReader()
	const first = new TextDecoder().decode((await reader?.read())?.value)
	expect(first).toContain("five stars")
	expect(first).toContain("</html>")
})

// A held document renders a rejected value as a streamed one does: the value's failure is in Solid's hydration data
// (BUGS.md 374), and the client paints the nearest <Errored>, the match's boundary when none is around the read. The
// rest of the page renders, the answer is 200, and it is never stored: private, no-store (dx/defer.md, BUGS.md 373).
it("document buffer reject", async () => {
	const page = createPage("_root_/p")
		.loader(({ defer }) => ({
			reviews: defer(() => later("five stars", 10), { key: "reviews" }),
			broken: defer(() => Promise.reject(new Error("service down")), { key: "broken" }),
		}))
		.render((props) => [shown(() => props.loaderData.reviews), shown(() => props.loaderData.broken)])
		.errorRender(() => element("p", "page failed"))
	const response = await serverFor(page, { documentResponseDefer: "buffer" }).fetch(new Request(`${SITE}/p`))
	expect(response.status).toBe(200)
	expect(response.headers.get("cache-control")).toBe("private, no-store")
	const body = await response.text()
	expect(body).toContain(">five stars</p>")
	expect(body).toContain("__deferredFailure:!0,error:$R")
	expect(body).toContain('message:"service down"')
	expect(body).not.toContain("page failed")
	expect(body).toContain("</html>")
})

// A stored page, production stubbed: the route's `stream` leaves a hole with no `c` frame, a call's
// `prerender: "resolve"` is awaited and stored inline, and the fill sends the hole's value with the resolved one as
// `kept`.
it("stored modes", async () => {
	vi.stubEnv("DEV", false)
	vi.stubEnv("PROD", true)
	const page = createPage("_root_/p")
		.cache({ isr: { defer: "stream" } })
		.loader(({ defer }) => ({
			hole: defer(async () => "later value", { key: "hole" }),
			kept: defer(async () => "stored value", { key: "kept", prerender: "resolve" }),
		}))
		.render((props) => [shown(() => props.loaderData.hole), shown(() => props.loaderData.kept)])
	const server = serverFor(page, { site: SITE, store: createMemoryStore() })
	const miss = await server.fetch(new Request(`${SITE}/p`))
	expect(miss.headers.get("cross-origin-opener-policy")).toBe("same-origin")
	await miss.text()
	await expect
		.poll(async () => (await server.fetch(new Request(`${SITE}/p?_flare=data`))).headers.get("flare-cache"))
		.toBe("hit")
	const stored = frames(await (await server.fetch(new Request(`${SITE}/p?_flare=data`))).text())
	expect(stored).toContainEqual({
		t: "l",
		m: "_root_/p",
		d: {
			hole: { __deferred: true, key: "hole", hole: true },
			kept: { __deferred: true, key: "kept", value: "stored value" },
		},
	})
	expect(stored.some((frame) => Reflect.get(Object(frame), "t") === "c")).toBe(false)
	const fill = frames(await (await server.fetch(new Request(`${SITE}/p?_flare=fill`))).text())
	expect(fill).toContainEqual({ t: "c", m: "_root_/p", k: "hole", d: "later value" })
	expect(fill).toContainEqual(
		expect.objectContaining({
			t: "l",
			m: "_root_/p",
			d: expect.objectContaining({ kept: { __deferred: true, key: "kept", kept: true } }),
		}),
	)
})

let harness: Harness | undefined

beforeAll(async () => {
	harness = await startHarness(resolve(dirname(expect.getState().testPath ?? ""), "../.."))
})

afterAll(async () => {
	await harness?.close()
})

// A page that reads its deferred value with `useDeferred` inside `<Loading>`, built on both sides from this source. The
// root writes the whole document, as dx requires: Solid's streamed swap of a resolved boundary needs it.
function deferredApp(api: Api): { router: unknown } {
	const root = api.rootLayout
		.createRootLayout("_root_")
		.render((props) => api.h("html", "doc", () => [api.h("head", "head"), api.h("body", "body", () => props.children)]))
	const home = api.page
		.createPage("_root_/")
		.loader(({ defer }) => ({
			reviews: defer(() => new Promise<string>((done) => setTimeout(() => done("five stars"), 200)), {
				key: "reviews",
			}),
		}))
		.render((props) => {
			const reviews = api.deferred.useDeferred(() => props.loaderData.reviews)
			return api.solid.createComponent(api.solid.Loading, {
				fallback: api.h("p", "waiting", () => "waiting"),
				get children() {
					return api.h("p", "reviews", () => reviews())
				},
			})
		})
	return {
		router: api.router.createRouter({
			layouts: { _root_: root },
			routeTree: [{ id: "_root_/", path: "/", module: home }],
		}),
	}
}

// The document's shell carries the fallback, and the value follows in the same stream; the client hydrates the
// value, and the fallback is gone (dx/defer.md What the component does).
function hydratedValue(engine: Engine): Promise<AppResult> {
	if (harness === undefined) throw new Error("the harness did not start")
	return harness.app(engine, {
		app: deferredApp,
		client(client, record) {
			client.onHydrated(() => record.push("hydrated"))
		},
		async steps(tab) {
			await tab.waitForFunction(() => document.getElementById("reviews")?.textContent === "five stars")
			await tab.evaluate(() => {
				const record = Reflect.get(window, "__flareRecord") as unknown[]
				record.push({
					reviews: document.getElementById("reviews")?.textContent,
					waiting: document.getElementById("waiting") !== null,
				})
			})
		},
	})
}

// A live page whose deferred value rejects after `?delay` milliseconds, read with `useDeferred` inside `<Loading>`
// inside `<Errored>`. The harness sends the function's text, so the delay comes from the URL.
function rejectingApp(api: Api): { router: unknown } {
	const root = api.rootLayout
		.createRootLayout("_root_")
		.render((props) => api.h("html", "doc", () => [api.h("head", "head"), api.h("body", "body", () => props.children)]))
	const home = api.page
		.createPage("_root_/")
		.loader(({ defer, search }) => ({
			broken: defer(
				() =>
					new Promise<string>((_, fail) => setTimeout(() => fail(new Error("stats down")), Number(search["delay"]))),
				{
					key: "broken",
				},
			),
		}))
		.render((props) => {
			const broken = api.deferred.useDeferred(() => props.loaderData.broken)
			return api.solid.createComponent(api.solid.Errored, {
				fallback: (error: () => unknown) => api.h("p", "failed", () => `failed: ${(error() as Error).message}`),
				get children() {
					return api.solid.createComponent(api.solid.Loading, {
						fallback: api.h("p", "waiting", () => "waiting"),
						get children() {
							return api.h("p", "value", () => broken())
						},
					})
				},
			})
		})
	return {
		router: api.router.createRouter({
			layouts: { _root_: root },
			routeTree: [{ id: "_root_/", path: "/", module: home }],
		}),
	}
}

// The slot once the rejection has painted: its <Errored> fallback, and neither the read nor its <Loading> fallback.
function rejected(engine: Engine, timing: Pick<AppCase, "path" | "hydrateAfter">): Promise<AppResult> {
	if (harness === undefined) throw new Error("the harness did not start")
	return harness.app(engine, {
		...timing,
		app: rejectingApp,
		client(client, record) {
			client.onHydrated(() => record.push("hydrated"))
		},
		async steps(tab) {
			await tab.waitForSelector("html[data-flare-hydrated]", { state: "attached" })
			await tab.waitForSelector("#failed", { timeout: 10_000 })
			await tab.evaluate(() =>
				(Reflect.get(window, "__flareRecord") as unknown[]).push({
					failed: document.getElementById("failed")?.textContent,
					value: document.getElementById("value") !== null,
					waiting: document.getElementById("waiting") !== null,
				}),
			)
		},
	})
}

describe.each(ENGINES)("%s", (engine) => {
	it("component reads", async () => {
		const result = await hydratedValue(engine)
		expect(result.problems).toEqual([])
		expect(result.html.indexOf('id="waiting"')).toBeGreaterThan(-1)
		expect(result.html.indexOf('id="waiting"')).toBeLessThan(result.html.indexOf("five stars"))
		expect(result.record).toEqual(["hydrated", { reviews: "five stars", waiting: false }])
	})

	// A live document whose deferred value rejected paints the nearest <Errored> once the client hydrates, whether the
	// rejection reached the page before hydration or after it; before BUGS.md 374 the slot was left empty.
	it("streamed rejection early", async () => {
		const result = await rejected(engine, { path: "/?delay=0", hydrateAfter: 300 })
		expect(result.record).toEqual(["hydrated", { failed: "failed: stats down", value: false, waiting: false }])
	})

	it("streamed rejection late", async () => {
		const result = await rejected(engine, { path: "/?delay=800" })
		expect(result.record).toEqual(["hydrated", { failed: "failed: stats down", value: false, waiting: false }])
	})
})

// A page whose deferred read mounts only after hydration, behind a `<Show>` that `window.__open` opens: Solid's
// hydration data holds nothing for it, so the client reads the value's own slot, which the document settles
// (BUGS.md 375). `/shown` renders it on the server, `/direct-bad` reads `.promise` without useDeferred.
const LATE = appFrom(`
const root = api.rootLayout.createRootLayout("_root_").render((props) => api.h("html", "doc", () => [
	api.h("head", "head"),
	api.h("body", "body", () => props.children),
]))
const view = (initial, direct) => (props) => {
	const [open, setOpen] = api.solid.createSignal(initial)
	if (typeof window !== "undefined") window.__open = () => { setOpen(true); api.solid.flush() }
	const Late = () => {
		const value = direct ? api.solid.createMemo(async () => props.loaderData.v.promise) : api.deferred.useDeferred(() => props.loaderData.v)
		return api.solid.createComponent(api.solid.Errored, {
			fallback: (error) => api.h("p", "failed", () => "failed: " + error().message),
			get children() {
				return api.solid.createComponent(api.solid.Loading, {
					fallback: api.h("p", "wait", () => "wait"),
					get children() { return api.h("p", "late", () => String(value())) },
				})
			},
		})
	}
	return api.solid.createComponent(api.solid.Show, { get when() { return open() }, get children() { return api.solid.createComponent(Late, {}) } })
}
const ok = () => new Promise((done) => setTimeout(() => done("five stars"), 50))
const bad = () => new Promise((_, fail) => setTimeout(() => fail(new Error("stats down")), 50))
const page = (id, fn, initial, cache, direct) => {
	const built = api.page.createPage(id)
	return (cache === undefined ? built : built.cache(cache)).loader(({ defer }) => ({ v: defer(fn, { key: "v" }) })).render(view(initial, direct))
}
const routeTree = [
	{ id: "_root_/shown", path: "/shown", module: page("_root_/shown", ok, true) },
	{ id: "_root_/live", path: "/live", module: page("_root_/live", ok, false) },
	{ id: "_root_/live-bad", path: "/live-bad", module: page("_root_/live-bad", bad, false) },
	{ id: "_root_/direct-bad", path: "/direct-bad", module: page("_root_/direct-bad", bad, false, undefined, true) },
	{ id: "_root_/stored", path: "/stored", module: page("_root_/stored", ok, false, { isr: true }) },
	{ id: "_root_/holed", path: "/holed", module: page("_root_/holed", ok, false, { isr: { defer: "stream" } }) },
]
return {
	router: api.router.createRouter({ layouts: { _root_: root }, routeTree }),
	server: { store: api.memory.createMemoryStore() },
}
`)

// The late slot 1.5 s after it opened, 300 ms after hydration: the value, the read's failure, or still its fallback.
function late(engine: Engine, path: string): Promise<AppResult> {
	if (harness === undefined) throw new Error("the harness did not start")
	return harness.app(engine, {
		app: LATE,
		path,
		prime: path === "/stored" || path === "/holed" ? [{ path }] : [],
		client() {},
		async steps(tab) {
			await tab.waitForSelector("html[data-flare-hydrated]", { state: "attached" })
			await new Promise((done) => setTimeout(done, 300))
			await tab.evaluate(() => (Reflect.get(window, "__open") as () => void)())
			await tab
				.waitForSelector("#late, #failed", { timeout: 1500 })
				.catch(() => new Promise((done) => setTimeout(done, 0)))
			await tab.evaluate(() =>
				(Reflect.get(window, "__flareRecord") as unknown[]).push({
					late: document.getElementById("late")?.textContent ?? null,
					failed: document.getElementById("failed")?.textContent ?? null,
				}),
			)
		},
	})
}

const LATE_SHOWS = { late: "five stars", failed: null }
const LATE_FAILS = { late: null, failed: "failed: stats down" }

describe.each(ENGINES)("%s", (engine) => {
	it.each([
		["/shown", LATE_SHOWS],
		["/live", LATE_SHOWS],
		["/live-bad", LATE_FAILS],
		["/direct-bad", LATE_FAILS],
		["/stored", LATE_SHOWS],
		["/holed", LATE_SHOWS],
	] as const)("late read %s", async (path, want) => {
		const result = await late(engine, path)
		expect(result.problems).toEqual([])
		expect(result.record).toEqual([want])
	})
})

// A deferred value the wire cannot hold, a function or a class instance, settles as that key's error frame on a client
// navigation; the others still stream, the body ends with `d`, and nothing rejects unhandled, which would stop a Node or
// Bun server (BUGS.md 149; a BigInt and a cycle are wire values, B145).
it("unserializable deferred", async () => {
	class Thing {}
	const page = createPage("_root_/odd")
		.loader(({ defer }) => ({
			big: defer(() => Promise.resolve(() => 10)),
			loop: defer(() => Promise.resolve(new Thing())),
			fine: defer(() => Promise.resolve("ok")),
		}))
		.render(() => "odd")
	const unhandled: unknown[] = []
	const note = (reason: unknown): void => void unhandled.push(reason)
	process.on("unhandledRejection", note)
	try {
		const get = serve([{ id: "_root_/odd", path: "/odd", module: page }])
		const answer = await get("/odd?_flare=data")
		const lines = frames(answer.text) as unknown as Array<Record<string, unknown>>
		await new Promise((resolve) => setTimeout(resolve, 50))
		expect(answer.status).toBe(200)
		// The keys are the deferred ids in creation order: big, loop, fine.
		expect(lines.filter((frame) => frame["t"] === "e").map((frame) => frame["k"])).toEqual(["d0", "d1"])
		expect(lines.filter((frame) => frame["t"] === "c")).toEqual([{ t: "c", m: "_root_/odd", k: "d2", d: "ok" }])
		expect(lines.at(-1)).toEqual({ t: "d" })
		expect(unhandled).toEqual([])
	} finally {
		process.off("unhandledRejection", note)
	}
})
