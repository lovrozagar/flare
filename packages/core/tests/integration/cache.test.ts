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
import { buildUrl } from "../../src/shared/url/href.ts"
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

// A listed slug that needs percent-encoding is served at the URL prerender writes for it, `buildUrl`'s; the same URL
// in lowercase hex redirects there (BUGS.md 388).
it("listed encoded", async () => {
	const slugs = [{ slug: "a b" }, { slug: "é" }]
	const page = createPage("_root_/post/[slug]")
		.cache({ ssg: () => slugs })
		.render(() => "post")
	const router = createRouter({
		layouts: { _root_: root },
		routeTree: [{ id: "_root_/post/[slug]", path: "/post/[slug]", module: page }],
	})
	const app = createServer({ router, site: SITE, store: createMemoryStore() })
	const urls = [...slugs.map((params) => buildUrl({ to: "_root_/post/[slug]", params })), "/post/%c3%a9"]
	const statuses = await Promise.all(urls.map(async (url) => (await app.fetch(new Request(`${SITE}${url}`))).status))
	expect([urls, statuses]).toEqual([
		["/post/a%20b", "/post/%C3%A9", "/post/%c3%a9"],
		[200, 200, 301],
	])
})

// A stored page never keeps the route's validators: an `ETag` or `Last-Modified` the server would ignore on
// `If-None-Match` or `If-Modified-Since` is sent on neither the miss nor the hit (BUGS.md 399).
it("no validators stored", async () => {
	const page = createPage("_root_/v")
		.cache({ ssr: { ttl: "1h" } })
		.headers(() => ({ etag: '"v1"', "last-modified": "Wed, 21 Oct 2026 07:28:00 GMT", "x-kept": "1" }))
		.render(() => "v")
	const router = createRouter({ layouts: { _root_: root }, routeTree: [{ id: "_root_/v", path: "/v", module: page }] })
	const app = createServer({ router, site: SITE, store: createMemoryStore() })
	const sent = []
	const asked: Record<string, string>[] = [{}, { "if-none-match": '"v1"' }]
	for (const headers of asked) {
		const response = await app.fetch(new Request(`${SITE}/v`, { headers }))
		const read = (name: string) => response.headers.get(name)
		sent.push([response.status, read("flare-cache"), read("etag"), read("last-modified"), read("x-kept")])
		await response.text()
	}
	expect(sent).toEqual([
		[200, "miss", null, null, "1"],
		[200, "hit", null, null, "1"],
	])
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
		// A body that is not JSON is the 400 below, not a render error (BUGS.md 400).
		const body: unknown = await request.json().catch(() => undefined)
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
	const call = (authorization: string, body = '{"tags":["posts"]}') =>
		app.fetch(new Request(`${SITE}/hook`, { method: "POST", headers: { authorization }, body }), env)
	await visit()
	await vi.waitFor(async () => expect((await visit()).headers.get("flare-cache")).toBe("hit"))
	const stored = renders
	for (const wrong of ["Bearer nope", "Bearer s3cre", "s3cret", "Bearer s3cret2", ""]) {
		expect((await call(wrong)).status).toBe(401)
	}
	// A body that is not JSON, or none, is the recipe's 400, not a logged render error (BUGS.md 400).
	const logged = vi.spyOn(console, "error").mockImplementation(() => undefined)
	for (const body of ["not json", "", "null", '{"tags":[]}'])
		expect([body, (await call("Bearer s3cret", body)).status]).toEqual([body, 400])
	expect(logged).not.toHaveBeenCalled()
	logged.mockRestore()
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

// The webhook route answers only POST: a GET or HEAD is 405 naming `POST, OPTIONS`, and an OPTIONS is 204 (dx/cache.md
// Purge from a webhook, BUGS.md 208).
it("webhook methods", async () => {
	const router = createRouter({
		layouts: { _root_: root },
		routeTree: [{ id: "_root_/hook", path: "/hook", module: hook }],
	})
	const app = createServer({ router, site: SITE, store: createMemoryStore() })
	const answers = []
	for (const method of ["GET", "HEAD", "OPTIONS"]) {
		const response = await app.fetch(new Request(`${SITE}/hook`, { method }), { REVALIDATE_SECRET: "s3cret" })
		answers.push([method, response.status, response.headers.get("allow")])
	}
	expect(answers).toEqual([
		["GET", 405, "POST, OPTIONS"],
		["HEAD", 405, "POST, OPTIONS"],
		["OPTIONS", 204, "POST, OPTIONS"],
	])
})

// Outside dev, an ssg page with no `static` store renders per request and logs that once, at error level, for each
// server; and a page's `params()` list is called once per process and function, however many servers read it.
it("ssg production reads", async () => {
	vi.stubEnv("DEV", false)
	vi.stubEnv("PROD", true)
	const logged = vi.spyOn(console, "error").mockImplementation(() => undefined)
	try {
		const params = vi.fn<() => Array<{ slug: string }>>(() => [{ slug: "a" }])
		const page = createPage("_root_/s/[slug]")
			.cache({ ssg: params })
			.render(() => "s")
		const router = createRouter({
			layouts: { _root_: root },
			routeTree: [{ id: "_root_/s/[slug]", path: "/s/[slug]", module: page }],
		})
		const servers = [createServer({ router, site: SITE }), createServer({ router, site: SITE })]
		const statuses = []
		for (const app of [...servers, ...servers]) statuses.push((await app.fetch(new Request(`${SITE}/s/a`))).status)
		const lines = logged.mock.calls.filter((call) => call.some((part) => String(part).includes("has no static store")))
		expect([statuses, lines.length, params.mock.calls.length]).toEqual([[200, 200, 200, 200], 2, 1])
	} finally {
		logged.mockRestore()
		vi.unstubAllEnvs()
	}
})
