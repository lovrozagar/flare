import type { RequestEvent } from "@solidjs/web"
import { provideRequestEvent } from "@solidjs/web/storage"

// On @solidjs/web 2.0.0-rc.13 and rc.14, aborting renderToStream's signal does not close its writable (N3-2). Every pull,
// the chunk-0 wait included, races the request signal. An abort or a consumer cancel disposes the render
// once, cancels the source, and ends the response.
export function raceAbort(
	source: ReadableStream<Uint8Array>,
	signal: AbortSignal,
	dispose: () => void,
): ReadableStream<Uint8Array> {
	const reader = source.getReader()
	const { promise: aborted, resolve } = Promise.withResolvers<undefined>()
	let stopped = false
	// A consumer cancel and a later abort both land here. The render is disposed once.
	const stop = (): void => {
		if (stopped) return
		stopped = true
		dispose()
		void reader.cancel()
		resolve(undefined)
	}
	if (signal.aborted) stop()
	else signal.addEventListener("abort", stop, { once: true })
	// A consumer cancel that lands while a pull waits ends the stream: nothing is written into it after (BUGS.md 304).
	let cancelled = false
	return new ReadableStream<Uint8Array>({
		async pull(controller) {
			const result = await Promise.race([reader.read(), aborted])
			if (cancelled) return
			if (result === undefined || result.done) controller.close()
			else controller.enqueue(result.value)
		},
		cancel() {
			cancelled = true
			stop()
		},
	})
}

// Solid disposes the tree, and runs every cleanup, inside the abort listener of the signal the render gives it. A
// socket close fires outside the request's scope, where a cleanup that reads the request (the query client getter)
// throws, and a listener's throw ends the process. So Solid gets a signal this owns, never the request's, and a
// request abort or a consumer cancel stops it under the request event the render ran under (BUGS.md B28).
export function renderStop(
	requestSignal: AbortSignal,
	event: RequestEvent | undefined,
): { signal: AbortSignal; stop: () => void } {
	const halt = new AbortController()
	const stop = event === undefined ? () => halt.abort() : () => void provideRequestEvent(event, () => halt.abort())
	requestSignal.addEventListener("abort", stop, { once: true })
	return { signal: halt.signal, stop }
}
