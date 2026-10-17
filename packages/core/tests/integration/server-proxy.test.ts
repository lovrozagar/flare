import { createServer as createHttpServer, type Server } from "node:http"
import type { AddressInfo } from "node:net"
import { gzipSync } from "node:zlib"
import { afterAll, beforeAll, expect, it, vi } from "vitest"
import { createServer } from "../../src/server/lifecycle/create.ts"
import { createMiddleware } from "../../src/server/middleware/index.ts"
import { mount } from "../../src/server/mount/index.ts"
import { proxy, type ProxyOptions } from "../../src/server/proxy/index.ts"
import { createPage } from "../../src/shared/route-builder/page.ts"
import { createRootLayout } from "../../src/shared/route-builder/root-layout.ts"
import { createRouter } from "../../src/shared/router/create-router.ts"

// dx/server.md's proxy through the real `createServer(...).fetch` (B96) and a real upstream on a local socket, reached
// through the runtime's own fetch: the upstream checks, the forwarding options, the outbound URL, the hop-by-hop
// headers both ways, Location, and the decoded body.

let upstream: Server
let port = 0
const seen: Array<{ url: string; headers: Record<string, string | string[] | undefined> }> = []

beforeAll(async () => {
	upstream = createHttpServer((req, res) => {
		seen.push({ url: req.url ?? "", headers: req.headers })
		req.resume()
		const path = (req.url ?? "").split("?")[0]
		if (path === "/redir") {
			res.writeHead(302, { location: "/next", "set-cookie": "s=1; Path=/" })
			return void res.end()
		}
		if (path === "/away") {
			res.writeHead(302, { location: "https://evil.example/x" })
			return void res.end()
		}
		if (path === "/scheme") {
			res.writeHead(302, { location: "//evil.example/x" })
			return void res.end()
		}
		if (path === "/zipped") {
			const body = gzipSync("decoded text")
			res.writeHead(200, { "content-encoding": "gzip", "content-length": String(body.length) })
			return void res.end(body)
		}
		res.writeHead(200, { "set-cookie": ["a=1; Path=/up", "b=2"], connection: "x-hop", "x-hop": "1", "x-up": "1" })
		res.end("ok")
	})
	await new Promise<void>((resolve) => upstream.listen(0, "127.0.0.1", resolve))
	port = (upstream.address() as AddressInfo).port
	const real = globalThis.fetch.bind(globalThis)
	vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
		const url = new URL(input instanceof Request ? input.url : String(input))
		if (url.origin !== "https://up.test") return real(input, init)
		return real(`http://127.0.0.1:${port}${url.pathname}${url.search}`, init)
	})
})

afterAll(async () => {
	vi.restoreAllMocks()
	await new Promise<void>((resolve) => upstream.close(() => resolve()))
})

const root = createRootLayout("_root_").render((props) => props.children)
const router = createRouter({
	layouts: { _root_: root },
	routeTree: [{ id: "_root_/p", path: "/p", module: createPage("_root_/p").render(() => "p") }],
})

function through(target: string, options: ProxyOptions = {}) {
	return createServer({ router, mounts: [mount("/api", (request) => proxy(request, target, options))] })
}

const at = (path: string, headers: Record<string, string> = {}) => new Request(`http://localhost${path}`, { headers })

// `upstream` is an absolute https URL: `//`, `http://`, and any other scheme throw, a logged 500, and so does a proxy
// with no active mount (dx/server.md proxy).
it("proxy upstream checks", async () => {
	const logged = vi.spyOn(console, "error").mockImplementation(() => undefined)
	for (const target of ["//up.test", "http://up.test", "ftp://up.test", "up.test"]) {
		expect([target, (await through(target).fetch(at("/api/x"))).status]).toEqual([target, 500])
	}
	const outside = createServer({
		router,
		middleware: [createMiddleware((ctx) => proxy(ctx.request, "https://up.test"))],
	})
	expect((await outside.fetch(at("/p"))).status).toBe(500)
	expect(logged).toHaveBeenCalled()
	logged.mockRestore()
})

// Cookie and Authorization stay home unless asked for; Set-Cookie is dropped unless relayed, and relayed unchanged on a
// surfaced 3xx too, a `Connection: set-cookie` token notwithstanding (dx/server.md proxy).
it("proxy forwarding", async () => {
	const secrets = { cookie: "sid=1", authorization: "Bearer t" }
	seen.length = 0
	const closed = await through("https://up.test").fetch(at("/api/x", secrets))
	expect([seen[0]?.headers.cookie, seen[0]?.headers.authorization, closed.headers.getSetCookie()]).toEqual([
		undefined,
		undefined,
		[],
	])
	const open = { forwardCookies: true, forwardAuthorization: true, relaySetCookie: true }
	seen.length = 0
	const relayed = await through("https://up.test", open).fetch(at("/api/x", { ...secrets, connection: "set-cookie" }))
	expect([seen[0]?.headers.cookie, seen[0]?.headers.authorization]).toEqual(["sid=1", "Bearer t"])
	expect(relayed.headers.getSetCookie()).toEqual(["a=1; Path=/up", "b=2"])
	const surfaced = await through("https://up.test", open).fetch(at("/api/redir"))
	expect([surfaced.status, surfaced.headers.get("location"), surfaced.headers.getSetCookie()]).toEqual([
		302,
		"/api/next",
		["s=1; Path=/"],
	])
})

// The outbound URL is the stripped path plus the search, an upstream's own path dropped; a header the Connection header
// names is dropped both ways (dx/server.md proxy).
it("proxy url and hops", async () => {
	seen.length = 0
	const response = await through("https://up.test/base/path?q=1").fetch(
		at("/api/x/y?z=2", { connection: "x-mine", "x-mine": "1", "x-kept": "1" }),
	)
	expect(seen[0]?.url).toBe("/x/y?z=2")
	expect([seen[0]?.headers["x-mine"], seen[0]?.headers["x-kept"]]).toEqual([undefined, "1"])
	expect([response.headers.get("x-hop"), response.headers.get("x-up")]).toEqual([null, "1"])
})

// Upstream redirects stay redirects: a single-slash Location is prefixed with the mount, any other is 502; a body the
// runtime's fetch decoded leaves without its Content-Encoding and Content-Length (dx/server.md proxy).
it("proxy location and body", async () => {
	const server = through("https://up.test")
	expect((await server.fetch(at("/api/redir"))).headers.get("location")).toBe("/api/next")
	expect([(await server.fetch(at("/api/away"))).status, (await server.fetch(at("/api/scheme"))).status]).toEqual([
		502, 502,
	])
	const zipped = await server.fetch(at("/api/zipped"))
	expect([await zipped.text(), zipped.headers.get("content-encoding"), zipped.headers.get("content-length")]).toEqual([
		"decoded text",
		null,
		null,
	])
})
