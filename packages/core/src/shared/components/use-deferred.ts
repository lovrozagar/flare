import { createMemo, untrack, type Accessor } from "solid-js"
import { DOCUMENT_VIEW, failureError, isDeferredFailure } from "../protocol/deferred-failure.ts"
import type { Deferred } from "../route-builder/register.ts"

// Reads a deferred value under <Loading> (dx/defer.md), as `useDeferred(() => props.loaderData.x)`. The memo reads
// the accessor in its own tracking scope, so a later loader run's value replaces it, and a component body never reads
// loader data untracked. A live value is an ordinary async read, so a document streams it. A stored `"stream"` hole is
// a client source: the server renders the boundary's fallback and hands the position to the client, which reads the
// value a fill request brings after hydrate.
// A document's value that rejected arrives as its failure (server/loaders/defer.ts), which the read throws on the
// server and on the client alike, so the nearest <Errored> paints it (BUGS.md 374).
export function useDeferred<T>(read: () => Deferred<T>): Accessor<T> {
	const hole = untrack(read).hole === true
	const value = createMemo(() => viewOf(read()), { ssrSource: hole ? "client" : "server" })
	return () => {
		const settled = value()
		if (isDeferredFailure(settled)) throw failureError(settled)
		return settled
	}
}

// The server's document view where the value has one, else its promise: the client's slot, which a document settles
// (BUGS.md 375).
function viewOf<T>(deferred: Deferred<T>): Promise<T> {
	const view: unknown = Reflect.get(deferred, DOCUMENT_VIEW)
	return view instanceof Promise ? (view as Promise<T>) : deferred.promise
}
