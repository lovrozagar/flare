import type { IncomingMessage, ServerResponse } from "node:http"
import type { Socket } from "node:net"
import type { Plugin, ViteDevServer } from "vite"

// The request trace of an e2e dev boot (BUGS.md 453). With FLARE_E2E_TRACE=1 the boot names this module to the app's
// vite.config, which puts the plugin first: its middleware runs ahead of Vite's own and Flare's listener, so it sees
// every request that reaches the server, modules and documents alike. Each line goes to the server's stderr, which the
// boot captures, and a failed case carries it in its server log (server-log.ts). Without the env, nothing loads.

type Write = (line: string) => void
type Next = () => void
type Now = () => number

export function trace(write: Write = (line) => void process.stderr.write(`${line}\n`)): Plugin {
	return {
		name: "flare:e2e-trace",
		enforce: "pre",
		configureServer(server) {
			const conns = connections(write)
			server.httpServer?.on("connection", conns.accept)
			server.middlewares.use(traced(write, undefined, conns))
			traceModules(server, write)
			const stop = stalls(write)
			server.httpServer?.once("close", stop)
		},
	}
}

// How often an app's answer is checked for its head, its first bytes, and a quiet stream. Only the app's answers are
// polled: a page loads a hundred modules, and their arrival and end say enough.
const POLL = 2

// How long an answer whose head went out may send no bytes before it logs `quiet` (BUGS.md 504.8).
const QUIET = 1000

// Each connection the dev server accepts, numbered: `[trace] <ms> s<n> accept`, then `end` when the client half-closes
// it, `error <code>`, and `close requests=<k> read=<bytes> written=<bytes>`. A request's `arrived` names its socket, so
// a request the page sent that no `arrived` line shows reads against the sockets open then: bytes a socket read beyond
// the requests it carried were one the server never parsed (BUGS.md 504.14). No `data` listener is added, which would
// take a Node socket off its native parser. A socket that does not count its bytes, as Bun's may not, reads 0.
export function connections(write: Write, now: Now = () => performance.now()) {
	const start = now()
	let count = 0
	const known = new WeakMap<Socket, { id: number; requests: number }>()
	const line = (id: number, event: string): void => write(`[trace] ${Math.round(now() - start)} s${id} ${event}`)
	return {
		accept(socket: Socket): void {
			const state = { id: ++count, requests: 0 }
			known.set(socket, state)
			line(state.id, "accept")
			socket.once("end", () => line(state.id, "end"))
			socket.on("error", (error: NodeJS.ErrnoException) => line(state.id, `error ${error.code ?? error.message}`))
			socket.once("close", () => {
				const read = Number(socket.bytesRead ?? 0)
				line(state.id, `close requests=${state.requests} read=${read} written=${written(socket)}`)
			})
		},
		// The socket a request came on, counted: `s<n>`, or `s?` for one accepted before the trace listened.
		request(socket: Socket): string {
			const state = known.get(socket)
			if (state === undefined) return "s?"
			state.requests += 1
			return `s${state.id}`
		},
	}
}

// Each request, numbered, from its arrival: `[trace] <ms> #<n> <method> <url> <event>`. Every request logs `arrived on
// s<n>`, its socket, `finish <status> <bytes>` when its answer was handed to the socket, and `close` with whether it
// finished, whether the head went out, and the bytes written. An answer the app writes, a document, a data request, or a server function,
// also logs `head <status>` and `first bytes` when they go out, `quiet <bytes>` once a second passes with no new bytes,
// and `resumed <bytes> after <ms>` when they flow again. Under Cloudflare's plugin the head goes out when workerd
// answers, so an app request with no head is one workerd has not answered (BUGS.md 504.8).
export function traced(
	write: Write,
	now: Now = () => performance.now(),
	conns: Pick<ReturnType<typeof connections>, "request"> = { request: () => "s?" },
) {
	const start = now()
	let count = 0
	return (req: IncomingMessage, res: ServerResponse, next: Next): void => {
		const id = ++count
		const line = (event: string): void =>
			write(`[trace] ${Math.round(now() - start)} #${id} ${req.method ?? ""} ${req.url ?? ""} ${event}`)
		// The socket, kept: the response lets go of it at close.
		const socket = req.socket
		const base = written(socket)
		const bytes = (): number => written(socket) - base
		line(`arrived on ${conns.request(socket)}`)
		const stop = isAnswer(req) ? watchAnswer({ res, line, bytes, now }) : () => undefined
		res.once("finish", () => line(`finish ${res.statusCode} ${bytes()}`))
		res.once("close", () => {
			stop()
			line(`close finished=${String(res.writableFinished)} head=${String(res.headersSent)} bytes=${bytes()}`)
		})
		next()
	}
}

type Watch = { res: ServerResponse; line: (event: string) => void; bytes: () => number; now: Now }

function watchAnswer({ res, line, bytes, now }: Watch): () => void {
	let head = false
	let first = false
	let sent = 0
	let changed = now()
	let quiet = false
	const timer = setInterval(() => {
		if (!head && res.headersSent) line(`head ${res.statusCode}`)
		head ||= res.headersSent
		const count = bytes()
		if (!first && count > 0) line("first bytes")
		first ||= count > 0
		const at = now()
		if (count !== sent) {
			if (quiet) line(`resumed ${count} after ${Math.round(at - changed)} ms`)
			quiet = false
			sent = count
			changed = at
		} else if (head && !quiet && !res.writableFinished && at - changed >= QUIET) {
			quiet = true
			line(`quiet ${count}`)
		}
	}, POLL)
	return () => clearInterval(timer)
}

// A document, or a request the app answers rather than Vite: a data, prefetch, or fill request, or a server function.
function isAnswer(req: IncomingMessage): boolean {
	const url = req.url ?? ""
	if (url.includes("_flare=") || url.includes("/_flare/fn/")) return true
	const dest = req.headers["sec-fetch-dest"]
	return dest === undefined ? (req.headers.accept ?? "").includes("text/html") : dest === "document"
}

// The bytes the socket wrote so far. A keep-alive socket carries one request at a time, so the difference from the
// arrival is this answer's. A socket that does not count them, as Bun's may not, reads 0.
function written(socket: Socket): number {
	return Number(socket.bytesWritten ?? 0)
}

type Fetcher = { fetchModule: (...args: never[]) => Promise<unknown> }

// Each module a server environment's runner asks Vite for, numbered on its own: `[trace] <ms> m<n> <env> <id> asked`,
// then `answered <ms> ms` or `failed <ms> ms: <message>`. Under Cloudflare's plugin workerd asks over the plugin's
// socket, so a request held on a module reads apart from one the app never answered (BUGS.md 504.8). Vite's invoke
// handler calls the environment's own `fetchModule`, so wrapping it on the instance sees every ask.
export function traceModules(server: ViteDevServer, write: Write, now: Now = () => performance.now()): void {
	const start = now()
	const stamp = (): number => Math.round(now() - start)
	let count = 0
	for (const [name, environment] of Object.entries(server.environments)) {
		if (name === "client") continue
		const target = environment as unknown as Fetcher
		const fetchModule = target.fetchModule.bind(target)
		target.fetchModule = async (...args) => {
			const id = ++count
			const line = (event: string): void => write(`[trace] ${stamp()} m${id} ${name} ${String(args[0])} ${event}`)
			const asked = now()
			line("asked")
			try {
				const result = await fetchModule(...args)
				line(`answered ${Math.round(now() - asked)} ms`)
				return result
			} catch (error) {
				line(`failed ${Math.round(now() - asked)} ms: ${error instanceof Error ? error.message : String(error)}`)
				throw error
			}
		}
	}
}

// How often the dev server's event loop is sampled, and the gap between samples that logs a stall.
const TICK = 100
const STALL = 500

type Repeat = (tick: () => void) => () => void

const every: Repeat = (tick) => {
	const timer = setInterval(tick, TICK)
	timer.unref()
	return () => clearInterval(timer)
}

// The dev server's own event loop: a gap of STALL or more between ticks logs `[trace] <ms> node stalled <gap> ms`, so a
// stall in Node reads apart from one in workerd (BUGS.md 504.8). It returns the stop.
export function stalls(write: Write, now: Now = () => performance.now(), repeat: Repeat = every): () => void {
	const start = now()
	let last = start
	return repeat(() => {
		const at = now()
		if (at - last >= STALL) write(`[trace] ${Math.round(at - start)} node stalled ${Math.round(at - last)} ms`)
		last = at
	})
}
