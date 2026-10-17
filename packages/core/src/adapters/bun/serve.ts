import { rebodied, streamsBody } from "../../server/lifecycle/finalize.ts"
import { forwardedHttps, trustedHops, validHost } from "../../shared/url/index.ts"
import { pendingWork, type DrainOptions } from "../drain.ts"

// Bun's own default `maxRequestBodySize`, kept as the platform ceiling. Flare's capped reader answers a body over
// `bodyLimit` with 413 (`server-fn/input.ts`), and that limit is at most 32 MiB, so the 413 always comes first. A
// body over this ceiling makes Bun cut the connection, which a client reads as EPIPE or ECONNRESET, not a status
// (BUGS.md 114).
const BUN_CEILING = 128 * 1024 * 1024

type Ctx = { waitUntil: (promise: Promise<unknown>) => void }

export type BunServer = {
	fetch: (request: Request, env: undefined, ctx: Ctx) => Response | Promise<Response>
}

// `trustProxy` as on the Node listener: with a trusted hop, `X-Forwarded-Proto: https` makes the request https, so its
// origin, redirects, and Strict-Transport-Security follow (dx/adapters.md). `idleTimeout` is Bun.serve's, in seconds,
// and goes to it with the fetch.
export type BunFetchOptions = { trustProxy?: number; idleTimeout?: number }

// The per-request timeout of the server Bun.serve hands its fetch.
export type BunTimeouts = { timeout: (request: Request, seconds: number) => void }

// Bun's own default `idleTimeout`, and its ceiling.
const BUN_IDLE = 10
const MAX_IDLE = 255

// `drain` is what a SIGTERM handler awaits after `stop()`: it resolves once every answer in flight is sent and its
// `waitUntil` work has settled, or with `false` at the timeout (dx/adapters.md, plan 21 16.11).
export function createBunFetch(
	server: BunServer,
	options: BunFetchOptions = {},
): {
	fetch: (request: Request, bun?: BunTimeouts) => Promise<Response>
	maxRequestBodySize: number
	idleTimeout: number
	drain: (options: DrainOptions) => Promise<boolean>
} {
	const { idleTimeout = BUN_IDLE, ...forwarding } = options
	const hops = trustedHops("createBunFetch", forwarding, ["trustProxy", "idleTimeout"])
	if (!Number.isInteger(idleTimeout) || idleTimeout < 0 || idleTimeout > MAX_IDLE) {
		throw new Error(`idleTimeout is an integer from 0 to ${MAX_IDLE} seconds`)
	}
	const pending = pendingWork()
	// Background work is held until it settles, so a drain waits for it; a rejection is logged, never left unhandled,
	// as on Node (BUGS.md 153).
	const ctx: Ctx = {
		waitUntil(promise) {
			pending.track(promise)
			promise.catch((error: unknown) => console.error("[flare:bun] waitUntil rejected", error))
		},
	}
	return {
		fetch(request, bun) {
			// Bun builds the URL from the Host header as sent: one that is not a host would change the routed path.
			if (!validHost(request.headers.get("host"))) return Promise.resolve(new Response(null, { status: 400 }))
			const sent = Promise.withResolvers<void>()
			pending.track(sent.promise)
			const timeout = bun === undefined ? undefined : (seconds: number) => bun.timeout(request, seconds)
			// A throw as the call starts rejects like a later one, so the answer is never left in flight.
			const answered = new Promise<Response>((resolve) =>
				resolve(server.fetch(forwarded(request, hops), undefined, ctx)),
			)
			return answered.then(
				(response) => watched(response, { timeout, idle: idleTimeout, sent: sent.resolve }),
				(error: unknown) => {
					sent.resolve()
					throw error
				},
			)
		},
		maxRequestBodySize: BUN_CEILING,
		idleTimeout,
		drain: pending.drain,
	}
}

type Watch = { timeout: ((seconds: number) => void) | undefined; idle: number; sent: () => void }

// A streamed answer counts as in flight until its body ends or the client leaves. Bun closes a socket idle for
// `idleTimeout`, a response in flight included, so a stream that goes quiet between chunks, a slow deferred value or a
// server function's `.stream()`, would be cut: the timeout is lifted while it is sent and set back once it ends, so an
// idle keep-alive socket still closes (plan 21 8.3, BUGS.md 198). A kept Response with no body, a 204 or a redirect,
// has nothing to watch; its body is read only after `blobBody`, since reading a Blob body makes it a stream (BUGS.md 238).
function watched(response: Response, watch: Watch): Response {
	if (!streamsBody(response) || blobBody(response) || response.body === null) {
		watch.sent()
		return response
	}
	watch.timeout?.(0)
	return rebodied(
		response,
		ended(response.body, () => {
			watch.timeout?.(watch.idle)
			watch.sent()
		}),
	)
}

// The body as sent, calling `done` once when it ends, fails, or is cancelled.
function ended(body: ReadableStream<Uint8Array>, done: () => void): ReadableStream<Uint8Array> {
	const reader = body.getReader()
	return new ReadableStream<Uint8Array>({
		async pull(controller) {
			try {
				const step = await reader.read()
				if (!step.done) return controller.enqueue(step.value)
				controller.close()
				done()
			} catch (error) {
				controller.error(error)
				done()
			}
		},
		cancel(reason) {
			done()
			return reader.cancel(reason)
		},
	})
}

// Bun's URL keeps the scheme the socket spoke. Rebuilt only for a trusted https hop, so another request keeps its body.
function forwarded(request: Request, hops: number): Request {
	const url = new URL(request.url)
	if (url.protocol !== "http:" || !forwardedHttps(hops, request.headers.get("x-forwarded-proto"))) return request
	url.protocol = "https:"
	return new Request(url, request)
}

// Bun holds a string or bytes body as a Blob, which it sends at once and types `text/plain` itself only while nothing
// reads `body` (plan 21 12.7). Its inspector tells such a body from a stream without reading it.
function blobBody(response: Response): boolean {
	const bun: unknown = Reflect.get(globalThis, "Bun")
	const inspect: unknown = Reflect.get(Object(bun), "inspect")
	return typeof inspect === "function" && String(Reflect.apply(inspect, bun, [response])).includes("\n  Blob (")
}
