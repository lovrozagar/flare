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

it("proxy", async () => {
	const forward = mount("/api", (request) => proxy(request, "https://upstream.test"))
	const server = createServer({ router, mounts: [forward] })
	const bytes = new Uint8Array([0xff, 0x00, 0xc3, 0x28])
	const response = await server.fetch(
		new Request("http://localhost/api/echo?q=1", {
			method: "POST",
			body: bytes,
			headers: { "keep-alive": "timeout=5" },
		}),
	)
	expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes)
	expect(seen.at(-1)?.url).toBe("/echo?q=1")
	expect(seen.at(-1)?.headers["keep-alive"]).toBeUndefined()
	expect(response.headers.get("connection")).toBeNull()
	expect(response.headers.get("x-up")).toBe("1")
	expect(response.headers.get("x-content-type-options")).toBe("nosniff")
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
