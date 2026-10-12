import type { Deferred } from "../../shared/route-builder/register.ts";

export type DeferMode = "resolve" | "stream";

export type DeferOptions = { key?: string; prerender?: DeferMode };

// `prefetch` never runs a function: the prefetch entry is the shell only (dx/defer.md).
export type DeferScope = {
	stored: boolean;
	route?: DeferMode | undefined;
	dev: boolean;
	prefetch?: boolean;
};

export type Started = { key: string; promise: Promise<unknown> };

// `held` is what a stored render waits for. `started` is every value whose function ran, in creation order,
// which a live response writes as `c` or `e` frames. `holes` counts the stored `"stream"` values whose function did
// not run: a fill request runs them.
export type LoaderDefer = {
	defer: <T>(fn: () => Promise<T>, options?: DeferOptions) => Deferred<T>;
	held: readonly Promise<unknown>[];
	started: readonly Started[];
	readonly holes: number;
};

class Placeholder<T> implements Deferred<T> {
	readonly __deferred: true = true;
	readonly key: string;
	readonly hole?: true;
	readonly #promise: Promise<T>;

	// A hole travels on the wire, so the server render and the client's read take the same source (useDeferred).
	constructor(key: string, promise: Promise<T>, hole: boolean) {
		this.key = key;
		if (hole) this.hole = true;
		this.#promise = promise;
	}

	// A prototype getter keeps the promise off JSON.stringify, so the wire carries only { __deferred, key }.
	get promise(): Promise<T> {
		return this.#promise;
	}
}

// One scope per loader: default keys count from d0 inside that loader.
export function createDefer(scope: DeferScope): LoaderDefer {
	const seen = new Map<string, Deferred<unknown>>();
	const held: Promise<unknown>[] = [];
	const started: Started[] = [];
	const state = { next: 0, running: false, holes: 0 };

	function start<T>(fn: () => Promise<T>): Promise<T> {
		state.running = true;
		try {
			return fn();
		} finally {
			state.running = false;
		}
	}

	function defer<T>(fn: () => Promise<T>, options: DeferOptions = {}): Deferred<T> {
		const key = options.key ?? `d${state.next++}`;
		const first = seen.get(key);
		// The key identifies the value: a repeated key is the first call's value whatever its function. The map holds
		// every key's value, so `T` is the caller's claim about that key, which the cast states.
		if (first !== undefined) return first as Deferred<T>;
		// A nested defer has no frame to resolve it, so the client would wait forever.
		if (state.running && scope.dev) throw new Error("defer: called inside a deferred function");
		const now = runs(options) && !state.running;
		const hole = scope.stored && !now && scope.prefetch !== true;
		const value = new Placeholder(key, now ? start(fn) : new Promise<T>(() => undefined), hole);
		if (now) {
			// The frame writer or the render reads the outcome. A rejection nobody reads is not a process crash.
			value.promise.catch(() => undefined);
			started.push({ key, promise: value.promise });
		}
		if (scope.stored && now) held.push(value.promise);
		if (hole) state.holes += 1;
		seen.set(key, value);
		return value;
	}

	function runs(options: DeferOptions): boolean {
		if (scope.prefetch === true) return false;
		if (!scope.stored) return true;
		return (options.prerender ?? scope.route ?? "resolve") === "resolve";
	}

	return {
		defer,
		held,
		started,
		get holes() {
			return state.holes;
		},
	};
}
