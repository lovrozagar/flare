import { type } from "arktype"
import { Schema } from "effect"
import { afterEach, expect, it, vi } from "vitest"
import { notFound, redirect, unauthenticated, unauthorized } from "../../src/shared/errors/index.ts"
import { createLayout } from "../../src/shared/route-builder/layout.ts"
import { createPage } from "../../src/shared/route-builder/page.ts"
import { createRootLayout } from "../../src/shared/route-builder/root-layout.ts"
import { createPathSegment } from "../../src/shared/route-builder/segment.ts"
import { buildUrl } from "../../src/exports/index.ts"
import { serverCtx } from "../../src/exports/server.ts"
import { frames, serve } from "./builder-app.ts"

// dx/builder.md's methods through the real createServer(...).fetch (B96): each case builds its routes with the real
// builders, serves them, and reads the document, the data stream, or the status. Which builder has which method, and
// the call-once and order rules, are direct calls of the builders. The client-only rows (intercept, effects, reset)
// are builder-client.test.ts; boundaries, head, headers, security, and render props are builder-render.test.ts.

const BUILDERS = {
	page: () => createPage("_root_/x") as unknown as Record<string, unknown>,
	layout: () => createLayout("_root_/l") as unknown as Record<string, unknown>,
	"root layout": () => createRootLayout("_r_") as unknown as Record<string, unknown>,
	segment: () => createPathSegment("_root_/s") as unknown as Record<string, unknown>,
}

// The table's yes cells, per method, before `render`; the boundary renders, after it.
const HAS: Record<string, Array<keyof typeof BUILDERS>> = {
	intercept: ["page"],
	cache: ["page", "layout", "root layout", "segment"],
	input: ["page", "layout", "root layout"],
	authenticate: ["page", "layout", "root layout"],
	authenticateOptional: ["page", "layout", "root layout"],
	authorize: ["page", "layout", "root layout"],
	effects: ["page", "layout", "root layout"],
	preloader: ["page", "layout", "root layout"],
	loader: ["page", "layout", "root layout"],
	response: ["page"],
	head: ["page", "layout", "root layout"],
	headers: ["page", "layout", "root layout"],
	security: ["page", "layout", "root layout"],
	render: ["page", "layout", "root layout", "segment"],
}
const BOUNDARIES = ["errorRender", "notFoundRender", "unauthenticatedRender", "unauthorizedRender"]

// Each builder offers exactly its row's methods; a segment's render is fixed and returns its children; the boundary
// renders come after `render`, on everything but a segment.
it("method matrix", () => {
	for (const [method, kinds] of Object.entries(HAS)) {
		for (const [kind, make] of Object.entries(BUILDERS)) {
			expect([method, kind, typeof make()[method]]).toEqual([
				method,
				kind,
				kinds.includes(kind as keyof typeof BUILDERS) ? "function" : "undefined",
			])
		}
	}
	const rendered = {
		page: createPage("_root_/x").render(() => "p") as unknown as Record<string, unknown>,
		layout: createLayout("_root_/l").render((props) => props.children) as unknown as Record<string, unknown>,
		"root layout": createRootLayout("_r_").render((props) => props.children) as unknown as Record<string, unknown>,
	}
	for (const [kind, record] of Object.entries(rendered)) {
		for (const name of BOUNDARIES) expect([kind, name, typeof record[name]]).toEqual([kind, name, "function"])
	}
	const segment = createPathSegment("_root_/s")
	expect(segment.render({ children: "inside" })).toBe("inside")
	expect(segment.cache({ cdn: "1h" } as never)).toMatchObject({ _type: "segment", id: "_root_/s" })
})

// Each method once; a second call throws when the chain is built, and so does a method called after a later one, an
// argument the method rejects, and a cache with two modes.
it("call once and order", () => {
	type Steps = Record<string, (...args: unknown[]) => Steps>
	const untyped = (value: unknown): Steps => value as Steps
	const loaded = untyped(createPage("_root_/x")).loader?.(() => ({}))
	expect(() => untyped(loaded).loader?.(() => ({}))).toThrow("loader twice")
	expect(() => untyped(createPage("_root_/x").loader(() => ({}))).authenticate?.()).toThrow("order: authenticate")
	const rendered = untyped(createPage("_root_/x").render(() => "p"))
	expect(() => untyped(rendered.errorRender?.(() => "e")).errorRender?.(() => "again")).toThrow("errorRender twice")
	expect(() => untyped(createPage("_root_/x")).authenticate?.("optional")).toThrow("The method is authenticateOptional")
	expect(() => untyped(createPage("_root_/x")).input?.({})).toThrow("input needs params or searchParams")
	expect(() => untyped(createPage("_root_/x")).effects?.({})).toThrow("effects needs")
	expect(() => untyped(createPage("_root_/x")).cache?.({ ssr: { ttl: "1m" }, isr: { ttl: "1m" } })).toThrow(
		"one cache mode",
	)
})

// A Standard Schema validator: `id` is digits, which it turns into a number.
const digits = {
	"~standard": {
		version: 1,
		vendor: "test",
		validate: (value: unknown) => {
			const id = String(Reflect.get(Object(value), "id"))
			return /^\d+$/.test(id) ? { value: { id: Number(id) } } : { issues: [{ message: "digits", path: ["id"] }] }
		},
	},
}

// The search record a validator receives: one key a string, a repeated key a string[] in order.
const echoSearch = (value: unknown) => ({ seen: JSON.stringify(value) })

// Validators run before auth. A failure is 400 JSON `{ issues, fieldErrors }` on a document and on a data request, with
// no shell; the output replaces that side for the loader and render.
it("input", async () => {
	const user = createPage("_root_/u/[id]")
		.input({ params: digits })
		.loader(({ params }) => {
			const id: unknown = Reflect.get(Object(params), "id")
			return { text: `${typeof id} ${String(id)}` }
		})
		.render((props) => `user ${props.loaderData.text}`)
	const search = createPage("_root_/s")
		.input({ searchParams: echoSearch })
		.render((props) => `search ${String(Reflect.get(Object(props.search), "seen"))}`)
	const get = serve([
		{ id: "_root_/u/[id]", path: "/u/[id]", module: user },
		{ id: "_root_/s", path: "/s", module: search },
	])
	expect((await get("/u/12")).text).toContain("user number 12")
	const bad = { issues: [{ message: "digits", path: ["id"] }], fieldErrors: { id: ["digits"] } }
	for (const path of ["/u/ab", "/u/ab?_flare=data"]) {
		const answer = await get(path)
		expect(answer.status).toBe(400)
		expect(answer.headers.get("content-type")).toMatch(/^application\/json/)
		expect(JSON.parse(answer.text)).toEqual(bad)
	}
	expect((await get("/s?q=a&q=b&one=x")).text).toContain('search {"q":["a","b"],"one":"x"}')
})

// A page that validates its search with `validator` and renders what it got.
function validated(id: string, validator: unknown) {
	return createPage(id)
		.input({ searchParams: validator as never })
		.render((props) => `got ${String(Reflect.get(Object(props.search), "q"))}`)
}

// The real ArkType and Effect validators, each callable and a Standard Schema: the schema decides, so invalid input is
// a 400 with its issues and valid input reaches the render (plan 21 2.3, BUGS.md 154).
it("input libraries", async () => {
	const ark = type({ q: "string >= 3" })
	const effect = Schema.standardSchemaV1(Schema.Struct({ q: Schema.String.pipe(Schema.minLength(3)) }))
	const get = serve([
		{ id: "_root_/ark", path: "/ark", module: validated("_root_/ark", ark) },
		{ id: "_root_/effect", path: "/effect", module: validated("_root_/effect", effect) },
	])
	for (const path of ["/ark", "/effect"]) {
		expect([path, (await get(`${path}?q=long`)).text]).toEqual([path, expect.stringContaining("got long")])
		const bad = await get(`${path}?q=a`)
		expect([path, bad.status]).toEqual([path, 400])
		expect(Object.keys(Object(JSON.parse(bad.text).fieldErrors))).toEqual(["q"])
	}
})

afterEach(() => {
	vi.unstubAllEnvs()
	vi.restoreAllMocks()
})

// A plain Effect Schema is callable but no validator, and would fail every input with a quiet 400. The server checks it
// before validating: the request is a 500 whose error names the route and the fix, logged like any 500, on a document
// and on a data request. A throwing `authenticate`, the other 500 that answers before a render, is logged the same way
// (BUGS.md 157).
it("input plain effect", async () => {
	const logged = vi.spyOn(console, "error").mockImplementation(() => undefined)
	const said = (pattern: RegExp): boolean => logged.mock.calls.some((call) => pattern.test(String(call)))
	const plain = Schema.Struct({ q: Schema.String })
	const get = serve([{ id: "_root_/plain", path: "/plain", module: validated("_root_/plain", plain) }])
	const fix = /_root_\/plain: a plain Effect Schema is not a validator; wrap it with Schema\.standardSchemaV1/
	for (const path of ["/plain?q=x", "/plain?q=x&_flare=data"]) {
		logged.mockClear()
		expect([path, (await get(path)).status]).toEqual([path, 500])
		expect([path, said(fix)]).toEqual([path, true])
	}
	const broken = createPage("_root_/gate")
		.authenticate()
		.render(() => "gate")
	const gated = serve([{ id: "_root_/gate", path: "/gate", module: broken }], {
		authenticate: () => {
			throw new Error("session store down")
		},
	})
	logged.mockClear()
	expect((await gated("/gate")).status).toBe(500)
	expect(said(/session store down/)).toBe(true)
})

// In production a 500's error reaches the server log with its digest, name, message, and stack, while the client sees
// only the digest; an operator ties one to the other by that digest (B76, plan 21 9.4, BUGS.md 158).
it("production error log", async () => {
	vi.stubEnv("DEV", false)
	vi.stubEnv("PROD", true)
	const logged = vi.spyOn(console, "error").mockImplementation(() => undefined)
	const page = createPage("_root_/boom")
		.loader(() => {
			throw new TypeError("ledger offline at shard 7")
		})
		.render(() => "boom")
	const get = serve([{ id: "_root_/boom", path: "/boom", module: page }])
	const answer = await get("/boom")
	expect(answer.status).toBe(500)
	expect(answer.text).not.toContain("ledger offline")
	const digest = /"digest":"([0-9a-f]{12})"/.exec(answer.text)?.[1] ?? ""
	expect(digest).toMatch(/^[0-9a-f]{12}$/)
	const line = logged.mock.calls.map((call) => call.map(String).join(" ")).find((text) => text.includes(digest)) ?? ""
	expect(line).toContain("TypeError")
	expect(line).toContain("ledger offline at shard 7")
	expect(line).toMatch(/at .*builder\.test\.ts/)
})

// `authenticate` makes the session required and hands the app the leaf's arguments as `callerData`; a null session is
// 401 with the built-in `Please log in`. `authenticateOptional` lets a null session render. `.authenticate("optional")`
// throws, as above.
it("authenticate", async () => {
	const seen: unknown[] = []
	const required = createPage("_root_/r")
		.authenticate("admin", "audit")
		.loader(({ auth }) => ({ text: String(Reflect.get(Object(auth), "name")) }))
		.render((props) => `required ${props.loaderData.text}`)
	const optional = createPage("_root_/o")
		.authenticateOptional()
		.loader(({ auth }) => ({ text: auth === null ? "anonymous" : "known" }))
		.render((props) => `optional ${props.loaderData.text}`)
	const get = serve(
		[
			{ id: "_root_/r", path: "/r", module: required },
			{ id: "_root_/o", path: "/o", module: optional },
		],
		{
			authenticate: ({ callerData }) => {
				seen.push(callerData)
				return null
			},
		},
	)
	const denied = await get("/r")
	expect(denied.status).toBe(401)
	expect(denied.text).toContain("Please log in")
	expect(seen).toEqual([["admin", "audit"]])
	expect(await get("/o")).toMatchObject({ status: 200, text: expect.stringContaining("optional anonymous") })
	const known = serve([{ id: "_root_/r", path: "/r", module: required }], { authenticate: () => ({ name: "ana" }) })
	expect(await known("/r")).toMatchObject({ status: 200, text: expect.stringContaining("required ana") })
})

// `authorize` sees the resolved session, `null` on a public route; `false` is 403 with `Access denied`; a throw is the
// loader-throw outcome, 500, not 403; a parent authorizes before its child.
it("authorize", async () => {
	const order: string[] = []
	const area = createLayout("_root_/area")
		.authorize(({ auth }) => {
			order.push(`layout ${auth === null ? "null" : "session"}`)
			return true
		})
		.render((props) => props.children)
	const page = (allow: () => boolean) =>
		createPage("_root_/area/p")
			.authorize(() => {
				order.push("page")
				return allow()
			})
			.render(() => "allowed")
	const routes = (allow: () => boolean) => [{ id: "_root_/area/p", path: "/area/p", module: page(allow) }]
	const layouts = { "_root_/area": area }
	expect(
		await serve(
			routes(() => true),
			{ layouts },
		)("/area/p"),
	).toMatchObject({
		status: 200,
		text: expect.stringContaining("allowed"),
	})
	expect(order).toEqual(["layout null", "page"])
	const denied = await serve(
		routes(() => false),
		{ layouts },
	)("/area/p")
	expect(denied.status).toBe(403)
	expect(denied.text).toContain("Access denied")
	const thrown = await serve(
		routes(() => {
			throw new Error("authorize broke")
		}),
		{ layouts },
	)("/area/p")
	expect(thrown.status).toBe(500)
	expect(thrown.text).toContain("Something went wrong")
})

// The preloader runs after auth, parent before child, and receives `{ auth }`; the context merges outside-in into the
// child's loader and render; a throw is the loader-throw outcome and fails the descendants too.
it("preloader", async () => {
	const order: string[] = []
	const area = (fail: boolean) =>
		createLayout("_root_/area")
			.preloader(({ auth }) => {
				order.push(`layout ${auth === null ? "null" : "session"}`)
				if (fail) throw new Error("preloader broke")
				return { outer: "o" }
			})
			.render((props) => props.children)
	const page = createPage("_root_/area/p")
		.preloader(() => {
			order.push("page")
			return { inner: "i" }
		})
		.loader(({ preloaderContext }) => ({ text: JSON.stringify(preloaderContext) }))
		.render((props) => `loader ${props.loaderData.text} render ${JSON.stringify(props.preloaderContext)}`)
	const routes = [{ id: "_root_/area/p", path: "/area/p", module: page }]
	const ok = await serve(routes, { layouts: { "_root_/area": area(false) } })("/area/p")
	expect(ok.text).toContain('loader {"outer":"o","inner":"i"} render {"outer":"o","inner":"i"}')
	expect(order).toEqual(["layout null", "page"])
	const broke = await serve(routes, { layouts: { "_root_/area": area(true) } })("/area/p")
	expect(broke.status).toBe(500)
	expect(broke.text).not.toContain('loader {"')
	expect(broke.text).toContain("Something went wrong")
})

// A page whose loader is `load`, with its own errorRender.
function loading(load: () => unknown) {
	return createPage("_root_/p")
		.loader(load as () => { text: string })
		.render((props) => `data ${props.loaderData.text}`)
		.errorRender(() => "page error")
}

function servedLoading(load: () => unknown) {
	return serve([{ id: "_root_/p", path: "/p", module: loading(load) }])
}

// Loader data reaches render; a throw on a document is 500 and the walked `errorRender`; on a data request it stays 200
// with an `e` frame and no `l` frame for that match; `notFound()` stays 404 on both, with no `e` frame.
it("loader", async () => {
	expect((await servedLoading(() => ({ text: "ok" }))("/p")).text).toContain("data ok")
	const broke = servedLoading(() => {
		throw new Error("loader broke")
	})
	const document = await broke("/p")
	expect(document.status).toBe(500)
	expect(document.text).toContain("page error")
	const data = await broke("/p?_flare=data")
	expect(data.status).toBe(200)
	const sent = frames(data.text).filter((frame) => frame["m"] === "_root_/p")
	expect(sent.map((frame) => frame["t"])).toEqual(["e"])
	const missing = servedLoading(() => {
		throw notFound()
	})
	expect((await missing("/p")).status).toBe(404)
	const missingData = await missing("/p?_flare=data")
	expect(missingData.status).toBe(404)
	expect(frames(missingData.text).some((frame) => frame["t"] === "e")).toBe(false)
})

function named(thrown: () => never) {
	return createPage("_root_/named").response(thrown)
}

// `.response()` answers with its own Response, which still passes finalize; a thrown redirect, named status, or other
// error answers as such; an authorize that returns false is 403 and the function never runs.
it("response", async () => {
	let called = false
	const raw = createPage("_root_/raw").response(
		() => new Response("raw body", { headers: { "content-type": "text/plain" } }),
	)
	const moved = createPage("_root_/moved").response(() => {
		throw redirect({ href: "https://example.com/elsewhere", status: 307 })
	})
	const gone = createPage("_root_/gone").response(() => {
		throw notFound()
	})
	const closed = createPage("_root_/closed")
		.authenticate()
		.authorize(() => false)
		.response(() => {
			called = true
			return new Response("never")
		})
	const get = serve(
		[
			{ id: "_root_/raw", path: "/raw", module: raw },
			{ id: "_root_/moved", path: "/moved", module: moved },
			{ id: "_root_/gone", path: "/gone", module: gone },
			{ id: "_root_/closed", path: "/closed", module: closed },
		],
		{ authenticate: () => ({ name: "ana" }) },
	)
	const answer = await get("/raw")
	expect(answer).toMatchObject({ status: 200, text: "raw body" })
	expect(answer.headers.get("x-content-type-options")).toBe("nosniff")
	const redirected = await get("/moved")
	expect(redirected.status).toBe(307)
	expect(redirected.headers.get("location")).toBe("https://example.com/elsewhere")
	expect((await get("/gone")).status).toBe(404)
	expect((await get("/closed")).status).toBe(403)
	expect(called).toBe(false)
	for (const [thrown, status] of [
		[
			() => {
				throw unauthenticated()
			},
			401,
		],
		[
			() => {
				throw unauthorized()
			},
			403,
		],
		[
			() => {
				throw new Error("response broke")
			},
			500,
		],
	] as const) {
		expect((await serve([{ id: "_root_/named", path: "/named", module: named(thrown) }])("/named")).status).toBe(status)
	}
})

// What each callback on `path` sees: the fetch env, the request URL, no `serverContext` field, and `serverCtx()`.
function seenAt(path: string) {
	return { env: { KEY: "k" }, url: `https://example.com${path}`, context: false, ctx: { path } }
}

// Loader, preloader, `authorize`, and `.response()` receive the fetch `env` and the `request`; the loader also gets
// `defer`. The request context is `serverCtx()`, which reads what `createServer({ serverContext })` produced for this
// request. The route callbacks get no `serverContext` field; `buildUrl` is an import (BUGS.md 137).
it("server callbacks", async () => {
	const seen: Record<string, unknown> = {}
	const look = (name: string, ctx: object) => {
		const { env, request } = ctx as { env: unknown; request: Request }
		seen[name] = { env, url: request.url, context: "serverContext" in ctx, ctx: serverCtx() }
	}
	const page = createPage("_root_/p")
		.authorize((ctx) => (look("authorize", ctx), true))
		.preloader((ctx) => (look("preloader", ctx), {}))
		.loader((ctx) => {
			look("loader", ctx)
			return { text: `${typeof ctx.defer} ${buildUrl({ to: "_root_/users/[id]", params: { id: "7" }, hash: "top" })}` }
		})
		.render((props) => `defer ${props.loaderData.text}`)
	const answer = createPage("_root_/r").response((ctx) => (look("response", ctx), new Response("r")))
	const get = serve(
		[
			{ id: "_root_/p", path: "/p", module: page },
			{ id: "_root_/r", path: "/r", module: answer },
		],
		{ env: { KEY: "k" }, serverContext: ({ request }) => ({ path: new URL(request.url).pathname }) },
	)
	expect((await get("/p")).text).toContain("defer function /users/7#top")
	await get("/r")
	expect(seen).toEqual({
		authorize: seenAt("/p"),
		preloader: seenAt("/p"),
		loader: seenAt("/p"),
		response: seenAt("/r"),
	})
})

// A page whose loader throws the redirect `target` gives.
function redirecting(target: Parameters<typeof redirect>[0]) {
	return serve([
		{
			id: "_root_/away",
			path: "/away",
			module: createPage("_root_/away")
				.loader((): { text: string } => redirect(target))
				.render(() => "never"),
		},
	])
}

// `redirect()` defaults to 303 and `replace: true` (decision B71, BUGS.md 138): a document answers that status and
// Location, a data request is HTTP 200 and one `x` frame with the built URL, the status, and `replace`. An explicit
// status is kept; an `href` that is not http(s) throws at the call, the loader-throw outcome.
it("redirect", async () => {
	const bare = redirecting({ to: "_root_/users/[id]", params: { id: "7" }, search: { tab: "a" }, hash: "top" })
	const document = await bare("/away")
	expect(document.status).toBe(303)
	expect(document.headers.get("location")).toBe("/users/7?tab=a#top")
	const data = await bare("/away?_flare=data")
	expect(data.status).toBe(200)
	expect(frames(data.text)).toEqual([{ t: "x", u: "/users/7?tab=a#top", s: 303, r: true }])
	const kept = redirecting({ to: "_root_/users/[id]", params: { id: "7" }, status: 307, replace: false })
	expect((await kept("/away")).status).toBe(307)
	expect(frames((await kept("/away?_flare=data")).text)).toEqual([{ t: "x", u: "/users/7", s: 307, r: false }])
	expect((await redirecting({ href: "javascript:alert(1)" })("/away")).status).toBe(500)
})
