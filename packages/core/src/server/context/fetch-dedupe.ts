import { getRequestEvent, type RequestEvent } from "@solidjs/web"
import { requestEvent } from "../loaders/scope.ts"

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>

export type FetchTarget = FetchLike | { fetch: FetchLike }

export type DedupeOptions = { maxBytes?: number }

type Entries = Map<string, Promise<Shared>>

type Store = WeakMap<object, Entries>

const STORE_KEY = "flareFetchDedupe"

const UNKEYED_HEADERS = ["traceparent", "tracestate", "x-correlation-id", "x-request-id"]

// A Response is an unread master copy, and each waiter gets its own clone. "own": the body is not
// memoizable, so a waiter fetches on its own. "retry": the call rejected, so a waiter starts a fresh shared
// entry. A rejection is never handed to a second caller.
type Shared = Response | "own" | "retry"

// Entries live on Solid's request event, keyed by the target itself, so a binding wrapped twice in one
// request shares them and the next request starts empty. `globalThis.fetch` is never patched (B87).
export function withFetchDedupe(target: FetchTarget, options: DedupeOptions = {}): FetchLike {
	const maxBytes = options.maxBytes ?? 1024 * 1024
	const call: FetchLike = typeof target === "function" ? target : (input, init) => target.fetch(input, init)
	const deduped: FetchLike = (input, init) => {
		const event: RequestEvent | undefined = getRequestEvent()
		if (event === undefined) return call(input, init)
		const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase()
		if (method !== "GET" && method !== "HEAD") {
			reset(event)
			return call(input, init)
		}
		const entries = entriesOf(event, target)
		const key = keyOf(new Request(input, init))
		const existing = entries.get(key)
		if (existing === undefined) return lead({ entries, key, maxBytes }, () => call(input, init))
		return existing.then((shared) => {
			if (shared === "retry") return deduped(input, init)
			if (shared === "own") return call(input, init)
			return shared.clone()
		})
	}
	return deduped
}

function lead(
	slot: { entries: Entries; key: string; maxBytes: number },
	call: () => Promise<Response>,
): Promise<Response> {
	// share() clones before the caller can read the body: it runs in the first callback on that response.
	const settled = call().then((response) => ({ response, memo: share(response, slot.maxBytes) }))
	const entry = settled
		.then((result) => result.memo)
		.then(
			(memo): Shared => memo ?? "own",
			(): Shared => "retry",
		)
		.then((shared) => {
			if (typeof shared === "string") slot.entries.delete(slot.key)
			return shared
		})
	slot.entries.set(slot.key, entry)
	return settled.then((result) => result.response)
}

// Headers iterate lowercased and sorted (Fetch spec), so equal header sets give equal keys.
function keyOf(request: Request): string {
	const headers = [...request.headers].filter(([name]) => !UNKEYED_HEADERS.includes(name))
	return JSON.stringify([
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
	])
}

// An event stream never ends, so it is not cloned. A body over the cap stays with the first caller, and both
// spare branches are cancelled so they stop buffering. A tee branch's cancel settles only once its sibling is
// cancelled too, so it is never awaited.
function share(response: Response, maxBytes: number): Promise<Response | undefined> {
	if ((response.headers.get("content-type") ?? "").includes("text/event-stream")) return Promise.resolve(undefined)
	const master = response.clone()
	const probe = master.clone().body
	const kept = master.body
	if (probe === null || kept === null) return Promise.resolve(master)
	return fits(probe, maxBytes).then((ok) => {
		if (ok) return master
		void kept.cancel()
		return undefined
	})
}

async function fits(stream: ReadableStream<Uint8Array>, maxBytes: number): Promise<boolean> {
	const reader = stream.getReader()
	let total = 0
	for (;;) {
		const next = await reader.read()
		if (next.done) return true
		total += next.value.byteLength
		if (total > maxBytes) {
			void reader.cancel()
			return false
		}
	}
}

function entriesOf(event: RequestEvent, target: object): Entries {
	const store = storeOf(event)
	const found = store.get(target)
	if (found !== undefined) return found
	const created: Entries = new Map()
	store.set(target, created)
	return created
}

// The store is the request's, not one loader's: sibling loaders and the render share it (B21).
function storeOf(event: RequestEvent): Store {
	const found: unknown = Reflect.get(requestEvent(event), STORE_KEY)
	if (isStore(found)) return found
	return reset(event)
}

// Only reset() writes this field, always with a Store.
function isStore(value: unknown): value is Store {
	return value instanceof WeakMap
}

// Anything other than GET or HEAD may change what a later GET returns, so the request starts over.
function reset(event: RequestEvent): Store {
	const store: Store = new WeakMap()
	Reflect.set(requestEvent(event), STORE_KEY, store)
	return store
}
