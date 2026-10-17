import { createServer as createHttpServer, type Server } from "node:http"
import type { AddressInfo } from "node:net"
import { createComponent, type Element } from "solid-js"
import { Dynamic } from "@solidjs/web"
import { afterAll, beforeAll, expect, it, vi } from "vitest"
import { i18n } from "../../src/features/i18n/server/middleware.ts"
import { createServer } from "../../src/server/lifecycle/create.ts"
import { createMiddleware, type MiddlewareEntry } from "../../src/server/middleware/index.ts"
import { mount } from "../../src/server/mount/index.ts"
import { proxy } from "../../src/server/proxy/index.ts"
import { redirect } from "../../src/shared/errors/index.ts"
import { createPage } from "../../src/shared/route-builder/page.ts"
import { createRootLayout } from "../../src/shared/route-builder/root-layout.ts"
import { createRouter } from "../../src/shared/router/create-router.ts"

const router = createRouter({
	layouts: { _root_: createRootLayout("_root_").render((props) => props.children) },
	routeTree: [{ id: "_root_/about", path: "/about", module: createPage("_root_/about").render(() => "about") }],
})

// A real upstream on a local socket. proxy accepts only https, so `https://upstream.test` maps to it here.
let upstream: Server
let port = 0
const seen: Array<{ url: string; headers: Record<string, string | string[] | undefined>; body: Buffer }> = []

beforeAll(async () => {
	upstream = createHttpServer((req, res) => {
		const chunks: Buffer[] = []
		req.on("data", (chunk: Buffer) => chunks.push(chunk))
		req.on("end", () => {
			const body = Buffer.concat(chunks)
			seen.push({ url: req.url ?? "", headers: req.headers, body })
			res.writeHead(200, { connection: "close", "x-up": "1", "content-type": "application/octet-stream" })
			res.end(body)
		})
	})
	await new Promise<void>((resolve) => upstream.listen(0, "127.0.0.1", resolve))
	port = (upstream.address() as AddressInfo).port
	const real = globalThis.fetch.bind(globalThis)
	vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
		const url = new URL(input instanceof Request ? input.url : String(input))
		if (url.origin !== "https://upstream.test") return real(input, init)
		return real(`http://127.0.0.1:${port}${url.pathname}${url.search}`, init)
	})
})

afterAll(async () => {
	vi.restoreAllMocks()
	await new Promise<void>((resolve) => upstream.close(() => resolve()))
})

it("filter", async () => {
	const entered: string[] = []
	const watch = createMiddleware((ctx) => void entered.push(ctx.path))
	const calls: string[] = []
	const fns = createMiddleware((ctx) => void calls.push(`${ctx.kind} ${ctx.path}`))
	const middleware: MiddlewareEntry[] = [
		{ filter: { prefix: ["/admin"] }, handler: watch },
		{ filter: { kind: ["serverFn"] }, handler: fns },
	]
	const server = createServer({ router, middleware })
	expect((await server.fetch(new Request("http://localhost/about"))).status).toBe(200)
	await server.fetch(new Request("http://localhost/admin/x"))
	expect(entered).toEqual(["/admin/x"])
	// A server-function call enters a `kind` filter and still reaches dispatch, which knows no such id.
	const fn = await server.fetch(new Request("http://localhost/_flare/fn/abc", { method: "POST", body: "null" }))
	expect(fn.status).toBe(404)
	expect(calls).toEqual(["serverFn /_flare/fn/abc"])
})

// A page that renders "admin".
function adminPage(id: string) {
	return createPage(id).render(() => "admin")
}

// A filter names the route path, so a locale prefix or the basePath never walks around it: a block on /admin also blocks
// /hr/admin under a `[[locale]]` root and /base/admin under basePath /base; the pathname as sent still matches too
// (plan 21 12.1, BUGS.md 159).
it("filter route path", async () => {
	const block = createMiddleware((ctx) => ctx.respond(new Response("blocked", { status: 403 })))
	const middleware: MiddlewareEntry[] = [{ filter: { prefix: ["/admin"] }, handler: block }]
	const root = createRootLayout("_root_").render((props) => props.children)
	const localized = createServer({
		middleware,
		router: createRouter({
			layouts: { "[[locale]]/_root_": root },
			routeTree: [
				{ id: "[[locale]]/_root_/admin", path: "/[[locale]]/admin", module: adminPage("[[locale]]/_root_/admin") },
			],
			locale: { locales: ["en", "hr"], defaultLocale: "en" },
		}),
	})
	for (const path of ["/admin", "/hr/admin", "/HR/admin/x"]) {
		expect([path, (await localized.fetch(new Request(`http://localhost${path}`))).status]).toEqual([path, 403])
	}
	const based = createServer({
		middleware,
		router: createRouter({
			layouts: { _root_: root },
			routeTree: [{ id: "_root_/admin", path: "/admin", module: adminPage("_root_/admin") }],
			basePath: "/base",
		}),
	})
	expect((await based.fetch(new Request("http://localhost/base/admin"))).status).toBe(403)
	const open = createServer({ middleware, router })
	expect((await open.fetch(new Request("http://localhost/about"))).status).toBe(200)
})

// An `exact` filter holds for the page's trailing-slash form too, under each trailingSlash mode: `/admin/` serves the
// `/admin` page, so it is blocked, and under "always" the redirect lands on a blocked page (BUGS.md 336).
it("filter exact trailing slash", async () => {
	const block = createMiddleware((ctx) => ctx.respond(new Response("blocked", { status: 403 })))
	const root = createRootLayout("_root_").render((props) => props.children)
	const routeTree = [{ id: "_root_/admin", path: "/admin", module: adminPage("_root_/admin") }]
	const seen: unknown[] = []
	for (const trailingSlash of ["preserve", "always", "never"] as const) {
		const server = createServer({
			middleware: [{ filter: { exact: ["/admin"] }, handler: block }],
			router: createRouter({ layouts: { _root_: root }, routeTree, trailingSlash }),
		})
		for (const path of ["/admin", "/admin/"]) {
			const response = await server.fetch(new Request(`http://localhost${path}`))
			const landed = response.headers.get("location")
			const final = landed === null ? response : await server.fetch(new Request(new URL(landed, "http://localhost")))
			seen.push([trailingSlash, path, final.status])
		}
	}
	expect(seen).toEqual([
		["preserve", "/admin", 403],
		["preserve", "/admin/", 403],
		["always", "/admin", 403],
		["always", "/admin/", 403],
		["never", "/admin", 403],
		["never", "/admin/", 403],
	])
})

// A middleware's own answer, stashed or returned, still leaves through finalize: the security set wins.
it("middleware finalize", async () => {
	const sniff = { "x-content-type-options": "sniff" }
	const stash = createMiddleware((ctx) => ctx.respond(new Response("stashed", { headers: sniff })))
	const replace = createMiddleware(async (ctx) => {
		await ctx.next()
		return new Response("replaced", { headers: sniff })
	})
	for (const handler of [stash, replace]) {
		const response = await createServer({ router, middleware: [handler] }).fetch(new Request("http://localhost/about"))
		expect(response.headers.get("x-content-type-options")).toBe("nosniff")
		expect(response.headers.get("content-security-policy")).not.toBeNull()
	}
})

it("mount and page", async () => {
	const server = createServer({ router, mounts: [mount("/api", () => new Response("api"))] })
	const page = await server.fetch(new Request("http://localhost/about"))
	const api = await server.fetch(new Request("http://localhost/api/x"))
	expect(await page.text()).toContain("about")
	expect(await api.text()).toBe("api")
	for (const response of [page, api]) expect(response.headers.get("x-content-type-options")).toBe("nosniff")
})

// Middleware runs for a mount like any route, in list order, so a prefix guard covers the sub-app: a request it
// refuses never reaches the mount, one it lets through gets the mount's answer, which a later middleware can still
// change. `kind: ["mount"]` filters on a mount alone; the page and server-function kinds do not match it (plan 21 4.2).
it("mount middleware", async () => {
	const reached: string[] = []
	const api = mount("/api", (request) => {
		reached.push(new URL(request.url).pathname)
		return new Response("api")
	})
	const guard = createMiddleware((ctx) =>
		ctx.request.headers.get("authorization") === "ok" ? undefined : new Response("no", { status: 401 }),
	)
	const kinds: string[] = []
	const tag = createMiddleware(async (ctx) => {
		kinds.push(`${ctx.kind} ${ctx.path}`)
		const response = await ctx.next()
		response.headers.set("x-tagged", ctx.kind)
	})
	const middleware: MiddlewareEntry[] = [
		{ filter: { prefix: ["/api"] }, handler: guard },
		{ filter: { kind: ["mount"] }, handler: tag },
	]
	const server = createServer({ router, mounts: [api], middleware })
	expect((await server.fetch(new Request("http://localhost/api/x"))).status).toBe(401)
	expect(reached).toEqual([])
	const passed = await server.fetch(new Request("http://localhost/api/x", { headers: { authorization: "ok" } }))
	expect([passed.status, await passed.text(), passed.headers.get("x-tagged")]).toEqual([200, "api", "mount"])
	expect(passed.headers.get("x-content-type-options")).toBe("nosniff")
	expect(reached).toEqual(["/x"])
	expect((await server.fetch(new Request("http://localhost/about"))).headers.get("x-tagged")).toBeNull()
	expect(kinds).toEqual(["mount /api/x"])
})

// A middleware may read a mount request's body, through a clone, before the mount reads it: the mount's request is
// built once middleware let it through, so neither finds the body taken (BUGS.md 271).
it("mount body after middleware", async () => {
	const seen: string[] = []
	const peek = createMiddleware(async (ctx) => void seen.push(`middleware ${await ctx.request.clone().text()}`))
	const echo = mount("/api", async (request) => new Response(`mount ${await request.text()}`))
	const server = createServer({ router, mounts: [echo], middleware: [peek] })
	const response = await server.fetch(new Request("http://localhost/api/x", { method: "POST", body: "payload" }))
	expect([response.status, await response.text()]).toEqual([200, "mount payload"])
	expect(seen).toEqual(["middleware payload"])
})

it("proxy", async () => {
	const forward = mount("/api", (request) => proxy(request, "https://upstream.test"))
	const server = createServer({ router, mounts: [forward] })
	const bytes = new Uint8Array([0xff, 0x00, 0xc3, 0x28])
	const response = await server.fetch(
		new Request("http://localhost/api/echo?q=1", {
			method: "POST",
			body: bytes,
			// An upload's `Expect: 100-continue`, which Node's fetch refuses, belongs to this hop (BUGS.md 340).
			headers: { "keep-alive": "timeout=5", expect: "100-continue" },
		}),
	)
	expect(response.status).toBe(200)
	expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes)
	expect(seen.at(-1)?.url).toBe("/echo?q=1")
	expect(seen.at(-1)?.headers["keep-alive"]).toBeUndefined()
	expect(seen.at(-1)?.headers.expect).toBeUndefined()
	expect(response.headers.get("connection")).toBeNull()
	expect(response.headers.get("x-up")).toBe("1")
	expect(response.headers.get("x-content-type-options")).toBe("nosniff")
})

// The client's Host, proxy credentials, and forwarding claims never reach the upstream: it sees its own host, and no
// Proxy-Authorization, Forwarded, X-Forwarded-*, or X-Real-IP the client wrote (plan 21 12.9, ported from v0's
// api-proxy, BUGS.md 161).
it("proxy client headers", async () => {
	const forward = mount("/api", (request) => proxy(request, "https://upstream.test"))
	const server = createServer({ router, mounts: [forward] })
	const sent = {
		host: "internal-admin.upstream.test",
		"proxy-authorization": "Basic c2VjcmV0",
		"proxy-authenticate": "Basic",
		forwarded: "for=10.0.0.1;host=internal-admin",
		"x-forwarded-for": "10.0.0.1",
		"x-forwarded-host": "internal-admin.upstream.test",
		"x-forwarded-proto": "http",
		"x-forwarded-port": "8443",
		"x-real-ip": "10.0.0.1",
		"x-kept": "yes",
	}
	await server.fetch(new Request("http://localhost/api/echo", { headers: sent }))
	const got = seen.at(-1)?.headers ?? {}
	expect(got["host"]).toBe(`127.0.0.1:${port}`)
	for (const name of Object.keys(sent).filter((key) => key !== "host" && key !== "x-kept")) {
		expect([name, got[name]]).toEqual([name, undefined])
	}
	expect(got["x-kept"]).toBe("yes")
})

// Solid writes the head into the document's head element, so a root renders a full document and the body carries
// nonces.
function documentOf(children: Element): Element {
	return createComponent(Dynamic, {
		component: "html",
		get children() {
			return [
				createComponent(Dynamic, { component: "head" }),
				createComponent(Dynamic, { component: "body", children }),
			]
		},
	})
}

// A root that sets its own `.security()`, gated by session, around a full document so the body carries nonces. The
// session is the `x-user` header: none is a guest, `bob` a reader, `ada` the admin (BUGS.md B12, B13).
function secured(middleware: MiddlewareEntry[]): ReturnType<typeof createServer> {
	const root = createRootLayout("_root_")
		.authenticate()
		.authorize(({ auth }) => auth === "ada")
		.security({ "X-Frame-Options": "DENY" })
		.render((props) => documentOf(props.children))
	const admin = createRouter({
		layouts: { _root_: root },
		routeTree: [{ id: "_root_/", path: "/", module: createPage("_root_/").render(() => "admin") }],
	})
	return createServer({
		router: admin,
		middleware,
		security: { "X-Frame-Options": "SAMEORIGIN" },
		authenticate: ({ request }) => request.headers.get("x-user"),
	})
}

function as(user?: string): Request {
	return new Request("http://localhost/", { headers: user === undefined ? {} : { "x-user": user } })
}

// The CSP header's nonce and every nonce the body carries.
async function nonces(response: Response): Promise<{ header: string | undefined; body: string[] }> {
	const header = /'nonce-([^']+)'/.exec(response.headers.get("content-security-policy") ?? "")?.[1]
	const body = [...(await response.text()).matchAll(/nonce="([^"]+)"/g)].map((found) => found[1])
	return { header, body }
}

const passThrough = createMiddleware((ctx) => ctx.next())

const rewrapping = createMiddleware(async (ctx) => {
	const response = await ctx.next()
	return new Response(response.body, response)
})

it("route security keeps nonce", async () => {
	const { header, body } = await nonces(await secured([passThrough]).fetch(as("ada")))
	expect(body.length).toBeGreaterThan(0)
	expect(new Set(body)).toEqual(new Set([header]))
})

it("root security beats server with middleware", async () => {
	const server = secured([passThrough])
	const answers = await Promise.all([as("ada"), as(), as("bob")].map((request) => server.fetch(request)))
	expect(answers.map((response) => [response.status, response.headers.get("x-frame-options")])).toEqual([
		[200, "DENY"],
		[401, "DENY"],
		[403, "DENY"],
	])
})

it("rewrap keeps route security", async () => {
	const response = await secured([rewrapping]).fetch(as("ada"))
	expect(response.headers.get("x-frame-options")).toBe("DENY")
	const { header, body } = await nonces(response)
	expect(new Set(body)).toEqual(new Set([header]))
})

it("short circuit keeps server security", async () => {
	const answering = createMiddleware(() => new Response("maintenance"))
	const response = await secured([answering]).fetch(as("ada"))
	expect(await response.text()).toBe("maintenance")
	expect(response.headers.get("x-frame-options")).toBe("SAMEORIGIN")
})

it("security fn waits for its loader", async () => {
	const root = createRootLayout("_root_")
		.authenticate()
		.security(() => ({ "X-Frame-Options": "DENY" }))
		.render((props) => props.children)
	const gated = createRouter({
		layouts: { _root_: root },
		routeTree: [{ id: "_root_/", path: "/", module: createPage("_root_/").render(() => "home") }],
	})
	const server = createServer({
		router: gated,
		security: { "X-Frame-Options": "SAMEORIGIN" },
		authenticate: () => null,
	})
	const response = await server.fetch(new Request("http://localhost/"))
	expect([response.status, response.headers.get("x-frame-options")]).toEqual([401, "SAMEORIGIN"])
})

// An i18n root with its own `.security()`. A shared page with no tag is the negotiated downgrade, and a private page
// under a tag appends the locale cookie: both leave through the locale slot's exit.
it("locale exit keeps route security", async () => {
	const root = createRootLayout("_root_")
		.security({ "X-Frame-Options": "DENY" })
		.render((props) => documentOf(props.children))
	const shared = createPage("_root_/[[locale]]")
		.cache({ ssr: { ttl: "1h" }, cdn: { maxAge: "60s" } })
		.render(() => "home")
	const owned = createPage("_root_/[[locale]]/account").render(() => "account")
	const localized = createRouter({
		layouts: { _root_: root },
		routeTree: [
			{ id: "_root_/[[locale]]", path: "/[[locale]]", module: shared },
			{ id: "_root_/[[locale]]/account", path: "/[[locale]]/account", module: owned },
		],
		locale: { locales: ["en", "hr"], defaultLocale: "en" },
	})
	const server = createServer({
		router: localized,
		locale: i18n({ locales: ["en", "hr"], defaultLocale: "en" }),
		security: { "X-Frame-Options": "SAMEORIGIN" },
	})
	const negotiated = await server.fetch(new Request("http://localhost/"))
	expect(negotiated.headers.get("cache-control")).toContain("no-store")
	expect(negotiated.headers.get("x-frame-options")).toBe("DENY")
	const { header, body } = await nonces(negotiated)
	expect(new Set(body)).toEqual(new Set([header]))
	// A data answer for a tag the cookie lacks persists it.
	const cookied = await server.fetch(new Request("http://localhost/hr/account?_flare=data"))
	expect(cookied.headers.get("set-cookie")).toContain("flare.locale=hr")
	expect(cookied.headers.get("x-frame-options")).toBe("DENY")
})

// A `redirect()` a global middleware throws answers as a loader's does, by the request's kind: a document gets the 3xx,
// a client navigation's data request the one `x` frame (a 3xx would hand its fetch the HTML), a server function the
// envelope redirect its caller follows, all never stored (BUGS.md 281).
it("middleware throws redirect", async () => {
	const guard = createMiddleware((ctx) => {
		if (ctx.path !== "/about") throw redirect({ to: "_root_/about" })
	})
	const server = createServer({ router, middleware: [guard] })
	const document = await server.fetch(new Request("http://localhost/private"))
	expect([document.status, document.headers.get("location"), document.headers.get("cache-control")]).toEqual([
		303,
		"/about",
		"private, no-store",
	])
	const data = await server.fetch(new Request("http://localhost/private?_flare=data"))
	expect([data.status, await data.text()]).toEqual([200, '{"t":"x","s":303,"u":"/about","r":true}\n'])
	// `replace: false` pushes a history entry, as a loader's redirect does (BUGS.md 288).
	const pushing = createMiddleware(() => {
		throw redirect({ to: "_root_/about", replace: false })
	})
	const pushed = await createServer({ router, middleware: [pushing] }).fetch(
		new Request("http://localhost/x?_flare=data"),
	)
	expect(await pushed.text()).toBe('{"t":"x","s":303,"u":"/about","r":false}\n')
	const fn = await server.fetch(
		new Request("http://localhost/_flare/fn/0123456789abcdef", {
			method: "POST",
			headers: { origin: "http://localhost" },
		}),
	)
	expect([fn.status, Reflect.get(Object(await fn.json()), "redirect")]).toEqual([
		200,
		{ to: "/about", status: 303, replace: true },
	])
})
