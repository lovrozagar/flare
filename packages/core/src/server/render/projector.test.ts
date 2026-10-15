import { createComponent, type Element } from "solid-js"
import { Dynamic, markSafeError } from "@solidjs/web"
import { expect, it, vi } from "vitest"
import type { DevErrorPayload } from "../../shared/errors/dev-report.ts"
import { notFound, unauthenticated } from "../../shared/errors/http.ts"
import type { RouteRecord } from "../../shared/route-builder/page.ts"
import { createPage } from "../../shared/route-builder/page.ts"
import { createRootLayout } from "../../shared/route-builder/root-layout.ts"
import { createRouter } from "../../shared/router/create-router.ts"
import type { Logger } from "../lifecycle/logger.ts"
import { serveWith } from "../lifecycle/create.ts"
import { devSink, requestSink, type ErrorSink } from "./projector.ts"

const FRAME = /\n\s+at /

// A stack inside the state script is JSON, so its newline is the two characters \n.
const BODY_FRAME = /(\n|\\n)\s+at /

// A production root renders a whole document (B37).
const tag = (component: string, children: Element): Element => createComponent(Dynamic, { component, children })
const whole = (children: Element): Element => tag("html", tag("body", children))

const root = createRootLayout("_root_").render((props) => whole(["root[", props.children, "]"]))

function probe(dev: boolean): { sink: ErrorSink; send: ReturnType<typeof vi.fn>; lines: string[] } {
	const lines: string[] = []
	const write = (tag: string, message: string, data?: unknown): void => {
		lines.push([tag, message, data === undefined ? "" : String(data)].join(" "))
	}
	const log: Logger = { level: "error", error: write, warn: write, log: write }
	const send = vi.fn<(payload: DevErrorPayload) => void>()
	return { sink: { dev, send, log }, send, lines }
}

async function get(page: RouteRecord, sink: ErrorSink): Promise<{ status: number; body: string }> {
	const router = createRouter({ layouts: { _root_: root }, routeTree: [{ id: "_root_/", path: "/", module: page }] })
	const response = await serveWith({ router, authenticate: () => ({ user: "u" }) }, sink).fetch(
		new Request("http://localhost/"),
	)
	return { status: response.status, body: await response.text() }
}

function throwing(error: unknown): RouteRecord {
	return createPage("_root_/")
		.loader(() => {
			throw error
		})
		.render(() => "page")
}

it("prod generic", async () => {
	const prod = probe(false)
	const { status, body } = await get(throwing(new Error("secret")), prod.sink)
	expect(status).toBe(500)
	expect(body).not.toContain("secret")
	expect(body).not.toMatch(BODY_FRAME)
	const digest = /"digest":"([0-9a-f]{12})"/.exec(body)?.[1]
	if (digest === undefined) throw new Error("no digest in the body")
	expect(body).toContain("Something went wrong")
	expect(prod.send).not.toHaveBeenCalled()
	expect(prod.lines.join("\n")).toContain(digest)
	expect(prod.lines.join("\n")).not.toContain("secret")
})

it("prod safe", async () => {
	const prod = probe(false)
	const { status, body } = await get(throwing(markSafeError(new Error("visible"))), prod.sink)
	expect(status).toBe(500)
	expect(body).toContain("visible")
	expect(body).not.toMatch(BODY_FRAME)
	expect(prod.send).not.toHaveBeenCalled()
})

it("dev detail", async () => {
	const dev = probe(true)
	const page = createPage("_root_/")
		.loader(() => {
			throw new Error("secret")
		})
		.render(() => "page")
		.errorRender(() => "custom")
	const { status, body } = await get(page, dev.sink)
	expect(status).toBe(500)
	expect(body).toContain("custom")
	expect(body).toContain("secret")
	expect(body).toMatch(BODY_FRAME)
	expect(dev.send).toHaveBeenCalledExactlyOnceWith({
		type: "error",
		err: { message: "secret", stack: expect.stringMatching(FRAME) },
	})
	expect(dev.lines.join("\n")).toContain("secret")
	expect(dev.lines.join("\n")).toMatch(FRAME)
})

it("string thrown", async () => {
	const dev = probe(true)
	const { status, body } = await get(throwing("plain secret"), dev.sink)
	expect(status).toBe(500)
	expect(body).toContain('"message":"plain secret","stack":""')
	expect(dev.send).toHaveBeenCalledExactlyOnceWith({ type: "error", err: { message: "plain secret", stack: "" } })
})

it("not found in render", async () => {
	const dev = probe(true)
	const page = createPage("_root_/").render(() => notFound())
	expect((await get(page, dev.sink)).status).toBe(404)
	expect(dev.send).not.toHaveBeenCalled()
})

it("unauthenticated in render", async () => {
	const dev = probe(true)
	const page = createPage("_root_/").render(() => unauthenticated())
	expect((await get(page, dev.sink)).status).toBe(401)
	expect(dev.send).not.toHaveBeenCalled()
})

it("render has no auth", async () => {
	const seen: object[] = []
	const page = createPage("_root_/")
		.authenticate()
		.render((props) => {
			seen.push(props)
			return "page"
		})
	expect((await get(page, probe(false).sink)).status).toBe(200)
	expect(seen).toHaveLength(1)
	expect("auth" in seen[0]).toBe(false)
})

it("bigint", async () => {
	const prod = probe(false)
	const page = createPage("_root_/")
		.loader(() => ({ count: 1n }))
		.render(() => "page")
	expect(await get(page, prod.sink)).toEqual({ status: 500, body: "" })
})

it("null title", async () => {
	const page = createPage("_root_/")
		.head(() => JSON.parse('{"title":null}'))
		.render(() => "page")
	const { status, body } = await get(page, probe(false).sink)
	expect(status).toBe(200)
	expect(body).not.toContain("<title")
})

it("dev sink", () => {
	const send = vi.fn<(event: string, payload: unknown) => void>()
	const hot = devSink({ env: { DEV: true }, hot: { send } })
	expect(hot.dev).toBe(true)
	const payload = { type: "error" as const, err: { message: "m", stack: "" } }
	hot.send?.(payload)
	expect(send).toHaveBeenCalledExactlyOnceWith("flare:error", { token: undefined, payload })
	// A request's sink tags its payloads with its dev tab token (B42, B95 (b)).
	requestSink(hot, "T1").send?.(payload)
	expect(send).toHaveBeenLastCalledWith("flare:error", { token: "T1", payload })
	requestSink(hot, undefined).send?.(payload)
	expect(send).toHaveBeenLastCalledWith("flare:error", { token: undefined, payload })
	const built = devSink({ env: { DEV: false } })
	expect(built.dev).toBe(false)
	expect(built.send).toBeUndefined()
	expect(requestSink(built, "T1")).toBe(built)
})

// With Vite's hot channel able to listen, the dev sink also asks the dev server for a document's styles, and every
// call keeps the hot context as its receiver (B104).
it("dev styles sink", async () => {
	const sent: unknown[] = []
	const hot = {
		listeners: new Map<string, (payload: unknown) => void>(),
		send(event: string, payload: unknown) {
			sent.push(payload)
			if (event === "flare:styles")
				this.listeners.get(event)?.({ request: Reflect.get(Object(payload), "request"), styles: [] })
		},
		on(event: string, listener: (payload: unknown) => void) {
			this.listeners.set(event, listener)
		},
	}
	const sink = devSink({ env: { DEV: true }, hot })
	expect(await sink.styles?.(["_root_"])).toEqual([])
	expect(sent).toEqual([{ request: 0, routes: ["_root_"] }])
	// The requests in flight live in the module's hot data, which survives a re-evaluation (BUGS.md 86).
	const data = {}
	await devSink({ env: { DEV: true }, hot: { ...hot, data } }).styles?.(["_root_"])
	await devSink({ env: { DEV: true }, hot: { ...hot, data } }).styles?.(["_root_"])
	expect(sent.slice(1)).toEqual([
		{ request: 0, routes: ["_root_"] },
		{ request: 1, routes: ["_root_"] },
	])
	expect(devSink({ env: { DEV: true }, hot: { send: () => undefined } }).styles).toBeUndefined()
	// A dev server that never answers: the document renders without styles and the warning is logged.
	vi.useFakeTimers()
	const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined)
	try {
		const silent = devSink({ env: { DEV: true }, hot: { send: () => undefined, on: () => undefined } })
		const pending = silent.styles?.(["_root_"])
		vi.advanceTimersByTime(2000)
		expect(await pending).toEqual([])
		expect(warn).toHaveBeenCalledOnce()
	} finally {
		warn.mockRestore()
		vi.useRealTimers()
	}
})
