import { createComponent, createMemo, Loading } from "solid-js"
import { expect, it, vi } from "vitest"
import type { DevErrorPayload } from "../../shared/errors/dev-report.ts"
import { redirect } from "../../shared/errors/redirect.ts"
import type { Frame } from "../../shared/protocol/index.ts"
import type { Deferred } from "../../shared/route-builder/register.ts"
import { createPage } from "../../shared/route-builder/page.ts"
import { createRootLayout } from "../../shared/route-builder/root-layout.ts"
import { createRouter, type RouteModule } from "../../shared/router/create-router.ts"
import { serveWith } from "../lifecycle/create.ts"
import type { Logger } from "../lifecycle/logger.ts"
import { runLoaders } from "../loaders/run.ts"
import { decodeLine } from "../../shared/protocol/index.ts"

function noop(): void {}

const quiet: Logger = { level: "error", error: noop, warn: noop, log: noop }

const root = createRootLayout("_root_")
	.loader(() => ({ text: "root" }))
	.head(() => ({ title: "Root" }))
	.render((props) => ["root[", props.children, "]"])

type Slots = { fast: PromiseWithResolvers<string>; slow: PromiseWithResolvers<string>; calls: string[] }

function slots(): Slots {
	return { fast: Promise.withResolvers(), slow: Promise.withResolvers(), calls: [] }
}

// The slow defer is created first, so completion order differs from creation order.
function deferring(held: Slots): RouteModule {
	return createPage("_root_/about")
		.loader(({ defer }) => ({
			slow: defer(() => {
				held.calls.push("slow")
				return held.slow.promise
			}),
			fast: defer(() => {
				held.calls.push("fast")
				return held.fast.promise
			}),
		}))
		.head(() => ({ title: "About" }))
		.render((props) => {
			const data = props.loaderData as { fast: Deferred<string> }
			return createComponent(Loading, {
				fallback: "waiting",
				get children() {
					const value = createMemo(async () => data.fast.promise)
					return [() => value()]
				},
			})
		})
}

function app(page: RouteModule, options: { buffer?: boolean; send?: (payload: DevErrorPayload) => void } = {}) {
	const router = createRouter({
		layouts: { _root_: root },
		routeTree: [{ id: "_root_/about", path: "/about", module: page }],
	})
	const documentResponseDefer = options.buffer === true ? "buffer" : "stream"
	return serveWith({ router, documentResponseDefer }, { dev: true, send: options.send, log: quiet })
}

// Reads NDJSON lines as they arrive.
function lines(response: Response): { next: () => Promise<Frame | undefined> } {
	const reader = response.body?.getReader()
	if (reader === undefined) throw new Error("no body")
	const decoder = new TextDecoder()
	const queue: Frame[] = []
	let buffer = ""
	return {
		async next() {
			while (queue.length === 0) {
				const chunk = await reader.read()
				if (chunk.done) return undefined
				buffer += decoder.decode(chunk.value)
				const parts = buffer.split("\n")
				buffer = parts.pop() ?? ""
				for (const part of parts) queue.push(decodeLine(part))
			}
			return queue.shift()
		},
	}
}

async function rest(read: { next: () => Promise<Frame | undefined> }): Promise<Frame[]> {
	const frames: Frame[] = []
	for (let frame = await read.next(); frame !== undefined; frame = await read.next()) frames.push(frame)
	return frames
}

function data(path = "/about"): Request {
	return new Request(`http://localhost${path}?_flare=data`)
}

it("order", async () => {
	const held = slots()
	const response = await app(deferring(held)).fetch(data())
	held.slow.resolve("SLOW")
	held.fast.resolve("FAST")
	const frames = await rest(lines(response))
	expect(frames.map((frame) => frame.t)).toEqual(["l", "l", "h", "h", "r", "c", "c", "d"])
	expect(frames[1]).toEqual({
		t: "l",
		m: "_root_/about",
		d: { slow: { __deferred: true, key: "d0" }, fast: { __deferred: true, key: "d1" } },
	})
	expect(frames[3]).toEqual({ t: "h", m: "_root_/about", d: { title: "About" } })
})

it("two settle", async () => {
	const held = slots()
	const read = lines(await app(deferring(held)).fetch(data()))
	for (let index = 0; index < 5; index += 1) await read.next()
	held.fast.resolve("FAST")
	expect(await read.next()).toEqual({ t: "c", m: "_root_/about", k: "d1", d: "FAST" })
	held.slow.resolve("SLOW")
	expect(await rest(read)).toEqual([{ t: "c", m: "_root_/about", k: "d0", d: "SLOW" }, { t: "d" }])
})

it("content type", async () => {
	const held = slots()
	held.fast.resolve("FAST")
	held.slow.resolve("SLOW")
	const response = await app(deferring(held)).fetch(data())
	expect(response.status).toBe(200)
	expect(response.headers.get("content-type")).toBe("application/x-ndjson")
	await response.text()
})

it("redirect", async () => {
	const send = vi.fn<(payload: DevErrorPayload) => void>()
	const moved = createPage("_root_/about")
		.loader(() => redirect({ to: "_root_/about", search: { from: "a" }, hash: "top", status: 302 }))
		.render(() => "about")
	const response = await app(moved, { send }).fetch(data())
	expect(response.status).toBe(200)
	expect(await response.text()).toBe('{"t":"x","s":302,"u":"/about?from=a#top","r":true}\n')
	expect(send).not.toHaveBeenCalled()
})

it("defer rejected", async () => {
	const held = slots()
	const response = await app(deferring(held)).fetch(data())
	held.slow.reject(new Error("slow failed"))
	held.fast.resolve("FAST")
	const frames = await rest(lines(response))
	expect(frames.filter((frame) => frame.t === "l")).toHaveLength(2)
	expect(frames).toContainEqual({
		t: "e",
		m: "_root_/about",
		k: "d0",
		e: { message: "slow failed", stack: expect.stringContaining("slow failed") },
	})
})

it("one rejects", async () => {
	const held = slots()
	const read = lines(await app(deferring(held)).fetch(data()))
	for (let index = 0; index < 5; index += 1) await read.next()
	held.slow.reject(new Error("slow failed"))
	expect(await read.next()).toMatchObject({ t: "e", k: "d0" })
	held.fast.resolve("FAST")
	expect(await rest(read)).toEqual([{ t: "c", m: "_root_/about", k: "d1", d: "FAST" }, { t: "d" }])
})

it("document buffer", async () => {
	const held = slots()
	const pending = app(deferring(held), { buffer: true }).fetch(new Request("http://localhost/about"))
	const raced = await Promise.race([
		pending.then(() => "sent"),
		new Promise((resolve) => setTimeout(resolve, 20, "held")),
	])
	expect(raced).toBe("held")
	held.fast.resolve("FAST")
	held.slow.resolve("SLOW")
	const body = await (await pending).text()
	expect(body).toContain("root[FAST")
	expect(body).not.toContain("waiting")
})

it("document stream", async () => {
	const held = slots()
	const response = await app(deferring(held)).fetch(new Request("http://localhost/about"))
	const reader = response.body?.getReader()
	if (reader === undefined) throw new Error("no body")
	expect(new TextDecoder().decode((await reader.read()).value)).toContain("waiting")
	held.fast.resolve("FAST")
	held.slow.resolve("SLOW")
	await reader.cancel()
})

it("data ignores buffer", async () => {
	const held = slots()
	const read = lines(await app(deferring(held), { buffer: true }).fetch(data()))
	for (let index = 0; index < 5; index += 1) await read.next()
	held.fast.resolve("FAST")
	expect(await read.next()).toMatchObject({ t: "c", k: "d1" })
	held.slow.resolve("SLOW")
	await rest(read)
})

it("stored stream stays a hole", async () => {
	const held = slots()
	const streamed = createPage("_root_/about")
		.cache({ ssr: { ttl: "1m", defer: "stream" } })
		.loader(({ defer }) => ({ fast: defer(() => held.fast.promise) }))
		.render(() => "about")
	const built = createPage("_root_/built")
		.cache({ ssg: { defer: "stream" } })
		.loader(({ defer }) => ({ slow: defer(() => held.slow.promise) }))
		.render(() => "built")
	const run = await runLoaders({
		kind: "document",
		request: new Request("http://localhost/about"),
		env: {},
		authenticate: () => null,
		stored: true,
		routes: [
			{ ...streamed, id: "_root_/about" },
			{ ...built, id: "_root_/built" },
		],
	})
	// A hole travels on the wire, so the client reads it as a client source (useDeferred).
	expect(run.data).toEqual([
		{ fast: { __deferred: true, key: "d0", hole: true } },
		{ slow: { __deferred: true, key: "d0", hole: true } },
	])
	expect(run.deferred).toEqual([])
	expect(held.calls).toEqual([])
})

// `cache.isr.defer` decides a stored ISR render the way `ssr.defer` and `ssg.defer` do (dx/defer.md).
it("isr stream stays a hole", async () => {
	const held = slots()
	const page = createPage("_root_/isr")
		.cache({ isr: { defer: "stream" } })
		.loader(({ defer }) => ({
			fast: defer(() => {
				held.calls.push("fast")
				return held.fast.promise
			}),
		}))
		.render(() => "isr")
	const run = await runLoaders({
		kind: "document",
		request: new Request("http://localhost/isr"),
		env: {},
		authenticate: () => null,
		stored: true,
		routes: [{ ...page, id: "_root_/isr" }],
	})
	expect(run.data).toEqual([{ fast: { __deferred: true, key: "d0", hole: true } }])
	expect(held.calls).toEqual([])
})

it("cancel", async () => {
	const held = slots()
	const response = await app(deferring(held)).fetch(data())
	const reader = response.body?.getReader()
	if (reader === undefined) throw new Error("no body")
	await reader.read()
	await reader.cancel()
	held.fast.resolve("FAST")
	held.slow.reject(new Error("late"))
	await expect(Promise.allSettled([held.fast.promise, held.slow.promise])).resolves.toHaveLength(2)
	await new Promise((resolve) => setTimeout(resolve, 0))
})

it("loader e", async () => {
	const send = vi.fn<(payload: DevErrorPayload) => void>()
	const broken = createPage("_root_/about")
		.loader(() => {
			throw new Error("loader broke")
		})
		.render(() => "about")
	const response = await app(broken, { send }).fetch(data())
	expect(response.status).toBe(200)
	const frames = await rest(lines(response))
	expect(frames).toEqual([
		{ t: "l", m: "_root_", d: { text: "root" } },
		{ t: "e", m: "_root_/about", e: { message: "loader broke", stack: expect.stringContaining("loader broke") } },
		{ t: "h", m: "_root_", d: { title: "Root" } },
		{ t: "r" },
		{ t: "d" },
	])
	expect(send).toHaveBeenCalledOnce()
})

function headBroke(): never {
	throw new Error("head broke")
}

it("head throw", async () => {
	const send = vi.fn<(payload: DevErrorPayload) => void>()
	const page = createPage("_root_/about")
		.loader(() => ({ text: "about" }))
		.head(headBroke)
		.render(() => "about")
	const frames = await rest(lines(await app(page, { send }).fetch(data())))
	expect(frames.map((frame) => frame.t)).toEqual(["l", "l", "h", "r", "d"])
	expect(frames[2]).toEqual({ t: "h", m: "_root_", d: { title: "Root" } })
	expect(send).toHaveBeenCalledExactlyOnceWith(
		expect.objectContaining({ err: expect.objectContaining({ message: "head broke" }) }),
	)
})
