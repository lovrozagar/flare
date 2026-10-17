import { createComponent } from "solid-js"
import { Dynamic } from "@solidjs/web"
import { afterEach, expect, it, vi } from "vitest"
import { serverCtx } from "../../src/server/context/ctx.ts"
import { createMemoryStore } from "../../src/server/cache/memory.ts"
import { createServer } from "../../src/server/lifecycle/create.ts"
import { notFound, redirect, unauthenticated, unauthorized } from "../../src/shared/errors/index.ts"
import { createLayout } from "../../src/shared/route-builder/layout.ts"
import { createPage } from "../../src/shared/route-builder/page.ts"
import { createRootLayout } from "../../src/shared/route-builder/root-layout.ts"
import { createRouter, type RouterOptions } from "../../src/shared/router/create-router.ts"

// dx/server.md's createServer options through the real `createServer(...).fetch` (B96): authenticate's statuses, its
// one call, its context, and its order before a shared hit; `site` and the stores; `rewrite`; `serverContext`;
// `serverFns`; and `retireServiceWorker`.

afterEach(() => {
	vi.restoreAllMocks()
	vi.unstubAllEnvs()
})

const root = createRootLayout("_root_").render((props) => props.children)

// A production root renders a whole document (B37).
const documentRoot = createRootLayout("_root_").render((props) =>
	createComponent(Dynamic, {
		component: "html",
		get children() {
			return [
				createComponent(Dynamic, { component: "head" }),
				createComponent(Dynamic, { component: "body", children: props.children }),
			]
		},
	}),
)

// A stored record as a write leaves it, fresh now.
function stored(text: string): { data: unknown; storedAt: number; tags: string[] } {
	const sentinel = "__FLARE_NONCE_00000000000000000000000000000000"
	const html = `<html><head></head><body>${text}<script id="flare-state" nonce="${sentinel}">self.flare={"matches":[],"nonce":"${sentinel}"}</script></body></html>`
	const data = { html, ndjson: '{"t":"r"}\n{"t":"d"}\n', headers: [], security: {}, sentinel, render: "isr" }
	return { data, storedAt: Date.now(), tags: [] }
}

function routes(
	pages: RouterOptions["routeTree"],
	options: Partial<RouterOptions> = {},
): ReturnType<typeof createRouter> {
	return createRouter({ layouts: { _root_: root, ...options.layouts }, routeTree: pages, ...options })
}

const at = (path: string, init: RequestInit = {}) => new Request(`http://localhost${path}`, init)

// A group layout and its page each call `authenticate`, the page also validating its search; a public page beside them.
function gated() {
	const group = createLayout("_root_/(g)")
		.authenticate("member")
		.render((props) => props.children)
	const both = createPage("_root_/(g)/both")
		.input({
			searchParams: (raw) => {
				if (Reflect.get(Object(raw), "q") === "bad") throw new Error("bad q")
				return raw
			},
		})
		.authenticate("admin")
		.render(() => "both")
	const pub = createPage("_root_/pub").render(() => "pub")
	return routes(
		[
			{ id: "_root_/(g)/both", path: "/both", module: both },
			{ id: "_root_/pub", path: "/pub", module: pub },
		],
		{ layouts: { _root_: root, "_root_/(g)": group } },
	)
}

// authenticate runs once per request, after validation and only for a chain that reads identity, with the leaf's
// arguments and the chain's; its redirect(), notFound(), unauthenticated(), and unauthorized() keep their status, and
// any other throw is a logged 500, never 401 (dx/server.md authenticate).
it("authenticate", async () => {
	const logged = vi.spyOn(console, "error").mockImplementation(() => undefined)
	const seen: unknown[] = []
	const server = createServer({
		router: gated(),
		authenticate: ({ request, env, callerData, callerChain }) => {
			seen.push({ url: request.url, env, callerData, callerChain })
			const mode = request.headers.get("x-mode")
			if (mode === "redirect") redirect({ to: "/pub", status: 302 } as never)
			if (mode === "missing") notFound()
			if (mode === "anonymous") unauthenticated()
			if (mode === "denied") unauthorized()
			if (mode === "boom") throw new Error("auth boom")
			return { user: "ada" }
		},
	})
	const env = { REGION: "eu" }
	expect((await server.fetch(at("/both"), env)).status).toBe(200)
	expect(seen).toEqual([
		{
			url: "http://localhost/both",
			env,
			callerData: ["admin"],
			callerChain: [
				{ route: "_root_/(g)", args: ["member"] },
				{ route: "_root_/(g)/both", args: ["admin"] },
			],
		},
	])
	expect([(await server.fetch(at("/both?q=bad"))).status, (await server.fetch(at("/pub"))).status]).toEqual([400, 200])
	expect(seen).toHaveLength(1)
	const statuses: number[] = []
	for (const mode of ["redirect", "missing", "anonymous", "denied", "boom"]) {
		statuses.push((await server.fetch(at("/both", { headers: { "x-mode": mode } }))).status)
	}
	expect(statuses).toEqual([302, 404, 401, 403, 500])
	expect(logged.mock.calls.flat().map(String).join(" ")).toContain("auth boom")
})

// A chain with `authorize` runs its preloader, then `authorize`, before a shared hit is served; `false` is 403 and the
// stored body is not sent (dx/server.md authenticate, B73).
it("authorize before a shared hit", async () => {
	const order: string[] = []
	const page = createPage("_root_/s")
		.cache({ isr: true })
		.authorize(({ request }) => (order.push("authorize"), request.headers.get("x-deny") === null))
		.preloader(() => (order.push("preloader"), {}))
		.render(() => "shared body")
	const store = createMemoryStore()
	const server = createServer({
		router: routes([{ id: "_root_/s", path: "/s", module: page }]),
		authenticate: () => null,
		site: "https://site.test",
		store,
	})
	// The entry a write leaves, put under the key the server gives that page, as a prerender seed puts it.
	await store.set(server.cache.key({ to: "_root_/s" } as never), stored("shared body"))
	const hit = await server.fetch(at("/s"))
	expect([hit.headers.get("flare-cache"), order, (await hit.text()).includes("shared body")]).toEqual([
		"hit",
		["preloader", "authorize"],
		true,
	])
	const denied = await server.fetch(at("/s", { headers: { "x-deny": "1" } }))
	expect([denied.status, (await denied.text()).includes("shared body")]).toEqual([403, false])
})

// `site` is an absolute https origin outside dev, and a store needs it; a shared render reads `site` plus the
// canonical pathname, with no search and no request header, never the Host; a store or static function is called at
// most once per request, and only when the request reads that store (dx/server.md site, store, static).
it("site and stores", async () => {
	vi.stubEnv("DEV", false)
	vi.stubEnv("PROD", true)
	const shared = createPage("_root_/s")
		.cache({ isr: true })
		.loader(({ request }) => ({
			url: request.url,
			header: request.headers.get("x-a"),
			host: request.headers.get("host"),
		}))
		.render((props) => JSON.stringify(props.loaderData))
	const seeded = createPage("_root_/g")
		.cache({ ssg: true })
		.render(() => "seeded")
	const plain = createPage("_root_/p").render(() => "plain")
	const router = routes(
		[
			{ id: "_root_/s", path: "/s", module: shared },
			{ id: "_root_/g", path: "/g", module: seeded },
			{ id: "_root_/p", path: "/p", module: plain },
		],
		{ layouts: { _root_: documentRoot } },
	)
	expect(() => createServer({ router, site: "http://site.test" })).toThrow("site must be an absolute https origin")
	expect(() => createServer({ router, store: createMemoryStore() })).toThrow("store needs site")
	const memory = createMemoryStore()
	const calls = { store: 0, static: 0 }
	const server = createServer({
		router,
		site: "https://site.test",
		store: () => ((calls.store += 1), memory),
		static: () => ((calls.static += 1), createMemoryStore()),
	})
	const body = await (
		await server.fetch(new Request("http://other.host/s?q=1", { headers: { "x-a": "secret" } }))
	).text()
	expect(body).toContain("https://site.test/s")
	expect([body.includes("q=1"), body.includes("secret"), body.includes("other.host")]).toEqual([false, false, false])
	const after = { ...calls }
	await server.fetch(at("/p"))
	expect(calls).toEqual(after)
	await server.fetch(at("/g"))
	expect([calls.store <= after.store + 1, calls.static]).toEqual([true, after.static + 1])
})

// A page at `/<id>` that renders its id.
const named = (id: string) => ({
	id: `_root_/${id}`,
	path: `/${id}`,
	module: createPage(`_root_/${id}`).render(() => id),
})

// A rewrite redirects to its replacement with the query kept, 301 for GET and HEAD and 308 otherwise; a replacement it
// changes again, or a throw, is a logged 500; one that is not a path is 400, and an absolute URL stays on this origin;
// a mount's path never reaches it, and it sees the path before the case fold (dx/server.md rewrite).
it("rewrite", async () => {
	const logged = vi.spyOn(console, "error").mockImplementation(() => undefined)
	const rewrites: Record<string, string> = {
		"/old": "/new",
		"/again": "/again2",
		"/again2": "/again3",
		"/bad": "//evil.test/x",
		"/abs": "https://evil.test/x",
		"/api/x": "/new",
	}
	const server = createServer({
		router: routes([named("new"), named("again2"), named("again3")]),
		mounts: [{ prefix: "/api", fetch: () => new Response("mount") }],
		rewrite: (path) => {
			if (path === "/boom") throw new Error("rewrite boom")
			return rewrites[path]
		},
	})
	const moved = async (path: string, method = "GET") => {
		const response = await server.fetch(at(path, { method }))
		return [response.status, response.headers.get("location")]
	}
	expect(await moved("/old?q=1")).toEqual([301, "/new?q=1"])
	expect(await moved("/old", "HEAD")).toEqual([301, "/new"])
	expect(await moved("/old", "POST")).toEqual([308, "/new"])
	expect(await moved("/again")).toEqual([500, null])
	expect(await moved("/boom")).toEqual([500, null])
	expect((await moved("/bad"))[0]).toBe(400)
	expect(await moved("/abs")).toEqual([301, "/https:/evil.test/x"])
	expect(await (await server.fetch(at("/api/x"))).text()).toBe("mount")
	expect((await moved("/OLD"))[1]).not.toBe("/new")
	expect(logged.mock.calls.flat().map(String).join(" ")).toContain("rewrite boom")
})

// serverContext runs once per request after the canonical path is accepted, never for a redirect, with only the
// request and env; serverCtx() returns its value (dx/server.md serverContext).
it("server context", async () => {
	const args: string[][] = []
	const page = createPage("_root_/p")
		.loader(() => ({ ctx: serverCtx() }))
		.render((props) => JSON.stringify(props.loaderData))
	const server = createServer({
		router: routes([{ id: "_root_/p", path: "/p", module: page }]),
		rewrite: (path) => (path === "/old" ? "/p" : undefined),
		serverContext: (ctx) => (args.push(Object.keys(ctx).sort()), { tenant: "acme" }),
	})
	expect(await (await server.fetch(at("/p"))).text()).toContain('{"ctx":{"tenant":"acme"}}')
	expect((await server.fetch(at("/old"))).status).toBe(301)
	expect((await server.fetch(at("/p//"))).status).toBe(301)
	expect(args).toEqual([["env", "request"]])
})

// An unknown server-function id is 404 before the method check, whatever the method (dx/server.md serverFns).
it("unknown server function", async () => {
	const server = createServer({ router: routes([]) })
	const statuses: number[] = []
	for (const method of ["GET", "PUT", "DELETE", "POST"]) {
		statuses.push(
			(await server.fetch(at("/_flare/fn/0123456789abcdef", { method, headers: { origin: "http://localhost" } })))
				.status,
		)
	}
	expect(statuses).toEqual([404, 404, 404, 404])
})

// A retired worker's path answers the retiring script, JavaScript, never stored and never redirected by the
// trailing-slash or rewrite rules; the app's middleware runs first and may answer it (dx/server.md retireServiceWorker).
it("retired worker", async () => {
	const options = {
		router: routes([], { trailingSlash: "always" }),
		retireServiceWorker: "/sw.js",
		rewrite: (path: string) => (path === "/sw.js" ? "/elsewhere" : undefined),
	}
	const server = createServer(options)
	const script = await server.fetch(at("/sw.js"))
	expect([script.status, script.headers.get("content-type"), script.headers.get("cache-control")]).toEqual([
		200,
		expect.stringContaining("javascript"),
		"private, no-store",
	])
	expect(script.headers.get("x-content-type-options")).toBe("nosniff")
	const head = await server.fetch(at("/sw.js", { method: "HEAD" }))
	expect([head.status, await head.text()]).toEqual([200, ""])
	const first = createServer({
		...options,
		middleware: [{ filter: { exact: ["/sw.js"] }, handler: () => new Response("mine") }],
	})
	expect(await (await first.fetch(at("/sw.js"))).text()).toBe("mine")
})
