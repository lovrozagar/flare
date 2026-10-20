import { connect } from "node:net"
import { expect, it, vi } from "vitest"
import { createServer } from "../../server/lifecycle/create.ts"
import { finalize, keptAs } from "../../server/lifecycle/finalize.ts"
import { createServerFn } from "../../server/server-fn/dispatch.ts"
import { createRootLayout } from "../../shared/route-builder/root-layout.ts"
import { createRouter } from "../../shared/router/create-router.ts"
import { invalidWrites } from "../../server/render/writes.fixture.ts"
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

// The env the server sees is the option's value, and `process.env` without one, so a loader's `env` is the app's on
// Bun as on Workers; the options hold nothing else (dx/adapters.md, BUGS.md 372).
it("env", async () => {
	const seen: unknown[] = []
	const server = {
		fetch(_request: Request, env: unknown) {
			seen.push(env)
			return new Response("ok")
		},
	}
	const given = { REVALIDATE_SECRET: "given" }
	await createBunFetch(server).fetch(new Request("http://localhost/"))
	await createBunFetch(server, { env: given }).fetch(new Request("http://localhost/"))
	expect(seen[0]).toBe(process.env)
	expect(seen[1]).toBe(given)
	// @ts-expect-error bodyLimit is a createServer option
	expect(() => createBunFetch(server, { bodyLimit: 1 })).toThrow(
		"createBunFetch takes only trustProxy, idleTimeout, and env",
	)
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
	// Like every answer, it names its build and carries the default security set (BUGS.md 341).
	expect([hostile.headers.get("flare-build"), hostile.headers.get("x-content-type-options")]).toEqual([
		"dev",
		"nosniff",
	])
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

// The timeouts Bun.serve's server sets per request, recorded.
function timeouts(): { calls: number[]; timeout: (request: Request, seconds: number) => void } {
	const calls: number[] = []
	return { calls, timeout: (_, seconds) => void calls.push(seconds) }
}

function body(): ReadableStream<Uint8Array> {
	return new Response("streamed").body ?? new ReadableStream()
}

// A streamed body may go quiet longer than `idleTimeout`: the timeout, Bun's 255 s while the handler runs (BUGS.md 424),
// is lifted while the body is sent and set back to `idleTimeout` once it ends, so an idle keep-alive socket still
// closes. A call with no Bun server touches nothing. `idleTimeout` is Bun's 10 s by default and goes to Bun.serve with
// the fetch (plan 21 8.3, BUGS.md 198).
it("idle timeout", async () => {
	const streamed = createBunFetch({ fetch: () => finalize({ status: 200, body: body() }) }, { idleTimeout: 30 })
	expect(streamed.idleTimeout).toBe(30)
	const bun = timeouts()
	const response = await streamed.fetch(new Request("http://localhost/"), bun)
	expect(bun.calls).toEqual([255, 0])
	expect([response.status, await response.text()]).toEqual([200, "streamed"])
	expect(bun.calls).toEqual([255, 0, 30])
	// A body that is not a stream keeps the timeout: `blob body` pins it, through Bun's inspector or its stand-in.
	expect(createBunFetch({ fetch: () => finalize({ status: 200, body: "whole" }) }).idleTimeout).toBe(10)
	expect(await (await streamed.fetch(new Request("http://localhost/"))).text()).toBe("streamed")
	const server = { fetch: () => new Response("") }
	for (const idleTimeout of [-1, 1.5, 256]) {
		expect(() => createBunFetch(server, { idleTimeout })).toThrow(IDLE_RANGE)
	}
})

const IDLE_RANGE = "idleTimeout is 0 (no timeout) or a whole number of seconds from 5 to 255"

// Bun counts `idleTimeout` in 4-second ticks from a sweep that runs while any socket is open, so 1 to 4 is one tick:
// the next sweep, which can come as soon as a fresh request starts, cuts it. Those values are refused; 0 and 5 are
// not (BUGS.md 423).
it("idle tick", () => {
	const server = { fetch: () => new Response("") }
	for (const idleTimeout of [1, 2, 3, 4]) {
		expect(() => createBunFetch(server, { idleTimeout })).toThrow(`${IDLE_RANGE}: Bun counts it in 4-second ticks`)
	}
	expect([0, 5].map((idleTimeout) => createBunFetch(server, { idleTimeout }).idleTimeout)).toEqual([0, 5])
})

// A drain waits for each answer until its streamed body ends, fails, or is cancelled, and for the `waitUntil` work the
// server handed over; a fetch that rejects is no longer in flight, and a rejected `waitUntil` is logged (plan 21 16.11).
it("drain", async () => {
	const logged = vi.spyOn(console, "error").mockImplementation(() => undefined)
	const work = Promise.withResolvers<void>()
	const failing = new ReadableStream<Uint8Array>({ pull: (controller) => controller.error(new Error("cut")) })
	const bodies = [body(), body(), failing]
	const fetcher = createBunFetch({
		fetch(request, _env, ctx) {
			if (request.url.endsWith("/throw")) throw new Error("down")
			ctx.waitUntil(work.promise)
			ctx.waitUntil(Promise.reject(new Error("refresh failed")))
			return finalize({ status: 200, body: bodies.shift() ?? null })
		},
	})
	const read = await fetcher.fetch(new Request("http://localhost/"))
	const cancelled = await fetcher.fetch(new Request("http://localhost/"))
	const broken = await fetcher.fetch(new Request("http://localhost/"))
	await expect(fetcher.fetch(new Request("http://localhost/throw"))).rejects.toThrow("down")
	let drained: boolean | undefined
	void fetcher.drain({ timeout: "5s" }).then((value) => (drained = value))
	expect(await read.text()).toBe("streamed")
	await cancelled.body?.cancel()
	await expect(broken.text()).rejects.toThrow("cut")
	await new Promise((resolve) => setTimeout(resolve, 10))
	expect(drained).toBeUndefined()
	work.resolve()
	await vi.waitFor(() => expect(drained).toBe(true))
	expect(logged).toHaveBeenCalledWith("[flare:bun]", "waitUntil rejected", new Error("refresh failed"))
	logged.mockRestore()
})

// Under Bun a string or bytes body is a Blob its inspector shows: it is sent as it is, its type Bun's own, and the idle
// timeout goes back to `idleTimeout` from the handler's 255 s (plan 21 12.7, BUGS.md 424).
it("blob body", async () => {
	// Under Node a stand-in inspector; under Bun, Bun's own.
	const inspect = vi.fn<(value: unknown) => string>(() => "Response (4 bytes) {\n  Blob (4 bytes)\n}")
	const stubbed = Reflect.get(globalThis, "Bun") === undefined
	if (stubbed) vi.stubGlobal("Bun", { inspect })
	try {
		const own = new Response("down")
		const fetcher = createBunFetch({ fetch: () => keptAs(own, finalize({ status: 200, body: null })) ?? own })
		const bun = timeouts()
		expect(await fetcher.fetch(new Request("http://localhost/"), bun)).toBe(own)
		expect(bun.calls).toEqual([255, 10])
		expect(inspect.mock.calls).toEqual(stubbed ? [[own]] : [])
	} finally {
		vi.unstubAllGlobals()
	}
})

// A kept Response with no body, a middleware's 204 or a page's `new Response(null)`, is sent as it is: there is nothing
// to watch, so the timeout goes back to `idleTimeout` and the request is not left in flight (BUGS.md 238, 424).
it("kept empty body", async () => {
	const own = new Response(null, { status: 204 })
	const fetcher = createBunFetch({ fetch: () => keptAs(own, finalize({ status: 204, body: null })) ?? own })
	const bun = timeouts()
	const response = await fetcher.fetch(new Request("http://localhost/"), bun)
	expect([response.status, response.body, bun.calls]).toEqual([204, null, [255, 10]])
})

// Bun counts a handler that has not answered yet as idle, so a render slower than `idleTimeout` before its first byte
// was cut: the handler runs under Bun's longest timeout, 255 s, which still bounds one that hangs, and an answer that
// rejects sets `idleTimeout` back (BUGS.md 424).
it("slow first byte", async () => {
	const answer = Promise.withResolvers<Response>()
	const bun = timeouts()
	const pending = createBunFetch({ fetch: () => answer.promise }, { idleTimeout: 30 }).fetch(
		new Request("http://localhost/"),
		bun,
	)
	await Promise.resolve()
	expect(bun.calls).toEqual([255])
	answer.reject(new Error("render failed"))
	await expect(pending).rejects.toThrow("render failed")
	expect(bun.calls).toEqual([255, 30])
	// `idleTimeout: 0` is no timeout, and the handler keeps it: no 255 s bound the app did not ask for.
	const unbounded = timeouts()
	await createBunFetch({ fetch: () => new Response(null, { status: 204 }) }, { idleTimeout: 0 }).fetch(
		new Request("http://localhost/"),
		unbounded,
	)
	expect(unbounded.calls).toEqual([0, 0])
})

// A client that cancels while the answer's body waits on the app ends it once, with no write into the cancelled
// stream when the app's chunk lands (BUGS.md 304).
it("cancel during a pull", async () => {
	const gate = Promise.withResolvers<undefined>()
	// The app's own body honors its cancel, so the only write the case can see is the adapter's.
	const state = { open: true }
	const app = new ReadableStream<Uint8Array>({
		async pull(controller) {
			await gate.promise
			if (state.open) controller.enqueue(new TextEncoder().encode("late"))
		},
		cancel: () => void (state.open = false),
	})
	const fetcher = createBunFetch({ fetch: () => finalize({ status: 200, body: app }) })
	const writes = await invalidWrites(async () => {
		const answer = await fetcher.fetch(new Request("http://localhost/"))
		const reader = answer.body?.getReader()
		const next = reader?.read()
		await new Promise((resolve) => setTimeout(resolve, 0))
		await reader?.cancel()
		gate.resolve(undefined)
		expect(await next).toEqual({ done: true, value: undefined })
	})
	expect([writes, await fetcher.drain({ timeout: "1s" })]).toEqual([[], true])
})

// A streamed answer that sends its first line and then fails keeps that line behind a real Bun.serve, which drops a
// chunk it has not sent when the body errors in the same turn; the message never ends with its last chunk. That holds
// for any stream body, marked by this copy of Flare or not (BUGS.md 382).
it.runIf(bun !== undefined)("bun cut keeps sent", async () => {
	let sent = false
	const body = new ReadableStream<Uint8Array>({
		pull(controller) {
			if (sent) return controller.error(new Error("the source broke"))
			sent = true
			controller.enqueue(new TextEncoder().encode("first line\n"))
		},
	})
	// A raw stream Response, as a `.response()` route or a server bundle with its own copy of Flare hands over: the
	// adapter cannot tell it from one it marked, so it watches every stream body.
	const failing = { fetch: () => new Response(body, { headers: { "content-type": "application/x-ndjson" } }) }
	const served: unknown = Reflect.apply(Reflect.get(Object(bun), "serve"), bun, [
		{ hostname: "127.0.0.1", port: 0, ...createBunFetch(failing) },
	])
	try {
		const text = await new Promise<string>((resolve) => {
			let received = ""
			const socket = connect(Number(Reflect.get(Object(served), "port")), "127.0.0.1", () =>
				socket.write("GET / HTTP/1.1\r\nhost: site.test\r\n\r\n"),
			)
			socket.on("data", (chunk: Buffer) => void (received += chunk.toString("latin1")))
			socket.on("error", () => resolve(received))
			socket.on("close", () => resolve(received))
		})
		expect([text.includes("first line\n"), text.endsWith("\r\n0\r\n\r\n")]).toEqual([true, false])
	} finally {
		await Reflect.apply(Reflect.get(Object(served), "stop"), served, [true])
	}
})

// Behind a real Bun.serve at `idleTimeout` 5, which cuts a socket idle for 4 to 8 s, a handler that answers after 12 s
// is answered, not reset (BUGS.md 424).
it.runIf(bun !== undefined)(
	"bun slow first byte",
	async () => {
		const slow = {
			fetch: () => new Promise<Response>((resolve) => setTimeout(() => resolve(new Response("late")), 12_000)),
		}
		const served: unknown = Reflect.apply(Reflect.get(Object(bun), "serve"), bun, [
			{ hostname: "127.0.0.1", port: 0, ...createBunFetch(slow, { idleTimeout: 5 }) },
		])
		try {
			const response = await fetch(`http://127.0.0.1:${Number(Reflect.get(Object(served), "port"))}/`)
			expect([response.status, await response.text()]).toEqual([200, "late"])
		} finally {
			await Reflect.apply(Reflect.get(Object(served), "stop"), served, [true])
		}
	},
	90_000,
)

// Behind a real Bun.serve, a Host shaped like a host that is no URL authority is the adapter's 400, and an answer that
// throws is Flare's plain 500 with its build and the default security set, logged once, whatever NODE_ENV is: Bun's
// development error page, with the cwd, paths, stack, and source, never answers (BUGS.md 384).
it.runIf(bun !== undefined)("bun unparseable host and throw", async () => {
	const logged = vi.spyOn(console, "error").mockImplementation(() => undefined)
	const throwing = {
		fetch(request: Request): Response {
			throw new Error(`the app broke at ${new URL(request.url).pathname}`)
		},
	}
	const served: unknown = Reflect.apply(Reflect.get(Object(bun), "serve"), bun, [
		{ hostname: "127.0.0.1", port: 0, ...createBunFetch(throwing) },
	])
	const port = Number(Reflect.get(Object(served), "port"))
	const raw = (host: string): Promise<string> =>
		new Promise((resolve) => {
			let text = ""
			const socket = connect(port, "127.0.0.1", () =>
				socket.write(`GET /where HTTP/1.1\r\nhost: ${host}\r\nconnection: close\r\n\r\n`),
			)
			socket.on("data", (chunk: Buffer) => void (text += chunk.toString("latin1")))
			socket.on("error", () => resolve(text))
			socket.on("close", () => resolve(text))
		})
	try {
		for (const host of ["a:99999", "a:65536", "[1.2.3]", "[1:2]", "999.1.1.1", "1.2.3.256"]) {
			expect([host, (await raw(host)).split("\r\n")[0]]).toEqual([host, "HTTP/1.1 400 Bad Request"])
		}
		const text = await raw(`127.0.0.1:${port}`)
		const [head = "", body = ""] = text.split("\r\n\r\n")
		expect([
			head.split("\r\n")[0],
			/^flare-build:/im.test(head),
			/^x-content-type-options: nosniff/im.test(head),
		]).toEqual(["HTTP/1.1 500 Internal Server Error", true, true])
		for (const leak of [process.cwd(), "the app broke", "at ", ".ts"]) {
			expect([leak, body.includes(leak)]).toEqual([leak, false])
		}
		expect(logged).toHaveBeenCalledTimes(1)
	} finally {
		logged.mockRestore()
		await Reflect.apply(Reflect.get(Object(served), "stop"), served, [true])
	}
})

// Bun hands a throw to `error`: Flare's plain 500, with its build and the default security set, logged once, never
// Bun's development page. Bun calls it only on a throw, so a real Bun.serve case pins the path and this one the
// answer (BUGS.md 384).
it("error answer", async () => {
	const logged = vi.spyOn(console, "error").mockImplementation(() => undefined)
	const answer = createBunFetch({ fetch: () => new Response("") }).error(new Error("the app broke"))
	expect([answer.status, answer.headers.get("x-content-type-options"), await answer.text()]).toEqual([
		500,
		"nosniff",
		"",
	])
	expect(logged).toHaveBeenCalledTimes(1)
	logged.mockRestore()
})
