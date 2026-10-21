import { DOCUMENT_VIEW, deferredFailure, type DeferredFailure } from "../../shared/protocol/deferred-failure.ts"
import type { Deferred } from "../../shared/route-builder/register.ts"
import { inDeferred, insideDeferred } from "./scope.ts"

export type DeferMode = "resolve" | "stream"

export type DeferOptions = { key?: string; prerender?: DeferMode }

// `prefetch` never runs a function: the prefetch entry is the shell only (dx/defer.md). `fill` runs only the values
// a stored page leaves as holes (BUGS.md 94).
export type DeferScope = {
	stored: boolean
	route?: DeferMode | undefined
	dev: boolean
	prefetch?: boolean
	fill?: boolean
}

// The one rule for which values a stored page leaves as holes: a call's `prerender` wins, else the route's mode, else
// "resolve". The store write runs the others; a fill runs these.
export function isHole(options: DeferOptions, route: DeferMode | undefined): boolean {
	return (options.prerender ?? route ?? "resolve") === "stream"
}

// How a placeholder travels: a stored render's value it already resolved inline, so the stored page is the client's
// one source for it; a value a fill skipped as `kept`, which the client keeps from the page it shows; otherwise the
// key alone, and `hole` on a stored hole (BUGS.md 94).
type Wire = { __deferred: true; key: string; hole?: true; value?: unknown; kept?: true }

// `document` gives the render a view of the value that resolves its rejection to the projected failure, and returns it
// (BUGS.md 374). `stored` marks a stored render's value, which the stored state carries inline (BUGS.md 375).
export type Started = {
	key: string
	promise: Promise<unknown>
	stored: boolean
	document: (project: (error: unknown) => DeferredFailure["error"]) => Promise<unknown>
}

// `held` is what a stored render waits for. `started` is every value whose function ran, in creation order,
// which a live response writes as `c` or `e` frames. `holes` counts the stored `"stream"` values whose function did
// not run: a fill request runs them.
export type LoaderDefer = {
	defer: <T>(fn: () => Promise<T>, options?: DeferOptions) => Deferred<T>
	held: readonly Promise<unknown>[]
	started: readonly Started[]
	readonly holes: number
}

class Placeholder<T> implements Deferred<T> {
	readonly __deferred: true = true
	readonly key: string
	readonly hole?: true
	readonly #promise: Promise<T>
	#view: Promise<T> | undefined
	readonly #kept: boolean
	#resolved: { value: T } | undefined

	// A hole travels on the wire, so the server render and the client's read take the same source (useDeferred).
	constructor(key: string, promise: Promise<T>, flags: { hole: boolean; kept: boolean }) {
		this.key = key
		if (flags.hole) this.hole = true
		this.#promise = promise
		this.#kept = flags.kept
	}

	// A stored render's value, once its function fulfilled.
	inline(value: T): void {
		this.#resolved = { value }
	}

	toJSON(): Wire {
		if (this.#kept) return { __deferred: true, key: this.key, kept: true }
		if (this.#resolved !== undefined) return { __deferred: true, key: this.key, value: this.#resolved.value }
		return { __deferred: true, key: this.key, ...(this.hole === undefined ? {} : { hole: true }) }
	}

	// What a document's render reads through `useDeferred`: a rejection resolves to its projected failure, which Solid
	// writes in the hydration data and `useDeferred` throws on both sides. Solid leaves a rejected read for the client to
	// render again, so a rejection would paint nothing (BUGS.md 374). `promise` stays the value as it settled, so a
	// direct read rejects as before (BUGS.md 375).
	document(project: (error: unknown) => DeferredFailure["error"]): Promise<T> {
		this.#view ??= this.#promise.then(
			(value) => value,
			(error: unknown) => deferredFailure(project(error)) as T,
		)
		return this.#view
	}

	// The value as a live response writes it, and as the document's render reads it.
	started(stored: boolean): Started {
		return { key: this.key, promise: this.#promise, stored, document: (project) => this.document(project) }
	}

	// A prototype getter keeps the promise off JSON.stringify, so the wire carries only { __deferred, key }.
	get promise(): Promise<T> {
		return this.#promise
	}

	get [DOCUMENT_VIEW](): Promise<T> {
		return this.#view ?? this.#promise
	}
}

// A defer called inside a deferred function, which the dev guard refuses.
class NestedDefer extends Error {
	constructor() {
		super("defer: called inside a deferred function")
	}
}

// The default keys' pattern.
const RESERVED = /^d\d+$/

// `d0`, `d1`, … are the default keys, so an explicit one in that pattern would take another call's value (BUGS.md 430).
function explicitKey(key: string): string {
	if (RESERVED.test(key)) throw new Error(`defer: the key "${key}" is reserved: d0, d1, … are the default keys`)
	return key
}

// A throw before the function returns its promise is that value's rejection, as an `async` one's is: the loader goes
// on and the other values settle (BUGS.md 429). The function runs in its deferred scope (BUGS.md 459).
function start<T>(state: { running: boolean }, fn: () => Promise<T>): Promise<T> {
	state.running = true
	try {
		return inDeferred(fn)
	} catch (error) {
		// The dev guard's error is the loader's: a nested defer is the app's bug, not this value's failure.
		if (error instanceof NestedDefer) throw error
		return Promise.reject(error)
	} finally {
		state.running = false
	}
}

function runs(scope: DeferScope, options: DeferOptions): boolean {
	if (scope.prefetch === true) return false
	if (scope.fill === true) return isHole(options, scope.route)
	if (!scope.stored) return true
	return !isHole(options, scope.route)
}

// One scope per loader: default keys count from d0 inside that loader.
export function createDefer(scope: DeferScope): LoaderDefer {
	const seen = new Map<string, Deferred<unknown>>()
	const held: Promise<unknown>[] = []
	const started: Started[] = []
	const state = { next: 0, running: false, holes: 0 }

	// A nested defer has no frame to resolve it, so the client would wait forever. The flag catches a call before the
	// function's first await, and the deferred scope one after it (BUGS.md 459).
	function nested(): boolean {
		return scope.dev && (state.running || insideDeferred())
	}

	function defer<T>(fn: () => Promise<T>, options: DeferOptions = {}): Deferred<T> {
		const key = options.key === undefined ? `d${state.next++}` : explicitKey(options.key)
		const first = seen.get(key)
		// The key identifies the value: a repeated key is the first call's value whatever its function. The map holds
		// every key's value, so `T` is the caller's claim about that key, which the cast states.
		if (first !== undefined) return first as Deferred<T>
		if (nested()) throw new NestedDefer()
		const now = runs(scope, options) && !state.running
		const hole = scope.stored && !now && scope.prefetch !== true
		const kept = scope.fill === true && !now
		const value = new Placeholder(key, now ? start(state, fn) : new Promise<T>(() => undefined), { hole, kept })
		if (now) {
			// The frame writer or the render reads the outcome. A rejection nobody reads is not a process crash.
			value.promise.then(
				(resolved) => scope.stored && value.inline(resolved),
				() => undefined,
			)
			started.push(value.started(scope.stored))
		}
		if (scope.stored && now) held.push(value.promise)
		if (hole) state.holes += 1
		seen.set(key, value)
		return value
	}

	return {
		defer,
		held,
		started,
		get holes() {
			return state.holes
		},
	}
}
