import { activeMount } from "../mount/mount.ts"

// Each forward is opt-in. A cookie or a credential never reaches another origin unless the app says so (B87).
export type ProxyOptions = { forwardCookies?: boolean; forwardAuthorization?: boolean; relaySetCookie?: boolean }

// v0's api-proxy set (BUGS.md 161): the hop-by-hop headers, and the proxy credentials, which belong to this hop.
const HOP_BY_HOP = [
	"connection",
	"keep-alive",
	"proxy-authenticate",
	"proxy-authorization",
	"proxy-connection",
	"te",
	"trailer",
	"trailers",
	"transfer-encoding",
	"upgrade",
]

// What only the upstream's own request may say: its host, and where the request came from. A client's claims would
// pick the upstream's virtual host or a trusted client address (BUGS.md 161).
const CLIENT_CLAIMS = [
	"host",
	"forwarded",
	"x-forwarded-for",
	"x-forwarded-host",
	"x-forwarded-port",
	"x-forwarded-proto",
	"x-real-ip",
]

// Inside a mount's fetch: the stripped path plus the search goes to `upstream`, an absolute https origin, and the
// answer comes back with a redirect kept as a redirect (dx/server.md `proxy`). Outside a mount it throws.
export function proxy(request: Request, upstream: string, options: ProxyOptions = {}): Promise<Response> {
	// The upstream is configuration, so it is checked before the request context.
	const base = URL.canParse(upstream) ? new URL(upstream) : undefined
	if (upstream.startsWith("//") || base?.protocol !== "https:")
		throw new Error(`proxy upstream must be https: ${upstream}`)
	const prefix = activeMount()
	if (prefix === undefined) throw new Error("proxy needs an active mount")
	return send(request, base, options).then((response) => answer(response, prefix, options))
}

// The body streams to the upstream as bytes and is never read into memory, so a mount body needs no cap here.
// `duplex: "half"` is what fetch requires for a stream body. GET and HEAD send none.
function send(request: Request, base: URL, options: ProxyOptions): Promise<Response> {
	const url = new URL(request.url)
	const headers = withoutHops(request.headers, false)
	for (const name of CLIENT_CLAIMS) headers.delete(name)
	if (options.forwardCookies !== true) headers.delete("cookie")
	if (options.forwardAuthorization !== true) headers.delete("authorization")
	const init: RequestInit = { method: request.method, headers, redirect: "manual" }
	if (request.method !== "GET" && request.method !== "HEAD") Object.assign(init, { body: request.body, duplex: "half" })
	return fetch(new URL(`${url.pathname}${url.search}`, base.origin), init)
}

// A Location that is a single-slash path is put back under the mount. Any other Location, absolute or
// scheme-relative, is 502 and is not forwarded. fetch decoded the body, so its encoding and length are dropped.
function answer(response: Response, prefix: string, options: ProxyOptions): Response {
	const relay = options.relaySetCookie === true
	const headers = withoutHops(response.headers, relay)
	headers.delete("content-encoding")
	headers.delete("content-length")
	if (!relay) headers.delete("set-cookie")
	const location = response.headers.get("location")
	if (location !== null) {
		if (!location.startsWith("/") || location.startsWith("//")) {
			void response.body?.cancel()
			return new Response(null, { status: 502 })
		}
		headers.set("location", `${prefix}${location}`)
	}
	return new Response(response.body, { status: response.status, statusText: response.statusText, headers })
}

// The fixed hop-by-hop set and every header the Connection header names. `set-cookie` stays when it is relayed.
function withoutHops(source: Headers, keepSetCookie: boolean): Headers {
	const named = (source.get("connection") ?? "").split(",").map((token) => token.trim().toLowerCase())
	const drop = new Set(
		[...HOP_BY_HOP, ...named].filter((name) => name !== "" && !(keepSetCookie && name === "set-cookie")),
	)
	const headers = new Headers()
	source.forEach((value, name) => {
		if (!drop.has(name) && name !== "set-cookie") headers.append(name, value)
	})
	for (const cookie of source.getSetCookie()) if (!drop.has("set-cookie")) headers.append("set-cookie", cookie)
	return headers
}
