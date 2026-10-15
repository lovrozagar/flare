import { createComponent, createMemo, Errored, Loading } from "solid-js"
import type { JSX } from "@solidjs/web"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { encodeFrame, type Frame } from "../../shared/protocol/index.ts"
import { createPage } from "../../shared/route-builder/page.ts"
import type { Deferred } from "../../shared/route-builder/register.ts"
import { createRootLayout } from "../../shared/route-builder/root-layout.ts"
import { createRouter } from "../../shared/router/create-router.ts"
import { mountNavigator, settled, unmountAll } from "./navigate.fixture.ts"

// Deferred values arrive as `c` and `e` frames after the commit at `r` (B80).

const root = createRootLayout("_root_").render((props) => ["root[", props.children, "]"])
const home = createPage("_root_/").render((props) => `home:${String(props.loaderData)}`)
type Slots = { fast: Deferred<string>; slow: Deferred<string> }

// The client lands the data as frames and never runs a loader. The loader only types it.
async function slots(): Promise<Slots> {
	throw new Error("the client does not run loaders")
}

function slot(deferred: Deferred<string>, fallback: string): JSX.Element {
	return createComponent(Loading, {
		fallback,
		get children() {
			const value = createMemo(async () => deferred.promise)
			return [() => value()]
		},
	})
}

const slotted = createPage("_root_/slots")
	.loader(slots)
	.render((props) => {
		const data = props.loaderData
		return [slot(data.fast, "wait-fast"), "|", slot(data.slow, "wait-slow")]
	})
	.errorRender(() => "page-error")
const caught = createPage("_root_/caught")
	.loader(slots)
	.render((props) => {
		const data = props.loaderData
		return [
			createComponent(Errored, {
				fallback: () => "caught",
				get children() {
					return slot(data.fast, "wait-fast")
				},
			}),
			"|",
			slot(data.slow, "wait-slow"),
		]
	})
const escaped = createPage("_root_/escaped")
	.loader(slots)
	.render((props) => {
		const data = props.loaderData
		return [slot(data.fast, "wait-fast"), "|", slot(data.slow, "wait-slow")]
	})

// A page whose read resolves for id "a" and stays pending for any other id, under the page's own <Loading>. And a page
// whose pending read has no <Loading> around it, so its commit holds (B106).
const never = new Promise<string>(() => undefined)
const reading = createPage("_root_/read/[id]").render((props) => [
	"read:",
	createComponent(Loading, {
		fallback: "wait",
		get children() {
			const value = createMemo(async () => (props.params.id === "a" ? "A" : never))
			return [() => value()]
		},
	}),
])
const holding = createPage("_root_/held").render(() => {
	const value = createMemo(async () => never)
	return ["held:", () => value()]
})

const router = createRouter({
	layouts: { _root_: root },
	routeTree: [
		{ id: "_root_/", path: "/", module: home },
		{ id: "_root_/read/[id]", path: "/read/[id]", module: reading },
		{ id: "_root_/held", path: "/held", module: holding },
		{ id: "_root_/slots", path: "/slots", module: slotted },
		{ id: "_root_/caught", path: "/caught", module: caught },
		{ id: "_root_/escaped", path: "/escaped", module: escaped },
	],
})

beforeEach(() => {
	history.replaceState(null, "", "/")
})

afterEach(unmountAll)

// A data response the test writes into frame by frame, and can break as the browser's fetch does on an abort.
type Streamed = {
	response: Response
	write: (frame: Frame) => void
	close: () => void
	fail: (reason: unknown) => void
}

function streamed(route: string): Streamed {
	const encoder = new TextEncoder()
	let controller!: ReadableStreamDefaultController<Uint8Array>
	const body = new ReadableStream<Uint8Array>({ start: (opened) => void (controller = opened) })
	const write = (frame: Frame): void => controller.enqueue(encoder.encode(encodeFrame(frame)))
	write({ t: "l", m: "_root_", d: null })
	write({ t: "l", m: route, d: { fast: { __deferred: true, key: "d0" }, slow: { __deferred: true, key: "d1" } } })
	return {
		response: new Response(body, { headers: { "content-type": "application/x-ndjson" } }),
		write,
		close: () => controller.close(),
		fail: (reason) => controller.error(reason),
	}
}

it("two slots", async () => {
	const data = streamed("_root_/slots")
	const app = await mountNavigator(router, async () => data.response)
	const pushes: string[] = []
	const push = vi.spyOn(history, "pushState").mockImplementation(function (this: History, ...args) {
		pushes.push(app.text())
		History.prototype.pushState.apply(this, args)
	})
	const navigated = app.navigator.navigate({ to: "_root_/slots" })
	data.write({ t: "r" })
	await navigated
	await settled()
	expect(pushes).toEqual(["root[wait-fast|wait-slow]"])
	data.write({ t: "c", m: "_root_/slots", k: "d0", d: "FAST" })
	await settled()
	expect(app.text()).toBe("root[FAST|wait-slow]")
	data.write({ t: "c", m: "_root_/slots", k: "d1", d: "SLOW" })
	data.write({ t: "d" })
	data.close()
	await settled()
	expect(app.text()).toBe("root[FAST|SLOW]")
	expect(pushes).toHaveLength(1)
	push.mockRestore()
})

it("slot catches", async () => {
	const data = streamed("_root_/caught")
	const send = vi.fn<(error: unknown) => void>()
	const app = await mountNavigator(router, async () => data.response, { onBoundaryError: send })
	const navigated = app.navigator.navigate({ to: "_root_/caught" })
	data.write({ t: "r" })
	await navigated
	data.write({ t: "e", m: "_root_/caught", k: "d0", e: { message: "fast failed", digest: "0" } })
	data.write({ t: "c", m: "_root_/caught", k: "d1", d: "SLOW" })
	data.close()
	await settled()
	await settled()
	expect(app.text()).toBe("root[caught|SLOW]")
	expect(send).not.toHaveBeenCalled()
})

it("slot escapes", async () => {
	const data = streamed("_root_/escaped")
	const send = vi.fn<(error: unknown) => void>()
	const app = await mountNavigator(router, async () => data.response, { onBoundaryError: send })
	const navigated = app.navigator.navigate({ to: "_root_/escaped" })
	data.write({ t: "r" })
	await navigated
	data.write({ t: "e", m: "_root_/escaped", k: "d0", e: { message: "fast failed", digest: "0" } })
	data.close()
	await settled()
	await settled()
	expect(app.text()).toBe("root[Something went wrong]")
	// The slow value never came either, so it rejects when the stream ends: a second report.
	expect(send).toHaveBeenNthCalledWith(1, expect.objectContaining({ message: "fast failed" }))
})

// The first navigation has landed at `r` with both values still streaming when a second one aborts it, and the
// browser's fetch errors the body with an AbortError. Until the second commits, the first page keeps its fallbacks:
// its values stay pending, not failed. A third, stopped by a blocker, resolves too. No rejection escapes (B105,
// BUGS.md B58).
it("superseded resolves", async () => {
	const data = streamed("_root_/slots")
	const frames: Frame[] = [
		{ t: "l", m: "_root_", d: null },
		{ t: "l", m: "_root_/", d: "fresh" },
		{ t: "r" },
		{ t: "d" },
	]
	const second = Promise.withResolvers<Response>()
	const fetches = [
		async (signal: AbortSignal) => {
			signal.addEventListener("abort", () =>
				data.fail(new DOMException("signal is aborted without reason", "AbortError")),
			)
			return data.response
		},
		async () => second.promise,
	]
	const app = await mountNavigator(router, async (_url, init) =>
		(fetches.shift() ?? fetches[0])(init.signal as AbortSignal),
	)
	const unhandled: unknown[] = []
	const record = (reason: unknown) => unhandled.push(reason)
	process.on("unhandledRejection", record)
	const first = app.navigator.navigate({ to: "_root_/slots" })
	data.write({ t: "r" })
	await expect(first).resolves.toBeUndefined()
	const navigated = app.navigator.navigate({ to: "_root_/" })
	await settled()
	expect(app.text()).toBe("root[wait-fast|wait-slow]")
	second.resolve(
		new Response(frames.map(encodeFrame).join(""), { headers: { "content-type": "application/x-ndjson" } }),
	)
	await expect(navigated).resolves.toBeUndefined()
	app.deps.blockers.register(() => false)
	await expect(app.navigator.navigate({ to: "_root_/slots" })).resolves.toBeUndefined()
	await settled()
	process.off("unhandledRejection", record)
	expect(app.text()).toBe("root[home:fresh]")
	expect(unhandled).toEqual([])
})

function frames(id: string): Response {
	const list: Frame[] = [{ t: "l", m: "_root_", d: null }, { t: "l", m: id, d: null }, { t: "r" }, { t: "d" }]
	return new Response(list.map(encodeFrame).join(""), { headers: { "content-type": "application/x-ndjson" } })
}

function byPath(url: string): Response {
	const path = new URL(url, "http://localhost").pathname
	if (path.startsWith("/read/")) return frames("_root_/read/[id]")
	return frames(path === "/held" ? "_root_/held" : "_root_/")
}

// The same page with a new param, whose read stays pending: the page shows its own fallback at once, and history is
// pushed with that commit, never while the old page is on screen (B106, BUGS.md 62).
it("pending read commits", async () => {
	const app = await mountNavigator(router, async (url) => byPath(url))
	const pushes: string[] = []
	const push = vi.spyOn(history, "pushState").mockImplementation(function (this: History, ...args) {
		pushes.push(`${String(args[2])} ${app.text()}`)
		History.prototype.pushState.apply(this, args)
	})
	await app.navigator.navigate({ to: "_root_/read/[id]", params: { id: "a" } })
	await settled()
	expect(app.text()).toBe("root[read:A]")
	const pending = app.navigator.navigate({ to: "_root_/read/[id]", params: { id: "b" } })
	await settled()
	await settled()
	expect(app.text()).toBe("root[read:wait]")
	await pending
	expect(location.pathname).toBe("/read/b")
	expect(app.store.snapshot().location.pathname).toBe("/read/b")
	expect(pushes.at(-1)).toBe("/read/b root[read:wait]")
	push.mockRestore()
})

// A commit that holds, a read with no <Loading> around it, does not move the URL while the old page is on screen. A
// second navigation then commits, the URL is its own, and neither navigation rejects (B105, B106).
it("supersede pending read", async () => {
	const app = await mountNavigator(router, async (url) => byPath(url))
	const unhandled: unknown[] = []
	const record = (reason: unknown) => unhandled.push(reason)
	process.on("unhandledRejection", record)
	const held = app.navigator.navigate({ to: "_root_/held" })
	await settled()
	await settled()
	expect(app.text()).toBe("root[home:start]")
	expect(location.pathname).toBe("/")
	await app.navigator.navigate({ to: "_root_/read/[id]", params: { id: "a" } })
	await settled()
	await expect(held).resolves.toBeUndefined()
	expect(app.text()).toBe("root[read:A]")
	expect(location.pathname).toBe("/read/a")
	expect(history.length).toBeGreaterThan(0)
	process.off("unhandledRejection", record)
	expect(unhandled).toEqual([])
})
