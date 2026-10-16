import { connect } from "node:net"
import { expect, it } from "vitest"
import { createServer } from "../../server/lifecycle/create.ts"
import { createServerFn } from "../../server/server-fn/dispatch.ts"
import { createRootLayout } from "../../shared/route-builder/root-layout.ts"
import { createRouter } from "../../shared/router/create-router.ts"
import { createBunFetch } from "./serve.ts"

// Bun's platform ceiling is its own default, 128 MiB, whatever the server's `bodyLimit`: Flare's capped reader answers
// a body over that limit with 413 first (BUGS.md 114). The fetch passes the request through.
it("ceiling", async () => {
	let seen = ""
	const built = createBunFetch({
		fetch(request) {
			seen = new URL(request.url).pathname
			return new Response("ok")
		},
	})
	expect(built.maxRequestBodySize).toBe(128 * 1024 * 1024)
	const response = await built.fetch(new Request("http://localhost/page"))
	expect(seen).toBe("/page")
	expect(await response.text()).toBe("ok")
})

// createServer checks the range dx/server.md gives and carries the limit on the server it returns; Bun's ceiling does
// not follow it (BUGS.md 110, 114).
it("server limit", () => {
	const root = createRootLayout("_root_").render((props) => props.children)
	const router = createRouter({ layouts: { _root_: root }, routeTree: [] })
	const server = createServer({ router, bodyLimit: 2048 })
	expect([server.bodyLimit, createBunFetch(server).maxRequestBodySize]).toEqual([2048, 128 * 1024 * 1024])
	expect(createServer({ router }).bodyLimit).toBe(1024 * 1024)
	expect(createServer({ router, bodyLimit: 32 * 1024 * 1024 }).bodyLimit).toBe(32 * 1024 * 1024)
	for (const bodyLimit of [0, 1.5, 32 * 1024 * 1024 + 1]) {
		expect(() => createServer({ router, bodyLimit })).toThrow("bodyLimit is an integer from 1 to 33554432 bytes")
	}
})

// Bun builds the URL from the Host header as sent, so one that is not a host is a 400 and never reaches the server; a
// host with a port goes through (BUGS.md 150).
it("hostile host", async () => {
	const seen: string[] = []
	const server = {
		fetch(request: Request) {
			seen.push(request.url)
			return new Response("ok")
		},
	}
	const bun = createBunFetch(server)
	const hostile = await bun.fetch(
		new Request("http://evil.example/admin?/a", { headers: { host: "evil.example/admin?" } }),
	)
	expect(hostile.status).toBe(400)
	const fine = await bun.fetch(new Request("http://site.test:8080/a", { headers: { host: "site.test:8080" } }))
	expect(fine.status).toBe(200)
	expect(seen).toEqual(["http://site.test:8080/a"])
})

// Behind a proxy the app declares its hops: with `trustProxy: 1`, `X-Forwarded-Proto: https` makes the request the
// server sees https, body and method kept; with none it stays http. The range is shared-url `hops` (BUGS.md 109).
it("trust proxy", async () => {
	const seen: string[] = []
	const server = {
		async fetch(request: Request) {
			seen.push(`${request.method} ${request.url} ${await request.text()}`)
			return new Response("ok")
		},
	}
	await createBunFetch(server, { trustProxy: 1 }).fetch(forwarded())
	await createBunFetch(server).fetch(forwarded())
	await createBunFetch(server, { trustProxy: 1 }).fetch(new Request("http://site.test/a"))
	expect(seen).toEqual(["POST https://site.test/a b", "POST http://site.test/a b", "GET http://site.test/a "])
	expect(() => createBunFetch(server, { trustProxy: 6 })).toThrow("trustProxy is an integer from 0 to 5")
})

function forwarded(): Request {
	return new Request("http://site.test/a", { method: "POST", body: "b", headers: { "x-forwarded-proto": "https" } })
}

// The Bun runtime, present under `test:bun` only: the case below needs a real `Bun.serve`.
const bun: unknown = Reflect.get(globalThis, "Bun")

// Bun cuts the connection on a body over its `maxRequestBodySize`, so a client reads EPIPE or ECONNRESET, not a status.
// Flare's own capped reader is the enforcement: behind a real Bun.serve, an 8 MiB server-function POST over a 64 KiB
// `bodyLimit`, plain and chunked, is answered 413 and the client reads it (BUGS.md 114).
it.runIf(bun !== undefined)(
	"bun oversized post",
	async () => {
		const fn = createServerFn(ref).handler(() => "ok")
		const root = createRootLayout("_root_").render((props) => props.children)
		const server = createServer({
			router: createRouter({ layouts: { _root_: root }, routeTree: [] }),
			serverFns: { [ref.__id]: async () => fn },
			bodyLimit: 64 * 1024,
		})
		const served: unknown = Reflect.apply(Reflect.get(Object(bun), "serve"), bun, [
			{ hostname: "127.0.0.1", port: 0, ...createBunFetch(server) },
		])
		const port = Number(Reflect.get(Object(served), "port"))
		try {
			const body = Buffer.alloc(8 * 1024 * 1024, 32)
			expect([await post(port, body, true), await post(port, body, false)]).toEqual([413, 413])
		} finally {
			await Reflect.apply(Reflect.get(Object(served), "stop"), served, [true])
		}
	},
	30_000,
)

const ref = { method: "post" as const, __id: "big-id", __name: "big" }

// A POST over a raw socket, kept alive as a browser's is: the status line once the whole body is written, or the socket
// error that cut the write. A client that fails its request on that error, as Node's http client and a browser's fetch
// do, never sees a status the server sent before closing. Bun's own `node:http` client is no witness: it reads Bun's
// early answer whatever happened to its write.
function post(port: number, body: Buffer, sized: boolean): Promise<number | string> {
	return new Promise((resolve) => {
		const socket = connect(port, "127.0.0.1")
		let text = ""
		let written = false
		const settle = (): void => {
			const status = /^HTTP\/1\.1 (\d{3})/.exec(text)?.[1]
			if (!written || status === undefined) return
			resolve(Number(status))
			socket.destroy()
		}
		socket.on("data", (chunk: Buffer) => {
			text += chunk.toString("latin1")
			settle()
		})
		socket.on("error", (error: NodeJS.ErrnoException) => resolve(error.code ?? error.message))
		socket.on("close", () => resolve(text === "" ? "closed" : text.slice(0, 12)))
		const framing = sized ? `content-length: ${body.length}` : "transfer-encoding: chunked"
		const head = [
			`POST /_flare/fn/${ref.__id} HTTP/1.1`,
			`host: 127.0.0.1:${port}`,
			`origin: http://127.0.0.1:${port}`,
			"content-type: application/json",
			framing,
		]
		const payload = sized
			? body
			: Buffer.concat([Buffer.from(`${body.length.toString(16)}\r\n`), body, Buffer.from("\r\n0\r\n\r\n")])
		socket.write(Buffer.concat([Buffer.from(`${head.join("\r\n")}\r\n\r\n`), payload]), () => {
			written = true
			settle()
		})
	})
}
