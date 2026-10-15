import { createComponent, createMemo, Loading, type Element } from "solid-js"
import { Dynamic } from "@solidjs/web"
import { expect, expectTypeOf, it, vi, type Mock } from "vitest"
import { useDeferred } from "../../shared/components/index.ts"
import type { CacheConfig } from "../../shared/route-builder/chain.ts"
import type { Deferred } from "../../shared/route-builder/register.ts"
import { createPage } from "../../shared/route-builder/page.ts"
import { createRootLayout } from "../../shared/route-builder/root-layout.ts"
import { createRouter, type RouteModule } from "../../shared/router/create-router.ts"
import { prerendererOf } from "../../shared/protocol/prerender.ts"
import { serveWith } from "../lifecycle/create.ts"
import type { Logger } from "../lifecycle/logger.ts"
import type { FlareStore, FlareStoreEntry } from "./contract.ts"
import { createMemoryStore } from "./memory.ts"
import { fromSentinel } from "./nonce.ts"
import { buildEntry, entryTags, storeTiming, type EntryInput, type StoredPage } from "./write.ts"

// The server build's sheet. The source module is empty.
vi.mock("../../shared/css/sheet.ts", () => ({ builtSheet: ".a{color:red}.unused{color:blue}" }))

const SECOND = 1000
const HOUR = 3600 * SECOND

// A set `revalidate` stores for twice that, and the entry turns stale at `revalidate` (B47).
it("ttl", () => {
	expect(storeTiming("r", { isr: { revalidate: "60s" } })).toEqual({ ttl: 120 * SECOND, stale: 60 * SECOND })
})

it("ttl cap", () => {
	expect(storeTiming("r", { isr: { revalidate: "30d" } })).toEqual({ ttl: 24 * HOUR, stale: 24 * HOUR })
})

it("ssr ttl", () => {
	expect(storeTiming("r", { ssr: { ttl: "60s" } })).toEqual({ ttl: 60 * SECOND, stale: 0 })
	expect(storeTiming("r", { ssr: { ttl: "60s", staleTime: "10s" } })).toEqual({ ttl: 60 * SECOND, stale: 10 * SECOND })
})

// `ttl` is required in the type. Untyped, the server's check names the route.
it("ssr ttl missing", async () => {
	expectTypeOf<{ ssr: object }>().not.toExtend<CacheConfig>()
	const untyped: unknown = { ssr: {} }
	expect(() => storeTiming("_root_/p", untyped as CacheConfig)).toThrow(/_root_\/p: cache\.ssr needs a ttl/)
	await answers500(untyped)
})

it("stale over ttl", async () => {
	expect(() => storeTiming("_root_/p", { ssr: { ttl: "1m", staleTime: "2m" } })).toThrow(
		/_root_\/p: cache\.ssr\.staleTime is longer than its ttl/,
	)
	await answers500({ ssr: { ttl: "1m", staleTime: "2m" } })
})

// On demand: 24 hours, and nothing turns stale before then (B47).
it("on demand", () => {
	expect(storeTiming("r", { isr: true })).toEqual({ ttl: 24 * HOUR, stale: 24 * HOUR })
})

it("empty object", () => {
	expect(storeTiming("r", { isr: {} })).toEqual(storeTiming("r", { isr: true }))
})

it("revalidate omitted", () => {
	expect(storeTiming("r", { isr: { params: () => [{ id: "1" }] } })).toEqual({ ttl: 24 * HOUR, stale: 24 * HOUR })
})

// A page with no mode, or `ssg`, has no mutable-store timing: ssg is read from the static seeds.
it("no timing", () => {
	expect(storeTiming("r", { ssg: true })).toBeUndefined()
	expect(storeTiming("r", undefined)).toBeUndefined()
})

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

// A server with one page at /p, a memory store whose `set` is watched, and a sink that keeps each bug.
function storing(
	page: RouteModule,
	dev = true,
	log: Logger = quiet,
): {
	server: ReturnType<typeof serveWith>
	set: Mock<FlareStore["set"]>
	bugs: string[]
} {
	const store = createMemoryStore()
	const set = vi.fn<FlareStore["set"]>(store.set)
	const bugs: string[] = []
	const router = createRouter({ layouts: { _root_: root }, routeTree: [{ id: "_root_/p", path: "/p", module: page }] })
	const server = serveWith(
		{ router, site: SITE, store: { ...store, set } },
		{ dev, log, send: (payload) => void bugs.push(payload.err.message) },
	)
	return { server, set, bugs }
}

// The entry the store received, once the background write has run.
async function stored(
	set: Mock<FlareStore["set"]>,
): Promise<{ key: string; entry: FlareStoreEntry; page: StoredPage }> {
	await vi.waitFor(() => expect(set).toHaveBeenCalled())
	const [key, entry] = set.mock.calls.at(-1) as [string, FlareStoreEntry]
	return { key, entry, page: entry.data as StoredPage }
}

// A slot under `<Loading>` that reads one async value.
function slot(read: () => Promise<unknown>, fallback: string): Element {
	return createComponent(Loading, {
		fallback,
		get children() {
			const value = createMemo(async () => read())
			return [() => String(value())]
		},
	})
}

// A slot that reads a deferred value through useDeferred, the way dx/defer.md shows. A stored `"stream"` hole is then
// a client source, so the server renders its fallback and holds no boundary open.
function deferredSlot(read: () => Deferred<unknown>, fallback: string): Element {
	return createComponent(Loading, {
		fallback,
		get children() {
			const value = useDeferred(read)
			return [() => String(value())]
		},
	})
}

const entryOf = (input: Partial<EntryInput> = {}): FlareStoreEntry | undefined =>
	buildEntry({
		status: 200,
		// Not hex, so no random sentinel can contain it.
		html: '<html><body><script nonce="xyz">x()</script><script>self.flare={"matches":[],"nonce":"xyz"}</script></body></html>',
		ndjson: '{"t":"l","m":"p","d":{}}\n{"t":"r"}\n{"t":"d"}\n',
		settled: true,
		headers: { "x-robots-tag": "noindex" },
		security: {},
		nonce: "xyz",
		render: "isr",
		startedAt: 1000,
		tags: ["t"],
		...input,
	})

it("2xx complete", () => {
	const entry = entryOf()
	expect(entry?.storedAt).toBe(1000)
	expect(entry?.tags).toEqual(["t"])
	expect((entry as FlareStoreEntry).data).toMatchObject({ render: "isr" })
})

const byId = ({ params }: { params: Record<string, string | string[]> }) => [`post:${String(params["id"])}`, "posts"]

// The entry's tags are `ssr.tags` and the merged `cdn.tags`, resolved with the raw params, deduped.
it("entry tags", () => {
	expect(entryTags([["posts", "home"], byId, undefined], { id: "7" })).toEqual(["posts", "home", "post:7"])
})

it("401", () => {
	expect(entryOf({ status: 401 })).toBeUndefined()
})

it("403", () => {
	expect(entryOf({ status: 403 })).toBeUndefined()
})

it("404", () => {
	expect(entryOf({ status: 404 })).toBeUndefined()
})

it("redirect", () => {
	expect(entryOf({ status: 302 })).toBeUndefined()
})

it("incomplete", () => {
	expect(entryOf({ html: "<div>" })).toBeUndefined()
	expect(entryOf({ html: "<html><body>" })).toBeUndefined()
})

// A data variant with an error frame, or a "resolve" value that rejected, is not a finished body (B46, B92).
it("data not ok", () => {
	expect(
		entryOf({ ndjson: '{"t":"l","m":"p","d":{}}\n{"t":"e","m":"p","e":{"message":"x"}}\n{"t":"d"}\n' }),
	).toBeUndefined()
	expect(entryOf({ settled: false })).toBeUndefined()
})

it("storedAt", () => {
	vi.useFakeTimers({ now: 6000 })
	expect(entryOf({ startedAt: 1000 })?.storedAt).toBe(1000)
	vi.useRealTimers()
})

it("location stripped", () => {
	const page = entryOf({ headers: { location: "/x", "x-robots-tag": "noindex" } })?.data as StoredPage
	expect(page.headers).toEqual([["x-robots-tag", "noindex"]])
})

// Security headers, Set-Cookie, Cache-Control, and Cache-Tag are never stored. The route's `.security()` config is,
// so a hit rebuilds the set with its own nonce.
it("security stripped", () => {
	const page = entryOf({
		headers: {
			"content-security-policy": "default-src 'none'",
			"x-frame-options": "DENY",
			"set-cookie": ["a=1"],
			"cache-control": "public",
			"cache-tag": "x",
			"x-robots-tag": "noindex",
		},
		security: { "X-Frame-Options": "SAMEORIGIN" },
	})?.data as StoredPage
	expect(page.headers).toEqual([["x-robots-tag", "noindex"]])
	expect(page.security).toEqual({ "X-Frame-Options": "SAMEORIGIN" })
})

it("sentinel", () => {
	const page = entryOf()?.data as StoredPage
	expect(page.sentinel).toMatch(/^__FLARE_NONCE_[0-9a-f]{32}$/)
	expect(page.html).toContain(`nonce="${page.sentinel}"`)
	expect(page.html).toContain(`"nonce":"${page.sentinel}"`)
	expect(page.html).not.toContain("xyz")
})

// The settled value is in the stored HTML and NDJSON, under two nested boundaries. No key is left unfilled. The NDJSON
// carries it inline in its `l` frame, its one source, with no `c` frame (BUGS.md 94).
it("resolved defer", async () => {
	const page = createPage("_root_/p")
		.cache({ isr: true })
		.loader(({ defer }) => ({ one: defer(async () => 1) }))
		.render((props) =>
			slot(() => props.loaderData.one.promise.then((value) => slot(async () => value * 41, "inner")), "outer"),
		)
	const { server, set } = storing(page)
	const response = await server.fetch(new Request(`${SITE}/p`))
	expect(response.status).toBe(200)
	const { page: entry } = await stored(set)
	expect(entry.html).toContain("41")
	expect(entry.html).not.toContain("outer")
	expect(entry.html).not.toContain("inner")
	expect(entry.ndjson).toContain('{"t":"l","m":"_root_/p","d":{"one":{"__deferred":true,"key":"d0","value":1}}}')
	expect(entry.ndjson).not.toContain('"t":"c"')
})

// A "stream" value is a hole: the placeholder is stored, no `c` frame, and the function never ran.
it("streamed defer", async () => {
	const late = vi.fn<() => Promise<string>>(async () => "late")
	const page = createPage("_root_/p")
		.cache({ isr: { defer: "stream" } })
		.loader(({ defer }) => ({ late: defer(late) }))
		.render((props) => deferredSlot(() => props.loaderData.late, "waiting"))
	const { server, set } = storing(page)
	await server.fetch(new Request(`${SITE}/p`))
	const { page: entry } = await stored(set)
	expect(entry.html).toContain("waiting")
	expect(entry.ndjson).not.toContain('"t":"c"')
	expect(late).not.toHaveBeenCalled()
})

// A stored write waits until Solid's render completes, so a suspense value that settles after the shell is stored
// as its resolved fragment, not as a fallback whose fragment never comes (BUGS.md B15).
it("render completes before store", async () => {
	const page = createPage("_root_/p")
		.cache({ isr: true })
		.render(() => slot(() => new Promise((resolve) => setTimeout(() => resolve("ready-value"), 50)), "waiting"))
	const { server, set } = storing(page)
	await (await server.fetch(new Request(`${SITE}/p`))).text()
	const { page: entry } = await stored(set)
	expect(entry.html).toContain("ready-value")
})

// A Flare `"stream"` defer stays a hole beside it: its fallback is stored, and the app's own async is awaited.
it("stream defer stays a hole", async () => {
	const page = createPage("_root_/p")
		.cache({ isr: { defer: "stream" } })
		.loader(({ defer }) => ({ late: defer(async () => "late") }))
		.render((props) => [
			deferredSlot(() => props.loaderData.late, "hole-fallback"),
			slot(() => new Promise((resolve) => setTimeout(() => resolve("app-value"), 50)), "app-fallback"),
		])
	const { server, set } = storing(page)
	await (await server.fetch(new Request(`${SITE}/p`))).text()
	const { page: entry } = await stored(set)
	expect(entry.html).toContain("hole-fallback")
	expect(entry.html).toContain("app-value")
})

// An app value that never settles leaves the render incomplete. 10 s after the shell the miss is served live and
// uncached, nothing is written, and one warn names the route (BUGS.md B15).
function forever(cache: CacheConfig = { isr: true }): RouteModule {
	return createPage("_root_/p")
		.cache(cache)
		.render(() => slot(() => new Promise(() => undefined), "forever"))
}

function warnings(): { log: Logger; seen: string[] } {
	const seen: string[] = []
	return { log: { ...quiet, warn: (_tag, message) => void seen.push(message) }, seen }
}

it("incomplete render not stored", async () => {
	vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] })
	try {
		const { log, seen } = warnings()
		const { server, set } = storing(forever(), true, log)
		const answer = server.fetch(new Request(`${SITE}/p`))
		await vi.advanceTimersByTimeAsync(10_001)
		const response = await answer
		expect(response.headers.get("cache-control")).toBe("private, no-store")
		expect(set).not.toHaveBeenCalled()
		expect(seen).toEqual([expect.stringContaining("_root_/p")])
		await response.body?.cancel()
	} finally {
		vi.useRealTimers()
	}
})

it("prerender incomplete fails", async () => {
	vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] })
	try {
		const { log, seen } = warnings()
		const { server } = storing(forever({ ssg: true }), true, log)
		const pages = prerendererOf(server)
		const rendered = pages?.render({ id: "_root_/p", params: {}, env: {} })
		await vi.advanceTimersByTimeAsync(10_001)
		const result = await rendered
		expect(result?.entry).toBeUndefined()
		expect(seen).toEqual([expect.stringContaining("_root_/p")])
	} finally {
		vi.useRealTimers()
	}
})

// Every shared render requests `site` plus the canonical pathname: no search and no request headers. The miss serves
// the body it stored.
it("shared request", async () => {
	const seen: Request[] = []
	const page = createPage("_root_/p")
		.cache({ ssr: { ttl: "1m" } })
		.loader(({ request }) => {
			seen.push(request)
			return { text: "page" }
		})
		.render(() => "page")
	const { server, set } = storing(page)
	const response = await server.fetch(new Request(`${SITE}/p?q=1`, { headers: { "accept-language": "fr" } }))
	const html = await response.text()
	expect(seen.map((request) => request.url)).toEqual([`${SITE}/p`])
	expect([...(seen[0]?.headers.keys() ?? [])]).toEqual([])
	const { page: entry } = await stored(set)
	expect(html).toContain("page")
	const nonce = /'nonce-([^']+)'/.exec(response.headers.get("content-security-policy") ?? "")?.[1] ?? ""
	expect(fromSentinel(entry.html, entry.sentinel, nonce)).toBe(html)
	expect(response.headers.get("flare-cache")).toBe("miss")
	expect(response.headers.get("flare-render")).toBe("ssr")
})

// The origin in a stored body is `site`, never the request's Host.
it("host", async () => {
	const page = createPage("_root_/p")
		.cache({ isr: true })
		.loader(({ request }) => ({ origin: new URL(request.url).origin }))
		.render((props) => props.loaderData.origin)
	const { server, set } = storing(page)
	await server.fetch(new Request("https://evil/p", { headers: { host: "evil" } }))
	const { page: entry } = await stored(set)
	expect(entry.html).toContain(SITE)
	expect(entry.html).not.toContain("evil")
})

// The server checks the page's timing when it loads the chain, before any render, and answers 500 naming the route.
async function answers500(cache: unknown): Promise<void> {
	const render = vi.fn<() => string>(() => "p")
	const page = createPage("_root_/p")
		.cache(cache as CacheConfig)
		.render(render)
	const { server, bugs } = storing(page)
	const response = await server.fetch(new Request(`${SITE}/p`))
	expect(response.status).toBe(500)
	expect(render).not.toHaveBeenCalled()
	expect(bugs.join("\n")).toContain("_root_/p: cache.ssr")
}

// The shared render writes the critical style into the stored HTML, nonced with the entry's sentinel.
it("critical stored", async () => {
	const page = createPage("_root_/p")
		.cache({ isr: true })
		.render(() => createComponent(Dynamic, { component: "p", class: "a", children: "x" }))
	const { server, set } = storing(page, false)
	await server.fetch(new Request(`${SITE}/p`))
	const { page: entry } = await stored(set)
	expect(entry.html).toContain(`<style id="flare-critical" nonce="${entry.sentinel}">.a{color:red}</style></head>`)
})
