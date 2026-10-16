import { afterEach, expect, it, vi } from "vitest"
import * as z from "zod"
import { markSafeError, notFound, redirect, unauthenticated, unauthorized } from "../../src/shared/errors/index.ts"
import { createServer } from "../../src/server/lifecycle/create.ts"
import type { Middleware } from "../../src/server/middleware/types.ts"
import { createServerFn } from "../../src/server/server-fn/dispatch.ts"
import { createRootLayout } from "../../src/shared/route-builder/root-layout.ts"
import { createRouter } from "../../src/shared/router/create-router.ts"

// dx/server-fn.md through the real `createServer(...).fetch` (B96). `__id` and `__name` are what the boundary
// transform writes into the config; they are not typed config.

type Fn = { id: string }

const ORIGIN = "http://localhost"
const router = createRouter({ layouts: { _root_: createRootLayout("_root_").render(() => null) }, routeTree: [] })

function config(name: string, method: "get" | "post" = "post") {
	return { method, __id: `${name}0123456789abcdef`.slice(0, 16), __name: name }
}

function serve(fns: readonly Fn[], options: Omit<Parameters<typeof createServer>[0], "router" | "serverFns"> = {}) {
	return createServer({
		router,
		...options,
		serverFns: Object.fromEntries(fns.map((fn) => [fn.id, async () => fn])),
	} as Parameters<typeof createServer>[0])
}

function post(fn: Fn, body: unknown, headers: Record<string, string> = { origin: ORIGIN }): Request {
	return new Request(`${ORIGIN}/_flare/fn/${fn.id}`, {
		method: "POST",
		body: JSON.stringify(body),
		headers: { "content-type": "application/json", ...headers },
	})
}

function get(fn: Fn, input?: unknown): Request {
	const query = input === undefined ? "" : `?_i=${encodeURIComponent(JSON.stringify(input))}`
	return new Request(`${ORIGIN}/_flare/fn/${fn.id}${query}`, { headers: { origin: ORIGIN } })
}

afterEach(() => {
	vi.unstubAllEnvs()
})

const echo = createServerFn(config("echo"))
	.input((value: unknown) => value)
	.handler(({ input }) => input)

it("round trip", async () => {
	const response = await serve([echo]).fetch(post(echo, { text: "hi" }))
	expect(response.status).toBe(200)
	expect(await response.json()).toEqual({ name: "echo", status: 200, data: { text: "hi" } })
})

it("csrf", async () => {
	const response = await serve([echo]).fetch(post(echo, { text: "hi" }, { origin: "https://evil.example" }))
	expect(response.status).toBe(403)
})

it("no store", async () => {
	const response = await serve([echo]).fetch(post(echo, { text: "hi" }))
	expect(response.status).toBe(200)
	expect(response.headers.get("cache-control")).toBe("private, no-store")
})

// The default method is POST; a GET function takes its input as `_i`. The other method is 405 with `Allow`.
it("method", async () => {
	// No `method` in the config: the default.
	const unset = { __id: "defaultmethod000", __name: "posted" }
	const posted = createServerFn(unset as Parameters<typeof createServerFn>[0]).handler(() => "posted")
	const read = createServerFn(config("read", "get"))
		.input((value: unknown) => value)
		.handler(({ input }) => input)
	const server = serve([posted, read])
	expect(await (await server.fetch(post(posted, null))).json()).toMatchObject({ status: 200, data: "posted" })
	const wrong = await server.fetch(get(posted))
	expect([wrong.status, wrong.headers.get("allow")]).toEqual([405, "POST, OPTIONS"])
	expect(await (await server.fetch(get(read, { q: 1 }))).json()).toMatchObject({ status: 200, data: { q: 1 } })
	expect((await server.fetch(post(read, { q: 1 }))).status).toBe(405)
})

// `.authenticate()` runs the app's `authenticate` once per request and hands its session to the handler; a null
// session is 401 and the handler does not run. Reading identity turns CSRF fail-open off: no header is 403.
it("authenticate", async () => {
	const seen: string[] = []
	const me = createServerFn(config("me"))
		.authenticate()
		.handler(({ auth }) => {
			seen.push("handler")
			return auth
		})
	const anon = createServerFn(config("anon")).handler(({ auth }) => ({ auth }))
	const server = serve([me, anon], {
		authenticate: ({ request }) => {
			seen.push("authenticate")
			const user = request.headers.get("x-user")
			return user === null ? null : { user }
		},
	})
	const signedIn = await server.fetch(post(me, null, { origin: ORIGIN, "x-user": "ada" }))
	expect(await signedIn.json()).toMatchObject({ status: 200, data: { user: "ada" } })
	expect(seen).toEqual(["authenticate", "handler"])
	const nobody = await server.fetch(post(me, null))
	expect(nobody.status).toBe(401)
	expect(seen).toEqual(["authenticate", "handler", "authenticate"])
	expect((await server.fetch(post(me, null, { "x-user": "ada" }))).status).toBe(403)
	expect(await (await server.fetch(post(anon, null))).json()).toMatchObject({ data: { auth: null } })
	expect(seen).toHaveLength(3)
})

// A Standard Schema, `{ parse }`, or a function, each possibly async. A failure is 400 with `issues` and
// `fieldErrors` keyed by the first path segment, a `{ key }` segment by its key; an empty path is only in `issues`.
it("input", async () => {
	const schema = {
		"~standard": {
			version: 1,
			vendor: "test",
			validate: async (value: unknown) =>
				typeof value === "object" && value !== null && "n" in value
					? { value: { n: Number(value.n) } }
					: {
							issues: [
								{ message: "items are wrong", path: [{ key: "items" }, 0] },
								{ message: "item two too", path: ["items", 1] },
								{ message: "the whole input", path: [] },
							],
						},
		},
	}
	const standard = createServerFn(config("standard"))
		.input(schema)
		.handler(({ input }) => input)
	const parsed = createServerFn(config("parsed"))
		.input({ parse: async (value: { n: string }) => ({ n: Number(value.n) + 1 }) })
		.handler(({ input }) => input)
	const fn = createServerFn(config("fnvalid"))
		.input((value: { n: string }) => Promise.resolve({ n: Number(value.n) + 2 }))
		.handler(({ input }) => input)
	const server = serve([standard, parsed, fn])
	expect(await (await server.fetch(post(standard, { n: "1" }))).json()).toMatchObject({ data: { n: 1 } })
	expect(await (await server.fetch(post(parsed, { n: "1" }))).json()).toMatchObject({ data: { n: 2 } })
	expect(await (await server.fetch(post(fn, { n: "1" }))).json()).toMatchObject({ data: { n: 3 } })
	const bad = await server.fetch(post(standard, {}))
	expect(bad.status).toBe(400)
	const envelope = await bad.json()
	expect(envelope.errors.fieldErrors).toEqual({ items: ["items are wrong", "item two too"] })
	expect(envelope.errors.issues.map((issue: { message: string }) => issue.message)).toContain("the whole input")
})

// A zod record whose bad keys are named like Object.prototype members is a 400 whose `fieldErrors` holds each one, never
// a 500 (plan 21 8.10).
it("prototype keys", async () => {
	const fn = createServerFn(config("record"))
		.input(z.record(z.string(), z.number()))
		.handler(({ input }) => Object.keys(input).length)
	const server = serve([fn])
	const body = JSON.parse('{"constructor":"x","__proto__":"y","toString":"z"}') as unknown
	const bad = await server.fetch(post(fn, body))
	expect(bad.status).toBe(400)
	const envelope = await bad.json()
	// zod itself skips a `__proto__` key; shapeIssues keeps one too (issues.test `prototype keys`).
	expect(Object.keys(envelope.errors.fieldErrors).toSorted()).toEqual(["constructor", "toString"])
	expect(await (await server.fetch(post(fn, { constructor: 1 }))).json()).toMatchObject({ data: 1 })
})

// A `rewrite` maps page paths only: a server function's endpoint is never rewritten, so a locale rewrite that prefixes
// every path leaves the calls answering (plan 21 8.4).
it("rewrite skips functions", async () => {
	const ping = createServerFn(config("rwping")).handler(() => "pong")
	const server = serve([ping], { rewrite: (path) => (path.startsWith("/en") ? undefined : `/en${path}`) })
	const answer = await server.fetch(post(ping, null))
	expect([answer.status, answer.headers.get("location")]).toEqual([200, null])
	expect(await answer.json()).toMatchObject({ data: "pong" })
})

// A middleware that refreshes a session cookie on every answer.
const refresh: Middleware = async (ctx) => {
	const answer = await ctx.next()
	const headers = new Headers(answer.headers)
	headers.append("set-cookie", "session=r; Path=/")
	return new Response(answer.body, { status: answer.status, headers })
}

// A server function whose own returned Response writes a cookie answers `flare-cookies: set`, so the client forgets the
// matches and queries it cached for the visitor before (B133). A cookie a middleware writes on the call does not, nor
// does a handler's own copy of the header.
it("cookie signal", async () => {
	const login = createServerFn(config("login")).handler(
		() => new Response("in", { headers: { "set-cookie": "user=b; Path=/" } }),
	)
	const forged = createServerFn(config("forged")).handler(
		() => new Response("x", { headers: { "flare-cookies": "set" } }),
	)
	const value = createServerFn(config("value")).handler(() => 1)
	const server = serve([login, forged, value], { middleware: [refresh] })
	const signal = async (fn: Fn) => (await server.fetch(post(fn, null))).headers.get("flare-cookies")
	expect([await signal(login), await signal(forged), await signal(value)]).toEqual(["set", null, null])
	expect((await server.fetch(post(value, null))).headers.getSetCookie()).toEqual(["session=r; Path=/"])
})

// The run order is authenticate, input, authorize, handler. `authorize` false is a JSON 403 `Forbidden` and the
// handler does not run.
it("authorize", async () => {
	const seen: string[] = []
	const guarded = createServerFn(config("guarded"))
		.authenticate()
		.input((value: { allow: boolean }) => {
			seen.push("input")
			return value
		})
		.authorize(({ input }) => {
			seen.push("authorize")
			return (input as { allow: boolean }).allow
		})
		.handler(() => {
			seen.push("handler")
			return "ran"
		})
	const server = serve([guarded], {
		authenticate: () => {
			seen.push("authenticate")
			return { user: "ada" }
		},
	})
	expect(await (await server.fetch(post(guarded, { allow: true }))).json()).toMatchObject({ data: "ran" })
	expect(seen).toEqual(["authenticate", "input", "authorize", "handler"])
	seen.length = 0
	const denied = await server.fetch(post(guarded, { allow: false }))
	expect([denied.status, await denied.json()]).toEqual([403, { name: "guarded", status: 403, message: "Forbidden" }])
	expect(seen).toEqual(["authenticate", "input", "authorize"])
})

// A cached GET server function whose input "bad" is invalid and whose handler is `handler`.
function cachedFn(name: string, handler: (input: unknown) => unknown) {
	return createServerFn(config(name, "get"))
		.cache({ maxAge: "1m" })
		.input((value: unknown) => {
			if (value === "bad") throw new Error("bad input")
			return value
		})
		.handler(({ input }) => handler(input))
}

// A cached GET's answer is public only when it is a 2xx with no Set-Cookie: an invalid input, a thrown notFound(), a
// thrown error, and a returned Response that sets a cookie are each `private, no-store`, so no CDN keeps them
// (plan 21 2.5, BUGS.md 166).
it("cache errors private", async () => {
	const missing = cachedFn("cmissing", () => notFound())
	const broken = cachedFn("cbroken", () => {
		throw new Error("broken")
	})
	const cookie = cachedFn("ccookie", () => new Response("hi", { headers: { "set-cookie": "s=1" } }))
	const fine = cachedFn("cfine", () => "ok")
	const server = serve([missing, broken, cookie, fine])
	const control = async (fn: Fn, input: unknown) => {
		const response = await server.fetch(get(fn, input))
		return [response.status, response.headers.get("cache-control")]
	}
	vi.spyOn(console, "error").mockImplementation(() => undefined)
	expect(await control(fine, "x")).toEqual([200, "public, max-age=60"])
	expect(await control(fine, "bad")).toEqual([400, "private, no-store"])
	expect(await control(missing, "x")).toEqual([404, "private, no-store"])
	expect(await control(broken, "x")).toEqual([500, "private, no-store"])
	expect(await control(cookie, "x")).toEqual([200, "private, no-store"])
})

// `cache: { maxAge }` on a public GET is a public max-age; with POST, `authenticate`, or `authorize` the chain throws.
it("cache", async () => {
	const cached = createServerFn(config("cached", "get"))
		.cache({ maxAge: "1m30s" })
		.handler(() => "fresh")
	const response = await serve([cached]).fetch(get(cached))
	expect([response.status, response.headers.get("cache-control")]).toEqual([200, "public, max-age=90"])
	const illegal = "cache.maxAge needs a GET server function with no authenticate and no authorize"
	expect(() =>
		createServerFn(config("postcache"))
			.cache({ maxAge: "1m" })
			.handler(() => 1),
	).toThrow(illegal)
	expect(() =>
		createServerFn(config("authcache", "get"))
			.authenticate()
			.cache({ maxAge: "1m" })
			.handler(() => 1),
	).toThrow(illegal)
	expect(() =>
		createServerFn(config("authzcache", "get"))
			.authorize(() => true)
			.cache({ maxAge: "1m" })
			.handler(() => 1),
	).toThrow(illegal)
})

// The handler's context: the validator's output, the session or null, the fetch env, the request, and the object
// the app's serverContext produced. A stream's context also has the request's signal.
it("handler context", async () => {
	const seen: Record<string, unknown> = {}
	const context = createServerFn(config("context"))
		.authenticate()
		.input((value: { n: number }) => value)
		.handler(({ input, auth, env, request, serverContext }) => {
			Object.assign(seen, { input, auth, env, url: request.url, serverContext })
			return "ok"
		})
	const ticks = createServerFn(config("ticks")).stream(async function* ({ signal }) {
		seen["signal"] = signal instanceof AbortSignal
		yield 1
	})
	const server = serve([context, ticks], {
		authenticate: () => ({ user: "ada" }),
		serverContext: () => ({ requestId: "r1" }),
	})
	await (await server.fetch(post(context, { n: 1 }), { KEY: "value" })).text()
	expect(seen).toEqual({
		input: { n: 1 },
		auth: { user: "ada" },
		env: { KEY: "value" },
		url: `${ORIGIN}/_flare/fn/${context.id}`,
		serverContext: { requestId: "r1" },
	})
	await (await server.fetch(post(ticks, null))).text()
	expect(seen["signal"]).toBe(true)
})

// The wire's limits: a POST body over `bodyLimit` is 413; a GET takes only `_i`, any other param is 400.
it("wire limits", async () => {
	const read = createServerFn(config("limits", "get"))
		.input((value: unknown) => value)
		.handler(({ input }) => input)
	const server = serve([echo, read], { bodyLimit: 16 })
	expect((await server.fetch(post(echo, { text: "far more than sixteen bytes" }))).status).toBe(413)
	expect((await server.fetch(post(echo, { a: 1 }))).status).toBe(200)
	const extra = new Request(`${ORIGIN}/_flare/fn/${read.id}?_i=1&other=2`, { headers: { origin: ORIGIN } })
	expect((await server.fetch(extra)).status).toBe(400)
	expect(await (await server.fetch(get(read, 7))).json()).toMatchObject({ data: 7 })
})

// A thrown error is 500: production sends a generic message and a digest, no stack; `markSafeError` keeps the
// message; dev sends the message and the stack. The helpers are JSON at 404, 401, and 403 with their message.
it("wire envelope", async () => {
	const loud = createServerFn(config("loud")).handler(() => {
		throw new Error("postgres://secret")
	})
	const safe = createServerFn(config("safe")).handler(() => {
		throw markSafeError(new Error("quota used up"))
	})
	const missing = createServerFn(config("missing")).handler(() => notFound())
	const anonymous = createServerFn(config("anonymous")).handler(() => unauthenticated())
	const denied = createServerFn(config("denied")).handler(() => unauthorized())
	const dev = await (await serve([loud]).fetch(post(loud, null))).json()
	expect(dev).toMatchObject({ name: "loud", status: 500, message: "postgres://secret" })
	expect(dev.stack).toEqual(expect.any(String))
	vi.stubEnv("DEV", false)
	vi.stubEnv("PROD", true)
	const server = serve([loud, safe, missing, anonymous, denied])
	const answer = await server.fetch(post(loud, null))
	const production = await answer.json()
	expect(answer.status).toBe(500)
	expect(production.message).not.toContain("secret")
	expect(production.digest).toMatch(/^[0-9a-f]{12}$/)
	expect(production).not.toHaveProperty("stack")
	expect(await (await server.fetch(post(safe, null))).json()).toMatchObject({ message: "quota used up" })
	for (const [fn, status] of [
		[missing, 404],
		[anonymous, 401],
		[denied, 403],
	] as const) {
		const response = await server.fetch(post(fn, null))
		expect([response.status, (await response.json()).status]).toEqual([status, status])
	}
})

// A thrown `redirect()` is HTTP 200 with a redirect envelope and no data; `replace` defaults to true.
it("wire redirect", async () => {
	const away = createServerFn(config("away")).handler(() => redirect({ href: "https://example.com/next" }))
	const response = await serve([away]).fetch(post(away, null))
	expect(response.status).toBe(200)
	expect(await response.json()).toEqual({
		name: "away",
		status: 303,
		redirect: { to: "https://example.com/next", status: 303, replace: true },
	})
})

// A returned `Response` is the HTTP response, marked `flare-fn: response`, its status and body kept and its
// Cache-Control overwritten; a thrown one is an ordinary error.
it("wire response", async () => {
	const raw = createServerFn(config("raw")).handler(
		() =>
			new Response("teapot", {
				status: 418,
				headers: { "cache-control": "public, max-age=999", "flare-fn": "envelope", "x-own": "kept" },
			}),
	)
	const thrown = createServerFn(config("thrownresponse")).handler(() => {
		throw new Response("no")
	})
	const server = serve([raw, thrown])
	const response = await server.fetch(post(raw, null))
	expect([response.status, await response.text()]).toEqual([418, "teapot"])
	expect(response.headers.get("flare-fn")).toBe("response")
	expect(response.headers.get("x-own")).toBe("kept")
	expect(response.headers.get("cache-control")).toBe("private, no-store")
	expect((await server.fetch(post(thrown, null))).status).toBe(500)
})

// `.stream()` writes one envelope per yielded value as NDJSON.
it("wire stream", async () => {
	const ticks = createServerFn(config("streamticks")).stream(async function* () {
		yield 1
		yield 2
	})
	const response = await serve([ticks]).fetch(post(ticks, null))
	expect(response.headers.get("content-type")).toContain("ndjson")
	const lines = (await response.text())
		.trim()
		.split("\n")
		.map((line) => JSON.parse(line))
	expect(lines.filter((line) => "data" in line).map((line) => line.data)).toEqual([1, 2])
})
