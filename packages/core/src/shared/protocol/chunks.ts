// The chunks of a response body, read with a reader. Safari before 18 has no async iteration of a ReadableStream
// (`Symbol.asyncIterator`, `values`), so client code never iterates a body directly (BUGS.md 123). Leaving early, by
// `break`, `return()`, or a throw in the consumer, cancels the body, as the built-in iterator does, and the lock is
// released either way.
export async function* chunksOf(body: ReadableStream<Uint8Array>): AsyncGenerator<Uint8Array> {
	const reader = body.getReader();
	let done = false;
	try {
		for (let next = await reader.read(); !next.done; next = await reader.read()) yield next.value;
		done = true;
	} finally {
		if (!done) await reader.cancel().catch(() => undefined);
		reader.releaseLock();
	}
}
