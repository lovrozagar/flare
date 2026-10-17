// What Solid's stream writes: text, or bytes.
export type Chunk = string | Uint8Array

const encoder = new TextEncoder()
const decoder = new TextDecoder()

export function chunkText(chunk: Chunk | undefined): string {
	if (typeof chunk === "string") return chunk
	return decoder.decode(chunk)
}

// A document's body: the shell, then each chunk the render writes after it, as bytes. A consumer cancel cancels the
// render's reader; one that lands while a pull waits on the render ends the stream, so nothing is written into it
// after (BUGS.md 304).
export function bodyStream(shell: string, reader: ReadableStreamDefaultReader<Chunk>): ReadableStream<Uint8Array> {
	let cancelled = false
	return new ReadableStream<Uint8Array>({
		start(controller) {
			controller.enqueue(encoder.encode(shell))
		},
		async pull(controller) {
			const next = await reader.read()
			if (cancelled) return
			if (next.done) controller.close()
			else controller.enqueue(encoder.encode(chunkText(next.value)))
		},
		cancel(reason) {
			cancelled = true
			return reader.cancel(reason)
		},
	})
}
