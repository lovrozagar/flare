import { expect, it, vi } from "vitest"
import { createComponent, createMemo, Loading, onCleanup } from "solid-js"
import { i18n } from "../../src/features/i18n/server/middleware.ts"
import { createServer } from "../../src/server/lifecycle/create.ts"
import { serverCtx } from "../../src/server/context/ctx.ts"
import { createServerFn } from "../../src/server/server-fn/dispatch.ts"
import { redirect } from "../../src/shared/errors/index.ts"
import { createPage } from "../../src/shared/route-builder/page.ts"
import { createLayout } from "../../src/shared/route-builder/layout.ts"
import { createRootLayout } from "../../src/shared/route-builder/root-layout.ts"
import { createRouter } from "../../src/shared/router/create-router.ts"

// Hostile request values through the real createServer(...).fetch (B96).

// A value the request or a route derives from it never makes `server.fetch` reject: a malformed escape in the locale
// slot, a CR or LF in a `.headers()` value, and one in a redirect's target each come back as an answer: the bad
// headers are that match's bug (B82), and the bad redirect fails its loader (plan 21 2.7, BUGS.md 168).
it("hostile values answer", async () => {
	vi.spyOn(console, "error").mockImplementation(() => undefined)
	const root = createRootLayout("[[locale]]/_root_").render((props) => props.children)
	const page = createPage("[[locale]]/_root_/x").render(() => "x")
	const split = createPage("[[locale]]/_root_/split")
		.headers(({ search }) => ({ "x-echo": String(Reflect.get(Object(search), "v") ?? "") }))
		.render(() => "split")
	const away = createPage("[[locale]]/_root_/away")
		.loader(({ search }) => {
			throw redirect({ href: `https://example.com/${String(Reflect.get(Object(search), "to") ?? "")}` })
		})
		.render(() => "away")
	const server = createServer({
		site: "https://example.com",
		locale: i18n({ locales: ["en", "hr"], defaultLocale: "en" }),
		router: createRouter({
			layouts: { "[[locale]]/_root_": root },
			routeTree: [
				{ id: "[[locale]]/_root_/x", path: "/[[locale]]/x", module: page as never },
				{ id: "[[locale]]/_root_/split", path: "/[[locale]]/split", module: split as never },
				{ id: "[[locale]]/_root_/away", path: "/[[locale]]/away", module: away as never },
			],
			locale: { locales: ["en", "hr"], defaultLocale: "en" },
		}),
	})
	const answer = (path: string) =>
		Promise.resolve()
			.then(() => server.fetch(new Request(`https://example.com${path}`, { redirect: "manual" })))
			.then(
				(response) => ({
					status: response.status,
					echo: response.headers.get("x-echo"),
					cookie: response.headers.get("set-cookie"),
				}),
				(error: unknown) => ({ rejected: String(error) }),
			)
	// The bad `.headers()` value is that match's bug: its headers are omitted, the page renders, and no header was split.
	expect(await answer("/split?v=a%0D%0Aset-cookie:%20x=1")).toEqual({ status: 200, echo: null, cookie: null })
	expect(await answer("/split?v=fine")).toEqual({ status: 200, echo: "fine", cookie: null })
	// A redirect target with a CR or LF is refused, so the loader fails: the 500 page.
	expect(await answer("/away?to=a%0D%0Ab")).toMatchObject({ status: 500 })
	// A malformed escape in the locale slot is no locale: never a rejection.
	for (const path of ["/%zz/x", "/%e9/x", "/hr%ZZ/x"]) {
		const got = await answer(path)
		expect([path, "status" in got && got.status < 500]).toEqual([path, true])
	}
})

// A HEAD request answers the page's status and headers with no body, and the render behind it stops: a page whose
// render never completes is disposed and its cleanups run, so a HEAD never holds a render open (plan 21 3.12).
it("head stops the render", async () => {
	let disposed = false
	const root = createRootLayout("_root_").render((props) => props.children)
	const slow = createPage("_root_/slow").render(() => {
		onCleanup(() => void (disposed = true))
		return createComponent(Loading, {
			fallback: "wait",
			get children() {
				const value = createMemo(async () => new Promise<string>(() => undefined))
				return [() => value()]
			},
		})
	})
	const routeTree = [{ id: "_root_/slow", path: "/slow", module: slow }]
	const server = createServer({ router: createRouter({ layouts: { _root_: root }, routeTree }) })
	const answer = await server.fetch(new Request("http://localhost/slow", { method: "HEAD" }))
	expect([answer.status, await answer.text()]).toEqual([200, ""])
	await vi.waitFor(() => expect(disposed).toBe(true))
})

// A `.response()` page answers the methods it declares, GET when none: a PUT or a DELETE to a GET page is 405 with
// Allow and never runs it, so it cannot hand back its full body; HEAD sends no body (plan 21 13.5, BUGS.md 208).
it("response methods", async () => {
	const ran: string[] = []
	const respond = ({ request }: { request: Request }): Response => {
		ran.push(request.method)
		return new Response("secret body")
	}
	const server = createServer({
		router: createRouter({
			layouts: { _root_: createRootLayout("_root_").render((props) => props.children) },
			routeTree: [
				{ id: "_root_/file", path: "/file", module: createPage("_root_/file").response(respond) },
				{
					id: "_root_/hook",
					path: "/hook",
					module: createPage("_root_/hook").response(respond, { methods: ["POST"] }),
				},
			],
		}),
	})
	const call = async (path: string, method: string): Promise<[string, number, string | null, string]> => {
		const response = await server.fetch(new Request(`http://localhost${path}`, { method }))
		return [method, response.status, response.headers.get("allow"), await response.text()]
	}
	expect(await call("/file", "GET")).toEqual(["GET", 200, null, "secret body"])
	expect(await call("/file", "HEAD")).toEqual(["HEAD", 200, null, ""])
	expect(await call("/file", "PUT")).toEqual(["PUT", 405, "GET, HEAD, OPTIONS", ""])
	expect(await call("/file", "DELETE")).toEqual(["DELETE", 405, "GET, HEAD, OPTIONS", ""])
	expect(await call("/hook", "POST")).toEqual(["POST", 200, null, "secret body"])
	expect(await call("/hook", "GET")).toEqual(["GET", 405, "POST, OPTIONS", ""])
	expect(ran).toEqual(["GET", "HEAD", "POST"])
})

// A non-GET `.response()` request gets the server functions' origin check (B44): a cross-origin Origin or a
// cross-site Sec-Fetch-Site is 403 and never runs the handler, its own origin passes, and a request with none of the
// three headers, a webhook's, passes unless the chain reads identity, as an `authenticate` page does. GET is not
// checked (plan 21 4.3).
it("response csrf", async () => {
	const ran: string[] = []
	const respond = ({ request }: { request: Request }): Response => {
		ran.push(new URL(request.url).pathname)
		return new Response("done")
	}
	const server = createServer({
		authenticate: () => ({ id: "u" }),
		router: createRouter({
			layouts: { _root_: createRootLayout("_root_").render((props) => props.children) },
			routeTree: [
				{
					id: "_root_/hook",
					path: "/hook",
					module: createPage("_root_/hook").response(respond, { methods: ["POST"] }),
				},
				{
					id: "_root_/mine",
					path: "/mine",
					module: createPage("_root_/mine")
						.authenticate()
						.response(respond, { methods: ["GET", "POST"] }),
				},
			],
		}),
	})
	const call = async (path: string, method: string, headers: Record<string, string> = {}): Promise<number> =>
		(await server.fetch(new Request(`http://localhost${path}`, { method, headers }))).status
	expect(await call("/hook", "POST", { origin: "https://evil.example" })).toBe(403)
	expect(await call("/hook", "POST", { "sec-fetch-site": "cross-site" })).toBe(403)
	expect(await call("/hook", "POST", { origin: "http://localhost" })).toBe(200)
	expect(await call("/hook", "POST")).toBe(200)
	expect(await call("/mine", "POST")).toBe(403)
	expect(await call("/mine", "POST", { "sec-fetch-site": "same-origin" })).toBe(200)
	expect(await call("/mine", "GET", { origin: "https://evil.example" })).toBe(200)
	expect(ran).toEqual(["/hook", "/hook", "/mine", "/mine"])
})

// An escaped unreserved character is that character: `/docs/%72outing` is a 301 to `/docs/routing`, which serves,
// instead of a 404 (RFC 3986 6.2.2, plan 21 13.7, BUGS.md 210).
it("unreserved escapes", async () => {
	const docs = createPage("_root_/docs/routing").render(() => "routing")
	const server = createServer({
		router: createRouter({
			layouts: { _root_: createRootLayout("_root_").render((props) => props.children) },
			routeTree: [{ id: "_root_/docs/routing", path: "/docs/routing", module: docs }],
		}),
	})
	const moved = await server.fetch(new Request("http://localhost/docs/%72outing?x=1"))
	expect([moved.status, moved.headers.get("location")]).toEqual([301, "/docs/routing?x=1"])
	expect((await server.fetch(new Request("http://localhost/docs/routing"))).status).toBe(200)
})

const respond = (): Response => new Response("signed in")

const callback = () => createPage("_root_/callback")

// `crossOrigin: true` drops the Origin check for one `.response()` route whose handler proves the request itself, such
// as an OIDC form_post callback, which Apple sends with `Origin: https://appleid.apple.com`; without it that post is 403.
// It adds no CORS header. A route that answers only GET or OPTIONS, or whose chain authenticates or authorizes, layouts
// included, throws at createServer, naming the route (B44, BUGS.md 273).
it("cross origin", async () => {
	const root = createRootLayout("_root_").render((props) => props.children)
	const open = { methods: ["POST"], crossOrigin: true } as const
	const serve = (page: unknown, layout?: unknown) =>
		createServer({
			authenticate: () => ({ id: "u" }),
			router: createRouter({
				layouts: { _root_: root, ...(layout === undefined ? {} : { "_root_/(g)": layout }) } as never,
				routeTree: [
					{ id: layout === undefined ? "_root_/callback" : "_root_/(g)/callback", path: "/callback", module: page },
				] as never,
			}),
		})
	const post = { method: "POST", headers: { origin: "https://appleid.apple.com" }, body: "code=1" }
	const closed = serve(createPage("_root_/callback").response(respond, { methods: ["POST"] }))
	expect((await closed.fetch(new Request("http://localhost/callback", post))).status).toBe(403)
	const answer = await serve(createPage("_root_/callback").response(respond, open)).fetch(
		new Request("http://localhost/callback", post),
	)
	expect([answer.status, await answer.text(), answer.headers.get("access-control-allow-origin")]).toEqual([
		200,
		"signed in",
		null,
	])
	const refused = "createServer: _root_/callback .response() crossOrigin: true needs"
	expect(() => serve(callback().response(respond, { crossOrigin: true }))).toThrow(refused)
	expect(() => serve(callback().response(respond, { methods: ["GET", "OPTIONS"], crossOrigin: true }))).toThrow(refused)
	expect(() => serve(callback().authenticateOptional().response(respond, open))).toThrow(refused)
	expect(() =>
		serve(
			callback()
				.authorize(() => true)
				.response(respond, open),
		),
	).toThrow(refused)
	const guarded = createLayout("_root_/(g)").authenticateOptional()
	expect(() => serve(createPage("_root_/(g)/callback").response(respond, open), guarded)).toThrow(
		"createServer: _root_/(g)/callback .response() crossOrigin: true needs",
	)
})

// A `crossOrigin` route's request carries no identity: a server function with `.authenticate()` its handler calls never
// runs `authenticate` on the cross-site cookie, but throws a bug naming the route, a logged 500 an attacker cannot tell
// from any failure, and `serverCtx()` is what serverContext gives the request with no cookie. Without this, a forged
// form post would delete the visitor's account (B44, BUGS.md 282).
it("cross origin identity", async () => {
	const deleted: string[] = []
	const logged = vi.spyOn(console, "error").mockImplementation(() => undefined)
	const deleteAccount = createServerFn({ method: "post", __id: "deleteacct000000", __name: "deleteAccount" } as never)
		.authenticate()
		.handler(({ auth }) => void deleted.push(String(Reflect.get(Object(auth), "id"))))
	const seen: unknown[] = []
	const hook = createPage("_root_/hook").response(
		async () => {
			seen.push(serverCtx())
			await deleteAccount()
			return new Response("ok")
		},
		{ methods: ["POST"], crossOrigin: true },
	)
	const server = createServer({
		authenticate: ({ request }) => (request.headers.get("cookie") === "sid=alice" ? { id: "alice" } : null),
		serverContext: ({ request }) => ({ cookie: request.headers.get("cookie") ?? "none" }),
		router: createRouter({
			layouts: { _root_: createRootLayout("_root_").render((props) => props.children) },
			routeTree: [{ id: "_root_/hook", path: "/hook", module: hook }],
		}),
	})
	const forged = { method: "POST", headers: { origin: "https://evil.example", cookie: "sid=alice" } }
	const response = await server.fetch(new Request("http://localhost/hook", forged))
	expect([response.status, deleted, seen]).toEqual([500, [], [{ cookie: "none" }]])
	expect(logged.mock.calls.flat().map(String).join(" ")).toContain(
		"_root_/hook is a crossOrigin route and has no session",
	)
	// A serverContext that throws for the request without its cookie is the route's 500, as any serverContext throw is.
	const strict = createServer({
		serverContext: ({ request }) => {
			if (request.headers.get("cookie") === null) throw new Error("serverContext needs a cookie")
			return {}
		},
		router: createRouter({
			layouts: { _root_: createRootLayout("_root_").render((props) => props.children) },
			routeTree: [
				{
					id: "_root_/hook",
					path: "/hook",
					module: createPage("_root_/hook").response(respond, { methods: ["POST"], crossOrigin: true }),
				},
			],
		}),
	})
	expect((await strict.fetch(new Request("http://localhost/hook", forged))).status).toBe(500)
	logged.mockRestore()
})

// The identity-less request a crossOrigin route's server functions see keeps the method and the abort signal: a stream
// it serves stops when the client leaves, and the method reads as sent; only Cookie and Authorization go (BUGS.md 286).
it("cross origin request", async () => {
	const seen: Array<() => unknown> = []
	const peek = createServerFn({ method: "post", __id: "peekrequest00000", __name: "peek" } as never).handler(
		({ request }) => void seen.push(() => [request.method, request.signal.aborted, request.headers.get("cookie")]),
	)
	const hook = createPage("_root_/hook").response(
		async () => {
			await peek()
			return new Response("ok")
		},
		{ methods: ["POST"], crossOrigin: true },
	)
	const server = createServer({
		router: createRouter({
			layouts: { _root_: createRootLayout("_root_").render((props) => props.children) },
			routeTree: [{ id: "_root_/hook", path: "/hook", module: hook }],
		}),
	})
	const leave = new AbortController()
	const headers = { origin: "https://evil.example", cookie: "sid=alice" }
	const response = await server.fetch(
		new Request("http://localhost/hook", { method: "POST", headers, signal: leave.signal }),
	)
	expect(response.status).toBe(200)
	leave.abort()
	expect(seen.map((read) => read())).toEqual([["POST", true, null]])
})

const post = () => new Request("http://localhost/hook", { method: "POST", headers: { cookie: "sid=alice" } })

// A serverContext that throws inside a crossOrigin route's identity-less scope answers as any route's failure does,
// through the pipeline's `failed`: a bug is the 500 with the app's security set, a thrown redirect its 3xx (BUGS.md 287).
it("cross origin context throws", async () => {
	const logged = vi.spyOn(console, "error").mockImplementation(() => undefined)
	const hook = createPage("_root_/hook").response(() => new Response("ok"), { methods: ["POST"], crossOrigin: true })
	const serve = (thrown: () => never) =>
		createServer({
			security: { "X-Frame-Options": "SAMEORIGIN" },
			serverContext: ({ request }) => (request.headers.get("cookie") === null ? thrown() : {}),
			router: createRouter({
				layouts: { _root_: createRootLayout("_root_").render((props) => props.children) },
				routeTree: [{ id: "_root_/hook", path: "/hook", module: hook }],
			}),
		})
	const bug = await serve(() => {
		throw new Error("no cookie")
	}).fetch(post())
	expect([bug.status, bug.headers.get("x-frame-options")]).toEqual([500, "SAMEORIGIN"])
	const moved = await serve(() => redirect({ to: "_root_/hook" })).fetch(post())
	expect([moved.status, moved.headers.get("location")]).toEqual([303, "/hook"])
	logged.mockRestore()
})
