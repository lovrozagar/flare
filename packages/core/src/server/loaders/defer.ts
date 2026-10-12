import type { Deferred } from "../../shared/route-builder/register.ts";

export type DeferMode = "resolve" | "stream";

export type DeferOptions = { key?: string; prerender?: DeferMode };

// `prefetch` never runs a function: the prefetch entry is the shell only (dx/defer.md).
export type DeferScope = {
	stored: boolean;
	route?: DeferMode;
	dev: boolean;
	prefetch?: boolean;
};

export type Started = { key: string; promise: Promise<unknown> };

// `held` is what a stored render waits for. `started` is every value whose function ran, in creation order,
// which a live response writes as `c` or `e` frames.
export type LoaderDefer = {
	defer: <T>(fn: () => Promise<T>, options?: DeferOptions) => Deferred<T>;
	held: readonly Promise<unknown>[];
	started: readonly Started[];
};

class Placeholder<T> implements Deferred<T> {
	readonly __deferred: true = true;
	readonly key: string;
	readonly #promise: Promise<T>;

	constructor(key: string, promise: Promise<T>) {
		this.key = key;
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
	const state = { next: 0, running: false };

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
		// The key identifies the value: a repeated key is the first call's value whatever its function.
		if (first !== undefined) return first as Deferred<T>;
		// A nested defer has no frame to resolve it, so the client would wait forever.
		if (state.running && scope.dev) throw new Error("defer: called inside a deferred function");
		const now = runs(options) && !state.running;
		const value = new Placeholder(key, now ? start(fn) : new Promise<T>(() => undefined));
		if (now) {
			// The frame writer or the render reads the outcome. A rejection nobody reads is not a process crash.
			value.promise.catch(() => undefined);
			started.push({ key, promise: value.promise });
		}
		if (scope.stored && now) held.push(value.promise);
		seen.set(key, value);
		return value;
	}

	function runs(options: DeferOptions): boolean {
		if (scope.prefetch === true) return false;
		if (!scope.stored) return true;
		return (options.prerender ?? scope.route ?? "resolve") === "resolve";
	}

	return { defer, held, started };
}
