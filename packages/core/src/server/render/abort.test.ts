import { createRequestEvent, getRequestEvent } from "@solidjs/web"
import { expect, it, vi } from "vitest"
import { raceAbort, renderStop } from "./abort.ts"
import { invalidWrites } from "./writes.fixture.ts"

const encoder = new TextEncoder()

// A render that writes only what the test pushes, and never ends by itself.
function pending(): { stream: ReadableStream<Uint8Array>; push: (text: string) => void; cancel: () => void } {
	const started: ReadableStreamDefaultController<Uint8Array>[] = []
	const cancel = vi.fn<() => void>()
	const stream = new ReadableStream<Uint8Array>({
		start(controller) {
			started.push(controller)
		},
		cancel,
	})
	return { stream, push: (text) => started[0].enqueue(encoder.encode(text)), cancel }
}

it("before shell", async () => {
	const render = pending()
	const dispose = vi.fn<() => void>()
	const abort = new AbortController()
	const reader = raceAbort(render.stream, abort.signal, dispose).getReader()
	const first = reader.read()
	abort.abort()
	expect(await first).toEqual({ done: true, value: undefined })
	expect(dispose).toHaveBeenCalledOnce()
	expect(render.cancel).toHaveBeenCalledOnce()
})

it("mid stream", async () => {
	const render = pending()
	const dispose = vi.fn<() => void>()
	const abort = new AbortController()
	const reader = raceAbort(render.stream, abort.signal, dispose).getReader()
	render.push("shell")
	expect(new TextDecoder().decode((await reader.read()).value)).toBe("shell")
	const next = reader.read()
	abort.abort()
	expect(await next).toEqual({ done: true, value: undefined })
	await expect(reader.closed).resolves.toBeUndefined()
	expect(dispose).toHaveBeenCalledOnce()
})

it("idempotent", async () => {
	const render = pending()
	const dispose = vi.fn<() => void>()
	const abort = new AbortController()
	const reader = raceAbort(render.stream, abort.signal, dispose).getReader()
	const first = reader.read()
	abort.abort()
	abort.signal.dispatchEvent(new Event("abort"))
	await first
	expect(dispose).toHaveBeenCalledOnce()
	const already = new AbortController()
	already.abort()
	const late = vi.fn<() => void>()
	expect(await raceAbort(pending().stream, already.signal, late).getReader().read()).toEqual({
		done: true,
		value: undefined,
	})
	expect(late).toHaveBeenCalledOnce()
})

it("cancel", async () => {
	const render = pending()
	const dispose = vi.fn<() => void>()
	const abort = new AbortController()
	await raceAbort(render.stream, abort.signal, dispose).cancel()
	abort.abort()
	expect(dispose).toHaveBeenCalledOnce()
	expect(render.cancel).toHaveBeenCalledOnce()
})

// The render's stop signal, with a listener that records the request event it runs under. The test aborts from its own
// scope, as a socket close does (BUGS.md B28).
function stopping(): { request: AbortController; stop: () => void; event: unknown; seen: unknown[] } {
	const request = new AbortController()
	const event = createRequestEvent(new Request("http://localhost/"))
	const { signal, stop } = renderStop(request.signal, event)
	const seen: unknown[] = []
	signal.addEventListener("abort", () => void seen.push(getRequestEvent()))
	return { request, stop, event, seen }
}

it("stop under request event", () => {
	const { request, event, seen } = stopping()
	request.abort()
	expect(seen).toEqual([event])
})

it("cancel stops under request event", () => {
	const { stop, event, seen } = stopping()
	stop()
	expect(seen).toEqual([event])
})

it("stop runs once", () => {
	const { request, stop, seen } = stopping()
	request.abort()
	stop()
	expect(seen).toHaveLength(1)
})

// A consumer cancel that lands while a pull waits on the render ends the stream with no write into it.
it("cancel during a pull", async () => {
	const render = pending()
	const abort = new AbortController()
	const writes = await invalidWrites(async () => {
		const reader = raceAbort(render.stream, abort.signal, () => undefined).getReader()
		const next = reader.read()
		await new Promise((resolve) => setTimeout(resolve, 0))
		await reader.cancel()
		expect(await next).toEqual({ done: true, value: undefined })
	})
	expect(writes).toEqual([])
})
