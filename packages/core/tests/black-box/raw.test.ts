import { once } from "node:events"
import { createServer } from "node:net"
import { expect, it } from "vitest"
import { header, raw } from "./raw.ts"

// A server that answers every connection with `reply` and closes, or with `open`, keeps the socket open after it, as
// miniflare does whatever the request's Connection header says.
async function server(reply: string, open = false): Promise<{ origin: string; close: () => void }> {
	const sockets = new Set<import("node:net").Socket>()
	const listening = createServer((socket) => {
		sockets.add(socket)
		if (open) socket.write(reply)
		else socket.end(reply)
	})
	listening.listen(0, "127.0.0.1")
	await once(listening, "listening")
	const address = listening.address()
	const port = typeof address === "object" && address !== null ? address.port : 0
	return {
		origin: `http://127.0.0.1:${port}`,
		close: () => {
			for (const socket of sockets) socket.destroy()
			listening.close()
		},
	}
}

// The whole answer, as sent: status, head, and body read until the server closes.
it("whole answer", async () => {
	const served = await server("HTTP/1.1 418 Teapot\r\nContent-Type: text/plain\r\nX-A: 1\r\n\r\nshort and stout")
	try {
		const answer = await raw(served.origin, "GET / HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n")
		expect(answer).toEqual({
			status: 418,
			head: "HTTP/1.1 418 Teapot\r\nContent-Type: text/plain\r\nX-A: 1",
			body: "short and stout",
		})
		expect([header(answer.head, "content-type"), header(answer.head, "x-a"), header(answer.head, "vary")]).toEqual([
			"text/plain",
			"1",
			undefined,
		])
	} finally {
		served.close()
	}
})

// Only the test's own servers, on loopback: anything else is the harness's mistake, refused before a socket opens.
it("loopback only", async () => {
	await expect(raw("http://10.0.0.1:80", "GET / HTTP/1.1\r\n\r\n")).rejects.toThrow(
		"the black-box suites ask loopback only, not 10.0.0.1",
	)
})

// A server that closes without a head is no answer.
it("no answer", async () => {
	const served = await server("")
	try {
		await expect(raw(served.origin, "GET / HTTP/1.1\r\nHost: x\r\n\r\n")).rejects.toThrow(
			"closed with no answer to GET /",
		)
	} finally {
		served.close()
	}
})

// An answer framed by Content-Length or chunked encoding, or one with no body (HEAD, 204, 304), ends where its framing
// says, though the server keeps the socket open; a chunked body is decoded, so chunk sizes, which differ by runtime,
// are not the body.
it("framed answers", async () => {
	const cases: Array<[string, string, string]> = [
		["GET", "HTTP/1.1 200 OK\r\nContent-Length: 5\r\n\r\nhello", "hello"],
		["GET", "HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n3\r\nhel\r\n2\r\nlo\r\n0\r\n\r\n", "hello"],
		["HEAD", "HTTP/1.1 200 OK\r\nContent-Length: 99\r\n\r\n", ""],
		["GET", "HTTP/1.1 204 No Content\r\n\r\n", ""],
	]
	for (const [method, reply, body] of cases) {
		const served = await server(reply, true)
		try {
			const answer = await raw(served.origin, `${method} / HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n`)
			expect(answer.body).toBe(body)
		} finally {
			served.close()
		}
	}
})
