import { createServer as createHttpServer, request as httpRequest, type Server } from "node:http"
import { connect } from "node:net"
import { afterEach, expect, it, vi } from "vitest"
import { createBunFetch } from "../../src/adapters/bun/serve.ts"
import { createNodeListener } from "../../src/adapters/node/listener.ts"
import { createServer } from "../../src/server/lifecycle/create.ts"
import { createPage } from "../../src/shared/route-builder/page.ts"
import { createRootLayout } from "../../src/shared/route-builder/root-layout.ts"
import { createRouter } from "../../src/shared/router/create-router.ts"

// The Node and Bun adapters over real HTTP (B96, dx/adapters.md): the real `createServer` behind
// `createNodeListener` on `node:http`, and behind `createBunFetch` on a real `Bun.serve` under the Bun runtime.

const servers: Server[] = []

afterEach(async () => {
	vi.unstubAllEnvs()
	for (const server of servers.splice(0)) await new Promise((resolve) => server.close(resolve))
})

// A root, a page, and `.response()` routes that answer with the request's protocol, two cookies, the request body,
// and a stream whose second chunk waits for the test.
function app(release: Promise<void>): ReturnType<typeof createServer> {
	const root = createRootLayout("_root_").render((props) => props.children)
	const home = createPage("_root_/").render(() => "home")
	const proto = createPage("_root_/proto").response(({ request }) => new Response(new URL(request.url).protocol))
	const cookies = createPage("_root_/cookies").response(() => {
		const headers = new Headers()
		headers.append("set-cookie", "a=1; Path=/")
		headers.append("set-cookie", "b=2; Path=/")
		return new Response("cookies", { headers })
	})
	const echo = createPage("_root_/echo").response(async ({ request }) => new Response(`echo ${await request.text()}`))
	const where = createPage("_root_/where").response(({ request }) => new Response(request.url))
	const stream = createPage("_root_/stream").response(() => {
		const encoder = new TextEncoder()
		const body = new ReadableStream<Uint8Array>({
			async start(controller) {
				controller.enqueue(encoder.encode("one"))
				await release
				controller.enqueue(encoder.encode("two"))
				controller.close()
			},
		})
		return new Response(body)
	})
	const routeTree = [
		{ id: "_root_/", path: "/", module: home },
		{ id: "_root_/proto", path: "/proto", module: proto },
		{ id: "_root_/cookies", path: "/cookies", module: cookies },
		{ id: "_root_/echo", path: "/echo", module: echo },
		{ id: "_root_/where", path: "/where", module: where },
		{ id: "_root_/stream", path: "/stream", module: stream },
	]
	return createServer({ router: createRouter({ layouts: { _root_: root }, routeTree }) })
}

async function listen(listener: ReturnType<typeof createNodeListener>): Promise<string> {
	const server = createHttpServer(listener)
	servers.push(server)
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
	const address = server.address()
	if (address === null || typeof address === "string") throw new Error("no port")
	return `http://127.0.0.1:${address.port}`
}

type Answer = { status: number; headers: Record<string, string | string[] | undefined>; body: string }

function get(
	url: string,
	options: { headers?: Record<string, string>; method?: string; body?: string } = {},
): Promise<Answer> {
	const { headers = {}, method = "GET", body } = options
	return new Promise((resolve, reject) => {
		const call = httpRequest(url, { method, headers }, (response) => {
			let text = ""
			response.on("data", (chunk: Buffer) => void (text += chunk.toString()))
			response.on("end", () => resolve({ status: response.statusCode ?? 0, headers: response.headers, body: text }))
		})
		call.on("error", reject)
		call.end(body)
	})
}

// The target exactly as written, which a URL-parsing client would normalize away: its status line.
function raw(origin: string, target: string): Promise<string> {
	const { hostname, port } = new URL(origin)
	return new Promise((resolve) => {
		const socket = connect(Number(port), hostname)
		let text = ""
		socket.on("data", (chunk: Buffer) => void (text += chunk.toString("latin1")))
		socket.on("close", () => resolve(text.split("\r\n")[0] ?? ""))
		socket.end(`GET ${target} HTTP/1.1\r\nhost: ${hostname}\r\nconnection: close\r\n\r\n`)
	})
}

// A chunked body's data: each chunk's size line, then that many bytes, until the zero chunk.
function unchunked(body: string): string {
	let out = ""
	let at = 0
	for (;;) {
		const end = body.indexOf("\r\n", at)
		const size = Number.parseInt(body.slice(at, end), 16)
		if (end === -1 || !(size > 0)) return out
		out += body.slice(end + 2, end + 2 + size)
		at = end + 2 + size + 2
	}
}

// A request with this exact Host header: the status line and the body.
function withHost(origin: string, target: string, host: string): Promise<{ status: string; body: string }> {
	const { hostname, port } = new URL(origin)
	return new Promise((resolve) => {
		const socket = connect(Number(port), hostname)
		let text = ""
		socket.on("data", (chunk: Buffer) => void (text += chunk.toString("latin1")))
		socket.on("close", () => {
			const [head = "", body = ""] = text.split("\r\n\r\n")
			resolve({ status: head.split("\r\n")[0] ?? "", body: unchunked(body) })
		})
		socket.end(`GET ${target} HTTP/1.1\r\nhost: ${host}\r\nconnection: close\r\n\r\n`)
	})
}

// Host is a host and an optional port, nothing else: a path, a query, a fragment, userinfo, or a space in it is a 400,
// so it never changes the routed path; a name, an IPv4 or bracketed IPv6 address, and a port are served as given
// (plan 21 2.2, BUGS.md 150).
it("node host", async () => {
	const origin = await listen(createNodeListener(app(Promise.resolve())))
	for (const host of [
		"evil.example/admin?",
		"evil.example?x=",
		"evil.example#x",
		"user@evil.example",
		"a b",
		"ex:80/x",
	]) {
		expect([host, (await withHost(origin, "/where", host)).status]).toEqual([host, "HTTP/1.1 400 Bad Request"])
	}
	for (const [host, url] of [
		["example.com", "http://example.com/where"],
		["example.com:8080", "http://example.com:8080/where"],
		["127.0.0.1:3000", "http://127.0.0.1:3000/where"],
		["[::1]:3000", "http://[::1]:3000/where"],
		["svc_name.internal", "http://svc_name.internal/where"],
	]) {
		const answer = await withHost(origin, "/where", host)
		expect([host, answer.status, answer.body]).toEqual([host, "HTTP/1.1 200 OK", url])
	}
})

// The listener serves a page, writes a stream's first chunk before its second exists, keeps each Set-Cookie its own
// header, hands a `.response()` route the request body, refuses a `//` target with 400, and serves the next request
// on a connection whose page POST went unread (dx/adapters.md Node).
it("node listener", async () => {
	const gate = Promise.withResolvers<void>()
	const origin = await listen(createNodeListener(app(gate.promise)))
	const page = await get(`${origin}/`)
	expect([page.status, page.body.includes("home")]).toEqual([200, true])
	const first = await new Promise<string>((resolve) => {
		httpRequest(`${origin}/stream`, (response) =>
			response.once("data", (chunk: Buffer) => resolve(chunk.toString())),
		).end()
	})
	expect(first).toBe("one")
	gate.resolve()
	expect((await get(`${origin}/cookies`)).headers["set-cookie"]).toEqual(["a=1; Path=/", "b=2; Path=/"])
	expect((await get(`${origin}/echo`, { method: "POST", body: "payload" })).body).toBe("echo payload")
	expect(await raw(origin, "//evil/")).toBe("HTTP/1.1 400 Bad Request")
	expect((await get(`${origin}/`, { method: "POST", body: "x".repeat(100_000) })).status).toBe(405)
	expect((await get(`${origin}/`)).status).toBe(200)
})

// Behind a proxy that ends TLS, `trustProxy: 1` serves the app as https: the request the server sees and the
// production Strict-Transport-Security follow `X-Forwarded-Proto`; with no trust they do not (dx/adapters.md
// `trustProxy`). Production mode is stubbed, and HSTS proves it took.
it("node trust proxy", async () => {
	vi.stubEnv("DEV", false)
	vi.stubEnv("PROD", true)
	const forwarded = { "x-forwarded-proto": "https" }
	const trusted = await listen(createNodeListener(app(Promise.resolve()), { trustProxy: 1 }))
	expect((await get(`${trusted}/proto`, { headers: forwarded })).body).toBe("https:")
	expect((await get(`${trusted}/`, { headers: forwarded })).headers["strict-transport-security"]).toBe(
		"max-age=63072000; includeSubDomains",
	)
	const plain = await listen(createNodeListener(app(Promise.resolve())))
	expect((await get(`${plain}/proto`, { headers: forwarded })).body).toBe("http:")
	expect((await get(`${plain}/`, { headers: forwarded })).headers["strict-transport-security"]).toBeUndefined()
})

// The Bun runtime, present under `test:bun` only.
const bun: unknown = Reflect.get(globalThis, "Bun")

// A real Bun.serve over `createBunFetch`: it serves the page, trusts a declared hop's https, and keeps Bun's own
// body ceiling (dx/adapters.md Bun).
it.runIf(bun !== undefined)("bun serve", async () => {
	const fetcher = createBunFetch(app(Promise.resolve()), { trustProxy: 1 })
	expect(fetcher.maxRequestBodySize).toBe(128 * 1024 * 1024)
	const served: unknown = Reflect.apply(Reflect.get(Object(bun), "serve"), bun, [
		{ hostname: "127.0.0.1", port: 0, ...fetcher },
	])
	const origin = `http://127.0.0.1:${Number(Reflect.get(Object(served), "port"))}`
	try {
		expect((await get(`${origin}/`)).body).toContain("home")
		expect((await get(`${origin}/proto`, { headers: { "x-forwarded-proto": "https" } })).body).toBe("https:")
		expect((await get(`${origin}/echo`, { method: "POST", body: "payload" })).body).toBe("echo payload")
	} finally {
		await Reflect.apply(Reflect.get(Object(served), "stop"), served, [true])
	}
})
