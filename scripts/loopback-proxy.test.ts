import { once } from "node:events"
import { mkdtempSync, statSync } from "node:fs"
import { Agent, createServer, request, type IncomingMessage, type Server } from "node:http"
import { connect, type Socket } from "node:net"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, expect, it } from "vitest"
import { startLoopbackProxy, startRelay, type LoopbackProxy } from "./loopback-proxy.ts"

const open: { close: () => Promise<void> | void }[] = []

afterEach(async () => {
	for (const item of open.splice(0)) await item.close()
})

// A loopback server; `handle` answers each request.
async function upstream(handle: Parameters<typeof createServer>[1]): Promise<{ server: Server; port: number }> {
	const server = createServer(handle)
	server.listen(0, "127.0.0.1")
	await once(server, "listening")
	open.push({
		close: () => {
			server.closeAllConnections()
			server.close()
		},
	})
	const address = server.address()
	return { server, port: typeof address === "object" && address !== null ? address.port : 0 }
}

async function proxy(options: Partial<Parameters<typeof startLoopbackProxy>[0]> = {}): Promise<LoopbackProxy> {
	const path = join(mkdtempSync(join(tmpdir(), "flare-proxy-")), "proxy.sock")
	const started = await startLoopbackProxy({ path, ...options })
	open.push(started)
	return started
}

// One request through the proxy in absolute form, as a browser sends it; the answer, its body read whole.
async function via(
	running: LoopbackProxy,
	url: string,
	agent?: Agent,
): Promise<{ status: number; body: string; raw: string[] }> {
	const answer = await new Promise<IncomingMessage>((resolve, reject) => {
		const sent = request({ socketPath: running.path, path: url, agent }, resolve)
		sent.on("error", reject)
		sent.end()
	})
	let body = ""
	for await (const chunk of answer) body += String(chunk)
	return { status: answer.statusCode ?? 0, body, raw: answer.rawHeaders }
}

// An absolute-form GET reaches the loopback server, and its body streams: the first chunk arrives while the server
// still holds the rest.
it("streams a loopback answer", async () => {
	const release = Promise.withResolvers<void>()
	const { port } = await upstream((_req, res) => {
		res.writeHead(200, { "content-type": "text/plain" })
		res.write("first;")
		void release.promise.then(() => res.end("second"))
	})
	const running = await proxy()
	const answer = await new Promise<IncomingMessage>((resolve) => {
		request({ socketPath: running.path, path: `http://127.0.0.1:${port}/s` }, resolve).end()
	})
	const [first] = (await once(answer, "data")) as [Buffer]
	expect(String(first)).toBe("first;")
	release.resolve()
	let rest = ""
	for await (const chunk of answer) rest += String(chunk)
	expect(rest).toBe("second")
})

// One client connection carries requests to two loopback ports in turn, as a browser reuses its proxy connection.
it("keep-alive across ports", async () => {
	const a = await upstream((_req, res) => res.end("a"))
	const b = await upstream((_req, res) => res.end("b"))
	const running = await proxy()
	const agent = new Agent({ keepAlive: true, maxSockets: 1 })
	open.push({ close: () => agent.destroy() })
	const sockets = new Set<Socket>()
	agent.on("free", (socket: Socket) => sockets.add(socket))
	const first = await via(running, `http://127.0.0.1:${a.port}/`, agent)
	const second = await via(running, `http://127.0.0.1:${b.port}/`, agent)
	expect([first.body, second.body, sockets.size]).toEqual(["a", "b", 1])
})

// Repeated headers and their spelling come through as the server wrote them.
it("headers as written", async () => {
	const { port } = await upstream((_req, res) => {
		res.writeHead(200, [
			["Set-Cookie", "a=1"],
			["Set-Cookie", "b=2"],
			["X-Mixed-Case", "yes"],
		])
		res.end()
	})
	const answer = await via(await proxy(), `http://127.0.0.1:${port}/`)
	expect(answer.raw).toEqual(expect.arrayContaining(["Set-Cookie", "a=1", "Set-Cookie", "b=2", "X-Mixed-Case", "yes"]))
})

// CONNECT to a loopback port is a tunnel both ways, which a WebSocket through the proxy uses.
it("connect tunnel", async () => {
	const { server, port } = await upstream((_req, res) => res.end())
	server.on("upgrade", (_req, socket: Socket) => {
		socket.write("HTTP/1.1 101 Switching Protocols\r\nUpgrade: echo\r\nConnection: Upgrade\r\n\r\n")
		socket.on("data", (data) => socket.write(data))
	})
	const running = await proxy()
	const socket = connect(running.path)
	open.push({ close: () => void socket.destroy() })
	socket.write(`CONNECT 127.0.0.1:${port} HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\n\r\n`)
	const [established] = (await once(socket, "data")) as [Buffer]
	expect(String(established)).toMatch(/^HTTP\/1\.1 200 /)
	socket.write(`GET / HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: Upgrade\r\nUpgrade: echo\r\n\r\n`)
	const [switched] = (await once(socket, "data")) as [Buffer]
	expect(String(switched)).toMatch(/^HTTP\/1\.1 101 /)
	socket.write("ping")
	const [echoed] = (await once(socket, "data")) as [Buffer]
	expect(String(echoed)).toBe("ping")
})

// Only loopback, spelled 127.0.0.1, localhost, or [::1], on an unprivileged port (1024 and up): anything else is 403
// and opens no connection, a name that resolves elsewhere, a mapped or other address, port 0, and port 80 included.
it("refuses other targets", async () => {
	let reached = 0
	const { port } = await upstream((_req, res) => {
		reached += 1
		res.end()
	})
	const running = await proxy()
	const refused = [
		`http://example.com:${port}/`,
		`http://localhost.example.com:${port}/`,
		`http://10.0.0.1:${port}/`,
		`http://127.0.0.2:${port}/`,
		`http://[::ffff:10.0.0.1]:${port}/`,
		`http://[::ffff:127.0.0.1]:${port}/`,
		`http://[::2]:${port}/`,
		"http://127.0.0.1:0/",
		"http://127.0.0.1:80/",
		"http://localhost:1023/",
		"/relative",
	]
	const statuses = await Promise.all(refused.map(async (url) => (await via(running, url)).status))
	expect(statuses).toEqual(refused.map(() => 403))
	for (const target of ["example.com:443", "10.0.0.1:80", "127.0.0.1:0", "127.0.0.1:22", "[::ffff:10.0.0.1]:80"]) {
		const socket = connect(running.path)
		open.push({ close: () => void socket.destroy() })
		socket.write(`CONNECT ${target} HTTP/1.1\r\nHost: ${target}\r\n\r\n`)
		const [answer] = (await once(socket, "data")) as [Buffer]
		expect(String(answer), target).toMatch(/^HTTP\/1\.1 403 /)
	}
	expect(reached).toBe(0)
	expect((await via(running, `http://localhost:${port}/`)).status).toBe(200)
	expect(reached).toBe(1)
})

// It listens on its Unix socket and nowhere else: no TCP port, so nothing on loopback, the LAN, or a bridge reaches it.
it("listens only on its socket", async () => {
	const running = await proxy()
	expect(statSync(running.path).isSocket()).toBe(true)
	expect(running.address()).toBe(running.path)
})

// An idle client connection is closed after `idleMs`, and connections past `maxConnections` are refused, so a test that
// dies holding sockets leaks none for long.
it("caps idle and open connections", async () => {
	const running = await proxy({ idleMs: 100, maxConnections: 2 })
	const idle = connect(running.path)
	open.push({ close: () => void idle.destroy() })
	await once(idle, "connect")
	const second = connect(running.path)
	open.push({ close: () => void second.destroy() })
	await once(second, "connect")
	const third = connect(running.path)
	open.push({ close: () => void third.destroy() })
	await once(third, "close")
	await once(idle, "close")
})

// Inside Chromium's container, the relay turns a TCP port on its loopback, the proxy Chromium is given, into the
// proxy's socket: a request through it reaches the host's loopback server.
it("relay reaches the proxy", async () => {
	const { port } = await upstream((_req, res) => res.end("through"))
	const running = await proxy()
	const relay = await startRelay(0, running.path)
	open.push(relay)
	const answer = await new Promise<IncomingMessage>((resolve, reject) => {
		const sent = request({ host: "127.0.0.1", port: relay.port, path: `http://127.0.0.1:${port}/` }, resolve)
		sent.on("error", reject)
		sent.end()
	})
	let body = ""
	for await (const chunk of answer) body += String(chunk)
	expect([answer.statusCode, body]).toEqual([200, "through"])
})

// A streaming answer that never ends by itself: the request's socket reports when the client went away.
async function endless(): Promise<{ port: number; gone: Promise<void> }> {
	const left = Promise.withResolvers<void>()
	const { port } = await upstream((req, res) => {
		res.writeHead(200, { "content-type": "text/plain" })
		res.write("first;")
		const tick = setInterval(() => res.write("more;"), 20)
		req.socket.once("close", () => {
			clearInterval(tick)
			left.resolve()
		})
	})
	return { port, gone: left.promise }
}

// The upstream's close, or a timeout: a leave the proxy never passed on hangs, and fails here.
function within<T>(promise: Promise<T>, ms = 2000): Promise<T | "timed out"> {
	return Promise.race([promise, new Promise<"timed out">((resolve) => setTimeout(() => resolve("timed out"), ms))])
}

// A client that leaves mid-stream closes the upstream connection, so a server holding the stream sees it go and stops
// (docs-data `stream abort`). Through the proxy's socket and through the relay.
it("client leaving closes upstream", async () => {
	for (const via of ["socket", "relay"] as const) {
		const { port, gone } = await endless()
		const running = await proxy()
		const relay = via === "relay" ? await startRelay(0, running.path) : undefined
		if (relay !== undefined) open.push(relay)
		const target = relay === undefined ? { socketPath: running.path } : { host: "127.0.0.1", port: relay.port }
		const answer = await new Promise<IncomingMessage>((resolve) => {
			request({ ...target, path: `http://127.0.0.1:${port}/s` }, resolve).end()
		})
		await once(answer, "data")
		answer.destroy()
		expect(await within(gone), via).toBeUndefined()
	}
})

// A CONNECT tunnel's client leaving closes the upstream socket too.
it("tunnel client leaving closes upstream", async () => {
	const left = Promise.withResolvers<void>()
	const { server, port } = await upstream((_req, res) => res.end())
	server.on("connection", (socket: Socket) => socket.once("close", () => left.resolve()))
	const running = await proxy()
	const socket = connect(running.path)
	socket.write(`CONNECT 127.0.0.1:${port} HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\n\r\n`)
	await once(socket, "data")
	socket.destroy()
	expect(await within(left.promise)).toBeUndefined()
})

// An upstream that dies mid-stream ends the client's answer instead of leaving it open.
it("upstream dying closes client", async () => {
	const { port } = await upstream((_req, res) => {
		res.writeHead(200, { "content-type": "text/plain" })
		res.write("first;")
		setTimeout(() => res.socket?.destroy(), 50)
	})
	const running = await proxy()
	const answer = await new Promise<IncomingMessage>((resolve) => {
		request({ socketPath: running.path, path: `http://127.0.0.1:${port}/s` }, resolve).end()
	})
	answer.resume()
	// The client's answer errors as aborted, then closes.
	answer.on("error", () => undefined)
	expect(await within(new Promise<void>((resolve) => answer.on("close", () => resolve())))).toBeUndefined()
})
