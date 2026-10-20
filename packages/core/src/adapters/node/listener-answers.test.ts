import { createServer as createHttpServer } from "node:http"
import { connect } from "node:net"
import { expect, it, vi } from "vitest"
import { finalize } from "../../server/lifecycle/finalize.ts"
import { adaptedOf, createNodeListener, CUT_MS } from "./listener.ts"

// The answers the Node listener gives itself, which never reach the server: a 400 for a request it cannot route, the
// 500 of a failure before the headers, and the cut of one after them. Split from listener.test.ts at its 500-line
// limit.

function req(): { method: string; url: string; headers: Record<string, string> } {
	return { method: "GET", url: "/", headers: {} }
}

function settle(): Promise<void> {
	return new Promise((resolve) => {
		setTimeout(resolve, 0)
	})
}

// A failure before the headers is a 500 with no body, and it is logged (plan 21 13.6); like every answer it names its
// build and carries the default security set (BUGS.md 341).
it("fetch throws", async () => {
	const logged = vi.spyOn(console, "error").mockImplementation(() => undefined)
	const statuses: number[] = []
	const named: string[] = []
	let ended = false
	const listener = createNodeListener({
		fetch: () => Promise.reject(new Error("server broke")),
	})
	listener(req(), {
		writeHead(status) {
			statuses.push(status)
		},
		setHeader(name) {
			named.push(name.toLowerCase())
		},
		write: () => true,
		end() {
			ended = true
		},
		once() {},
	})
	await settle()
	expect(statuses).toEqual([500])
	expect(named).toEqual(expect.arrayContaining(["flare-build", "x-content-type-options", "content-security-policy"]))
	expect(ended).toBe(true)
	expect(logged).toHaveBeenCalledExactlyOnceWith("[flare:node]", "the request failed", expect.any(Error))
	logged.mockRestore()
})

// A failure after the headers waits for what is still buffered to leave, then destroys the socket with no last chunk,
// so the client keeps what was written (BUGS.md 382).
it("cut after drain", async () => {
	const logged = vi.spyOn(console, "error").mockImplementation(() => undefined)
	const events: string[] = []
	const drain = { now: (): void => undefined }
	const body = new ReadableStream<Uint8Array>({
		start(controller) {
			controller.enqueue(new Uint8Array([1]))
		},
		pull(controller) {
			controller.error(new Error("the source broke"))
		},
	})
	const listener = createNodeListener({ fetch: () => new Response(body) })
	listener(req(), {
		writeHead: () => undefined,
		setHeader: () => undefined,
		write: () => true,
		end: () => events.push("end"),
		once(event, callback) {
			if (event === "drain") drain.now = callback
		},
		writableLength: 1,
		destroy: () => events.push("destroy"),
	})
	await new Promise((resolve) => setTimeout(resolve, 10))
	expect(events).toEqual([])
	drain.now()
	expect(events).toEqual(["destroy"])
	logged.mockRestore()
})

// A client that stops reading never drains what is buffered, so the cut destroys the socket at its deadline instead of
// holding it and its bytes for good (BUGS.md 382).
it("cut deadline", async () => {
	vi.useFakeTimers()
	const logged = vi.spyOn(console, "error").mockImplementation(() => undefined)
	const events: string[] = []
	const body = new ReadableStream<Uint8Array>({
		start(controller) {
			controller.enqueue(new Uint8Array([1]))
		},
		pull(controller) {
			controller.error(new Error("the source broke"))
		},
	})
	try {
		const listener = createNodeListener({ fetch: () => new Response(body) })
		listener(req(), {
			writeHead: () => undefined,
			setHeader: () => undefined,
			write: () => true,
			end: () => events.push("end"),
			once: () => undefined,
			writableLength: 1,
			destroy: () => events.push("destroy"),
		})
		await vi.advanceTimersByTimeAsync(CUT_MS - 1)
		expect(events).toEqual([])
		await vi.advanceTimersByTimeAsync(1)
		expect(events).toEqual(["destroy"])
	} finally {
		logged.mockRestore()
		vi.useRealTimers()
	}
})

// A target or Host the listener cannot route is its own 400, never the server's, and like every answer it names its
// build and carries the default security set (BUGS.md 341).
it("bad target", async () => {
	const seen: Request[] = []
	const listener = createNodeListener({
		fetch: (request) => {
			seen.push(request)
			return new Response("done")
		},
	})
	const answers: { status: number; named: string[] }[] = []
	for (const asked of [{ url: "//evil" }, { headers: { host: "a?b" } }]) {
		const answer = { status: 0, named: [] as string[] }
		let ended = false
		listener(
			{ ...req(), ...asked },
			{
				writeHead(status) {
					answer.status = status
				},
				setHeader(name) {
					answer.named.push(name.toLowerCase())
				},
				write: () => true,
				end() {
					ended = true
				},
				once() {},
			},
		)
		await settle()
		expect(ended).toBe(true)
		answers.push(answer)
	}
	expect(seen).toEqual([])
	for (const answer of answers) {
		expect(answer.status).toBe(400)
		expect(answer.named).toEqual(expect.arrayContaining(["flare-build", "x-content-type-options"]))
	}
})

// The listener hands the socket's address on, so `trustProxy` of 0, or fewer forwarded entries than it trusts, reads
// the socket and never a client's claim (dx/server.md Client address, BUGS.md 342).
it("socket address", () => {
	const at = (headers: Record<string, string>, trustProxy: number) =>
		adaptedOf(
			{ ...req(), headers: { host: "site.test", ...headers }, socket: { remoteAddress: "10.0.0.9" } },
			trustProxy,
		)
	expect(at({ "x-forwarded-for": "1.1.1.1" }, 0).clientIp).toBe("10.0.0.9")
	expect(at({ "x-forwarded-for": "1.1.1.1" }, 2).clientIp).toBe("10.0.0.9")
	expect(at({ "x-forwarded-for": "1.1.1.1, 2.2.2.2" }, 1).clientIp).toBe("2.2.2.2")
	expect(adaptedOf({ ...req(), headers: { host: "site.test" } }, 0).clientIp).toBe("")
})

// A streamed answer, finalized as Flare's own are, that sends its first line and then fails.
function failingAnswer(): Response {
	let sent = false
	const body = new ReadableStream<Uint8Array>({
		pull(controller) {
			if (sent) return controller.error(new Error("the source broke"))
			sent = true
			controller.enqueue(new TextEncoder().encode("first line\n"))
		},
	})
	return finalize({ status: 200, body, url: "http://localhost/" })
}

// The raw bytes of one GET, until the socket closes.
function rawGet(port: number, host = "site.test"): Promise<string> {
	return new Promise((resolve) => {
		let text = ""
		const socket = connect(port, "127.0.0.1", () =>
			socket.write(`GET / HTTP/1.1\r\nhost: ${host}\r\nconnection: close\r\n\r\n`),
		)
		socket.on("data", (chunk: Buffer) => void (text += chunk.toString("latin1")))
		socket.on("close", () => resolve(text))
	})
}

// Such a body is cut short through a real socket: the bytes written before the failure reach the client, and the
// message never ends with its last chunk, so no cache keeps it and the client reads a cut stream with the values that
// arrived (B140, BUGS.md 382).
it("node cut keeps sent", async () => {
	const logged = vi.spyOn(console, "error").mockImplementation(() => undefined)
	const server = createHttpServer(createNodeListener({ fetch: failingAnswer }))
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
	try {
		const address = server.address()
		const text = await rawGet(typeof address === "object" && address !== null ? address.port : 0)
		expect(text.startsWith("HTTP/1.1 200 OK")).toBe(true)
		expect(text.includes("first line\n")).toBe(true)
		expect(text.endsWith("\r\n0\r\n\r\n")).toBe(false)
		expect(logged).toHaveBeenCalledTimes(1)
	} finally {
		logged.mockRestore()
		await new Promise((resolve) => server.close(resolve))
	}
})

// Hosts shaped like a host that are no URL authority: a port past 65535, a bracket that is no IPv6 address, an IPv4
// address with an octet past 255 (BUGS.md 384).
const UNPARSEABLE_HOSTS = ["a:99999", "a:65536", "[1.2.3]", "[1:2]", "999.1.1.1", "1.2.3.256"]

function brokenAnswer(): Response {
	throw new Error("the app broke")
}

// Through a real socket, such a Host is the listener's 400, never a throw in the server. An answer that throws is the
// listener's own 500 with no body, whatever NODE_ENV says, logged once (BUGS.md 384).
it("node unparseable host and throw", async () => {
	const logged = vi.spyOn(console, "error").mockImplementation(() => undefined)
	const server = createHttpServer(createNodeListener({ fetch: brokenAnswer }))
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
	try {
		const address = server.address()
		const port = typeof address === "object" && address !== null ? address.port : 0
		for (const host of UNPARSEABLE_HOSTS) {
			expect([host, (await rawGet(port, host)).split("\r\n")[0]]).toEqual([host, "HTTP/1.1 400 Bad Request"])
		}
		for (const mode of ["development", "production"]) {
			vi.stubEnv("NODE_ENV", mode)
			const text = await rawGet(port)
			const [head = "", body = ""] = text.split("\r\n\r\n")
			// An empty body, chunked (its last chunk alone) or not.
			const empty = body === "" || body === "0"
			expect([mode, head.split("\r\n")[0], /^flare-build:/im.test(head), empty]).toEqual([
				mode,
				"HTTP/1.1 500 Internal Server Error",
				true,
				true,
			])
		}
		expect(logged).toHaveBeenCalledTimes(2)
	} finally {
		vi.unstubAllEnvs()
		logged.mockRestore()
		await new Promise((resolve) => server.close(resolve))
	}
})
