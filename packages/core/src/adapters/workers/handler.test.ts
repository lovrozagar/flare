import { expect, it } from "vitest"
import { createServer } from "../../server/lifecycle/create.ts"
import { markUnmatched } from "../../server/lifecycle/finalize.ts"
import { createMiddleware } from "../../server/middleware/index.ts"
import { createServerFn } from "../../server/server-fn/dispatch.ts"
import { notFound as missingPage } from "../../shared/errors/index.ts"
import { createPage } from "../../shared/route-builder/page.ts"
import { createRootLayout } from "../../shared/route-builder/root-layout.ts"
import { createRouter } from "../../shared/router/create-router.ts"
import { createWorkersHandler, type WorkerCtx, type WorkerEnv } from "./handler.ts"

const ctx = (): WorkerCtx => ({
	waitUntil() {},
})

// The router's answer to a document no route matched: a 404 marked for the assets binding (plan 21 13.4).
function unmatched(): Response {
	return markUnmatched(new Response("missing", { status: 404 }))
}

it("waitUntil", async () => {
	const task = Promise.resolve("background")
	const received: Promise<unknown>[] = []
	const handler = createWorkersHandler({
		fetch(_request, _env, context) {
			context.waitUntil(task)
			return new Response("ok")
		},
	})
	const response = await handler.fetch(
		new Request("https://example.com/"),
		{},
		{
			waitUntil(promise) {
				received.push(promise)
			},
		},
	)
	expect(response.status).toBe(200)
	expect(received).toEqual([task])
})

it("assets GET", async () => {
	const seen: string[] = []
	let routed = 0
	const env: WorkerEnv = {
		ASSETS: {
			fetch(request) {
				seen.push(`${request.method} ${new URL(request.url).pathname}`)
				return new Response("file")
			},
		},
	}
	const handler = createWorkersHandler(
		{
			fetch() {
				routed += 1
				return unmatched()
			},
		},
		{ assets: "ASSETS" },
	)
	const get = await handler.fetch(new Request("https://example.com/app.js"), env, ctx())
	const head = await handler.fetch(new Request("https://example.com/app.js", { method: "HEAD" }), env, ctx())
	expect(routed).toBe(2)
	expect(seen).toEqual(["GET /app.js", "HEAD /app.js"])
	expect(get.status).toBe(200)
	expect(await get.text()).toBe("file")
	expect(head.status).toBe(200)
})

it("assets POST", async () => {
	let called = 0
	const handler = createWorkersHandler({ fetch: unmatched }, { assets: "ASSETS" })
	const response = await handler.fetch(
		new Request("https://example.com/app.js", { method: "POST" }),
		{
			ASSETS: {
				fetch() {
					called += 1
					return new Response("file")
				},
			},
		},
		ctx(),
	)
	expect(response.status).toBe(405)
	expect(response.headers.get("allow")).toBe("GET, HEAD, OPTIONS")
	expect(called).toBe(0)
})

// The server's ingress computes the canonical path (B22): a non-canonical one is its 301 or 400, as on Node and Bun,
// and never reaches the binding. A 404 passed that ingress, so the binding gets the request as it came.
it("assets escape", async () => {
	const forwarded: Request[] = []
	const root = createRootLayout("_root_").render((props) => props.children)
	const server = createServer({ router: createRouter({ layouts: { _root_: root }, routeTree: [] }) })
	const handler = createWorkersHandler(server, { assets: "ASSETS" })
	const env: WorkerEnv = { ASSETS: { fetch: (request) => (forwarded.push(request), new Response("file")) } }
	const empty = await handler.fetch(new Request("https://example.com/a//b"), env, ctx())
	expect([empty.status, empty.headers.get("location")]).toEqual([301, "/a/b"])
	expect((await handler.fetch(new Request("https://example.com/%2f"), env, ctx())).status).toBe(400)
	expect(forwarded).toEqual([])
	const canonical = new Request("https://example.com/a/b")
	expect(await (await handler.fetch(canonical, env, ctx())).text()).toBe("file")
	expect(forwarded).toEqual([canonical])
	expect(forwarded[0]).toBe(canonical)
})

it("assets missing", async () => {
	const logged: unknown[][] = []
	const error = console.error
	console.error = (...args: unknown[]) => {
		logged.push(args)
	}
	try {
		const handler = createWorkersHandler({ fetch: unmatched }, { assets: "ASSETS" })
		const response = await handler.fetch(new Request("https://example.com/app.js"), {}, ctx())
		expect(response.status).toBe(500)
		expect(logged).toHaveLength(1)
	} finally {
		console.error = error
	}
})

it("connecting ip", async () => {
	const seen: Array<string | undefined> = []
	const handler = createWorkersHandler({
		fetch(_request, _env, context) {
			seen.push(context.clientIp)
			return new Response("ok", { status: context.clientIp === undefined ? 404 : 200 })
		},
	})
	const present = await handler.fetch(
		new Request("https://example.com/", { headers: { "cf-connecting-ip": "1.2.3.4" } }),
		{},
		ctx(),
	)
	const absent = await handler.fetch(new Request("https://example.com/"), {}, ctx())
	expect(present.status).toBe(200)
	expect(absent.status).toBe(404)
	expect(seen).toEqual(["1.2.3.4", undefined])
})

// The app's not-found document for a path no route matched, with a security header, marked as the router marks it.
function notFound(): Response {
	return markUnmatched(
		new Response("<p>not found</p>", {
			status: 404,
			headers: { "x-frame-options": "DENY", "content-type": "text/html" },
		}),
	)
}

// A path neither the router nor the binding has is the app's own 404 document, with its headers, as on Node and Bun.
// A real static asset is still the binding's response, untouched.
it("assets miss", async () => {
	const env: WorkerEnv = {
		ASSETS: {
			fetch(request) {
				const path = new URL(request.url).pathname
				return path === "/app.js"
					? new Response("file", { headers: { "x-asset": "1" } })
					: new Response(null, { status: 404 })
			},
		},
	}
	const handler = createWorkersHandler({ fetch: notFound }, { assets: "ASSETS" })
	const missing = await handler.fetch(new Request("https://example.com/nothing"), env, ctx())
	expect(missing.status).toBe(404)
	expect(missing.headers.get("x-frame-options")).toBe("DENY")
	expect(await missing.text()).toBe("<p>not found</p>")
	const head = await handler.fetch(new Request("https://example.com/nothing", { method: "HEAD" }), env, ctx())
	expect(head.status).toBe(404)
	expect(head.headers.get("content-type")).toBe("text/html")
	const asset = await handler.fetch(new Request("https://example.com/app.js"), env, ctx())
	expect(asset.status).toBe(200)
	expect(asset.headers.get("x-asset")).toBe("1")
	expect(asset.headers.has("x-frame-options")).toBe(false)
	expect(await asset.text()).toBe("file")
})

// An SPA assets binding answers every path with its index. Only a document no route matched reaches it; a page's own
// notFound(), a server function's 404, and a navigation's 404 are the app's answers and stay 404 (plan 21 13.4,
// BUGS.md 207).
it("app 404 kept", async () => {
	const root = createRootLayout("_root_").render((props) => props.children)
	const gone = createPage("_root_/gone")
		.loader(() => missingPage())
		.render(() => "gone")
	const missing = createServerFn({ method: "get", __id: "missing012345678", __name: "missing" } as never).handler(() =>
		notFound(),
	)
	const server = createServer({
		router: createRouter({
			layouts: { _root_: root },
			routeTree: [{ id: "_root_/gone", path: "/gone", module: gone }],
		}),
		serverFns: { missing012345678: async () => missing },
		// A middleware's rewrap of the router's answer keeps what the answer is.
		middleware: [createMiddleware((context) => context.next())],
	} as Parameters<typeof createServer>[0])
	const spa: WorkerEnv = { ASSETS: { fetch: () => new Response("index", { status: 200 }) } }
	const handler = createWorkersHandler(server, { assets: "ASSETS" })
	const origin = { headers: { origin: "https://example.com" } }
	const answers = await Promise.all(
		["/gone", "/gone?_flare=data", "/_flare/fn/missing012345678", "/nowhere"].map(async (path) => {
			const response = await handler.fetch(new Request(`https://example.com${path}`, origin), spa, ctx())
			return [path, response.status]
		}),
	)
	expect(answers).toEqual([
		["/gone", 404],
		["/gone?_flare=data", 404],
		["/_flare/fn/missing012345678", 404],
		["/nowhere", 200],
	])
})

// A middleware that rewraps the answer, `new Response(response.body, response)` as bits/08 shows, still hands a document
// no route matched to the binding: the mark rides the body, which the rewrap keeps (BUGS.md 272).
it("rewrapped unmatched", async () => {
	const root = createRootLayout("_root_").render((props) => props.children)
	const rewrap = createMiddleware(async (context) => {
		const response = await context.next()
		return new Response(response.body, response)
	})
	const server = createServer({
		router: createRouter({ layouts: { _root_: root }, routeTree: [] }),
		middleware: [rewrap],
	})
	const spa: WorkerEnv = { ASSETS: { fetch: () => new Response("index", { status: 200 }) } }
	const response = await createWorkersHandler(server, { assets: "ASSETS" }).fetch(
		new Request("https://example.com/app.js"),
		spa,
		ctx(),
	)
	expect([response.status, await response.text()]).toEqual([200, "index"])
})
