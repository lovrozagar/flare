import { afterEach, expect, it, vi } from "vitest"
import { serverCtx } from "../../src/server/context/ctx.ts"
import { createMemoryStore } from "../../src/server/cache/memory.ts"
import { createServer } from "../../src/server/lifecycle/create.ts"
import { runLoaders } from "../../src/server/loaders/run.ts"
import { notFound } from "../../src/shared/errors/http.ts"
import { createLayout } from "../../src/shared/route-builder/layout.ts"
import { createPage } from "../../src/shared/route-builder/page.ts"
import { createRootLayout } from "../../src/shared/route-builder/root-layout.ts"
import { createRouter, type RouteModule } from "../../src/shared/router/create-router.ts"

// The store read is bit 10's, so `shared` is observed where it is handed over: the loader run's input.
vi.mock("../../src/server/loaders/run.ts", async (original) => {
	const actual = await original<typeof import("../../src/server/loaders/run.ts")>()
	return { ...actual, runLoaders: vi.fn<typeof actual.runLoaders>(actual.runLoaders) }
})

afterEach(() => {
	vi.mocked(runLoaders).mockClear()
})

const root = createRootLayout("_root_").render((props) => props.children)
const cdn = { maxAge: "60s", tags: ["t"] }
const PUBLIC = "public, max-age=0, s-maxage=60"

function serve(
	page: RouteModule,
	extra: { layout?: RouteModule; session?: unknown } = {},
): ReturnType<typeof createServer> {
	const layouts: Record<string, RouteModule> = { _root_: root }
	if (extra.layout !== undefined) layouts["_root_/(g)"] = extra.layout
	const id = extra.layout === undefined ? "_root_/p" : "_root_/(g)/p"
	return createServer({
		router: createRouter({ layouts, routeTree: [{ id, path: "/p", module: page }] }),
		authenticate: () => extra.session ?? null,
	})
}

const get = (path = "/p"): Request => new Request(`http://localhost${path}`)

function sharedSeen(): unknown {
	return vi.mocked(runLoaders).mock.calls.at(-1)?.[0].shared
}

it("required chain", async () => {
	const layout = createLayout("_root_/(g)")
		.authenticate()
		.render((props) => props.children)
	const page = createPage("_root_/(g)/p")
		.cache({ ssr: { ttl: "1h" }, cdn })
		.render(() => "p")
	const response = await serve(page, { layout, session: { userId: "u" } }).fetch(get())
	expect(response.status).toBe(200)
	expect(response.headers.get("cache-control")).toBe("private, no-store")
	expect(sharedSeen()).toBe(false)
})

it("optional chain", async () => {
	const page = createPage("_root_/p")
		.cache({ isr: true, cdn })
		.authenticateOptional()
		.render(() => "p")
	const anonymous = await serve(page).fetch(get())
	expect(anonymous.headers.get("cache-control")).toBe("private, no-store")
	expect(anonymous.headers.has("cache-tag")).toBe(false)
	expect(sharedSeen()).toBe(true)
	const signedIn = await serve(page, { session: { userId: "u" } }).fetch(get())
	expect(signedIn.headers.get("cache-control")).toBe("private, no-store")
	expect(sharedSeen()).toBe(false)
})

it("public page", async () => {
	const page = createPage("_root_/p")
		.cache({ isr: true, cdn })
		.render(() => "p")
	const server = serve(page)
	for (const path of ["/p", "/p?_flare=data", "/p?_flare=prefetch"]) {
		const response = await server.fetch(get(path))
		expect(response.headers.get("cache-control")).toBe(PUBLIC)
		expect(response.headers.get("cache-tag")).toBe("t, flare-build-dev")
	}
	expect(sharedSeen()).toBe(true)
})

it("route cookie", async () => {
	const page = createPage("_root_/p")
		.cache({ isr: true, cdn })
		.headers(() => ({ "set-cookie": "r=1" }))
		.render(() => "p")
	const response = await serve(page).fetch(get())
	expect(response.headers.get("cache-control")).toBe("private, no-store")
	expect(response.headers.getSetCookie()).toEqual(["r=1"])
})

it("middleware cookie", async () => {
	const page = createPage("_root_/p")
		.cache({ isr: true, cdn: { ...cdn, allowCookies: true } })
		.render(() => "p")
	const server = createServer({
		router: createRouter({ layouts: { _root_: root }, routeTree: [{ id: "_root_/p", path: "/p", module: page }] }),
		middleware: [
			async (ctx) => {
				const response = await ctx.next()
				response.headers.append("set-cookie", "m=1")
				return response
			},
		],
	})
	const response = await server.fetch(get())
	expect(response.headers.get("cache-control")).toBe("private, no-store")
	expect(response.headers.has("cache-tag")).toBe(false)
	expect(response.headers.getSetCookie()).toEqual(["m=1"])
})

it("not found", async () => {
	const page = createPage("_root_/p")
		.cache({ isr: true, cdn })
		.loader(() => notFound())
		.render(() => "p")
	const response = await serve(page).fetch(get())
	expect(response.status).toBe(404)
	expect(response.headers.get("cache-control")).toBe("private, no-store")
})

// A rewrapped answer loses the record of the route's own cookies, so its cookie fails closed: private, even under
// allowCookies (2d83265).
it("rewrapped answer", async () => {
	const page = createPage("_root_/p")
		.cache({ isr: true, cdn: { ...cdn, allowCookies: true } })
		.headers(() => ({ "set-cookie": "r=1" }))
		.render(() => "p")
	const wrapped = createServer({
		router: createRouter({ layouts: { _root_: root }, routeTree: [{ id: "_root_/p", path: "/p", module: page }] }),
		middleware: [
			async (ctx) => {
				const response = await ctx.next()
				return new Response(response.body, response)
			},
		],
	})
	const response = await wrapped.fetch(get())
	expect(response.headers.get("cache-control")).toBe("private, no-store")
	expect(response.headers.getSetCookie()).toEqual(["r=1"])
	// The same page without the rewrap keeps its own allowed cookie public.
	const direct = await serve(page).fetch(get())
	expect(direct.headers.get("cache-control")).toBe(PUBLIC)
})

// What serverContext holds for a request: its cookie, which a public render must never see.
function serverContext({ request }: { request: Request }): { who: string } {
	return { who: request.headers.get("cookie") ?? "none" }
}

// A public page renders as the anonymous request whether or not a store holds it, so the CDN copy every visitor gets
// never carries the one who asked first: the loader and serverContext see no cookie, no search, and no session, with
// a store and without one, on the document and the data answer alike, in each mode (plan 21 4.4).
it("public render anonymous", async () => {
	vi.spyOn(console, "error").mockImplementation(() => undefined)
	const modes = [{ isr: true }, { ssr: { ttl: "1h" } }, { ssg: true }] as const
	for (const mode of modes) {
		const page = createPage("_root_/p")
			.cache({ ...mode, cdn })
			.loader(({ request }) => ({
				cookie: request.headers.get("cookie") ?? "none",
				search: new URL(request.url).search || "none",
				context: String(Reflect.get(Object(serverCtx()), "who") ?? "none"),
			}))
			.render((props) => JSON.stringify(props.loaderData))
		const router = createRouter({
			layouts: { _root_: root },
			routeTree: [{ id: "_root_/p", path: "/p", module: page }],
		})
		const bare = createServer({ router, serverContext })
		const stored = createServer({ router, serverContext, store: createMemoryStore(), site: "https://example.com" })
		for (const server of [bare, stored]) {
			for (const path of ["/p?x=1", "/p?x=1&_flare=data"]) {
				const request = new Request(`http://localhost${path}`, { headers: { cookie: "who=alice" } })
				const response = await server.fetch(request)
				const body = await response.text()
				expect(response.headers.get("cache-control")).toBe(PUBLIC)
				expect(response.headers.get("flare-render")).toBe(Object.keys(mode)[0])
				expect(body).not.toContain("alice")
				expect(body).not.toContain("x=1")
			}
		}
	}
	vi.mocked(console.error).mockRestore()
})

// A public page whose anonymous render is not a clean 200, here a loader that needs a cookie, answers a visitor who has
// one with that visitor's own render: private, never the public policy a CDN would keep and serve to everyone.
it("public render refused", async () => {
	const page = createPage("_root_/p")
		.cache({ isr: true, cdn })
		.loader(({ request }) => {
			const cookie = request.headers.get("cookie")
			if (cookie === null) throw notFound()
			return { cookie }
		})
		.render((props) => JSON.stringify(props.loaderData))
	const router = createRouter({ layouts: { _root_: root }, routeTree: [{ id: "_root_/p", path: "/p", module: page }] })
	const bare = createServer({ router })
	for (const path of ["/p", "/p?_flare=data"]) {
		const response = await bare.fetch(new Request(`http://localhost${path}`, { headers: { cookie: "who=alice" } }))
		expect(await response.text()).toContain("alice")
		expect(response.headers.get("cache-control")).toBe("private, no-store")
	}
})
