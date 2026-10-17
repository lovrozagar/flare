import { createComponent, type Element } from "solid-js"
import { Dynamic, type JSX } from "@solidjs/web"
import { expect, it, vi } from "vitest"
import { createLayout } from "../../shared/route-builder/layout.ts"
import { createPage } from "../../shared/route-builder/page.ts"
import { createRootLayout } from "../../shared/route-builder/root-layout.ts"
import { createRouter, type RouteModule } from "../../shared/router/create-router.ts"
import type { DevErrorPayload } from "../../shared/errors/dev-report.ts"
import { redirect } from "../../shared/errors/redirect.ts"
import { notFound } from "../../shared/errors/http.ts"
import { createServer, serveWith } from "./create.ts"
import type { Logger } from "./logger.ts"
import { framesIn, stateIn } from "../wire.fixture.ts"

// flare() writes the client entry into build-info.ts. Without the plugin there is none.
const info = vi.hoisted((): { entry: string | undefined } => ({ entry: undefined }))
vi.mock("./build-info.ts", () => ({
	buildId: "dev",
	get clientEntry() {
		return info.entry
	},
	preloads: { entry: [], routes: {} },
}))

// A layout shows its data, then its outlet. A page has no children.
function show(props: { loaderData: unknown; children?: JSX.Element }): JSX.Element {
	return [`[${label(props.loaderData)}]`, props.children]
}

// Loader data is an object or nothing (dx/builder.md). These loaders return { text }.
function label(data: unknown): string {
	return typeof data === "object" && data !== null && "text" in data ? String(data.text) : String(data)
}

const root = createRootLayout("_root_").render(show)
const home = createPage("_root_/")
	.loader(() => ({ text: "Home" }))
	.render(show)
const router = createRouter({ layouts: { _root_: root }, routeTree: [{ id: "_root_/", path: "/", module: home }] })
const server = createServer({ router })

it("page", async () => {
	const response = await server.fetch(new Request("http://localhost/"))
	expect(response.status).toBe(200)
	const body = await response.text()
	expect(body).toContain("[Home]")
	expect(body).toContain("self.flare=")
})

it("miss", async () => {
	const response = await server.fetch(new Request("http://localhost/nope"))
	expect(response.status).toBe(404)
})

it("no authenticate", async () => {
	const seen: unknown[] = []
	const optional = createPage("_root_/")
		.authenticateOptional()
		.loader((ctx) => {
			seen.push(ctx.auth)
			return { text: "anonymous" }
		})
		.render(show)
	const app = createServer({
		router: createRouter({ layouts: { _root_: root }, routeTree: [{ id: "_root_/", path: "/", module: optional }] }),
	})
	const response = await app.fetch(new Request("http://localhost/"))
	expect(response.status).toBe(200)
	expect(seen).toEqual([null])
	const denied = createServer({
		router: createRouter({
			layouts: { _root_: root },
			routeTree: [{ id: "_root_/", path: "/", module: createPage("_root_/").authenticate().render(show) }],
		}),
	})
	expect((await denied.fetch(new Request("http://localhost/"))).status).toBe(401)
})

const status = async (method: string, path: string): Promise<number> =>
	(await server.fetch(new Request(`http://localhost${path}`, { method }))).status

it("methods", async () => {
	expect(await status("HEAD", "/nope")).toBe(404)
	expect(await status("POST", "/nope")).toBe(405)
	expect(await status("POST", "/")).toBe(405)
	expect(await status("OPTIONS", "/")).toBe(204)
	expect(await status("HEAD", "/")).toBe(200)
})

it("security on every status", async () => {
	const required = createPage("_root_/account").authenticate().render(show)
	const app = createServer({
		router: createRouter({
			layouts: { _root_: root },
			routeTree: [
				{ id: "_root_/", path: "/", module: home },
				{ id: "_root_/account", path: "/account", module: required },
			],
		}),
	})
	const fetchAt = (path: string, method = "GET"): Promise<Response> =>
		app.fetch(new Request(`https://localhost${path}`, { method }))
	const ok = await fetchAt("/")
	const answers = [
		await fetchAt("/missing"),
		await fetchAt("/account"),
		await fetchAt("/", "POST"),
		await fetchAt("/Account"),
	]
	expect(answers.map((response) => response.status)).toEqual([404, 401, 405, 301])
	const policy = ok.headers.get("permissions-policy")
	expect(policy).not.toBeNull()
	for (const response of answers) {
		expect(response.headers.get("content-security-policy")).toMatch(/script-src/)
		expect(response.headers.get("permissions-policy")).toBe(policy)
		expect(response.headers.get("strict-transport-security")).toBe(ok.headers.get("strict-transport-security"))
	}
})

it("state matches", async () => {
	const response = await server.fetch(new Request("http://localhost/?q=1"))
	const body = await response.text()
	expect(stateIn(body)).toEqual([
		{ id: "_root_", params: {}, search: { q: "1" }, data: null, preloader: {}, head: null, error: null },
		{ id: "_root_/", params: {}, search: { q: "1" }, data: { text: "Home" }, preloader: {}, head: null, error: null },
	])
	const tab = createPage("_root_/users/[id]/[[tab]]")
		.loader(() => ({ text: "user" }))
		.render(show)
	const users = createServer({
		router: createRouter({
			layouts: { _root_: root },
			routeTree: [{ id: "_root_/users/[id]/[[tab]]", path: "/users/[id]/[[tab]]", module: tab }],
		}),
	})
	const userBody = await (await users.fetch(new Request("http://localhost/users/42"))).text()
	expect(stateIn(userBody).map((match) => match["params"])).toEqual([{ id: "42" }, { id: "42" }])
})

async function preloaders(app: ReturnType<typeof createServer>, path: string): Promise<unknown[]> {
	const body = await (await app.fetch(new Request(`http://localhost${path}`))).text()
	return stateIn(body).map((match) => match["preloader"])
}

it("state preloader", async () => {
	const chained = createServer({
		router: createRouter({
			layouts: {
				_root_: createRootLayout("_root_")
					.preloader(() => ({ a: 1 }))
					.render(show),
				"_root_/shop": createLayout("_root_/shop")
					.preloader(() => ({ b: 2 }))
					.render(show),
			},
			routeTree: [
				{
					id: "_root_/shop/cart",
					path: "/shop/cart",
					module: createPage("_root_/shop/cart")
						.preloader(() => ({ c: 3 }))
						.render(show),
				},
			],
		}),
	})
	expect(await preloaders(chained, "/shop/cart")).toEqual([{ a: 1 }, { a: 1, b: 2 }, { a: 1, b: 2, c: 3 }])
	expect(await preloaders(server, "/")).toEqual([{}, {}])
})

// A production root renders a whole document (B37).
const tag = (component: string, children: Element): Element => createComponent(Dynamic, { component, children })
const whole = (children: Element): Element => tag("html", tag("body", children))

const framed = createRootLayout("_root_").render((props) => whole(["root[", props.children, "]"]))
const quiet: Logger = { level: "error", error: noop, warn: noop, log: noop }

function noop(): void {}

// Solid marks dynamic children with hydration comments.
function unmarked(html: string): string {
	return html.replaceAll(/<!--.*?-->/g, "")
}

function framedServer(module: RouteModule, sink = { dev: false, log: quiet }): ReturnType<typeof createServer> {
	return serveWith(
		{ router: createRouter({ layouts: { _root_: module }, routeTree: [{ id: "_root_/", path: "/", module: home }] }) },
		sink,
	)
}

it("root children", async () => {
	const body = await (await framedServer(framed).fetch(new Request("http://localhost/"))).text()
	expect(unmarked(body)).toContain("root[[Home]]")
})

it("unknown render", async () => {
	const response = await framedServer(framed).fetch(new Request("http://localhost/nope"))
	expect(response.status).toBe(404)
	expect(await response.text()).toMatch(/root\[<div[^>]*>Page not found<\/div>\]/)
})

it("unknown failure", async () => {
	const broken = createRootLayout("_root_")
		.loader(() => {
			throw new Error("root broke")
		})
		.render((props) => whole(["root[", props.children, "]"]))
	const response = await framedServer(broken).fetch(new Request("http://localhost/nope"))
	expect(response.status).toBe(500)
	const body = unmarked(await response.text())
	expect(body).toMatch(/<div[^>]*>Something went wrong<\/div>/)
	expect(body).not.toContain("root[")
})

it("boundary throw", async () => {
	const send = vi.fn<(payload: DevErrorPayload) => void>()
	const guarded = createRootLayout("_root_")
		.render((props) => ["root[", props.children, "]"])
		.errorRender(() => "root error")
	const failing = createPage("_root_/")
		.loader(() => {
			throw new Error("loader broke")
		})
		.render(show)
		.errorRender(() => {
			throw new Error("boundary broke")
		})
	const app = serveWith(
		{
			router: createRouter({
				layouts: { _root_: guarded },
				routeTree: [{ id: "_root_/", path: "/", module: failing }],
			}),
		},
		{ dev: true, send, log: quiet },
	)
	const response = await app.fetch(new Request("http://localhost/"))
	expect(response.status).toBe(500)
	expect(unmarked(await response.text())).toContain("root[root error]")
	expect(send.mock.calls.map(([payload]) => payload.err.message)).toEqual(["loader broke", "boundary broke"])
})

it("unknown no owner", async () => {
	const locale = createRootLayout("[locale]/_root_").render((props) => props.children)
	const app = serveWith(
		{ router: createRouter({ layouts: { "[locale]/_root_": locale }, routeTree: [] }) },
		{
			dev: false,
			log: quiet,
		},
	)
	const response = await app.fetch(new Request("http://localhost/"))
	expect(response.status).toBe(404)
	expect(await response.text()).toBe("")
})

function redirecting(page: RouteModule, basePath = "/") {
	const send = vi.fn<(payload: DevErrorPayload) => void>()
	const users = createPage("_root_/users/[id]").render(show)
	const router = createRouter({
		basePath,
		layouts: { _root_: framed },
		routeTree: [
			{ id: "_root_/", path: "/", module: page },
			{ id: "_root_/users/[id]", path: "/users/[id]", module: users },
		],
	})
	return { app: serveWith({ router }, { dev: true, send, log: quiet }), send }
}

it("loader redirect", async () => {
	const rendered = vi.fn<() => string>(() => "page")
	const painted = vi.fn<() => string>(() => "painted")
	const moved = createPage("_root_/")
		.loader(() =>
			redirect({ to: "_root_/users/[id]", params: { id: "7" }, search: { tab: "a" }, hash: "x", status: 302 }),
		)
		.render(rendered)
		.errorRender(painted)
	const { app, send } = redirecting(moved)
	const response = await app.fetch(new Request("https://localhost/"))
	expect(response.status).toBe(302)
	expect(response.headers.get("location")).toBe("/users/7?tab=a#x")
	expect(await response.text()).toBe("")
	expect(rendered).not.toHaveBeenCalled()
	expect(painted).not.toHaveBeenCalled()
	expect(response.headers.get("content-security-policy")).toMatch(/script-src/)
	expect(send).not.toHaveBeenCalled()
	const based = await redirecting(moved, "/app").app.fetch(new Request("https://localhost/app"))
	expect(based.headers.get("location")).toBe("/app/users/7?tab=a#x")
})

it("redirect href", async () => {
	const away = createPage("_root_/")
		.loader(() => redirect({ href: "https://example.com/a", status: 303 }))
		.render(show)
	const response = await redirecting(away).app.fetch(new Request("http://localhost/"))
	expect(response.status).toBe(303)
	expect(response.headers.get("location")).toBe("https://example.com/a")
})

function toLogin(): never {
	return redirect({ to: "_root_/login" })
}

it("redirect from auth", async () => {
	const login = createPage("_root_/login").render(show)
	const guarded = createPage("_root_/").authenticate().render(show)
	const authorized = createPage("_root_/").authorize(toLogin).render(show)
	for (const [page, authenticate] of [
		[guarded, toLogin],
		[authorized, () => ({ user: "u" })],
	] as const) {
		const router = createRouter({
			layouts: { _root_: framed },
			routeTree: [
				{ id: "_root_/", path: "/", module: page },
				{ id: "_root_/login", path: "/login", module: login },
			],
		})
		const response = await serveWith({ router, authenticate }, { dev: false, log: quiet }).fetch(
			new Request("http://localhost/"),
		)
		expect(response.status).toBe(303)
		expect(response.headers.get("location")).toBe("/login")
	}
})

function thrownBy(run: () => unknown): unknown {
	try {
		run()
	} catch (error) {
		return error
	}
	throw new Error("returned")
}

it("target kept", () => {
	const target = { to: "_root_/users/[id]", params: { id: "7" }, search: { tab: "a" }, hash: "x" }
	expect(thrownBy(() => redirect(target))).toMatchObject({ ...target, href: undefined, status: 303, replace: true })
})

function brokenAuth(): never {
	throw new Error("auth down")
}

it("authenticate throw", async () => {
	const router = createRouter({
		layouts: { _root_: framed },
		routeTree: [{ id: "_root_/", path: "/", module: createPage("_root_/").authenticate().render(show) }],
	})
	const response = await serveWith({ router, authenticate: brokenAuth }, { dev: false, log: quiet }).fetch(
		new Request("http://localhost/"),
	)
	expect(response.status).toBe(500)
	expect(response.headers.get("location")).toBeNull()
	expect(await response.text()).toBe("")
})

it("internal kinds", async () => {
	const calls: string[] = []
	const user = createPage("_root_/users/[id]")
		.loader(() => {
			calls.push("user")
			return { text: "user" }
		})
		.render(show)
	const missing = createPage("_root_/gone")
		.loader(() => notFound())
		.render(show)
	const router = createRouter({
		layouts: { _root_: framed },
		routeTree: [
			{ id: "_root_/users/[id]", path: "/users/[id]", module: user },
			{ id: "_root_/gone", path: "/gone", module: missing },
		],
	})
	const app = serveWith({ router }, { dev: false, log: quiet })
	const fetchAt = (path: string): Promise<Response> => app.fetch(new Request(`http://localhost${path}`))
	expect((await fetchAt("/users/7?_flare=isr")).status).toBe(400)
	expect((await fetchAt("/_flare/fn/abc")).status).toBe(404)
	expect((await fetchAt("/nowhere?_flare=data")).status).toBe(404)
	const named = await fetchAt("/gone?_flare=data")
	expect([named.status, named.headers.get("flare-failed")]).toEqual([404, "_root_/gone"])
	expect(framesIn(await named.text())[0]).toEqual({ t: "l", m: "_root_", d: null })
	const stale = await fetchAt("/users/7?q=1&_flare=data&_flare_stale=id%3D7%26q%3D1")
	expect(framesIn(await stale.text())).toEqual([{ t: "l", m: "_root_", d: null }, { t: "r" }, { t: "d" }])
	expect(calls).toEqual([])
})

it("lazy modules", async () => {
	const send = vi.fn<(payload: DevErrorPayload) => void>()
	const router = createRouter({
		layouts: { _root_: () => Promise.resolve(framed) },
		routeTree: [
			{ id: "_root_/", path: "/", module: () => Promise.resolve(home) },
			{ id: "_root_/broken", path: "/broken", module: () => Promise.reject(new Error("chunk missing")) },
		],
	})
	const app = serveWith({ router }, { dev: true, send, log: quiet })
	const ok = await app.fetch(new Request("http://localhost/"))
	expect(unmarked(await ok.text())).toContain("root[[Home]]")
	const broken = await app.fetch(new Request("http://localhost/broken"))
	expect(broken.status).toBe(500)
	expect(send).toHaveBeenCalledExactlyOnceWith(
		expect.objectContaining({ err: expect.objectContaining({ message: "chunk missing" }) }),
	)
})

it("method before load", async () => {
	const imported: string[] = []
	const lazy = (name: string, module: RouteModule) => () => {
		imported.push(name)
		return Promise.resolve(module)
	}
	const api = createPage("_root_/api").response(() => new Response("api"))
	const router = createRouter({
		layouts: { _root_: lazy("root", framed) },
		routeTree: [
			{ id: "_root_/", path: "/", module: lazy("home", home) },
			{ id: "_root_/api", path: "/api", response: true, methods: ["POST"], module: lazy("api", api) },
			{ id: "_root_/lie", path: "/lie", response: true, methods: ["POST"], module: lazy("lie", home) },
		],
	})
	const app = serveWith({ router }, { dev: false, log: quiet })
	const post = await app.fetch(new Request("http://localhost/", { method: "POST" }))
	expect(post.status).toBe(405)
	expect((await app.fetch(new Request("http://localhost/", { method: "OPTIONS" }))).status).toBe(204)
	const refused = await app.fetch(new Request("http://localhost/api"))
	expect([refused.status, refused.headers.get("allow"), imported]).toEqual([405, "POST, OPTIONS", []])
	const answered = await app.fetch(new Request("http://localhost/api", { method: "POST" }))
	expect(await answered.text()).toBe("api")
	expect(imported).toEqual(["root", "api"])
	expect((await app.fetch(new Request("http://localhost/lie", { method: "POST" }))).status).toBe(500)
})

it("prefetch defer", async () => {
	const late = vi.fn<() => Promise<string>>(async () => "late")
	const slow = createPage("_root_/slow")
		.loader(({ defer }) => ({ late: defer(late) }))
		.render(show)
	const app = createServer({
		router: createRouter({
			layouts: { _root_: root },
			routeTree: [{ id: "_root_/slow", path: "/slow", module: slow }],
		}),
	})
	const response = await app.fetch(new Request("http://localhost/slow?_flare=prefetch"))
	const body = await response.text()
	expect(response.status).toBe(200)
	expect(framesIn(body)).toContainEqual({ t: "l", m: "_root_/slow", d: { late: { __deferred: true, key: "d0" } } })
	expect(framesIn(body).filter((frame) => frame.t === "c")).toEqual([])
	expect(late).not.toHaveBeenCalled()
})

it("client script", async () => {
	info.entry = "/src/client.tsx"
	const withEntry = await (await createServer({ router }).fetch(new Request("http://localhost/"))).text()
	expect(withEntry).toContain('import("/src/client.tsx")')
	info.entry = undefined
	const without = await (await createServer({ router }).fetch(new Request("http://localhost/"))).text()
	expect(without).not.toContain("import(")
})

// A `.response()` function throws the root helpers as a loader does: `redirect()` answers its status and a Location
// built from the target, `notFound()` its status. A plain throw is still a bug, a 500 (BUGS.md 105).
it("response throws", async () => {
	const moved = createPage("_root_/old").response(() => redirect({ to: "_root_/", hash: "top", status: 301 }))
	const gone = createPage("_root_/gone").response(() => notFound())
	const broken = createPage("_root_/broken").response(() => {
		throw new Error("bug")
	})
	const router = createRouter({
		layouts: { _root_: root },
		routeTree: [
			{ id: "_root_/", path: "/", module: home },
			{ id: "_root_/old", path: "/old", response: true, module: moved },
			{ id: "_root_/gone", path: "/gone", response: true, module: gone },
			{ id: "_root_/broken", path: "/broken", response: true, module: broken },
		],
	})
	const app = serveWith({ router }, { dev: false, log: quiet })
	const old = await app.fetch(new Request("http://localhost/old"))
	expect([old.status, old.headers.get("location")]).toEqual([301, "/#top"])
	expect((await app.fetch(new Request("http://localhost/gone"))).status).toBe(404)
	expect((await app.fetch(new Request("http://localhost/broken"))).status).toBe(500)
})
