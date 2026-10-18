import { getHydrationWriter } from "@solidjs/web"
import { documentValueKey, type DeferredFailure } from "../../shared/protocol/deferred-failure.ts"
import type { DeferredFrame } from "../loaders/run.ts"

// A live document's deferred value as the client's slot reads it: the render's view, its rejection resolved to its
// projected failure (BUGS.md 374).
export type DocumentValue = { route: string; key: string; view: Promise<unknown> }

// Writes each value through Solid's keyed hydration channel, so the client settles its slot from the document itself:
// a read that mounts after hydration has no hydration entry of its own (BUGS.md 375). Solid's serializer writes it, so
// a value the render already serialized is a reference, and the stream's nonce and order are Solid's.
export function writeDocumentValues(values: readonly DocumentValue[]): void {
	const writer = getHydrationWriter()
	if (writer === undefined) return
	for (const { route, key, view } of values) writer.write(documentValueKey(`${route}\n${key}`), view)
}

// Each started value's view, the document's render reads them all; a stored render's state carries its values inline,
// so it writes none of them.
export function documentValues(
	deferred: readonly DeferredFrame[],
	project: (error: unknown) => DeferredFailure["error"],
): DocumentValue[] {
	return deferred.flatMap((entry) => {
		const view = entry.document?.(project)
		return view === undefined || entry.stored === true ? [] : [{ route: entry.m, key: entry.k, view }]
	})
}

// The document's render, writing the values first, inside the render, where the channel is found.
export function writingValues<T>(values: readonly DocumentValue[], render: () => T): () => T {
	return () => {
		writeDocumentValues(values)
		return render()
	}
}
