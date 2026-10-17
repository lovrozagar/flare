import { createComponent, type Element } from "solid-js"
import { Dynamic } from "@solidjs/web"
import { expect, it, vi, type Mock } from "vitest"
import type { FlareStore } from "../../src/server/cache/contract.ts"
import { createMemoryStore } from "../../src/server/cache/memory.ts"
import { createRevalidateFn, revalidate } from "../../src/server/cache/revalidate.ts"
import { createServer } from "../../src/server/lifecycle/create.ts"
import { createLayout } from "../../src/shared/route-builder/layout.ts"
import { createPage } from "../../src/shared/route-builder/page.ts"
import { createRootLayout } from "../../src/shared/route-builder/root-layout.ts"
import { createRouter, type RouteModule } from "../../src/shared/router/create-router.ts"
import { stateIn } from "../../src/server/wire.fixture.ts"

const SITE = "https://example.com"

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

const root = createRootLayout("_root_").render((props) => documentOf(props.children))

// One page at /p over a memory store whose writes are watched. A layout, when given, sits between root and page.
function serve(
	page: RouteModule,
	extra: { layout?: RouteModule; authenticate?: (ctx: { request: Request }) => {} | null } = {},
): {
	app: ReturnType<typeof createServer>
	store: FlareStore
	set: Mock<FlareStore["set"]>
} {
	const memory = createMemoryStore()
	const set = vi.fn<FlareStore["set"]>(memory.set)
	const store = { ...memory, set }
	const layouts: Record<string, RouteModule> = { _root_: root }
	if (extra.layout !== undefined) layouts["_root_/(g)"] = extra.layout
	const id = extra.layout === undefined ? "_root_/p" : "_root_/(g)/p"
	const router = createRouter({ layouts, routeTree: [{ id, path: "/p", module: page }] })
	return { app: createServer({ router, site: SITE, store, authenticate: extra.authenticate }), store, set }
}

// A cookie the route sets without `allowCookies` makes the answer private, and nothing is stored (dx/cache.md).
it("set-cookie", async () => {
	const page = createPage("_root_/p")
		.cache({ isr: true, cdn: { maxAge: "60s" } })
		.headers(() => ({ "set-cookie": "r=1" }))
		.render(() => "p")
	const { app, set } = serve(page)
	const response = await app.fetch(new Request(`${SITE}/p`))
	expect(response.headers.get("cache-control")).toBe("private, no-store")
	expect(response.headers.getSetCookie()).toEqual(["r=1"])
	await new Promise((resolve) => setTimeout(resolve, 10))
	expect(set).not.toHaveBeenCalled()
})

const KEY = "static:dev:_root_/p"

// A stored record built by hand, as a write leaves it, fresh at `Date.now()`.
function storedRecord(text: string): { data: unknown; storedAt: number; tags: string[] } {
	const sentinel = "__FLARE_NONCE_00000000000000000000000000000000"
	const html = `<html><head></head><body>${text}<script id="flare-state" nonce="${sentinel}">self.flare={"matches":[],"nonce":"${sentinel}"}</script></body></html>`
	const data = { html, ndjson: '{"t":"r"}\n{"t":"d"}\n', headers: [], security: {}, sentinel, render: "isr" }
	return { data, storedAt: Date.now(), tags: [] }
}

// A required chain is never shared, so a 401 is never stored: the next request authenticates again (B27).
it("401 not stored", async () => {
	const authenticate = vi.fn<() => {} | null>(() => null)
	const layout = createLayout("_root_/(g)")
		.authenticate()
		.render((props) => props.children)
	const page = createPage("_root_/(g)/p")
		.cache({ isr: true })
		.render(() => "p")
	const { app, set } = serve(page, { layout, authenticate })
	expect((await app.fetch(new Request(`${SITE}/p`))).status).toBe(401)
	expect((await app.fetch(new Request(`${SITE}/p`))).status).toBe(401)
	expect(authenticate).toHaveBeenCalledTimes(2)
	expect(set).not.toHaveBeenCalled()
})

// `authorize` runs, after preloader, before the read. `false` is 403 and the stored body is not used (B73).
it("authorize before hit", async () => {
	const page = createPage("_root_/p")
		.cache({ isr: true })
		.authorize(() => false)
		.render(() => "p")
	const { app, store } = serve(page)
	await store.set(KEY, storedRecord("SECRET"))
	const response = await app.fetch(new Request(`${SITE}/p`))
	expect(response.status).toBe(403)
	expect(await response.text()).not.toContain("SECRET")
	const data = await app.fetch(new Request(`${SITE}/p?_flare=data`))
	expect(data.status).toBe(403)
	expect(await data.text()).not.toContain("SECRET")
	// An authorize that passes reaches the read, and the stored body is served.
	const allowed = createPage("_root_/p")
		.cache({ isr: true })
		.authorize(() => true)
		.render(() => "p")
	const open = serve(allowed)
	await open.store.set(KEY, storedRecord("SHARED"))
	const hit = await open.app.fetch(new Request(`${SITE}/p`))
	expect(hit.headers.get("flare-cache")).toBe("hit")
	expect(await hit.text()).toContain("SHARED")
})

it("hit without authorize", async () => {
	const page = createPage("_root_/p")
		.cache({ isr: true })
		.render(() => "p")
	const { app, store } = serve(page)
	await store.set(KEY, storedRecord("STORED"))
	const response = await app.fetch(new Request(`${SITE}/p`))
	expect(response.headers.get("flare-cache")).toBe("hit")
	expect(await response.text()).toContain("STORED")
})

// An optional-auth page stores its anonymous render. The next anonymous request is a hit with no session text.
it("anonymous stored", async () => {
	const page = createPage("_root_/p")
		.cache({ isr: true })
		.authenticateOptional()
		.loader(({ auth }) => ({ who: auth === null ? "anonymous" : "SESSION" }))
		.render((props) => props.loaderData.who)
	const { app, set } = serve(page, { authenticate: () => null })
	await app.fetch(new Request(`${SITE}/p`))
	await vi.waitFor(() => expect(set).toHaveBeenCalled())
	const second = await app.fetch(new Request(`${SITE}/p`))
	expect(second.headers.get("flare-cache")).toBe("hit")
	const body = await second.text()
	expect(body).toContain("anonymous")
	expect(body).not.toContain("SESSION")
})

const bearer = ({ request }: { request: Request }): {} | null => request.headers.get("authorization")

// A request with a session is private and renders live. Neither user ever receives the other's body.
it("two users", async () => {
	const page = createPage("_root_/p")
		.cache({ isr: true })
		.authenticateOptional()
		.loader(({ auth }) => ({ who: auth === null ? "anonymous" : String(auth) }))
		.render((props) => `USER[${props.loaderData.who}]`)
	const { app } = serve(page, { authenticate: bearer })
	const as = (token: string) => app.fetch(new Request(`${SITE}/p`, { headers: { authorization: token } }))
	for (let round = 0; round < 2; round += 1) {
		const alice = await (await as("alice-token")).text()
		const bob = await (await as("bob-token")).text()
		expect(alice).toContain("USER[alice-token]")
		expect(alice).not.toContain("bob-token")
		expect(bob).toContain("USER[bob-token]")
		expect(bob).not.toContain("alice-token")
	}
})

const listed = () => [{ slug: "a" }]

function post(store = createMemoryStore()): {
	app: ReturnType<typeof createServer>
	set: Mock<FlareStore["set"]>
	store: FlareStore
} {
	const set = vi.fn<FlareStore["set"]>(store.set)
	const page = createPage("_root_/post/[slug]")
		.cache({ isr: { params: listed, dynamicParams: false } })
		.render(() => "post")
	const router = createRouter({
		layouts: { _root_: root },
		routeTree: [{ id: "_root_/post/[slug]", path: "/post/[slug]", module: page }],
	})
	return { app: createServer({ router, site: SITE, store: { ...store, set } }), set, store }
}

// `dynamicParams: false` 404s a slug `params()` did not return, on the document and the data URL, and never
// stores it: a second request is still the router's 404, not a stored 200.
it("not found", async () => {
	const { app, set } = post()
	for (let round = 0; round < 2; round += 1) {
		expect((await app.fetch(new Request(`${SITE}/post/b`))).status).toBe(404)
		expect((await app.fetch(new Request(`${SITE}/post/b?_flare=data`))).status).toBe(404)
	}
	expect(set).not.toHaveBeenCalled()
	expect((await app.fetch(new Request(`${SITE}/post/a`))).status).toBe(200)
})

// A listed slug whose tombstone is newer renders live, and the body may be stored again.
it("purged listed", async () => {
	const memory = createMemoryStore()
	await memory.delete("static:dev:_root_/post/[slug]:a")
	const { app, set } = post(memory)
	const response = await app.fetch(new Request(`${SITE}/post/a`))
	expect(response.headers.get("flare-cache")).toBe("miss")
	expect(await response.text()).toContain("post")
	await vi.waitFor(() => expect(set).toHaveBeenCalledOnce())
})

const encoder = new TextEncoder()

// dx/cache.md's webhook recipe. The header and the expected one are hashed to equal-length digests and compared in
// full, so the time taken never tells a caller how much of a guess matched; an unset secret matches nothing.
async function authorized(header: string | null, secret: string | undefined): Promise<boolean> {
	if (header === null || secret === undefined || secret === "") return false
	const texts = [header, `Bearer ${secret}`]
	const digests = await Promise.all(texts.map((text) => crypto.subtle.digest("SHA-256", encoder.encode(text))))
	const [left, right] = digests.map((digest) => new Uint8Array(digest))
	let difference = 0
	for (const [index, byte] of (left ?? []).entries()) difference |= byte ^ (right?.[index] ?? 0)
	return difference === 0
}

const hook = createPage("_root_/hook").response(
	async ({ request, env }) => {
		const header = request.headers.get("authorization")
		if (!(await authorized(header, Reflect.get(Object(env), "REVALIDATE_SECRET")))) {
			return new Response(null, { status: 401 })
		}
		const body: unknown = await request.json()
		const tags: unknown = Reflect.get(Object(body), "tags")
		if (!Array.isArray(tags) || !tags.every((tag) => typeof tag === "string") || tags.length === 0) {
			return new Response(null, { status: 400 })
		}
		await revalidate({ tags })
		return new Response(null, { status: 204 })
	},
	{ methods: ["POST"] },
)

// A CMS webhook: a wrong or missing secret is 401 and purges nothing; the right one answers once the purge is
// written, and the next visit renders fresh (plan 21 16.2).
it("webhook purge", async () => {
	let renders = 0
	const page = createPage("_root_/p")
		.cache({ ssr: { ttl: "1h", staleTime: "1h", tags: ["posts"] } })
		.loader(() => ({ render: (renders += 1) }))
		.render(() => "p")
	const router = createRouter({
		layouts: { _root_: root },
		routeTree: [
			{ id: "_root_/p", path: "/p", module: page },
			{ id: "_root_/hook", path: "/hook", module: hook },
		],
	})
	const app = createServer({ router, site: SITE, store: createMemoryStore() })
	const env = { REVALIDATE_SECRET: "s3cret" }
	const visit = () => app.fetch(new Request(`${SITE}/p`), env)
	const call = (authorization: string) =>
		app.fetch(
			new Request(`${SITE}/hook`, { method: "POST", headers: { authorization }, body: '{"tags":["posts"]}' }),
			env,
		)
	await visit()
	await vi.waitFor(async () => expect((await visit()).headers.get("flare-cache")).toBe("hit"))
	const stored = renders
	for (const wrong of ["Bearer nope", "Bearer s3cre", "s3cret", "Bearer s3cret2", ""]) {
		expect((await call(wrong)).status).toBe(401)
	}
	expect((await visit()).headers.get("flare-cache")).toBe("hit")
	expect(renders).toBe(stored)
	expect((await call("Bearer s3cret")).status).toBe(204)
	expect((await visit()).headers.get("flare-cache")).toBe("miss")
	expect(renders).toBe(stored + 1)
	const unset = createServer({ router, site: SITE, store: createMemoryStore() })
	const empty = new Request(`${SITE}/hook`, { method: "POST", headers: { authorization: "Bearer " }, body: "{}" })
	expect((await unset.fetch(empty, {})).status).toBe(401)
})

// A purge outside a request names a stored page by its route and params: `server.cache.key` gives the key a request
// to it is stored under, `server.buildId` the build it carries, and createRevalidateFn's key purge then misses the
// next visit. Another param's page stays a hit, and an id the router has no page for throws (plan 21 4.5).
it("key purge", async () => {
	let renders = 0
	const page = createPage("_root_/post/[slug]")
		.cache({ ssr: { ttl: "1h", staleTime: "1h" } })
		.loader(() => ({ render: (renders += 1) }))
		.render(() => "post")
	const router = createRouter({
		layouts: { _root_: root },
		routeTree: [{ id: "_root_/post/[slug]", path: "/post/[slug]", module: page }],
	})
	const store = createMemoryStore()
	const app = createServer({ router, site: SITE, store })
	expect(app.buildId).toBe("dev")
	const key = app.cache.key({ to: "_root_/post/[slug]", params: { slug: "a b" } } as never)
	expect(key).toBe("static:dev:_root_/post/[slug]:a%2520b")
	const visit = (slug: string) => app.fetch(new Request(`${SITE}/post/${encodeURIComponent(slug)}`))
	for (const slug of ["a b", "c"]) {
		await visit(slug)
		await vi.waitFor(async () => expect((await visit(slug)).headers.get("flare-cache")).toBe("hit"))
	}
	await createRevalidateFn(store)({ keys: [key] })
	expect((await visit("a b")).headers.get("flare-cache")).toBe("miss")
	expect((await visit("c")).headers.get("flare-cache")).toBe("hit")
	expect(() => app.cache.key({ to: "_root_/nope" } as never)).toThrow("cache.key: _root_/nope is not a page")
})

// Loader data holding a closing script tag and a new script is stored and replayed as text: the hit opens no script of
// its own, exactly as the live render did not (plan 21 7.3).
it("hostile state hit", async () => {
	const hostile = "</script><script>alert(1)</script><!--"
	const page = createPage("_root_/p")
		.cache({ ssr: { ttl: "1h", staleTime: "1h" } })
		.loader(() => ({ text: hostile }))
		.render(() => "p")
	const { app } = serve(page)
	const miss = await app.fetch(new Request(`${SITE}/p`))
	await vi.waitFor(async () =>
		expect((await app.fetch(new Request(`${SITE}/p`))).headers.get("flare-cache")).toBe("hit"),
	)
	const hit = await app.fetch(new Request(`${SITE}/p`))
	for (const body of [await miss.text(), await hit.text()]) {
		expect(body).not.toContain("<script>alert")
		expect(stateIn(body).at(-1)?.["data"]).toEqual({ text: hostile })
	}
})
