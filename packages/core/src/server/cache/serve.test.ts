import { createComponent, createMemo, Loading, type Element } from "solid-js"
import { Dynamic } from "@solidjs/web"
import { expect, it, vi, type Mock } from "vitest"
import { notFound } from "../../shared/errors/http.ts"
import { createPage } from "../../shared/route-builder/page.ts"
import { createRootLayout } from "../../shared/route-builder/root-layout.ts"
import { createRouter, type RouteModule } from "../../shared/router/create-router.ts"
import { useLocation } from "../../shared/components/outlet-nodes.ts"
import { serverCtx } from "../context/ctx.ts"
import type { FlareStoreEntry } from "./contract.ts"
import type { StoredPage } from "./write.ts"
import { serveWith } from "../lifecycle/create.ts"
import type { Logger } from "../lifecycle/logger.ts"
import type { FlareStore } from "./contract.ts"
import { createMemoryStore } from "./memory.ts"

function noop(): void {}

const quiet: Logger = { level: "error", error: noop, warn: noop, log: noop }

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
const SITE = "https://example.com"
const PUBLIC = "public, max-age=0, s-maxage=60"

// One page at /p. `store: false` serves it with no store.
function serve(page: RouteModule, store = true): { app: ReturnType<typeof serveWith>; set: Mock<FlareStore["set"]> } {
	const memory = createMemoryStore()
	const set = vi.fn<FlareStore["set"]>(memory.set)
	const router = createRouter({ layouts: { _root_: root }, routeTree: [{ id: "_root_/p", path: "/p", module: page }] })
	const options = store ? { router, site: SITE, store: { ...memory, set } } : { router, site: SITE }
	return { app: serveWith(options, { dev: false, log: quiet }), set }
}

const get = (path = "/p", init?: RequestInit): Request => new Request(`${SITE}${path}`, init)

// Long enough for a background write to have run.
const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 20))

// A public page with no store renders as the shared request a stored miss makes, with no search, and is written
// nowhere, so no `flare-cache` (plan 21 4.4).
it("no store", async () => {
	const seen: string[] = []
	const page = createPage("_root_/p")
		.cache({ isr: true, cdn: { maxAge: "60s" } })
		.loader(({ request }) => void seen.push(request.url))
		.render(() => "p")
	const response = await serve(page, false).app.fetch(get("/p?q=1"))
	expect(response.headers.get("cache-control")).toBe(PUBLIC)
	expect(response.headers.has("flare-cache")).toBe(false)
	expect(seen).toEqual([`${SITE}/p`])
})

// A stored page's resolve value runs once, in the store write: the stored document's state and its data variant carry
// it inline with no `c` frame, and the fill, which runs only the holes, sends it as `kept` (BUGS.md 94).
it("resolve runs once", async () => {
	const latest = vi.fn<() => Promise<string>>(async () => "1.0.0")
	const late = vi.fn<() => Promise<string>>(async () => "late")
	const page = createPage("_root_/p")
		.cache({ isr: { defer: "stream" } })
		.loader(({ defer }) => ({ latest: defer(latest, { key: "latest", prerender: "resolve" }), late: defer(late) }))
		.render(() => "p")
	const { app } = serve(page)
	const inline = '"latest":{"__deferred":true,"key":"latest","value":"1.0.0"}'
	expect(await (await app.fetch(get("/p"))).text()).toContain(inline)
	await settle()
	const data = await app.fetch(get("/p?_flare=data"))
	expect(data.headers.get("flare-cache")).toBe("hit")
	const frames = await data.text()
	expect(frames).toContain(inline)
	expect(frames).not.toContain('"t":"c"')
	const fill = await (await app.fetch(get("/p?_flare=fill"))).text()
	expect(fill).toContain('"latest":{"__deferred":true,"key":"latest","kept":true}')
	expect(fill).toContain('"t":"c","m":"_root_/p","k":"d0","d":"late"')
	expect(fill).not.toContain('"k":"latest"')
	expect(latest).toHaveBeenCalledOnce()
	expect(late).toHaveBeenCalledOnce()
})

// A data request's miss runs the same shared render and serves the NDJSON it stored. A prefetch then reads that
// same entry: one key holds both variants (02-system step 11).
it("data miss", async () => {
	const page = createPage("_root_/p")
		.cache({ isr: true, cdn: { maxAge: "60s" } })
		.loader(() => ({ text: "p" }))
		.render(() => "p")
	const { app, set } = serve(page)
	const miss = await app.fetch(get("/p?_flare=data"))
	const body = await miss.text()
	expect(miss.headers.get("content-type")).toContain("ndjson")
	expect(miss.headers.get("flare-cache")).toBe("miss")
	expect(miss.headers.get("cache-control")).toBe(PUBLIC)
	expect((await written(set)).ndjson).toBe(body)
	const hit = await app.fetch(get("/p?_flare=prefetch"))
	expect(hit.headers.get("flare-cache")).toBe("hit")
	expect(await hit.text()).toBe(body)
})

// A shared render that is not a clean 200 answers as a live one would and stores nothing.
it("not stored", async () => {
	const missing = createPage("_root_/p")
		.cache({ isr: true })
		.loader(() => notFound())
		.render(() => "p")
	const { app, set } = serve(missing)
	expect((await app.fetch(get())).status).toBe(404)
	expect((await app.fetch(get("/p?_flare=data"))).status).toBe(404)
	const broken = createPage("_root_/p")
		.cache({ isr: true })
		.render(() => {
			throw new Error("render broke")
		})
	const failing = serve(broken)
	expect((await failing.app.fetch(get())).status).toBe(500)
	await settle()
	expect(set).not.toHaveBeenCalled()
	expect(failing.set).not.toHaveBeenCalled()
})

function slot(read: () => Promise<unknown>): Element {
	return createComponent(Loading, {
		fallback: "waiting",
		get children() {
			const value = createMemo(async () => read())
			return [() => String(value())]
		},
	})
}

// A "resolve" value that rejects is not stored, and the answer leaves private, as a deferred error frame does.
it("rejected resolve", async () => {
	const page = createPage("_root_/p")
		.cache({ isr: true, cdn: { maxAge: "60s" } })
		.loader(({ defer }) => ({ late: defer(() => Promise.reject(new Error("late"))) }))
		.render((props) => slot(() => props.loaderData.late.promise.catch(() => "fallback")))
	const { app, set } = serve(page)
	for (const path of ["/p", "/p?_flare=data"]) {
		const response = await app.fetch(get(path))
		expect(response.status).toBe(200)
		expect(response.headers.get("cache-control")).toBe("private, no-store")
	}
	await settle()
	expect(set).not.toHaveBeenCalled()
})

// What the store received, once the background write has run.
async function written(set: Mock<FlareStore["set"]>): Promise<StoredPage> {
	await vi.waitFor(() => expect(set).toHaveBeenCalled())
	const entry: FlareStoreEntry | undefined = set.mock.calls.at(-1)?.[1]
	return entry?.data as StoredPage
}

// The render, not only the loaders, runs on the shared request: the visitor's search never reaches the entry.
it("render location", async () => {
	const page = createPage("_root_/p")
		.cache({ isr: true })
		.render(() => `SEARCH${JSON.stringify(useLocation().search)}`)
	const { app, set } = serve(page)
	const body = await (await app.fetch(get("/p?secret=alice"))).text()
	const stored = await written(set)
	expect(stored.html).not.toContain("alice")
	expect(body).not.toContain("alice")
	expect(stored.html).toContain("SEARCH{}")
})

// serverContext runs again for the shared request, with the same env, so no visitor cookie reaches the entry.
it("server context", async () => {
	const page = createPage("_root_/p")
		.cache({ isr: true })
		.loader(() => ({ who: String(serverCtx()) }))
		.render((props) => `WHO[${props.loaderData.who}|${String(serverCtx())}]`)
	const memory = createMemoryStore()
	const set = vi.fn<FlareStore["set"]>(memory.set)
	const envs: unknown[] = []
	const app = serveWith(
		{
			router: createRouter({ layouts: { _root_: root }, routeTree: [{ id: "_root_/p", path: "/p", module: page }] }),
			site: SITE,
			store: { ...memory, set },
			serverContext: ({ request, env }) => {
				envs.push(env)
				return request.headers.get("cookie") ?? "nobody"
			},
		},
		{ dev: false, log: quiet },
	)
	const env = { E: 1 }
	const body = await (await app.fetch(get("/p", { headers: { cookie: "user=alice" } }), env)).text()
	const stored = await written(set)
	expect(stored.html).toContain("WHO[nobody|nobody]")
	expect(body).toContain("WHO[nobody|nobody]")
	expect(envs).toEqual([env, env])
})

// A miss serves exactly what a hit would: the entry's HTML with its sentinel replaced by this request's nonce.
it("miss as hit", async () => {
	const page = createPage("_root_/p")
		.cache({ isr: true })
		.render(() => "p")
	const { app, set } = serve(page)
	const response = await app.fetch(get())
	const body = await response.text()
	const stored = await written(set)
	const nonce = /'nonce-([^']+)'/.exec(response.headers.get("content-security-policy") ?? "")?.[1] ?? ""
	expect(body).toBe(stored.html.replaceAll(stored.sentinel, nonce))
	expect([...body.matchAll(/nonce="([^"]+)"/g)].map((found) => found[1])).not.toContain(undefined)
	for (const found of body.matchAll(/nonce="([^"]+)"/g)) expect(found[1]).toBe(nonce)
})

// The shell is read until `</html>`, however Solid chunks it.
it("long shell", async () => {
	const page = createPage("_root_/p")
		.cache({ isr: true })
		.render(() => "x".repeat(300_000))
	const { app, set } = serve(page)
	const body = await (await app.fetch(get())).text()
	const stored = await written(set)
	expect(stored.html.trimEnd().endsWith("</html>")).toBe(true)
	expect(body.trimEnd().endsWith("</html>")).toBe(true)
	expect(body).toContain("x".repeat(300_000))
})

// A `serverContext` that throws for the shared request gives nothing to store: the visitor's request renders live.
it("shared context throws", async () => {
	const page = createPage("_root_/p")
		.cache({ isr: true })
		.render(() => `CTX[${String(serverCtx())}]`)
	const memory = createMemoryStore()
	const set = vi.fn<FlareStore["set"]>(memory.set)
	const app = serveWith(
		{
			router: createRouter({ layouts: { _root_: root }, routeTree: [{ id: "_root_/p", path: "/p", module: page }] }),
			site: SITE,
			store: { ...memory, set },
			serverContext: ({ request }) => {
				const cookie = request.headers.get("cookie")
				if (cookie === null) throw new Error("no cookie")
				return cookie
			},
		},
		{ dev: false, log: quiet },
	)
	const response = await app.fetch(get("/p", { headers: { cookie: "user=alice" } }))
	expect(await response.text()).toContain("CTX[user=alice]")
	expect(response.headers.has("flare-cache")).toBe(false)
	await settle()
	expect(set).not.toHaveBeenCalled()
})
