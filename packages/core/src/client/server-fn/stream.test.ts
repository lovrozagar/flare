import { expect, it, vi } from "vitest"
import type { CallDeps } from "./call.ts"
import { streamServerFn } from "./stream.ts"

const numbers = { id: "fedcba9876543210", name: "numbers", record: { method: "get" as const } }

function deps(response: Response): CallDeps {
	return {
		fetch: vi.fn<CallDeps["fetch"]>(async () => response),
		go: vi.fn<CallDeps["go"]>(),
		assign: vi.fn<CallDeps["assign"]>(),
		reload: vi.fn<CallDeps["reload"]>(() => true),
		origin: "http://localhost",
		basePath: "/",
		build: "b1",
		href: () => "http://localhost/page",
		forget: () => undefined,
	}
}

// Two lines split across chunks, so a line is only read whole.
function ndjson(text: string): Response {
	const encoder = new TextEncoder()
	const middle = Math.floor(text.length / 2)
	const body = new ReadableStream<Uint8Array>({
		start(controller) {
			controller.enqueue(encoder.encode(text.slice(0, middle)))
			controller.enqueue(encoder.encode(text.slice(middle)))
			controller.close()
		},
	})
	return new Response(body, { headers: { "content-type": "application/x-ndjson" } })
}

async function collect(source: AsyncIterable<unknown>): Promise<unknown[]> {
	const seen: unknown[] = []
	for await (const value of source) seen.push(value)
	return seen
}

const END = '{"name":"numbers","status":200,"end":true}\n'

it("iterator", async () => {
	const lines = '{"name":"numbers","status":200,"data":1}\n{"name":"numbers","status":200,"data":2}\n'
	expect(await collect(streamServerFn(numbers, undefined, deps(ndjson(lines + END))))).toEqual([1, 2])
	// A thrown yield is the last line, and the iterator rejects with it after the values before it.
	const broken = '{"name":"numbers","status":200,"data":1}\n{"name":"numbers","status":500,"message":"x"}'
	const seen: unknown[] = []
	const reading = (async () => {
		for await (const value of streamServerFn(numbers, undefined, deps(ndjson(broken)))) seen.push(value)
	})()
	await expect(reading).rejects.toThrow("x")
	expect(seen).toEqual([1])
	// A step before the generator failed, so the answer is one JSON envelope.
	const denied = new Response(JSON.stringify({ name: "numbers", status: 401, message: "Unauthenticated" }), {
		status: 401,
		headers: { "content-type": "application/json" },
	})
	await expect(collect(streamServerFn(numbers, undefined, deps(denied)))).rejects.toThrow("Unauthenticated")
	await expect(collect(streamServerFn(numbers, undefined, deps(ndjson("[1]\n"))))).rejects.toThrow(/not an envelope/)
	expect(await collect(streamServerFn(numbers, undefined, deps(ndjson(END))))).toEqual([])
	const bare = new Response(null, { status: 404 })
	await expect(collect(streamServerFn(numbers, undefined, deps(bare)))).rejects.toThrow("HTTP 404")
})

// The body yields one line and then never again. `return()` while a `next()` is pending aborts the fetch at once, and
// the pending `next()` resolves done, with no rejection (BUGS.md B40).
it("stop aborts", async () => {
	const line = new TextEncoder().encode('{"name":"numbers","status":200,"data":1}\n')
	const body = new ReadableStream<Uint8Array>({ start: (controller) => controller.enqueue(line) })
	const calls = deps(new Response(body, { headers: { "content-type": "application/x-ndjson" } }))
	const iterator = streamServerFn(numbers, undefined, calls)[Symbol.asyncIterator]()
	expect(await iterator.next()).toEqual({ value: 1, done: false })
	const pending = iterator.next()
	const stopping = iterator.return?.()
	expect(vi.mocked(calls.fetch).mock.calls[0]?.[1].signal?.aborted).toBe(true)
	expect(await stopping).toEqual({ value: undefined, done: true })
	expect(await pending).toEqual({ value: undefined, done: true })
	expect(await iterator.next()).toEqual({ value: undefined, done: true })
})

// A stream cut before its end line, after whole lines, in the middle of one, or with no line at all, rejects after
// the values that arrived, with status 0 as a network failure has, so it never reads as a finished stream
// (plan 21 4.6, B140).
it("cut stream", async () => {
	const one = '{"name":"numbers","status":200,"data":1}\n'
	const empty = new Response(null, { headers: { "content-type": "application/x-ndjson" } })
	for (const response of [ndjson(one), ndjson(`${one}{"name":"num`), empty]) {
		const seen: unknown[] = []
		const reading = (async () => {
			for await (const value of streamServerFn(numbers, undefined, deps(response))) seen.push(value)
		})()
		await expect(reading).rejects.toMatchObject({
			name: "ServerFnError",
			status: 0,
			message: "The stream was cut before its end",
		})
		expect(seen).toEqual(response === empty ? [] : [1])
	}
})
