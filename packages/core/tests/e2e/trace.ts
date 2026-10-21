import type { IncomingMessage, ServerResponse } from "node:http"
import type { Socket } from "node:net"
import type { Plugin } from "vite"

// The request trace of an e2e dev boot (BUGS.md 453). With FLARE_E2E_TRACE=1 the boot names this module to the app's
// vite.config, which puts the plugin first: its middleware runs ahead of Vite's own and Flare's listener, so it sees
// every request that reaches the server, modules and documents alike. Each line goes to the server's stderr, which the
// boot captures, and a failed case carries it in its server log (server-log.ts). Without the env, nothing loads.

type Write = (line: string) => void
type Next = () => void

export function trace(write: Write = (line) => void process.stderr.write(`${line}\n`)): Plugin {
	return {
		name: "flare:e2e-trace",
		enforce: "pre",
		configureServer(server) {
			server.middlewares.use(traced(write))
		},
	}
}

// How often a document's answer is checked for its head and its first bytes. Only documents are polled: a page loads
// a hundred modules, and their arrival and end say enough.
const POLL = 2

// Each request, numbered, from its arrival: `[trace] <ms> #<n> <method> <url> <event>`. Every request logs `arrived`,
// `finish <status> <bytes>` when its answer was handed to the socket, and `close` with whether it finished, whether the
// head went out, and the bytes written. A document also logs `head <status>` and `first bytes` when they go out.
export function traced(write: Write, now: () => number = () => performance.now()) {
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
		line("arrived")
		const stop = isDocument(req) ? watchDocument(res, line, bytes) : () => undefined
		res.once("finish", () => line(`finish ${res.statusCode} ${bytes()}`))
		res.once("close", () => {
			stop()
			line(`close finished=${String(res.writableFinished)} head=${String(res.headersSent)} bytes=${bytes()}`)
		})
		next()
	}
}

function watchDocument(res: ServerResponse, line: (event: string) => void, bytes: () => number): () => void {
	let head = false
	let first = false
	const timer = setInterval(() => {
		if (!head && res.headersSent) line(`head ${res.statusCode}`)
		head ||= res.headersSent
		if (!first && bytes() > 0) line("first bytes")
		first ||= bytes() > 0
	}, POLL)
	return () => clearInterval(timer)
}

function isDocument(req: IncomingMessage): boolean {
	const dest = req.headers["sec-fetch-dest"]
	return dest === undefined ? (req.headers.accept ?? "").includes("text/html") : dest === "document"
}

// The bytes the socket wrote so far. A keep-alive socket carries one request at a time, so the difference from the
// arrival is this answer's. A socket that does not count them, as Bun's may not, reads 0.
function written(socket: Socket): number {
	return Number(socket.bytesWritten ?? 0)
}
