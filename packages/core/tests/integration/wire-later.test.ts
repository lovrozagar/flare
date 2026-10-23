import { createComponent, createMemo, Loading, type Element } from "solid-js"
import { Dynamic } from "@solidjs/web"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { createMemoryStore } from "../../src/server/cache/memory.ts"
import type { FlareStore } from "../../src/server/cache/contract.ts"
import { serveWith } from "../../src/server/lifecycle/create.ts"
import type { Logger } from "../../src/server/lifecycle/logger.ts"
import { createServerFn } from "../../src/server/server-fn/dispatch.ts"
import { createQueryClientGetter } from "../../src/features/query/client/getter.ts"
import { createPage } from "../../src/shared/route-builder/page.ts"
import { createRootLayout } from "../../src/shared/route-builder/root-layout.ts"
import { createRouter, type RouteModule } from "../../src/shared/router/create-router.ts"
import { framesIn } from "../../src/server/wire.fixture.ts"

// Every site a value takes through flare's wire codec refuses one holding a Promise or a ReadableStream, through the
// path it already has for a value the wire cannot hold, and the refused promise is observed: one that rejects after
// the answer is no unhandled rejection, which would end a Node server (BUGS.md 507).

// A server function's config as the plugin writes it.
function named(id: string, name: string) {
	return { method: "post" as const, __id: id, __name: name }
}

const SITE = "https://example.com"
const REFUSED = "a Promise inside the value cannot cross the wire: return a later value through defer()"

function noop(): void {}
const quiet: Logger = { level: "error", error: noop, warn: noop, log: noop }

function documentOf(children: Element): Element {
	return createComponent(Dynamic, {
		component: "html",
		get children() {
			return [
				createComponent(Dynamic, { component: "head" }),
				createComponent(Dynamic, { component: "body", children }),
			]
		},
	})
}
const root = createRootLayout("_root_").render((props) => documentOf(props.children))

// A promise that rejects after the answer is written; nothing but the refusal reads it.
const late = (): Promise<unknown> => new Promise((_, fail) => setTimeout(() => fail(new Error("inner down")), 20))

function server(
	page: RouteModule,
	extra: { store?: FlareStore; serverFns?: Record<string, () => Promise<unknown>> } = {},
) {
	const router = createRouter({ layouts: { _root_: root }, routeTree: [{ id: "_root_/p", path: "/p", module: page }] })
	const bugs: string[] = []
	const app = serveWith({ router, site: SITE, ...extra } as Parameters<typeof serveWith>[0], {
		dev: true,
		log: quiet,
		send: (payload) => void bugs.push(payload.err.message),
	})
	return { app, bugs }
}

let unhandled: unknown[] = []
const note = (reason: unknown): void => void unhandled.push(reason)
beforeEach(() => {
	unhandled = []
	process.on("unhandledRejection", note)
})
// Every case's refused promise rejects after its answer; none of them may reach the process as unhandled.
afterEach(async () => {
	await new Promise((done) => setTimeout(done, 60))
	process.off("unhandledRejection", note)
	if (unhandled.length > 0) throw new Error(`unhandled rejection: ${String(unhandled[0])}`)
})

// A data answer whose loader value the wire refuses fails as one with a function does: a 500 that reports the bug.
it("loader frame refused", async () => {
	const { app, bugs } = server(
		createPage("_root_/p")
			.loader(() => ({ a: late() }))
			.render(() => "p"),
	)
	const response = await app.fetch(new Request(`${SITE}/p?_flare=data`))
	expect(response.status).toBe(500)
	await response.text()
	expect(bugs).toEqual([REFUSED])
})

it("deferred frame refused", async () => {
	const page = createPage("_root_/p")
		.loader(({ defer }) => ({ v: defer(async () => ({ a: late() })), fine: defer(async () => "ok") }))
		.render(() => "p")
	const frames = framesIn(await (await server(page).app.fetch(new Request(`${SITE}/p?_flare=data`))).text())
	expect(frames).toContainEqual(
		expect.objectContaining({ t: "e", m: "_root_/p", k: "d0", e: expect.objectContaining({ message: REFUSED }) }),
	)
	expect(frames).toContainEqual({ t: "c", m: "_root_/p", k: "d1", d: "ok" })
	expect(frames.at(-1)).toEqual({ t: "d" })
})

it("document state refused", async () => {
	const response = await server(
		createPage("_root_/p")
			.loader(() => ({ a: late() }))
			.render(() => "p"),
	).app.fetch(new Request(`${SITE}/p`))
	expect(response.status).toBe(500)
	expect(await response.text()).toContain(REFUSED)
})

it("server function refused", async () => {
	const fn = createServerFn(named("later00000000000", "later")).handler(() => ({
		a: late(),
	}))
	const { app } = server(
		createPage("_root_/p").render(() => "p"),
		{ serverFns: { [fn.id]: async () => fn } },
	)
	const response = await app.fetch(
		new Request(`${SITE}/_flare/fn/${fn.id}`, { method: "POST", headers: { origin: SITE } }),
	)
	expect(response.status).toBe(500)
	expect(JSON.parse(await response.text())).toEqual(
		expect.objectContaining({ name: "later", status: 500, message: REFUSED }),
	)
})

it("server stream refused", async () => {
	const fn = createServerFn(named("laterstream00000", "laterStream")).stream(async function* () {
		yield 1
		yield { a: late() }
	})
	const { app } = server(
		createPage("_root_/p").render(() => "p"),
		{ serverFns: { [fn.id]: async () => fn } },
	)
	const response = await app.fetch(
		new Request(`${SITE}/_flare/fn/${fn.id}`, { method: "POST", headers: { origin: SITE } }),
	)
	const lines = (await response.text())
		.trim()
		.split("\n")
		.map((line) => JSON.parse(line) as Record<string, unknown>)
	expect(lines).toHaveLength(2)
	expect(lines[1]).toEqual(expect.objectContaining({ name: "laterStream", status: 500, message: REFUSED }))
})

// A query cache the wire refuses fails the data answer as one holding a function does: a 500 that reports the bug.
it("query frame refused", async () => {
	const getQueryClient = createQueryClientGetter()
	const page = createPage("_root_/p")
		.loader(async () => {
			await getQueryClient().fetchQuery({ queryKey: ["later"], queryFn: async () => ({ a: late() }) })
			return null
		})
		.render(() => "p")
	const { app, bugs } = server(page)
	const response = await app.fetch(new Request(`${SITE}/p?_flare=data`))
	expect(response.status).toBe(500)
	await response.text()
	expect(bugs).toEqual([REFUSED])
})

it("stored answer refused", async () => {
	const store = createMemoryStore()
	const set = vi.fn<FlareStore["set"]>(store.set)
	const page = createPage("_root_/p")
		.cache({ isr: true })
		.loader(() => ({ a: late() }))
		.render(() => "p")
	const response = await server(page, { store: { ...store, set } }).app.fetch(new Request(`${SITE}/p`))
	expect(response.status).toBe(500)
	await new Promise((done) => setTimeout(done, 50))
	expect(set).not.toHaveBeenCalled()
})

// The refusal is flare's codec's alone: Solid's own serializer still streams an async memo's promise in a document.
it("solid still streams", async () => {
	const page = createPage("_root_/p").render(() =>
		createComponent(Loading, {
			fallback: "waiting",
			get children() {
				const value = createMemo(async () => "streamed-41")
				return [() => value()]
			},
		}),
	)
	const html = await (await server(page).app.fetch(new Request(`${SITE}/p`))).text()
	expect(html).toContain("streamed-41")
	expect(html).not.toContain(REFUSED)
})
