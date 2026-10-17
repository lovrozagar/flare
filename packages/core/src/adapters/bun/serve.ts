import { rebodied, streamsBody } from "../../server/lifecycle/finalize.ts"
import { forwardedHttps, trustedHops, validHost } from "../../shared/url/index.ts"

// Bun's own default `maxRequestBodySize`, kept as the platform ceiling. Flare's capped reader answers a body over
// `bodyLimit` with 413 (`server-fn/input.ts`), and that limit is at most 32 MiB, so the 413 always comes first. A
// body over this ceiling makes Bun cut the connection, which a client reads as EPIPE or ECONNRESET, not a status
// (BUGS.md 114).
const BUN_CEILING = 128 * 1024 * 1024

export type BunServer = {
	fetch: (request: Request) => Response | Promise<Response>
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

export function createBunFetch(
	server: BunServer,
	options: BunFetchOptions = {},
): {
	fetch: (request: Request, bun?: BunTimeouts) => Promise<Response>
	maxRequestBodySize: number
	idleTimeout: number
} {
	const { idleTimeout = BUN_IDLE, ...forwarding } = options
	const hops = trustedHops("createBunFetch", forwarding, ["trustProxy", "idleTimeout"])
	if (!Number.isInteger(idleTimeout) || idleTimeout < 0 || idleTimeout > MAX_IDLE) {
		throw new Error(`idleTimeout is an integer from 0 to ${MAX_IDLE} seconds`)
	}
	return {
		fetch(request, bun) {
			// Bun builds the URL from the Host header as sent: one that is not a host would change the routed path.
			if (!validHost(request.headers.get("host"))) return Promise.resolve(new Response(null, { status: 400 }))
			const answered = Promise.resolve(server.fetch(forwarded(request, hops)))
			if (bun === undefined) return answered
			return answered.then((response) => lifted(response, (seconds) => bun.timeout(request, seconds), idleTimeout))
		},
		maxRequestBodySize: BUN_CEILING,
		idleTimeout,
	}
}

// Bun closes a socket idle for `idleTimeout`, a response in flight included, so a stream that goes quiet between
// chunks, a slow deferred value or a server function's `.stream()`, is cut. The timeout is lifted while a streamed
// body is sent and set back once it ends, so an idle keep-alive socket still closes (plan 21 8.3, BUGS.md 198).
function lifted(response: Response, timeout: (seconds: number) => void, idle: number): Response {
	if (!streamsBody(response)) return response
	timeout(0)
	return rebodied(response, response.body.pipeThrough(new TransformStream({ flush: () => timeout(idle) })))
}

// Bun's URL keeps the scheme the socket spoke. Rebuilt only for a trusted https hop, so another request keeps its body.
function forwarded(request: Request, hops: number): Request {
	const url = new URL(request.url)
	if (url.protocol !== "http:" || !forwardedHttps(hops, request.headers.get("x-forwarded-proto"))) return request
	url.protocol = "https:"
	return new Request(url, request)
}
