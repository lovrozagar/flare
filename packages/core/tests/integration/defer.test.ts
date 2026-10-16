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

function frames(text: string): unknown[] {
	return text
		.split("\n")
		.filter((line) => line !== "")
		.map((line) => JSON.parse(line) as unknown)
}

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
	expect(first).toContain('"reviews":{"__deferred":true,"key":"reviews"}')
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
	const fill = await (await server.fetch(new Request(`${SITE}/p?_flare=fill`))).text()
	expect(fill).toContain('"t":"c","m":"_root_/p","k":"hole","d":"later value"')
	expect(fill).toContain('"kept":{"__deferred":true,"key":"kept","kept":true}')
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

describe.each(ENGINES)("%s", { timeout: 30_000 }, (engine) => {
	it("component reads", async () => {
		const result = await hydratedValue(engine)
		expect(result.problems).toEqual([])
		expect(result.html.indexOf('id="waiting"')).toBeGreaterThan(-1)
		expect(result.html.indexOf('id="waiting"')).toBeLessThan(result.html.indexOf("five stars"))
		expect(result.record).toEqual(["hydrated", { reviews: "five stars", waiting: false }])
	})
})
