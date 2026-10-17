import { settleRequestBody } from "./body.ts"
import { finalize } from "../../server/lifecycle/finalize.ts"
import { REFUSED, type RefusedAnswer } from "../../server/lifecycle/methods.ts"
import { trustedHops } from "../../shared/url/index.ts"
import { pendingWork, type DrainOptions, type Pending } from "../drain.ts"
import { toRequest } from "./request.ts"

// The methods fetch's Request refuses to build. No route answers one, so each is the 405 a page gives, as on Bun,
// where the server answers it (plan 21 13.6).
const UNBUILT = new Set(["CONNECT", "TRACE", "TRACK"])

type Ctx = { waitUntil: (promise: Promise<unknown>) => void }

type Server = {
	fetch: (request: Request, env: undefined, ctx: Ctx) => Promise<Response> | Response
}

// What the listener reads of a Node `IncomingMessage`. `on` and `resume` are methods, called on the request itself.
type NodeReq = {
	method?: string | undefined
	url?: string | undefined
	headers: Readonly<Record<string, string | readonly string[] | undefined>>
	resume?(): unknown
	on?(event: "data" | "end", listener: (chunk: Uint8Array) => void): unknown
	readableEnded?: boolean | undefined
}

type NodeRes = {
	writeHead: (status: number) => void
	setHeader: (name: string, value: string | readonly string[]) => void
	write: (chunk: Uint8Array) => boolean
	end: () => void
	once: (event: "drain" | "close", callback: () => void) => void
	writableFinished?: boolean
	destroy?: () => void
}

// `trustProxy` is how many proxy hops in front of the server are trusted: with one or more, `X-Forwarded-Proto: https`
// makes the request https, so its origin, redirects, and Strict-Transport-Security follow (dx/adapters.md).
export type NodeListenerOptions = { trustProxy?: number }

// The listener, and `drain`, which a SIGTERM handler awaits after `http.close()`: it resolves once every request in
// flight is sent and their `waitUntil` work has settled, or with `false` at the timeout (dx/adapters.md).
export type NodeListener = ((req: NodeReq, res: NodeRes) => void) & {
	drain: (options: DrainOptions) => Promise<boolean>
}

export function createNodeListener(server: Server, options: NodeListenerOptions = {}): NodeListener {
	const trustProxy = trustedHops("createNodeListener", options)
	const pending = pendingWork()
	const listener = (req: NodeReq, res: NodeRes): void => {
		const job = { server, req, res, pending, trustProxy, sent: false }
		// A failure before the headers is a 500 with no body, the build and the default security set on it (BUGS.md 341).
		// After them the socket is destroyed: the status is gone. Either is logged, never silent (plan 21 13.6).
		const pumped = pump(job).catch((error: unknown) => {
			console.error("[flare:node] the request failed", error)
			if (job.sent) return void res.destroy?.()
			writeHeaders(res, ownAnswer(500).headers)
			res.writeHead(500)
			res.end()
		})
		pending.track(pumped)
	}
	return Object.assign(listener, { drain: pending.drain })
}

type Job = {
	server: Server
	req: NodeReq
	res: NodeRes
	pending: Pending
	trustProxy: number
	sent: boolean
}

async function pump(job: Job): Promise<void> {
	// The origin comes from Host, as the adapter resolves it, so CSRF compares a browser's Origin with it (B44).
	const headers = joinedHeaders(job.req.headers)
	const adapted = toRequest({ url: job.req.url ?? "/", headers, trustProxy: job.trustProxy })
	if (adapted.status === 400) return send(job, ownAnswer(400), new AbortController().signal)
	const body = requestBody(job.req)
	// Node emits close after a normal finish too. Only a close before the finish is a client disconnect, and
	// only that aborts the request signal, so background work after a full response keeps it (as on Workers).
	const disconnect = new AbortController()
	job.res.once("close", () => {
		if (job.res.writableFinished !== true) disconnect.abort()
	})
	const method = job.req.method ?? "GET"
	if (UNBUILT.has(method.toUpperCase())) {
		const { status, location, allow } = await refusedAt(job.server, { method, url: adapted.url })
		const headers = new Headers(allow === undefined ? {} : { allow })
		return send(job, finalize({ status, body: "", url: adapted.url, location, headers }), disconnect.signal)
	}
	const init: RequestInit = { method, headers, signal: disconnect.signal }
	if (body !== undefined) {
		init.body = body.stream
		Object.assign(init, { duplex: "half" })
	}
	const request = new Request(adapted.url, init)
	const response = await job.server.fetch(request, undefined, {
		// Background work is held until it settles, so a drain waits for it; a rejection is logged, never left unhandled
		// to stop the process (BUGS.md 153).
		waitUntil(promise) {
			job.pending.track(promise)
			promise.catch((error: unknown) => console.error("[flare:node] waitUntil rejected", error))
		},
	})
	await send(job, response, disconnect.signal)
	if (body !== undefined && job.req.readableEnded !== true) await body.release()
}

// What the server's pipeline gives the method on that path, through its channel; a server with none gets the 405 a
// page gives (BUGS.md 280, 284).
async function refusedAt(server: Server, request: { method: string; url: string }): Promise<RefusedAnswer> {
	const channel: unknown = Reflect.get(server, REFUSED)
	if (typeof channel !== "function") return { status: 405, allow: "GET, HEAD, OPTIONS" }
	return (await Reflect.apply(channel, undefined, [request])) as RefusedAnswer
}

// An answer the listener gives itself, for a request it cannot route or one that failed before its headers: no body,
// and the build and the default security set every answer carries (BUGS.md 341). The request's URL may be unknown, so
// it is read as plain http.
function ownAnswer(status: number): Response {
	return finalize({ status, body: "", url: "http://localhost/" })
}

async function send(job: Job, response: Response, signal: AbortSignal): Promise<void> {
	writeHeaders(job.res, response.headers)
	// A server shutting down closes each connection after its answer, so no client sends it another request.
	if (job.pending.draining()) job.res.setHeader("connection", "close")
	job.res.writeHead(response.status)
	job.sent = true
	await writeBody(job.res, response.body, signal)
}

// Node keeps a repeated header as a list. The request carries it joined with ", ", as fetch Headers would.
function joinedHeaders(headers: NodeReq["headers"]): Record<string, string> {
	return Object.fromEntries(
		Object.entries(headers).flatMap(([name, value]) =>
			value === undefined ? [] : [[name, typeof value === "string" ? value : value.join(", ")]],
		),
	)
}

// `on` and `resume` stay calls on the request: a real `IncomingMessage` needs its receiver.
function requestBody(req: NodeReq): { stream: ReadableStream<Uint8Array>; release: () => Promise<void> } | undefined {
	if (req.method === "GET" || req.method === "HEAD") return undefined
	if (req.on === undefined || req.resume === undefined) return undefined
	const on = (event: "data" | "end", listener: (chunk: Uint8Array) => void): unknown => req.on?.(event, listener)
	const resume = (): unknown => req.resume?.()
	// A body the server stopped reading, past `bodyLimit` say, takes no more chunks: the rest drains, and an enqueue into
	// the cancelled stream would throw outside any request and stop the process (BUGS.md 151).
	let open = true
	return {
		stream: new ReadableStream<Uint8Array>({
			start(controller) {
				on("data", (chunk) => {
					if (open) controller.enqueue(chunk)
				})
				on("end", () => {
					if (open) controller.close()
				})
			},
			pull() {
				resume()
			},
			cancel() {
				open = false
				resume()
			},
		}),
		release: () => settleRequestBody({ on, resume }),
	}
}

function writeHeaders(res: NodeRes, headers: Headers): void {
	headers.forEach((value, name) => {
		if (name === "set-cookie") return
		res.setHeader(name, value)
	})
	const cookies = headers.getSetCookie()
	if (cookies.length > 0) res.setHeader("set-cookie", cookies)
}

// A client that disconnects cancels the body, so the producer stops instead of writing into a closed socket.
async function writeBody(res: NodeRes, body: ReadableStream<Uint8Array> | null, gone: AbortSignal): Promise<void> {
	if (body === null) {
		res.end()
		return
	}
	const reader = body.getReader()
	gone.addEventListener("abort", () => void reader.cancel(), { once: true })
	for (;;) {
		const step = await reader.read()
		if (step.done) {
			res.end()
			return
		}
		if (!res.write(step.value)) await drain(res)
	}
}

function drain(res: NodeRes): Promise<void> {
	return new Promise((resolve) => {
		res.once("drain", () => resolve())
	})
}
