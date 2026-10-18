import { createServer } from "node:http"
import { connect } from "node:net"
import { createComponent, Loading, onCleanup } from "solid-js"
import { QueryClientProvider } from "@tanstack/solid-query"
import { expect, it, vi } from "vitest"
import { useDeferred } from "../../shared/components/index.ts"
import { createPage } from "../../shared/route-builder/page.ts"
import { createRootLayout } from "../../shared/route-builder/root-layout.ts"
import { createRouter } from "../../shared/router/create-router.ts"
import { createQueryClientGetter } from "../../features/query/client/getter.ts"
import { createServer as createFlareServer, serveWith, type FlareServer } from "../../server/lifecycle/create.ts"
import { createNodeListener } from "./listener.ts"

type Ctx = { waitUntil: (promise: Promise<unknown>) => void }

function req(): { method: string; url: string; headers: Record<string, string> } {
	return { method: "GET", url: "/", headers: {} }
}

function settle(): Promise<void> {
	return new Promise((resolve) => {
		setTimeout(resolve, 0)
	})
}

function noop(): void {}

it("flush", async () => {
	const encoder = new TextEncoder()
	let pushSecond: () => void = noop
	const body = new ReadableStream<Uint8Array>({
		start(controller) {
			controller.enqueue(encoder.encode("one"))
			pushSecond = () => {
				controller.enqueue(encoder.encode("two"))
				controller.close()
			}
		},
	})
	const writes: string[] = []
	let ended = false
	const listener = createNodeListener({
		fetch: async () => new Response(body, { headers: { "x-test": "1" } }),
	})
	listener(req(), {
		writeHead() {},
		setHeader() {},
		write(chunk) {
			writes.push(new TextDecoder().decode(chunk))
			return true
		},
		end() {
			ended = true
		},
		once() {},
	})
	await settle()
	expect(writes).toEqual(["one"])
	pushSecond()
	await settle()
	expect(ended).toBe(true)
	expect(writes).toEqual(["one", "two"])
})

it("backpressure", async () => {
	const encoder = new TextEncoder()
	let pushSecond: () => void = noop
	const body = new ReadableStream<Uint8Array>({
		start(controller) {
			controller.enqueue(encoder.encode("one"))
			pushSecond = () => {
				controller.enqueue(encoder.encode("two"))
				controller.close()
			}
		},
	})
	const writes: string[] = []
	let drain: () => void = noop
	const listener = createNodeListener({ fetch: async () => new Response(body) })
	listener(req(), {
		writeHead() {},
		setHeader() {},
		write(chunk) {
			writes.push(new TextDecoder().decode(chunk))
			return false
		},
		end() {},
		once(_event, callback) {
			drain = callback
		},
	})
	await settle()
	expect(writes).toEqual(["one"])
	pushSecond()
	await settle()
	expect(writes).toEqual(["one"])
	drain()
	await settle()
	expect(writes).toEqual(["one", "two"])
})

it("post without a socket", async () => {
	for (const method of ["HEAD", "POST"]) {
		let ended = false
		const listener = createNodeListener({
			fetch: async () => new Response(null, { status: method === "POST" ? 405 : 200 }),
		})
		listener(
			{ method, url: "/page", headers: { "x-test": "1" } },
			{
				writeHead() {},
				setHeader() {},
				write() {
					return true
				},
				end() {
					ended = true
				},
				once() {},
			},
		)
		await settle()
		expect(ended).toBe(true)
	}
})

// Behind a proxy the app declares its hops: with `trustProxy: 1`, `X-Forwarded-Proto: https` makes the request the
// server sees https, so its origin and Strict-Transport-Security follow; with none it stays http. Another option, or a
// hop count that is not an integer from 0 to 5, throws (BUGS.md 109).
it("trust proxy", async () => {
	const about = createPage("_root_/").render(() => "home")
	const root = createRootLayout("_root_").render((props) => props.children)
	const router = createRouter({ layouts: { _root_: root }, routeTree: [{ id: "_root_/", path: "/", module: about }] })
	// A production server: dev sends no Strict-Transport-Security.
	const flare = serveWith({ router }, { dev: false, log: { level: "error", error: noop, warn: noop, log: noop } })
	const seen: string[] = []
	const server = {
		fetch: (request: Request, env: unknown, ctx: Ctx) => (seen.push(request.url), flare.fetch(request, env, ctx)),
	}
	const hsts: boolean[] = []
	const forwarded = { method: "GET", url: "/", headers: { host: "site.test", "x-forwarded-proto": "https" } }
	for (const listener of [createNodeListener(server, { trustProxy: 1 }), createNodeListener(server)]) {
		let found = false
		const ended = Promise.withResolvers<void>()
		listener(forwarded, {
			writeHead() {},
			setHeader(name) {
				if (name.toLowerCase() === "strict-transport-security") found = true
			},
			write: () => true,
			end: () => ended.resolve(),
			once() {},
		})
		await ended.promise
		hsts.push(found)
	}
	expect(seen).toEqual(["https://site.test/", "http://site.test/"])
	expect(hsts).toEqual([true, false])
	expect(() => createNodeListener(server, { trustProxy: 5 })).not.toThrow()
	for (const trustProxy of [-1, 1.5, 6]) {
		expect(() => createNodeListener(server, { trustProxy })).toThrow("trustProxy is an integer from 0 to 5")
	}
	// @ts-expect-error bodyLimit is a createServer option
	expect(() => createNodeListener(server, { bodyLimit: 1 })).toThrow("createNodeListener takes only trustProxy and env")
})

it("wait until", async () => {
	const background = new Promise<void>(() => undefined)
	const args: unknown[] = []
	let ended = false
	const listener = createNodeListener({
		fetch(request, env, ctx) {
			args.push(request, env, ctx)
			ctx.waitUntil(background)
			return new Response("ok")
		},
	})
	listener(req(), {
		writeHead() {},
		setHeader() {},
		write() {
			return true
		},
		end() {
			ended = true
		},
		once() {},
	})
	await settle()
	expect(args[0]).toBeInstanceOf(Request)
	expect(args[1]).toBe(process.env)
	expect(typeof (args[2] as Ctx).waitUntil).toBe("function")
	expect(ended).toBe(true)
})

// The env the server sees is the option's value, and `process.env` without one, so a loader's `env` is the app's on
// Node as on Workers (dx/adapters.md, BUGS.md 372).
it("env", async () => {
	const given = { REVALIDATE_SECRET: "given" }
	const seen: unknown[] = []
	const listener = createNodeListener(
		{
			fetch(_request, env) {
				seen.push(env)
				return new Response("ok")
			},
		},
		{ env: given },
	)
	listener(req(), { writeHead() {}, setHeader() {}, write: () => true, end() {}, once() {} })
	await settle()
	expect(seen).toEqual([given])
	expect(seen[0]).toBe(given)
})

it("set-cookie", async () => {
	const headers = new Headers()
	headers.append("set-cookie", "a=1")
	headers.append("set-cookie", "b=2")
	const cookies: Array<string | readonly string[]> = []
	const listener = createNodeListener({
		fetch: async () => new Response("ok", { headers }),
	})
	listener(req(), {
		writeHead() {},
		setHeader(name, value) {
			if (name.toLowerCase() === "set-cookie") cookies.push(value)
		},
		write() {
			return true
		},
		end() {},
		once() {},
	})
	await settle()
	expect(cookies.flat()).toEqual(["a=1", "b=2"])
})

// A response whose close event the test fires, finished or not.
function closable(finished: boolean): {
	res: Parameters<ReturnType<typeof createNodeListener>>[1]
	close: () => void
	ended: Promise<void>
} {
	const closers: (() => void)[] = []
	const ended = Promise.withResolvers<void>()
	const res = {
		writeHead: noop,
		setHeader: noop,
		write: () => true,
		end: () => ended.resolve(),
		once(event: "drain" | "close", callback: () => void) {
			if (event === "close") closers.push(callback)
		},
		get writableFinished() {
			return finished
		},
	}
	return { res, close: () => closers.forEach((callback) => callback()), ended: ended.promise }
}

function capture(): { listener: ReturnType<typeof createNodeListener>; seen: Request[] } {
	const seen: Request[] = []
	const listener = createNodeListener({
		fetch: (request) => {
			seen.push(request)
			return new Response("done")
		},
	})
	return { listener, seen }
}

it("finish keeps signal", async () => {
	const { listener, seen } = capture()
	const done = closable(true)
	listener(req(), done.res)
	await done.ended
	done.close()
	expect(seen[0].signal.aborted).toBe(false)
})

it("disconnect aborts", async () => {
	const { listener, seen } = capture()
	const gone = closable(false)
	listener(req(), gone.res)
	await gone.ended
	gone.close()
	expect(seen[0].signal.aborted).toBe(true)
})

// A method fetch's Request refuses to build is the 405 a page gives, with Allow, and the server is never asked
// (plan 21 13.6, BUGS.md 209).
it("refused method", async () => {
	const statuses: number[] = []
	const set: Record<string, string> = {}
	let asked = 0
	const listener = createNodeListener({
		fetch: () => {
			asked += 1
			return new Response("x")
		},
	})
	listener(
		{ ...req(), method: "trace", headers: { host: "localhost" } },
		{
			writeHead(status) {
				statuses.push(status)
			},
			setHeader(name: string, value: string | readonly string[]) {
				set[name] = String(value)
			},
			write: () => true,
			end() {},
			once() {},
		},
	)
	await settle()
	expect([statuses, set["allow"], asked]).toEqual([[405], "GET, HEAD, OPTIONS", 0])
})

// The request's origin is the one the adapter resolved from Host, so a browser's same-origin POST passes CSRF (B44).
it("host origin", async () => {
	const urls: string[] = []
	const listener = createNodeListener({
		fetch: async (request) => {
			urls.push(request.url)
			return new Response("ok")
		},
	})
	const res = { writeHead() {}, setHeader() {}, write: () => true, end() {}, once() {} }
	listener({ ...req(), url: "/a?b=1", headers: { host: "127.0.0.1:5173" } }, res)
	listener(req(), res)
	await settle()
	expect(urls).toEqual(["http://127.0.0.1:5173/a?b=1", "http://localhost/"])
})

// A real `node:http` server: the listener is its request handler as written, and a POST body is read through the
// `IncomingMessage` itself, whose `on` and `resume` need their receiver. A repeated header reaches the request.
it("node request", async () => {
	const http = createServer(
		createNodeListener({
			fetch: async (request) => new Response(`${request.headers.get("x-pair")} ${await request.text()}`),
		}),
	)
	await new Promise<void>((resolve) => http.listen(0, "127.0.0.1", resolve))
	const address = http.address()
	const port = typeof address === "object" && address !== null ? address.port : 0
	try {
		const headers: Array<[string, string]> = [
			["x-pair", "a"],
			["x-pair", "b"],
		]
		const response = await fetch(`http://127.0.0.1:${port}/echo`, { method: "POST", body: "ping", headers })
		expect(response.status).toBe(200)
		expect(await response.text()).toBe("a, b ping")
	} finally {
		await new Promise((resolve) => http.close(resolve))
	}
	// A bare request object: no method or url is `GET /`, a listed header is joined, and an absent one is dropped.
	const seen: Request[] = []
	const bare = createNodeListener({
		fetch: async (request) => {
			seen.push(request)
			return new Response(null)
		},
	})
	bare(
		{ headers: { "x-list": ["a", "b"], "x-gone": undefined } },
		{
			writeHead() {},
			setHeader() {},
			write: () => true,
			end() {},
			once() {},
		},
	)
	await settle()
	expect(seen[0]?.method).toBe("GET")
	expect(seen[0]?.url).toBe("http://localhost/")
	expect(seen[0]?.headers.get("x-list")).toBe("a, b")
	expect(seen[0]?.headers.has("x-gone")).toBe(false)
})

// A root under TanStack's provider, whose cleanup reads the client through the request-scoped getter, and a page
// whose `"stream"` defer never settles. Each client below leaves mid-response (BUGS.md B28). Under vitest the
// provider's own cleanup never runs, so the root's cleanup reads the client as the provider's does in an app build.
function streamingApp(): FlareServer {
	const getQueryClient = createQueryClientGetter()
	const root = createRootLayout("_root_").render((props) => {
		onCleanup(() => void getQueryClient())
		return createComponent(QueryClientProvider, {
			get client() {
				return getQueryClient()
			},
			get children() {
				return props.children
			},
		})
	})
	const page = createPage("_root_/")
		.loader(({ defer }) => ({ tip: defer(() => new Promise<string>(noop)) }))
		.render((props) =>
			createComponent(Loading, {
				fallback: "waiting",
				get children() {
					const tip = useDeferred(() => props.loaderData.tip)
					return [() => tip()]
				},
			}),
		)
	const router = createRouter({ layouts: { _root_: root }, routeTree: [{ id: "_root_/", path: "/", module: page }] })
	return createFlareServer({ router })
}

function drop(port: number, after: "headers" | "connect"): Promise<void> {
	return new Promise((resolve) => {
		const socket = connect(port, "127.0.0.1", () => {
			socket.write("GET / HTTP/1.1\r\nHost: 127.0.0.1\r\nAccept: text/html\r\n\r\n")
			if (after === "connect") socket.destroy()
		})
		socket.on("data", (chunk: Buffer) => {
			if (chunk.toString().includes("\r\n\r\n")) socket.destroy()
		})
		socket.on("close", () => resolve())
	})
}

it("disconnect mid-stream", async () => {
	const escaped: unknown[] = []
	const record = (error: unknown): void => void escaped.push(error)
	process.on("uncaughtException", record)
	process.on("unhandledRejection", record)
	const http = createServer(createNodeListener(streamingApp()))
	await new Promise<void>((resolve) => http.listen(0, "127.0.0.1", resolve))
	const address = http.address()
	const port = typeof address === "object" && address !== null ? address.port : 0
	try {
		for (let index = 0; index < 5; index += 1) await drop(port, "headers")
		await drop(port, "connect")
		await new Promise((resolve) => setTimeout(resolve, 50))
		const next = await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(2000) }).catch(
			(error: unknown) => error,
		)
		expect(next instanceof Response ? next.status : next).toBe(200)
		if (next instanceof Response) await next.body?.cancel()
		expect(escaped).toEqual([])
	} finally {
		process.off("uncaughtException", record)
		process.off("unhandledRejection", record)
		http.closeAllConnections()
		await new Promise((resolve) => http.close(resolve))
	}
})

// A drain waits for each request until its answer is sent and for its `waitUntil` work; an answer sent while the
// server drains closes its connection, so no client sends it another request (plan 21 16.11).
it("drain", async () => {
	const work = Promise.withResolvers<void>()
	const listener = createNodeListener({
		fetch(_request, _env, ctx: Ctx) {
			ctx.waitUntil(work.promise)
			return new Response("ok")
		},
	})
	const headers: Record<string, string> = {}
	const res = {
		writeHead: noop,
		setHeader: (name: string, value: string | readonly string[]) => void (headers[name] = String(value)),
		write: () => true,
		end: noop,
		once: noop,
	}
	listener(req(), res)
	await settle()
	expect(headers["connection"]).toBeUndefined()
	let drained: boolean | undefined
	void listener.drain({ timeout: "5s" }).then((value) => (drained = value))
	listener(req(), res)
	await settle()
	expect(headers["connection"]).toBe("close")
	expect(drained).toBeUndefined()
	work.resolve()
	await vi.waitFor(() => expect(drained).toBe(true))
})
