import { afterEach, expect, it, vi } from "vitest"
import { dispatchMount, mount, mountTable } from "../mount/mount.ts"
import { proxy, type ProxyOptions } from "./proxy.ts"

type Upstream = (request: Request) => Response

const UPSTREAM = "https://upstream.test"

afterEach(() => {
	vi.restoreAllMocks()
})

// The upstream answers through a stubbed fetch, and every request it saw is kept.
function upstreamOf(answer: Upstream): Request[] {
	const seen: Request[] = []
	vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
		const request = new Request(input, init)
		seen.push(request)
		return answer(request)
	})
	return seen
}

// A request through a mount on `/api` whose fetch proxies to the upstream.
async function through(request: Request, options: ProxyOptions = {}): Promise<Response> {
	const table = mountTable([mount("/api", (inner) => proxy(inner, UPSTREAM, options))], {})
	const response = await dispatchMount(table, request, { env: undefined, ctx: { waitUntil: () => undefined } })
	if (response === undefined) throw new Error("no mount")
	return response
}

const get = (path: string, headers: HeadersInit = {}): Request => new Request(`http://localhost${path}`, { headers })

it("hop by hop dropped", async () => {
	const seen = upstreamOf(
		() => new Response("ok", { headers: { connection: "close", "transfer-encoding": "chunked", "x-up": "1" } }),
	)
	const response = await through(
		get("/api/x?q=1", { connection: "keep-alive", "keep-alive": "timeout=5", te: "trailers", expect: "100-continue" }),
	)
	expect(seen[0]?.url).toBe("https://upstream.test/x?q=1")
	expect(seen[0]?.headers.get("keep-alive")).toBeNull()
	expect(seen[0]?.headers.get("te")).toBeNull()
	expect(seen[0]?.headers.get("expect")).toBeNull()
	expect(response.headers.get("connection")).toBeNull()
	expect(response.headers.get("transfer-encoding")).toBeNull()
	expect(response.headers.get("x-up")).toBe("1")
})

it("cookie off", async () => {
	const seen = upstreamOf(() => new Response("ok"))
	await through(get("/api/x", { cookie: "s=1" }))
	expect(seen[0]?.headers.get("cookie")).toBeNull()
})

it("authorization off", async () => {
	const seen = upstreamOf(() => new Response("ok"))
	await through(get("/api/x", { authorization: "Bearer t" }))
	expect(seen[0]?.headers.get("authorization")).toBeNull()
})

it("redirect manual", async () => {
	const seen = upstreamOf(() => new Response(null, { status: 302, headers: { location: "/next" } }))
	const response = await through(get("/api/x"))
	expect(response.status).toBe(302)
	expect(seen[0]?.redirect).toBe("manual")
})

it("location rewritten", async () => {
	upstreamOf(() => new Response(null, { status: 302, headers: { location: "/secret" } }))
	expect((await through(get("/api/x"))).headers.get("location")).toBe("/api/secret")
})

it("hostile location", async () => {
	upstreamOf(() => new Response(null, { status: 302, headers: { location: "//evil" } }))
	const response = await through(get("/api/x"))
	expect(response.status).toBe(502)
	expect(response.headers.get("location")).toBeNull()
	expect(() => proxy(get("/x"), "//upstream.test")).toThrow("https")
	expect(() => proxy(get("/x"), "http://upstream.test")).toThrow("https")
})

it("raw body", async () => {
	const bytes = new Uint8Array([0xff, 0xfe, 0x00, 0xc3, 0x28])
	const seen = upstreamOf(() => new Response("ok"))
	await through(new Request("http://localhost/api/x", { method: "POST", body: bytes }))
	expect(new Uint8Array(await (seen[0] ?? new Request(UPSTREAM)).arrayBuffer())).toEqual(bytes)
	expect(seen[0]?.method).toBe("POST")
})

it("set-cookie relay", async () => {
	upstreamOf(() => new Response("ok", { headers: { "set-cookie": "a=1" } }))
	expect((await through(get("/api/x"))).headers.getSetCookie()).toEqual([])
	expect((await through(get("/api/x"), { relaySetCookie: true })).headers.getSetCookie()).toEqual(["a=1"])
})

it("named connection", async () => {
	const seen = upstreamOf(() => new Response("ok", { headers: { connection: "x-custom", "x-custom": "1" } }))
	const response = await through(get("/api/x", { connection: "x-mine", "x-mine": "1" }))
	expect(seen[0]?.headers.get("x-mine")).toBeNull()
	expect(response.headers.get("x-custom")).toBeNull()
})

it("cookie on", async () => {
	const seen = upstreamOf(() => new Response("ok"))
	await through(get("/api/x", { cookie: "s=1" }), { forwardCookies: true })
	expect(seen[0]?.headers.get("cookie")).toBe("s=1")
})

it("authorization on", async () => {
	const seen = upstreamOf(() => new Response("ok"))
	await through(get("/api/x", { authorization: "Bearer t" }), { forwardAuthorization: true })
	expect(seen[0]?.headers.get("authorization")).toBe("Bearer t")
})

it("set-cookie many", async () => {
	const cookies = ["a=1; Path=/x; Domain=up.test", "b=2; HttpOnly"]
	upstreamOf(() => {
		const headers = new Headers({ location: "/next", connection: "set-cookie" })
		for (const cookie of cookies) headers.append("set-cookie", cookie)
		return new Response(null, { status: 302, headers })
	})
	const relayed = await through(get("/api/x"), { relaySetCookie: true })
	expect(relayed.status).toBe(302)
	expect(relayed.headers.getSetCookie()).toEqual(cookies)
	expect((await through(get("/api/x"))).headers.getSetCookie()).toEqual([])
})

it("no mount", () => {
	expect(() => proxy(get("/x"), UPSTREAM)).toThrow("active mount")
})

it("absolute location", async () => {
	upstreamOf(() => new Response(null, { status: 301, headers: { location: "https://example.com/a" } }))
	const response = await through(get("/api/x"))
	expect(response.status).toBe(502)
	expect(response.headers.get("location")).toBeNull()
})

// fetch has already decoded a compressed body, so the encoding and the length no longer describe it.
it("decoded body", async () => {
	upstreamOf(() => new Response("plain", { headers: { "content-encoding": "gzip", "content-length": "99" } }))
	const response = await through(get("/api/x"))
	expect(response.headers.get("content-encoding")).toBeNull()
	expect(response.headers.get("content-length")).toBeNull()
	expect(await response.text()).toBe("plain")
})

// The body streams to the upstream and is never read into memory: the first chunk arrives while the client's
// stream is still open (dx/server.md `proxy`).
it("streamed body", async () => {
	const { readable: body, writable } = new TransformStream<Uint8Array, Uint8Array>()
	const writer = writable.getWriter()
	const first = new Promise<Uint8Array | undefined>((resolve) => {
		vi.spyOn(globalThis, "fetch").mockImplementation(async (_input, init) => {
			const stream = init?.body
			if (!(stream instanceof ReadableStream)) throw new Error("the body is not a stream")
			const read = await stream.getReader().read()
			resolve(read.value)
			return new Response("ok")
		})
	})
	const init: RequestInit = { method: "POST", body }
	const request = new Request("http://localhost/api/up", Object.assign(init, { duplex: "half" }))
	const response = through(request)
	void writer.write(new Uint8Array([1, 2, 3]))
	const timeout = new Promise<string>((resolve) => setTimeout(() => resolve("buffered"), 500))
	expect(await Promise.race([first, timeout])).toEqual(new Uint8Array([1, 2, 3]))
	expect((await response).status).toBe(200)
})
