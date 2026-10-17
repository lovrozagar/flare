import { expect, it, vi } from "vitest"
import { createPage } from "../../shared/route-builder/page.ts"
import { createRootLayout } from "../../shared/route-builder/root-layout.ts"
import { createRouter, type RouteModule } from "../../shared/router/create-router.ts"
import { createLayout } from "../../shared/route-builder/layout.ts"
import { createServer, serveWith } from "./create.ts"
import { NO_STORE } from "./policies.ts"
import type { FlareStore } from "../cache/contract.ts"
import { createMemoryStore } from "../cache/memory.ts"

const root = createRootLayout("_root_").render((props) => props.children)
const cdn = { maxAge: "60s", tags: ["t"] }
const PUBLIC = "public, max-age=0, s-maxage=60"

function serve(page: RouteModule, authenticate: () => {} | null): ReturnType<typeof createServer> {
	const router = createRouter({ layouts: { _root_: root }, routeTree: [{ id: "_root_/p", path: "/p", module: page }] })
	return createServer({ router, authenticate })
}

const get = (path = "/p"): Request => new Request(`http://localhost${path}`)

// The decision and the gate read the same memoized session, so authenticate runs once.
it("one session", async () => {
	const authenticate = vi.fn<() => {} | null>(() => ({ userId: "u" }))
	const page = createPage("_root_/p")
		.cache({ isr: true, cdn })
		.authenticateOptional()
		.render(() => "p")
	const response = await serve(page, authenticate).fetch(get())
	expect(response.status).toBe(200)
	expect(response.headers.get("cache-control")).toBe(NO_STORE)
	expect(authenticate).toHaveBeenCalledOnce()
})

it("public chain", async () => {
	const authenticate = vi.fn<() => {} | null>(() => null)
	const page = createPage("_root_/p")
		.cache({ isr: true, cdn })
		.render(() => "p")
	const response = await serve(page, authenticate).fetch(get())
	expect(response.headers.get("cache-control")).toBe(PUBLIC)
	expect(authenticate).not.toHaveBeenCalled()
})

// The decision counts a throw as a session. The gate then answers the throw's status.
it("session throw", async () => {
	const page = createPage("_root_/p")
		.cache({ isr: true, cdn })
		.authenticateOptional()
		.render(() => "p")
	const response = await serve(page, () => {
		throw new Error("store down")
	}).fetch(get())
	expect(response.status).toBe(500)
	expect(response.headers.get("cache-control")).toBe(NO_STORE)
})

// A failed loader on a data request is still HTTP 200, and its `e` frame takes the public header away (B73).
it("data error frame", async () => {
	const page = createPage("_root_/p")
		.cache({ isr: true, cdn })
		.loader(() => {
			throw new Error("boom")
		})
		.render(() => "p")
	const response = await serve(page, () => null).fetch(get("/p?_flare=data"))
	expect(response.status).toBe(200)
	expect(await response.text()).toContain('"t":"e"')
	expect(response.headers.get("cache-control")).toBe(NO_STORE)
	expect(response.headers.has("cache-tag")).toBe(false)
})

// A loader that defers one value settling after 50 ms. `settled` turns true when it does.
function deferring(cache: Parameters<ReturnType<typeof createPage<"_root_/p">>["cache"]>[0], rejects = false) {
	const state = { settled: false }
	const late = (): Promise<string> =>
		new Promise((resolve, reject) =>
			setTimeout(() => {
				state.settled = true
				if (rejects) reject(new Error("late"))
				else resolve("v")
			}, 50),
		)
	const page = createPage("_root_/p")
		.cache(cache)
		.loader(({ defer }) => ({ late: defer(late) }))
		.render(() => "p")
	const router = createRouter({ layouts: { _root_: root }, routeTree: [{ id: "_root_/p", path: "/p", module: page }] })
	return { state, server: createServer({ router, documentResponseDefer: "stream" }) }
}

// A public answer is sent only after every deferred value it started has settled, whatever documentResponseDefer
// says (dx/cache.md).
it("public waits", async () => {
	for (const path of ["/p", "/p?_flare=data"]) {
		const { state, server } = deferring({ isr: true, cdn })
		const response = await server.fetch(get(path))
		expect(state.settled).toBe(true)
		expect(response.headers.get("cache-control")).toBe(PUBLIC)
		expect(response.headers.get("cache-tag")).toBe("t, flare-build-dev")
		await response.text()
	}
})

// A rejection is an error frame. A private page keeps streaming its shell first.
it("deferred rejection", async () => {
	for (const path of ["/p", "/p?_flare=data"]) {
		const { state, server } = deferring({ isr: true, cdn }, true)
		const response = await server.fetch(get(path))
		expect(state.settled).toBe(true)
		expect(response.headers.get("cache-control")).toBe(NO_STORE)
		expect(response.headers.has("cache-tag")).toBe(false)
		await response.text()
	}
	const { state, server } = deferring({ isr: true, cdn: { ...cdn, private: true } }, true)
	const response = await server.fetch(get())
	expect(state.settled).toBe(false)
	expect(response.headers.get("cache-control")).toBe(NO_STORE)
	await response.text()
})

// The fill of a stored `"stream"` hole runs the function live, leaves `private, no-store`, carries no
// `flare-cache`, and never reads or writes the store (dx/defer.md).
it("fill no-store", async () => {
	const late = vi.fn<() => Promise<string>>(async () => "late")
	const page = createPage("_root_/p")
		.cache({ isr: { defer: "stream" }, cdn: { maxAge: "60s" } })
		.loader(({ defer }) => ({ late: defer(late) }))
		.render(() => "p")
	const memory = createMemoryStore()
	const reads = vi.fn<FlareStore["get"]>(memory.get)
	const set = vi.fn<FlareStore["set"]>(memory.set)
	const router = createRouter({ layouts: { _root_: root }, routeTree: [{ id: "_root_/p", path: "/p", module: page }] })
	const app = createServer({ router, site: "https://example.com", store: { ...memory, get: reads, set } })
	const response = await app.fetch(get("/p?_flare=fill"))
	const body = await response.text()
	expect(response.headers.get("cache-control")).toBe(NO_STORE)
	expect(response.headers.has("flare-cache")).toBe(false)
	expect(body).toContain('"t":"c"')
	expect(late).toHaveBeenCalledOnce()
	expect(reads).not.toHaveBeenCalled()
	expect(set).not.toHaveBeenCalled()
})

type Logged = (tag: string, message: string, data?: unknown) => void

const rejected = (): Promise<string> => Promise.reject(new Error("late"))

// A deferred rejection is the client's to report, since an <Errored> may catch it there: its `e` frame is logged and
// sends no overlay payload. A loader throw in the same answer still sends one (dx/plugin.md, BUGS.md B6).
it("deferred no overlay", async () => {
	const sink = {
		dev: true,
		send: vi.fn<(payload: { err: { message: string } }) => void>(),
		log: { level: "warn" as const, error: vi.fn<Logged>(), warn: vi.fn<Logged>(), log: vi.fn<Logged>() },
	}
	const shell = createLayout("_root_/s")
		.loader(({ defer }) => ({ late: defer(rejected) }))
		.render((props) => props.children)
	const page = createPage("_root_/s/p")
		.loader(() => {
			throw new Error("boom")
		})
		.render(() => "p")
	const filled = createPage("_root_/f")
		.cache({ isr: { defer: "stream" } })
		.loader(({ defer }) => ({ late: defer(rejected) }))
		.render(() => "f")
	const router = createRouter({
		layouts: { _root_: root, "_root_/s": shell },
		routeTree: [
			{ id: "_root_/s/p", path: "/s/p", module: page },
			{ id: "_root_/f", path: "/f", module: filled },
		],
	})
	const app = serveWith({ router, site: "https://example.com", store: createMemoryStore() }, sink)
	expect(await (await app.fetch(get("/s/p?_flare=data"))).text()).toContain('"message":"late"')
	expect(sink.send.mock.calls.map(([payload]) => payload.err.message)).toEqual(["boom"])
	expect(await (await app.fetch(get("/f?_flare=fill"))).text()).toContain('"message":"late"')
	expect(sink.send).toHaveBeenCalledOnce()
	expect(sink.log.error.mock.calls.filter((call) => call[1] === "late")).toHaveLength(2)
})

function mask(text: string): string {
	return text.replaceAll(/[0-9a-f]{12,}/g, "#")
}

// A production server has no dev sink, so it never reads the dev tab header: a request carrying it is answered, logged,
// and reported exactly as one without it (B40, BUGS.md B42). Digests and nonces are random hex, so they are masked.
it("prod tab header", async () => {
	const page = createPage("_root_/p")
		.loader(() => {
			throw new Error("boom")
		})
		.render(() => "p")
	const router = createRouter({ layouts: { _root_: root }, routeTree: [{ id: "_root_/p", path: "/p", module: page }] })
	const seen: unknown[] = []
	const variants: Record<string, string>[] = [{}, { "flare-dev-tab": "x" }]
	for (const headers of variants) {
		const log = { level: "error" as const, error: vi.fn<Logged>(), warn: vi.fn<Logged>(), log: vi.fn<Logged>() }
		const app = serveWith({ router }, { dev: false, log })
		const read = vi.spyOn(Headers.prototype, "get")
		const answers = []
		for (const path of ["/p", "/p?_flare=data"]) {
			const response = await app.fetch(new Request(`http://localhost${path}`, { headers }))
			const own = [...response.headers].map(([name, value]) => `${name}: ${mask(value)}`)
			answers.push({ status: response.status, headers: own, body: mask(await response.text()) })
		}
		const tabReads = read.mock.calls.filter(([name]) => name.toLowerCase() === "flare-dev-tab").length
		read.mockRestore()
		const logged = [log.error, log.warn, log.log].map((spy) => spy.mock.calls.map((call) => mask(JSON.stringify(call))))
		seen.push({ answers, logged, tabReads })
	}
	expect(seen[1]).toEqual(seen[0])
	expect(Reflect.get(Object(seen[0]), "tabReads")).toBe(0)
})
