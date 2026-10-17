import type { ErrorSink } from "../render/projector.ts"
import { errorEnvelope, okEnvelope, type Envelope } from "./envelope.ts"

const encoder = new TextEncoder()

// `.stream()` answers NDJSON: one envelope per yielded value, in order (02-system). A generator that finishes writes
// the end line, `{ name, status: 200, end: true }`, so the client can tell a whole stream from one cut short (B140). A
// throw writes its error envelope, projected like a handler's, as the last line instead. A cancelled body stops the
// generator.
export function streamEnvelopes(
	name: string,
	source: AsyncIterable<unknown>,
	context: { sink: ErrorSink; basePath: string },
): ReadableStream<Uint8Array> {
	// An async generator always has `return`, which a bare AsyncIterator need not.
	const iterator = (async function* () {
		yield* source
	})()
	return new ReadableStream<Uint8Array>({
		async pull(controller) {
			try {
				const next = await iterator.next()
				if (next.done !== true) return controller.enqueue(line(okEnvelope(name, next.value)))
				controller.enqueue(line({ name, status: 200, end: true }))
				controller.close()
			} catch (thrown) {
				controller.enqueue(line(errorEnvelope(name, thrown, context).envelope))
				controller.close()
			}
		},
		async cancel() {
			await iterator.return(undefined)
		},
	})
}

function line(envelope: Envelope): Uint8Array {
	return encoder.encode(`${JSON.stringify(envelope)}\n`)
}
