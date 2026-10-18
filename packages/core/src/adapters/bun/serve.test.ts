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

// A streamed body may go quiet longer than `idleTimeout`: the timeout is lifted while it is sent and set back to
// `idleTimeout` once it ends, so an idle keep-alive socket still closes. A body that is not a stream keeps the timeout,
// and so does a call with no Bun server. `idleTimeout` is Bun's 10 s by default and goes to Bun.serve with the fetch;
// it is an integer from 0 to 255, as Bun takes it (plan 21 8.3, BUGS.md 198).
it("idle timeout", async () => {
	const streamed = createBunFetch({ fetch: () => finalize({ status: 200, body: body() }) }, { idleTimeout: 30 })
	expect(streamed.idleTimeout).toBe(30)
	const bun = timeouts()
	const response = await streamed.fetch(new Request("http://localhost/"), bun)
	expect(bun.calls).toEqual([0])
	expect([response.status, await response.text()]).toEqual([200, "streamed"])
	expect(bun.calls).toEqual([0, 30])
	const plain = timeouts()
	const whole = createBunFetch({ fetch: () => finalize({ status: 200, body: "whole" }) })
	expect(whole.idleTimeout).toBe(10)
	expect(await (await whole.fetch(new Request("http://localhost/"), plain)).text()).toBe("whole")
	expect(plain.calls).toEqual([])
	expect(await (await streamed.fetch(new Request("http://localhost/"))).text()).toBe("streamed")
	const server = { fetch: () => new Response("") }
	for (const idleTimeout of [-1, 1.5, 256]) {
		expect(() => createBunFetch(server, { idleTimeout })).toThrow("idleTimeout is an integer from 0 to 255 seconds")
	}
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
// timeout is never touched, though the answer counts as streaming (plan 21 12.7).
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
		expect(bun.calls).toEqual([])
		expect(inspect.mock.calls).toEqual(stubbed ? [[own]] : [])
	} finally {
		vi.unstubAllGlobals()
	}
})

// A kept Response with no body, a middleware's 204 or a page's `new Response(null)`, is sent as it is: there is nothing
// to watch, so the timeout is never lifted and the request is not left in flight (BUGS.md 238).
it("kept empty body", async () => {
	const own = new Response(null, { status: 204 })
	const fetcher = createBunFetch({ fetch: () => keptAs(own, finalize({ status: 204, body: null })) ?? own })
	const bun = timeouts()
	const response = await fetcher.fetch(new Request("http://localhost/"), bun)
	expect([response.status, response.body, bun.calls]).toEqual([204, null, []])
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
