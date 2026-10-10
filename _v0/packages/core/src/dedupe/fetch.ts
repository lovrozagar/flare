import { getServerRequestContext } from "@lovrozagar/flare/server-context";

export type FetchFn = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

const FETCH_CACHE_KEY = "__flare_fetch_dedupe";
/** Bodies above this are streamed to their caller but never memoized. */
export const DEFAULT_MAX_BYTES = 1024 * 1024;

const SHAREABLE_METHODS = new Set(["GET", "HEAD"]);
const NULL_BODY_STATUSES = new Set([204, 205, 304]);
const EXCLUDED_HEADERS = new Set(["traceparent", "tracestate", "x-correlation-id", "x-request-id"]);

function isRequest(input: RequestInfo | URL): input is Request {
	return typeof input === "object" && !(input instanceof URL) && "method" in input && "url" in input;
}

function methodOf(input: RequestInfo | URL, init: RequestInit | undefined): string {
	return (init?.method ?? (isRequest(input) ? input.method : "GET")).toUpperCase();
}

/* `new Request` normalizes the URL and header names the same way the runtime's fetch will. */
function keyOf(scope: string, request: Request): string {
	const headers: Array<[string, string]> = [];
	request.headers.forEach((value, name) => {
		if (!EXCLUDED_HEADERS.has(name)) headers.push([name, value]);
	});
	headers.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
	return JSON.stringify([
		scope,
		request.method,
		request.url,
		headers,
		request.redirect,
		request.cache,
		request.credentials,
		request.integrity,
		request.mode,
		request.referrer,
		request.referrerPolicy,
	]);
}

function requestCache(): Map<string, SharedFetch> | undefined {
	try {
		const ctx = getServerRequestContext();
		let cache = ctx.get<Map<string, SharedFetch>>(FETCH_CACHE_KEY);
		if (!cache) {
			cache = new Map();
			ctx.set(FETCH_CACHE_KEY, cache);
		}
		return cache;
	} catch {
		return undefined;
	}
}

function isShareable(response: Response, maxBytes: number): boolean {
	if (response.status < 200 || response.status > 599) return false;
	const type = response.headers.get("content-type");
	if (type && type.trim().toLowerCase().startsWith("text/event-stream")) return false;
	const length = Number(response.headers.get("content-length") ?? Number.NaN);
	return !(length > maxBytes);
}

interface Head {
	headers: Headers;
	redirected: boolean;
	status: number;
	statusText: string;
	url: string;
}

function build(head: Head, body: ReadableStream<Uint8Array> | null): Response {
	const response = new Response(body, { headers: head.headers, status: head.status, statusText: head.statusText });
	/* Constructed responses have no url / redirected; keep the upstream values callers rely on. */
	if (head.url) Object.defineProperty(response, "url", { value: head.url });
	if (head.redirected) Object.defineProperty(response, "redirected", { value: true });
	return response;
}

/** Errors the caller's body with its abort reason, as a native fetch body would. */
function abortable(body: ReadableStream<Uint8Array>, signal: AbortSignal | undefined): ReadableStream<Uint8Array> {
	if (!signal) return body;
	const reader = body.getReader();
	let finished = false;
	let onAbort: (() => void) | undefined;
	const finish = () => {
		finished = true;
		if (onAbort) signal.removeEventListener("abort", onAbort);
	};
	return new ReadableStream<Uint8Array>(
		{
			cancel(reason) {
				finish();
				return reader.cancel(reason);
			},
			async pull(controller) {
				const { done, value } = await reader.read();
				if (finished) return;
				if (done) {
					finish();
					controller.close();
					return;
				}
				controller.enqueue(value);
			},
			start(controller) {
				onAbort = () => {
					if (finished) return;
					finish();
					controller.error(signal.reason);
					reader.cancel(signal.reason).catch(() => {});
				};
				signal.addEventListener("abort", onAbort, { once: true });
			},
		},
		{ highWaterMark: 0 },
	);
}

/**
 * Reads one tee branch eagerly and replays it to every later caller. Past `maxBytes` the entry is
 * evicted and, once no replay reader needs the rest, the branch is canceled so the first caller's
 * branch keeps native backpressure. No branch is ever left unread.
 */
class Replay {
	private chunks: Uint8Array[] = [];
	private bytes = 0;
	private done = false;
	private failed = false;
	private error: unknown;
	private overflowed = false;
	private readers = 0;
	private wakers: Array<() => void> = [];

	constructor(
		source: ReadableStream<Uint8Array>,
		private readonly maxBytes: number,
		private readonly evict: () => void,
	) {
		void this.pump(source.getReader());
	}

	private notify(): void {
		const wakers = this.wakers;
		this.wakers = [];
		for (const wake of wakers) wake();
	}

	private async pump(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<void> {
		try {
			for (;;) {
				const { done, value } = await reader.read();
				if (done) break;
				this.bytes += value.byteLength;
				if (this.bytes > this.maxBytes && !this.overflowed) {
					this.overflowed = true;
					this.evict();
				}
				if (this.overflowed && this.readers === 0) {
					this.chunks = [];
					await reader.cancel();
					return;
				}
				this.chunks.push(value);
				this.notify();
			}
			this.done = true;
		} catch (e: unknown) {
			this.failed = true;
			this.error = e;
			this.evict();
		}
		this.notify();
	}

	stream(signal: AbortSignal | undefined): ReadableStream<Uint8Array> {
		this.readers++;
		let index = 0;
		let finished = false;
		let onAbort: (() => void) | undefined;
		const finish = () => {
			if (finished) return;
			finished = true;
			this.readers--;
			if (onAbort) signal?.removeEventListener("abort", onAbort);
		};
		return new ReadableStream<Uint8Array>(
			{
				cancel: finish,
				pull: async (controller) => {
					for (;;) {
						if (finished) return;
						const chunk = this.chunks[index];
						if (chunk) {
							index++;
							/* Each caller owns its bytes; a consumer that detaches a buffer cannot corrupt another. */
							controller.enqueue(new Uint8Array(chunk));
							return;
						}
						if (this.failed) {
							finish();
							controller.error(this.error);
							return;
						}
						if (this.done) {
							finish();
							controller.close();
							return;
						}
						await new Promise<void>((resolve) => this.wakers.push(resolve));
					}
				},
				start: (controller) => {
					if (!signal) return;
					onAbort = () => {
						if (finished) return;
						finish();
						controller.error(signal.reason);
						this.notify();
					};
					signal.addEventListener("abort", onAbort, { once: true });
				},
			},
			{ highWaterMark: 0 },
		);
	}
}

interface Waiter {
	reject: (reason: unknown) => void;
	resolve: (response: Response | Promise<Response>) => void;
	signal: AbortSignal | undefined;
}

/** One upstream fetch shared by every caller in the request with the same key. */
class SharedFetch {
	private readonly upstream = new AbortController();
	private waiters: Waiter[] = [];
	/** A caller without a signal can never abort, so the upstream fetch must run to completion. */
	private pinned = false;
	private head: Head | undefined;
	private body: Replay | null | undefined;

	constructor(
		private readonly cache: Map<string, SharedFetch>,
		private readonly key: string,
		private readonly call: FetchFn,
		private readonly input: RequestInfo | URL,
		private readonly init: RequestInit | undefined,
		private readonly maxBytes: number,
	) {
		Promise.resolve()
			.then(() => call(input, { ...init, signal: this.upstream.signal }))
			.then(
				(response) => this.settle(response),
				(error: unknown) => this.fail(error),
			);
	}

	private evict(): void {
		if (this.cache.get(this.key) === this) this.cache.delete(this.key);
	}

	join(signal: AbortSignal | undefined): Promise<Response> {
		const head = this.head;
		if (head) return Promise.resolve(build(head, this.body ? this.body.stream(signal) : null));
		return new Promise<Response>((resolve, reject) => {
			const waiter: Waiter = { reject, resolve, signal };
			this.waiters.push(waiter);
			if (!signal) {
				this.pinned = true;
				return;
			}
			signal.addEventListener(
				"abort",
				() => {
					const index = this.waiters.indexOf(waiter);
					if (index === -1) return;
					this.waiters.splice(index, 1);
					reject(signal.reason);
					if (!this.pinned && this.waiters.length === 0) {
						this.evict();
						this.upstream.abort(signal.reason);
					}
				},
				{ once: true },
			);
		});
	}

	private fail(error: unknown): void {
		this.evict();
		const waiters = this.waiters;
		this.waiters = [];
		for (const waiter of waiters) waiter.reject(error);
	}

	private settle(response: Response): void {
		const waiters = this.waiters;
		this.waiters = [];
		const [first, ...rest] = waiters;
		if (!first) {
			this.evict();
			response.body?.cancel().catch(() => {});
			return;
		}

		if (!isShareable(response, this.maxBytes)) {
			this.evict();
			const signal = first.signal;
			if (signal) signal.addEventListener("abort", () => this.upstream.abort(signal.reason), { once: true });
			first.resolve(response);
			for (const waiter of rest) {
				waiter.resolve(this.call(this.input, { ...this.init, signal: waiter.signal }));
			}
			return;
		}

		const head: Head = {
			headers: new Headers(response.headers),
			redirected: response.redirected,
			status: response.status,
			statusText: response.statusText,
			url: response.url,
		};
		const source = NULL_BODY_STATUSES.has(response.status) ? null : response.body;
		if (!source) {
			if (response.body) response.body.cancel().catch(() => {});
			this.body = null;
			this.head = head;
			for (const waiter of waiters) waiter.resolve(build(head, null));
			return;
		}

		const [own, shared] = source.tee();
		this.body = new Replay(shared, this.maxBytes, () => this.evict());
		this.head = head;
		first.resolve(build(head, abortable(own, first.signal)));
		for (const waiter of rest) waiter.resolve(build(head, this.body.stream(waiter.signal)));
	}
}

/**
 * Wraps `call` so GET and HEAD requests with the same key share one upstream fetch for the
 * rest of the current server request. Other methods pass through and drop every memoized
 * response. Outside a request (browser, module scope, background jobs) it is a plain passthrough.
 */
export function createDedupedFetch(call: FetchFn, scope: string, maxBytes = DEFAULT_MAX_BYTES): FetchFn {
	return (input, init) => {
		const cache = requestCache();
		if (!cache) return call(input, init);
		const method = methodOf(input, init);
		if (!SHAREABLE_METHODS.has(method)) {
			cache.clear();
			return call(input, init);
		}
		const signal = init && "signal" in init ? (init.signal ?? undefined) : isRequest(input) ? input.signal : undefined;
		if (signal?.aborted) return Promise.reject(signal.reason);

		let key: string;
		try {
			key = keyOf(scope, new Request(input, init));
		} catch {
			/* Let the runtime's fetch report an invalid request the way it normally does. */
			return call(input, init);
		}
		let entry = cache.get(key);
		if (!entry) {
			entry = new SharedFetch(cache, key, call, input, init, maxBytes);
			cache.set(key, entry);
		}
		return entry.join(signal);
	};
}

let originalFetch: typeof globalThis.fetch | undefined;
let enableCount = 0;

/**
 * Reference-counted enable/disable to avoid race conditions
 * when concurrent requests share the same isolate.
 */
export function enableFetchDedupe(): void {
	enableCount++;
	if (enableCount === 1) {
		const base = globalThis.fetch;
		originalFetch = base;
		globalThis.fetch = createDedupedFetch((input, init) => base(input, init), "global") as typeof globalThis.fetch;
	}
}

export function disableFetchDedupe(): void {
	enableCount--;
	if (enableCount <= 0) {
		if (originalFetch) globalThis.fetch = originalFetch;
		originalFetch = undefined;
		enableCount = 0;
	}
}

export function isFetchDedupeEnabled(): boolean {
	return enableCount > 0;
}
