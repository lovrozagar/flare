import { createServer, request as httpRequest, type IncomingMessage, type ServerResponse } from "node:http"
import type { AddressInfo } from "node:net"

// A shared HTTP cache in front of an origin, as a CDN or a caching proxy is: RFC 9111's rules for a shared cache and
// RFC 9213's CDN-Cache-Control, each taken at the permissive edge the RFC allows, so that what it does not leak, no
// compliant cache leaks (plan 28):
// - a GET whose answer may be stored is stored: an explicit freshness (s-maxage, max-age, Expires), `public`, or, for a
//   heuristically cacheable status with neither, a heuristic freshness of 60 s (RFC 9111 4.2.2);
// - `private`, `no-store`, `no-cache`, and `Vary: *` keep an answer out; `no-cache="field"` stores it without the field;
// - CDN-Cache-Control, when present, is read instead of Cache-Control (RFC 9213);
// - a request with Authorization reuses a stored answer only when it says `public` or `s-maxage` (RFC 9111 3.5);
// - a stored answer's headers are replayed, Set-Cookie included; the request's own Cache-Control is ignored, as CDNs do;
// - HEAD is answered from a stored GET; every other method passes through.

const HEURISTIC_SECONDS = 60

// The statuses RFC 9110 15.1 calls heuristically cacheable.
const HEURISTIC = new Set([200, 203, 204, 206, 300, 301, 308, 404, 405, 410, 414, 501])

const HOP_BY_HOP = new Set([
	"connection",
	"keep-alive",
	"proxy-connection",
	"transfer-encoding",
	"upgrade",
	"te",
	"trailer",
	"content-length",
])

// One answer from the origin, as the cache judged it: whether it was stored, from what freshness, and whether it
// carried Set-Cookie.
export type Decision = {
	method: string
	url: string
	status: number
	stored: boolean
	freshness: "explicit" | "heuristic" | "none"
	setCookie: boolean
	cacheControl: string | null
	cdnCacheControl: string | null
}

export type SharedCache = { origin: string; decisions: Decision[]; hits: string[]; close: () => Promise<void> }

type Entry = {
	status: number
	headers: [string, string][]
	body: Uint8Array
	storedAt: number
	fresh: number
	vary: string[]
	varied: Record<string, string | undefined>
	public: boolean
}

type Directives = Map<string, string | true>

type Freshness = { seconds: number; kind: Decision["freshness"]; strip: string[]; public: boolean }

function directives(value: string | null): Directives {
	const parsed: Directives = new Map()
	for (const part of (value ?? "").split(",")) {
		const [name = "", ...rest] = part.trim().split("=")
		const raw = rest.join("=").trim()
		if (name !== "") parsed.set(name.toLowerCase(), raw === "" ? true : raw.replace(/^"|"$/g, ""))
	}
	return parsed
}

function seconds(value: string | true | undefined): number | undefined {
	const parsed = typeof value === "string" ? Number.parseInt(value, 10) : Number.NaN
	return Number.isFinite(parsed) ? parsed : undefined
}

function expires(headers: Headers): number | undefined {
	const value = headers.get("expires")
	if (value === null) return undefined
	const at = Date.parse(value)
	return Number.isNaN(at) ? 0 : Math.max(0, Math.round((at - Date.now()) / 1000))
}

// The answer's caching rules: CDN-Cache-Control when present, else Cache-Control (RFC 9213).
function rulesOf(headers: Headers): Directives {
	return directives(headers.get("cdn-cache-control") ?? headers.get("cache-control"))
}

// Whether the rules keep the answer out of a shared cache entirely.
function forbidden(rules: Directives, headers: Headers): boolean {
	const vary = (headers.get("vary") ?? "").split(",").some((field) => field.trim() === "*")
	return rules.has("no-store") || rules.has("private") || rules.get("no-cache") === true || vary
}

// How long the answer may be served, or undefined when it may not be stored.
function freshnessOf(status: number, headers: Headers, authorized: boolean): Freshness | undefined {
	const rules = rulesOf(headers)
	if (forbidden(rules, headers)) return undefined
	const noCache = rules.get("no-cache")
	const strip = typeof noCache === "string" ? noCache.split(",").map((field) => field.trim().toLowerCase()) : []
	const shared = seconds(rules.get("s-maxage"))
	const open = rules.has("public") || shared !== undefined
	if (authorized && !open) return undefined
	const explicit = shared ?? seconds(rules.get("max-age")) ?? expires(headers)
	if (explicit !== undefined) return { seconds: explicit, kind: "explicit", strip, public: open }
	if (rules.has("public") || HEURISTIC.has(status)) {
		return { seconds: HEURISTIC_SECONDS, kind: "heuristic", strip, public: open }
	}
	return undefined
}

function headerOf(request: IncomingMessage, name: string): string | undefined {
	return [request.headers[name] ?? []].flat().join(", ") || undefined
}

function forwardedHeaders(request: IncomingMessage): Headers {
	const headers = new Headers()
	for (const [name, value] of Object.entries(request.headers)) {
		if (value === undefined || HOP_BY_HOP.has(name)) continue
		for (const one of Array.isArray(value) ? value : [value]) headers.append(name, one)
	}
	return headers
}

// The origin's status and headers, as the cache judges them.
type Answer = { status: number; headers: Headers }

function headersOf(incoming: IncomingMessage): Headers {
	const headers = new Headers()
	for (const [name, value] of Object.entries(incoming.headers)) {
		for (const one of Array.isArray(value) ? value : value === undefined ? [] : [value]) headers.append(name, one)
	}
	return headers
}

// The request sent on to the origin as a CDN sends it, its Host kept, which `fetch` would replace, so an origin that
// checks a request's Origin against its Host sees the visitor's own; the answer relayed as it arrives, as a CDN
// relays a stream, unfollowed. `judge` sees the status and headers first and says whether to keep the body, which is
// then stored once the answer has ended whole. A visitor that leaves cancels the origin request.
function relay(input: {
	url: string
	init: { method: string; headers: Headers; body: ArrayBuffer | undefined }
	response: ServerResponse
	judge: (answer: Answer) => ((bytes: Uint8Array) => void) | undefined
}): Promise<void> {
	const { url, init, response, judge } = input
	return new Promise((resolve, reject) => {
		const headers: Record<string, string> = {}
		init.headers.forEach((value, name) => {
			headers[name] = value
		})
		const outgoing = httpRequest(url, { method: init.method, headers }, (incoming) => {
			const answer = { status: incoming.statusCode ?? 502, headers: headersOf(incoming) }
			const keep = judge(answer)
			for (const [name, value] of keptHeaders(answer.headers)) response.appendHeader(name, value)
			response.writeHead(answer.status)
			const chunks: Buffer[] = []
			incoming.on("data", (chunk: Buffer) => {
				if (keep !== undefined) chunks.push(chunk)
				response.write(chunk)
			})
			incoming.on("end", () => {
				response.end()
				keep?.(new Uint8Array(Buffer.concat(chunks)))
				resolve()
			})
			incoming.on("error", reject)
			response.on("close", () => {
				if (!incoming.complete) incoming.destroy()
				resolve()
			})
		})
		outgoing.on("error", reject)
		outgoing.end(init.body === undefined ? undefined : Buffer.from(init.body))
	})
}

async function bodyOf(request: IncomingMessage): Promise<ArrayBuffer> {
	const chunks: Buffer[] = []
	for await (const chunk of request) chunks.push(chunk as Buffer)
	const joined = Buffer.concat(chunks)
	return joined.buffer.slice(joined.byteOffset, joined.byteOffset + joined.byteLength) as ArrayBuffer
}

// The answer's headers as they are replayed: Set-Cookie one value each, no hop-by-hop field.
function keptHeaders(headers: Headers): [string, string][] {
	const kept: [string, string][] = []
	headers.forEach((value, name) => {
		if (name !== "set-cookie" && !HOP_BY_HOP.has(name)) kept.push([name, value])
	})
	for (const cookie of headers.getSetCookie()) kept.push(["set-cookie", cookie])
	return kept
}

function entryOf(answered: Answer, from: { body: Uint8Array; fresh: Freshness; request: IncomingMessage }): Entry {
	const { body, fresh, request } = from
	const vary = (answered.headers.get("vary") ?? "")
		.split(",")
		.map((name) => name.trim().toLowerCase())
		.filter((name) => name !== "")
	return {
		status: answered.status,
		headers: keptHeaders(answered.headers).filter(([name]) => !fresh.strip.includes(name)),
		body,
		storedAt: Date.now(),
		fresh: fresh.seconds,
		vary,
		varied: Object.fromEntries(vary.map((name) => [name, headerOf(request, name)])),
		public: fresh.public,
	}
}

function decisionOf(at: { method: string; url: string }, answered: Answer, fresh: Freshness | undefined): Decision {
	const { method, url } = at
	return {
		method,
		url,
		status: answered.status,
		stored: fresh !== undefined,
		freshness: fresh?.kind ?? "none",
		setCookie: answered.headers.getSetCookie().length > 0,
		cacheControl: answered.headers.get("cache-control"),
		cdnCacheControl: answered.headers.get("cdn-cache-control"),
	}
}

// A stored answer that may serve this request: fresh, with the same varied headers, and, for a request with
// Authorization, one that said public or s-maxage (RFC 9111 3.5).
function usable(entry: Entry, request: IncomingMessage): boolean {
	if (Date.now() - entry.storedAt >= entry.fresh * 1000) return false
	if (request.headers.authorization !== undefined && !entry.public) return false
	return entry.vary.every((name) => headerOf(request, name) === entry.varied[name])
}

function send(
	response: ServerResponse,
	answer: { status: number; headers: [string, string][]; body?: Uint8Array },
): void {
	const { status, headers, body } = answer
	for (const [name, value] of headers) response.appendHeader(name, value)
	response.writeHead(status)
	response.end(body)
}

export async function sharedCache(origin: string): Promise<SharedCache> {
	const store = new Map<string, Entry[]>()
	const decisions: Decision[] = []
	const hits: string[] = []

	async function handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
		const method = request.method ?? "GET"
		const url = request.url ?? "/"
		const readable = method === "GET" || method === "HEAD"
		const found = readable ? store.get(`GET ${url}`)?.find((entry) => usable(entry, request)) : undefined
		if (found !== undefined) {
			hits.push(`${method} ${url}`)
			const age = String(Math.floor((Date.now() - found.storedAt) / 1000))
			return send(response, {
				status: found.status,
				headers: [...found.headers, ["age", age]],
				body: method === "HEAD" ? undefined : found.body,
			})
		}
		const body = readable ? undefined : await bodyOf(request)
		const authorized = request.headers.authorization !== undefined
		await relay({
			url: `${origin}${url}`,
			init: { method, headers: forwardedHeaders(request), body },
			response,
			judge: (answered) => {
				const fresh = method === "GET" ? freshnessOf(answered.status, answered.headers, authorized) : undefined
				decisions.push(decisionOf({ method, url }, answered, fresh))
				if (fresh === undefined) return undefined
				return (bytes) =>
					store.set(`GET ${url}`, [
						entryOf(answered, { body: bytes, fresh, request }),
						...(store.get(`GET ${url}`) ?? []),
					])
			},
		})
	}

	const server = createServer((request, response) => {
		handle(request, response).catch((error: unknown) => {
			// An origin that fails once its answer has started can only cut the relay short, as a CDN does.
			if (response.headersSent) return void response.destroy()
			send(response, { status: 502, headers: [], body: new TextEncoder().encode(String(error)) })
		})
	})
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
	return {
		origin: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
		decisions,
		hits,
		close: () =>
			new Promise((resolve) => {
				server.closeAllConnections()
				server.close(() => resolve())
			}),
	}
}
