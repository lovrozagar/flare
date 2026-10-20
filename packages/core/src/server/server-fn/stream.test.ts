import { expect, it } from "vitest"
import { withServerContext } from "../context/ctx.ts"
import type { StageResult } from "../lifecycle/finalize.ts"
import type { Logger } from "../lifecycle/logger.ts"
import type { ServerFnRef } from "../../shared/server-fn/builder.ts"
import { createServerFn } from "./dispatch.ts"
import { dispatch } from "./dispatch.ts"
import { heldStream, streamEnvelopes } from "./stream.ts"
import { fromWire, toWire } from "../../shared/protocol/value.ts"

function noop(): void {}

const sink = { dev: false, log: { level: "error", error: noop, warn: noop, log: noop } satisfies Logger }

async function* numbers(): AsyncGenerator<number> {
	yield 1
	yield 2
}

async function* broken(): AsyncGenerator<number> {
	yield 1
	throw new Error("secret")
}

// The transform writes `__id` and `__name`. They are not typed config, so they arrive untyped.
const config = { method: "post" as const, __id: "numbers-id", __name: "numbers" }

const counted = createServerFn(config).stream(numbers)

function lines(text: string): unknown[] {
	return text
		.split("\n")
		.filter((line) => line !== "")
		.map((line) => {
			const envelope: Record<string, unknown> = JSON.parse(line)
			return "data" in envelope ? { ...envelope, data: fromWire(envelope["data"]) } : envelope
		})
}

function within<T>(request: Request, run: () => Promise<T>, fail: T): Promise<T> {
	return withServerContext({ request, env: {} }, run, () => fail)
}

// The callable is untyped until the generated types narrow it.
function isStream(value: unknown): value is AsyncIterable<unknown> {
	return typeof value === "object" && value !== null && Symbol.asyncIterator in value
}

function iterable(value: unknown): AsyncIterable<unknown> {
	if (!isStream(value)) throw new Error("not a stream")
	return value
}

// Each yield is a line, and a generator that finishes writes the end line last, so a client can tell a whole stream
// from one cut short (plan 21 4.6, B140).
it("two yields", async () => {
	const body = streamEnvelopes("numbers", numbers(), { sink, basePath: "/", trailingSlash: "preserve" })
	expect(lines(await new Response(body).text())).toEqual([
		{ name: "numbers", status: 200, data: 1 },
		{ name: "numbers", status: 200, data: 2 },
		{ name: "numbers", status: 200, end: true },
	])
	const request = new Request(`http://localhost/_flare/fn/${counted.id}`, {
		method: "POST",
		body: JSON.stringify(toWire(null)),
		headers: { origin: "http://localhost" },
	})
	const serverFns = { [counted.id]: async (): Promise<ServerFnRef> => counted }
	const failed: StageResult = { status: 500, body: null }
	const run = () => dispatch({ request, serverFns, sameSite: [], sink, basePath: "/", trailingSlash: "preserve" })
	const result = await within(request, run, failed)
	expect(result.status).toBe(200)
	expect(result.headers?.get("content-type")).toBe("application/x-ndjson")
	expect(result.headers?.get("cache-control")).toBe("private, no-store")
	expect(lines(await new Response(result.body).text())).toEqual([
		{ name: "numbers", status: 200, data: 1 },
		{ name: "numbers", status: 200, data: 2 },
		{ name: "numbers", status: 200, end: true },
	])
})

it("thrown yield", async () => {
	const body = streamEnvelopes("broken", broken(), { sink, basePath: "/", trailingSlash: "preserve" })
	const [first, failure] = lines(await new Response(body).text())
	expect(first).toEqual({ name: "broken", status: 200, data: 1 })
	expect(failure).toMatchObject({ name: "broken", status: 500, message: "Something went wrong" })
	expect(JSON.stringify(failure)).not.toContain("secret")
})

it("in request", async () => {
	const seen: unknown[] = []
	const read = async (): Promise<void> => {
		for await (const value of iterable(counted())) seen.push(value)
	}
	await within(new Request("http://localhost/"), read, undefined)
	expect(seen).toEqual([1, 2])
	expect(() => iterable(null)).toThrow("not a stream")
	expect(() => counted()).toThrow("server function called outside a request")
})

it("cancel", async () => {
	const closed: string[] = []
	async function* held(): AsyncGenerator<number> {
		try {
			yield 1
			yield 2
		} finally {
			closed.push("finally")
		}
	}
	const reader = streamEnvelopes("held", held(), { sink, basePath: "/", trailingSlash: "preserve" }).getReader()
	await reader.read()
	await reader.cancel()
	expect(closed).toEqual(["finally"])
})

// A client that stops reading while the generator is still producing cancels the body mid-pull: when the value lands,
// nothing is written into the cancelled stream and nothing is logged. The write once threw ERR_INVALID_STATE into the
// pull's own catch, which logged it as the function's error (BUGS.md 304).
it("cancel during a pull", async () => {
	const gate = Promise.withResolvers<undefined>()
	async function* slow(): AsyncGenerator<number> {
		yield 1
		await gate.promise
		yield 2
	}
	const logged: unknown[][] = []
	const error = (...line: unknown[]): void => void logged.push(line)
	const watching = { dev: false, log: { level: "error", error, warn: noop, log: noop } satisfies Logger }
	const reader = streamEnvelopes("slow", slow(), {
		sink: watching,
		basePath: "/",
		trailingSlash: "preserve",
	}).getReader()
	await reader.read()
	const pending = reader.read()
	// The second pull starts, and waits on the generator.
	await new Promise((resolve) => setTimeout(resolve, 0))
	const cancelled = reader.cancel()
	gate.resolve(undefined)
	await cancelled
	expect(await pending).toEqual({ done: true, value: undefined })
	await new Promise((resolve) => setTimeout(resolve, 0))
	expect(logged).toEqual([])
})

// A generator that throws after the client stopped reading: its error is not written into the cancelled stream, nor
// logged as the function's error, since no one is reading it (BUGS.md 304).
it("throw after cancel", async () => {
	const gate = Promise.withResolvers<undefined>()
	async function* failing(): AsyncGenerator<number> {
		yield 1
		await gate.promise
		throw new Error("late")
	}
	const logged: unknown[][] = []
	const error = (...line: unknown[]): void => void logged.push(line)
	const watching = { dev: false, log: { level: "error", error, warn: noop, log: noop } satisfies Logger }
	const reader = streamEnvelopes("failing", failing(), {
		sink: watching,
		basePath: "/",
		trailingSlash: "preserve",
	}).getReader()
	await reader.read()
	const pending = reader.read()
	await new Promise((resolve) => setTimeout(resolve, 0))
	const cancelled = reader.cancel()
	gate.resolve(undefined)
	await cancelled.catch(() => undefined)
	expect(await pending).toEqual({ done: true, value: undefined })
	await new Promise((resolve) => setTimeout(resolve, 0))
	expect(logged).toEqual([])
})

// A public stream is held until it ends: its outcome is the end line's 200 or the error line's status. Past the cap it
// is answered as it runs, the held lines first, and a cancel of that answer reaches the source (BUGS.md 383).
// A finished stream of these texts, one chunk each.
function chunked(...texts: string[]): ReadableStream<Uint8Array> {
	return new ReadableStream<Uint8Array>({
		start(controller) {
			for (const text of texts) controller.enqueue(new TextEncoder().encode(text))
			controller.close()
		},
	})
}

it("held stream", async () => {
	const clean = await heldStream(chunked('{"status":200,"data":1}\n', '{"status":200,"end":true}\n'), 1024)
	expect([clean.status, clean.body]).toEqual([200, '{"status":200,"data":1}\n{"status":200,"end":true}\n'])
	const failed = await heldStream(chunked('{"status":200,"data":1}\n', '{"status":503,"message":"x"}\n'), 1024)
	expect(failed.status).toBe(503)
	const over = await heldStream(chunked("aaaa", "bbbb", "cccc"), 6)
	expect([over.status, await new Response(over.body).text()]).toEqual([0, "aaaabbbbcccc"])
	let cancelled = false
	const endless = new ReadableStream<Uint8Array>({
		pull(controller) {
			controller.enqueue(new Uint8Array(8))
		},
		cancel() {
			cancelled = true
		},
	})
	const running = await heldStream(endless, 10)
	await (running.body as ReadableStream<Uint8Array>).cancel()
	expect([running.status, cancelled]).toEqual([0, true])
})
