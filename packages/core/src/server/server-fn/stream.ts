import type { Routing } from "../redirect/index.ts"
import type { ErrorSink } from "../render/projector.ts"
import { errorEnvelope, okEnvelope, type Envelope } from "./envelope.ts"
import { dataToWire } from "../../shared/protocol/value.ts"

const encoder = new TextEncoder()

// `.stream()` answers NDJSON: one envelope per yielded value, in order (02-system). A generator that finishes writes
// the end line, `{ name, status: 200, end: true }`, so the client can tell a whole stream from one cut short (B140). A
// throw writes its error envelope, projected like a handler's, as the last line instead. A cancelled body stops the
// generator.
export function streamEnvelopes(
	name: string,
	source: AsyncIterable<unknown>,
	context: { sink: ErrorSink } & Routing,
): ReadableStream<Uint8Array> {
	// An async generator always has `return`, which a bare AsyncIterator need not.
	const iterator = (async function* () {
		yield* source
	})()
	// A consumer cancel that lands while a pull waits on the generator ends the stream: nothing is written into it after,
	// and nothing is logged as the function's error (BUGS.md 304).
	let cancelled = false
	return new ReadableStream<Uint8Array>({
		async pull(controller) {
			try {
				const next = await iterator.next()
				if (cancelled) return
				if (next.done !== true) return controller.enqueue(line(okEnvelope(name, next.value)))
				controller.enqueue(line({ name, status: 200, end: true }))
				controller.close()
			} catch (thrown) {
				if (cancelled) return
				controller.enqueue(line(errorEnvelope(name, thrown, context).envelope))
				controller.close()
			}
		},
		async cancel() {
			cancelled = true
			await iterator.return(undefined)
		},
	})
}

function line(envelope: Envelope): Uint8Array {
	return encoder.encode(`${JSON.stringify(dataToWire(envelope))}\n`)
}

// How much of a public stream the server holds before it answers (BUGS.md 383).
export const PUBLIC_STREAM_BYTES: number = 1024 * 1024

// A public stream's answer: its Cache-Control goes out before its body, and a cache in front cannot always tell a
// message cut short from a whole one (workerd ends both cleanly; an HTTP/2 hop or a buffering proxy may too), so the
// stream is held, up to `cap` bytes, until it ends. `status` is the outcome the cache decision reads: 200 for a stream
// that ended with its end line, the error line's status for one that failed, which stays private with that line as a
// private stream sends it, and 0 for one that outgrew `cap`, sent private with its held lines first and the rest as
// they come, so an endless or huge stream neither waits forever nor sits in memory.
export async function heldStream(
	body: ReadableStream<Uint8Array>,
	cap: number,
): Promise<{ status: number; body: string | ReadableStream<Uint8Array> }> {
	const reader = body.getReader()
	const chunks: Uint8Array[] = []
	let bytes = 0
	for (;;) {
		const step = await reader.read()
		if (step.done) break
		chunks.push(step.value)
		bytes += step.value.length
		if (bytes > cap) return { status: 0, body: resumed(chunks, reader) }
	}
	const whole = new Uint8Array(bytes)
	let at = 0
	for (const chunk of chunks) {
		whole.set(chunk, at)
		at += chunk.length
	}
	const text = new TextDecoder().decode(whole)
	return { status: ended(text), body: text }
}

// The outcome of a whole stream, read from its last line: the end line is 200, an error line its status.
function ended(text: string): number {
	const whole = text.trimEnd()
	const last: unknown = JSON.parse(whole.slice(whole.lastIndexOf("\n") + 1))
	return Reflect.get(Object(last), "end") === true ? 200 : Number(Reflect.get(Object(last), "status"))
}

// The held lines, then the rest of the stream as it comes. A cancel reaches the generator.
function resumed(
	held: readonly Uint8Array[],
	reader: ReadableStreamDefaultReader<Uint8Array>,
): ReadableStream<Uint8Array> {
	return new ReadableStream<Uint8Array>({
		start(controller) {
			for (const chunk of held) controller.enqueue(chunk)
		},
		async pull(controller) {
			const step = await reader.read()
			if (step.done) return controller.close()
			controller.enqueue(step.value)
		},
		cancel: (reason) => reader.cancel(reason),
	})
}
