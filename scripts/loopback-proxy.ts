import { rmSync } from "node:fs"
import { createServer, request } from "node:http"
import { connect, createServer as createTcpServer, type Socket } from "node:net"

// The isolated Chromium's way to the host's loopback (plan 33, BUGS.md 484). Chromium in its own network namespace
// never sees another process's interface changes, which fail its loads with ERR_NETWORK_CHANGED; but there it cannot
// reach the test servers on the host's 127.0.0.1. This forwarding proxy runs in the host's namespace, listens only on
// a Unix socket the Chromium container shares, so no TCP port opens anywhere, and forwards to loopback alone: an
// absolute-form request streamed message by message, and CONNECT as a tunnel for WebSockets. Every origin a page loads
// stays http://127.0.0.1:<port>.

export type LoopbackProxy = {
	path: string
	address: () => string | undefined
	close: () => Promise<void>
}

export type ProxyOptions = {
	path: string
	// An idle client connection closes after this, so a test that died holding one leaks nothing for long.
	idleMs?: number
	// Connections past this are refused.
	maxConnections?: number
}

// The loopback spellings a page's URL may carry, and where each goes.
const LOOPBACK: Readonly<Record<string, string>> = { "127.0.0.1": "127.0.0.1", localhost: "127.0.0.1", "[::1]": "::1" }

// The loopback target of `host` and `port`, or undefined for any other host, or a port outside 1024-65535: a test page
// reaches the test servers, never a privileged service on the host.
export function loopbackTarget(host: string, port: string): { host: string; port: number } | undefined {
	const to = LOOPBACK[host.toLowerCase()]
	const number = Number(port)
	if (to === undefined || !/^\d+$/.test(port) || number < 1024 || number > 65_535) return undefined
	return { host: to, port: number }
}

function absoluteTarget(url: string | undefined): { host: string; port: number; path: string } | undefined {
	if (url === undefined || !/^http:\/\//i.test(url)) return undefined
	const parsed = URL.parse(url)
	if (parsed === null) return undefined
	const target = loopbackTarget(parsed.hostname, parsed.port || "80")
	return target === undefined ? undefined : { ...target, path: `${parsed.pathname}${parsed.search}` }
}

function connectTarget(authority: string | undefined): { host: string; port: number } | undefined {
	const found = /^(.+):([^:\]]+)$/.exec(authority ?? "")
	return found === null ? undefined : loopbackTarget(found[1] ?? "", found[2] ?? "")
}

export function startLoopbackProxy(options: ProxyOptions): Promise<LoopbackProxy> {
	// A tunnel's sockets leave the HTTP server's books, so the proxy keeps them to end them on close.
	const tunnels = new Set<Socket>()
	const server = createServer((req, res) => {
		const target = absoluteTarget(req.url)
		if (target === undefined) return void res.writeHead(403).end()
		// Each request its own upstream connection (`agent: false`): one the client left is destroyed, never pooled for
		// the next. A leave in either direction closes the other side, so a server holding a stream sees the client go
		// (docs-data `stream abort`), and a client sees an upstream that died.
		const forwarded = request(
			{
				host: target.host,
				port: target.port,
				method: req.method,
				path: target.path,
				headers: req.rawHeaders,
				agent: false,
			},
			(answer) => {
				res.writeHead(answer.statusCode ?? 502, answer.rawHeaders)
				answer.pipe(res)
				answer.on("aborted", () => res.destroy())
				answer.on("error", () => res.destroy())
			},
		)
		forwarded.on("error", () => {
			if (res.headersSent) res.destroy()
			else res.writeHead(502).end()
		})
		res.on("close", () => {
			if (!res.writableFinished) forwarded.destroy()
		})
		req.pipe(forwarded)
	})
	server.on("connect", (req, socket: Socket, head: Buffer) => {
		const target = connectTarget(req.url)
		if (target === undefined) return void socket.end("HTTP/1.1 403 Forbidden\r\n\r\n")
		tunnels.add(socket)
		socket.on("close", () => tunnels.delete(socket))
		const tunnel = connect(target.port, target.host, () => {
			socket.write("HTTP/1.1 200 Connection Established\r\n\r\n")
			tunnel.write(head)
			tunnel.pipe(socket)
			socket.pipe(tunnel)
		})
		tunnel.on("close", () => socket.destroy())
		socket.on("close", () => tunnel.destroy())
		tunnel.on("error", () => socket.destroy())
		socket.on("error", () => tunnel.destroy())
	})
	server.keepAliveTimeout = options.idleMs ?? 30_000
	server.on("connection", (socket: Socket) => socket.setTimeout(options.idleMs ?? 30_000, () => socket.destroy()))
	server.maxConnections = options.maxConnections ?? 256
	// A socket file a dead proxy left would make listen fail with EADDRINUSE.
	rmSync(options.path, { force: true })
	return new Promise((resolve, reject) => {
		server.once("error", reject)
		server.listen(options.path, () => {
			resolve({
				path: options.path,
				address: () => {
					const address = server.address()
					return typeof address === "string" ? address : undefined
				},
				close: () =>
					new Promise((done) => {
						server.closeAllConnections()
						for (const socket of tunnels) socket.destroy()
						server.close(() => done())
					}),
			})
		})
	})
}

// Inside Chromium's container: a TCP port on its loopback, the proxy Chromium is given, piped to the proxy's socket.
// Chromium cannot name a Unix socket as its proxy, and the container cannot reach the host's TCP ports.
export function startRelay(port: number, path: string): Promise<{ port: number; close: () => Promise<void> }> {
	const sockets = new Set<Socket>()
	const server = createTcpServer((client) => {
		const upstream = connect(path)
		for (const socket of [client, upstream]) {
			sockets.add(socket)
			socket.on("close", () => sockets.delete(socket))
		}
		client.pipe(upstream)
		upstream.pipe(client)
		// Either side closing closes the other, so a leave reaches the proxy and through it the server.
		upstream.on("close", () => client.destroy())
		client.on("close", () => upstream.destroy())
		upstream.on("error", () => client.destroy())
		client.on("error", () => upstream.destroy())
	})
	return new Promise((resolve, reject) => {
		server.once("error", reject)
		server.listen(port, "127.0.0.1", () => {
			const address = server.address()
			resolve({
				port: typeof address === "object" && address !== null ? address.port : port,
				close: () =>
					new Promise((done) => {
						for (const socket of sockets) socket.destroy()
						server.close(() => done())
					}),
			})
		})
	})
}

// The containers run this file with Node's type stripping: `proxy <socket>` in the host-network one, `relay <port>
// <socket>` in Chromium's.
if (import.meta.main) {
	const [mode, first = "", second = ""] = process.argv.slice(2)
	if (mode === "proxy") await startLoopbackProxy({ path: first })
	else if (mode === "relay") await startRelay(Number(first), second)
	else throw new Error(`loopback-proxy: unknown mode ${mode ?? "(none)"}; use proxy <socket> or relay <port> <socket>`)
}
