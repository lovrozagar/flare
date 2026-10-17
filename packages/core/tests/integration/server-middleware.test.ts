import { afterEach, expect, it, vi } from "vitest"
import { createMemoryStore } from "../../src/server/cache/memory.ts"
import { createServer } from "../../src/server/lifecycle/create.ts"
import { createMiddleware, type MiddlewareEntry } from "../../src/server/middleware/index.ts"
import { notFound, redirect, unauthenticated } from "../../src/shared/errors/index.ts"
import { createPage } from "../../src/shared/route-builder/page.ts"
import { createRootLayout } from "../../src/shared/route-builder/root-layout.ts"
import { createRouter } from "../../src/shared/router/create-router.ts"

// dx/server.md's Middleware through the real `createServer(...).fetch` (B96): the ctx fields, the order, `respond` and
// `bypass`, a second `next()`, what `next()` resolves to and what a return does, and a throw.

afterEach(() => {
	vi.restoreAllMocks()
})

const root = createRootLayout("_root_").render((props) => props.children)
const page = (id: string, render: () => string = () => id.slice(7)) => ({
	id: `_root_/${id}`,
	path: `/${id}`,
	module: createPage(`_root_/${id}`).render(render),
})
const missing = createPage("_root_/missing")
	.loader(() => notFound())
	.render(() => "missing")
const gated = createPage("_root_/gated")
	.loader(() => unauthenticated())
	.render(() => "gated")
const moved = createPage("_root_/moved")
	.loader(() => redirect({ to: "/home", status: 302 } as never))
	.render(() => "moved")
const broken = createPage("_root_/broken")
	.loader(() => {
		throw new Error("page broke")
	})
	.render(() => "broken")
const kept = createPage("_root_/kept")
	.cache({ isr: true })
	.render(() => "kept")
const router = createRouter({
	layouts: { _root_: root },
	routeTree: [
		page("home"),
		{ id: "_root_/missing", path: "/missing", module: missing },
		{ id: "_root_/gated", path: "/gated", module: gated },
		{ id: "_root_/moved", path: "/moved", module: moved },
		{ id: "_root_/broken", path: "/broken", module: broken },
		{ id: "_root_/kept", path: "/kept", module: kept },
	],
})

function serve(middleware: MiddlewareEntry[], extra: object = {}) {
	return createServer({
		router,
		middleware,
		mounts: [{ prefix: "/api", fetch: () => new Response("mount") }],
		...extra,
	})
}

const at = (path: string, init: RequestInit = {}) => new Request(`http://localhost${path}`, init)

// ctx carries the canonical request and path, the fetch env, and the request's kind; `next()` for a mount resolves to
// the mount's answer (dx/server.md Middleware ctx).
it("middleware context", async () => {
	const seen: unknown[] = []
	const server = serve([
		createMiddleware(async (ctx) => {
			const response = await ctx.next()
			seen.push({
				url: ctx.request.url,
				path: ctx.path,
				env: ctx.env,
				kind: ctx.kind,
				body: await response.clone().text(),
			})
			return response
		}),
	])
	const env = { REGION: "eu" }
	await server.fetch(at("/home?q=1"), env)
	await server.fetch(at("/api/x"), env)
	await server.fetch(
		at("/_flare/fn/0123456789abcdef", { method: "POST", headers: { origin: "http://localhost" } }),
		env,
	)
	expect(seen).toEqual([
		expect.objectContaining({ url: "http://localhost/home?q=1", path: "/home", env, kind: "page" }),
		expect.objectContaining({ path: "/api/x", kind: "mount", body: "mount" }),
		expect.objectContaining({ kind: "serverFn" }),
	])
})

// The list runs in order, each wrapping the rest; `respond()` and `bypass()` stash an answer and skip `next()`; one that
// returns without calling any continues the chain (dx/server.md Middleware).
it("middleware order and answers", async () => {
	const steps: string[] = []
	const wrap = (name: string) =>
		createMiddleware(async (ctx) => {
			steps.push(`${name} in`)
			const response = await ctx.next()
			steps.push(`${name} out`)
			return response
		})
	expect(await (await serve([wrap("a"), wrap("b")]).fetch(at("/home"))).text()).toContain("home")
	expect(steps).toEqual(["a in", "b in", "b out", "a out"])
	const reached: string[] = []
	const after = createMiddleware(() => void reached.push("after"))
	const answered = async (handler: Parameters<typeof createMiddleware>[0]) => {
		const response = await serve([createMiddleware(handler), after]).fetch(at("/home"))
		const text = await response.text()
		return [response.status, text.includes("home") ? "home" : text, response.headers.get("x-content-type-options")]
	}
	expect(await answered((ctx) => ctx.respond(new Response("stashed", { status: 202 })))).toEqual([
		202,
		"stashed",
		"nosniff",
	])
	expect(await answered((ctx) => ctx.bypass(new Response("bypassed")))).toEqual([200, "bypassed", "nosniff"])
	expect(reached).toEqual([])
	expect(await answered(() => undefined)).toEqual([200, "home", "nosniff"])
	expect(reached).toEqual(["after"])
})

// Calls `next()` twice, catching the second call's throw or not.
const twice = (caught: boolean) =>
	createMiddleware(async (ctx) => {
		const response = await ctx.next()
		if (!caught) await ctx.next()
		else {
			try {
				await ctx.next()
			} catch {
				// The middleware answers as it chooses: here, with the first answer.
			}
		}
		return response
	})

// A second `next()` throws in the middleware: uncaught it is the projected 500, caught the middleware answers as it
// chooses (dx/server.md, BUGS.md S15 wording).
it("next twice", async () => {
	vi.spyOn(console, "error").mockImplementation(() => undefined)
	expect((await serve([twice(false)]).fetch(at("/home"))).status).toBe(500)
	expect(await (await serve([twice(true)]).fetch(at("/home"))).text()).toContain("home")
})

// `next()` resolves to the pipeline's answer, a 3xx, 401, 404, and 500 included; returning a Response replaces it, void
// or anything else keeps it; a throw after a response is 500 with the original body discarded (dx/server.md Middleware).
it("on response", async () => {
	const logged = vi.spyOn(console, "error").mockImplementation(() => undefined)
	const statuses: number[] = []
	const watch = createMiddleware(async (ctx) => {
		const response = await ctx.next()
		statuses.push(response.status)
		return response
	})
	const server = serve([watch])
	for (const path of ["/moved", "/gated", "/missing", "/broken"]) await server.fetch(at(path))
	expect(statuses).toEqual([302, 401, 404, 500])
	const returning = (value: unknown) => serve([createMiddleware(async (ctx) => (await ctx.next(), value as Response))])
	expect(await (await returning(new Response("replaced")).fetch(at("/home"))).text()).toBe("replaced")
	expect(await (await returning(undefined).fetch(at("/home"))).text()).toContain("home")
	expect(await (await returning("ignored").fetch(at("/home"))).text()).toContain("home")
	const late = serve([
		createMiddleware(async (ctx) => {
			await ctx.next()
			throw new Error("late boom")
		}),
	])
	const response = await late.fetch(at("/home"))
	expect([response.status, (await response.text()).includes("home")]).toEqual([500, false])
	expect(logged.mock.calls.flat().map(String).join(" ")).toContain("late boom")
})

// A middleware's own throw is the projected 500, logged; a `redirect()` it throws answers by the request's kind and
// is never stored (dx/server.md middleware).
it("middleware throws", async () => {
	const logged = vi.spyOn(console, "error").mockImplementation(() => undefined)
	const boom = serve([
		createMiddleware(() => {
			throw new Error("mw boom")
		}),
	])
	expect((await boom.fetch(at("/home"))).status).toBe(500)
	expect(logged.mock.calls.flat().map(String).join(" ")).toContain("mw boom")
	const store = createMemoryStore()
	const away = serve(
		[{ filter: { exact: ["/kept"] }, handler: () => redirect({ to: "/home", status: 303 } as never) }],
		{ site: "https://localhost", store },
	)
	const first = await away.fetch(at("/kept"))
	const second = await away.fetch(at("/kept"))
	expect([first.status, second.status, second.headers.get("flare-cache")]).toEqual([303, 303, null])
	expect(first.headers.get("cache-control")).toContain("no-store")
})
