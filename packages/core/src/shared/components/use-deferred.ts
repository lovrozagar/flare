import { createMemo, untrack, type Accessor } from "solid-js";
import type { Deferred } from "../route-builder/register.ts";

// Reads a deferred value under <Loading> (dx/defer.md). Pass `() => props.loaderData.x`: the memo reads it in its
// tracking scope, so a later loader run's value replaces it, and a component body never reads loader data untracked.
// A live value is an ordinary async read, so a document streams it. A stored `"stream"` hole is a client source: the
// server renders the boundary's fallback and hands the position to the client, which reads the value a fill request
// brings after hydrate.
export function useDeferred<T>(source: Deferred<T> | (() => Deferred<T>)): Accessor<T> {
	const read = typeof source === "function" ? source : () => source;
	const hole = untrack(read).hole === true;
	return createMemo(() => read().promise, { ssrSource: hole ? "client" : "server" });
}
