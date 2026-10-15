import type { ErrorSink } from "../render/projector.ts"
import { errorEnvelope, okEnvelope, type Envelope } from "./envelope.ts"

const encoder = new TextEncoder()

// `.stream()` answers NDJSON: one envelope per yielded value, in order (02-system). A throw writes its error
// envelope, projected like a handler's, as the last line. A cancelled body stops the generator.
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
				if (next.done === true) controller.close()
				else controller.enqueue(line(okEnvelope(name, next.value)))
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
