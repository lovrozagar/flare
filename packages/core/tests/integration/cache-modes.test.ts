import { afterEach, expect, it, vi } from "vitest"
import type { FlareStore, FlareStoreEntry } from "../../src/server/cache/contract.ts"
import { createMemoryStore } from "../../src/server/cache/memory.ts"
import { createRevalidateFn, revalidate } from "../../src/server/cache/revalidate.ts"
import { createLayout } from "../../src/shared/route-builder/layout.ts"
import { createPage } from "../../src/shared/route-builder/page.ts"
import { createPathSegment } from "../../src/shared/route-builder/segment.ts"
import { bodyOf, serve, type Answer, type Serve } from "./builder-app.ts"
import { stateIn } from "../../src/server/wire.fixture.ts"

// dx/cache.md's server modes through the real createServer(...).fetch and a real memory store (B96): what is stored,
// for how long, what a purge drops, and the headers each decision sends. A stored answer says so in `flare-cache`.
// The clock is `Date` alone, faked, so a ttl or a staleTime passes with no real wait.

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const START = Date.UTC(2026, 9, 16)
const PRIVATE = "private, no-store"

afterEach(() => {
	vi.useRealTimers()
})

function clock(): (ms: number) => void {
	vi.useFakeTimers({ toFake: ["Date"], now: START })
	return (ms) => vi.setSystemTime(START + ms)
}

// Asks for `path` until the store answers it. A store write runs after its miss is sent.
async function stored(get: Serve, path: string): Promise<Answer> {
	for (let tries = 0; tries < 50; tries++) {
		const answer = await get(path)
		if (answer.headers.get("flare-cache") === "hit") return answer
		await new Promise((resolve) => setTimeout(resolve, 10))
	}
	throw new Error(`${path} was never stored`)
}

const cacheOf = (answer: Answer): string | null => answer.headers.get("flare-cache")

// A stored /p is a hit either way. A stale one also re-renders behind it, which a later hit shows.
async function freshOrStale(get: Serve): Promise<"fresh" | "stale"> {
	const hit = await get("/p")
	expect(cacheOf(hit)).toBe("hit")
	for (let tries = 0; tries < 10; tries++) {
		await new Promise((resolve) => setTimeout(resolve, 10))
		if (bodyOf((await get("/p")).text) !== bodyOf(hit.text)) return "stale"
	}
	return "fresh"
}

// A page at `id` under the root with this cache, whose body names its render.
function counted(id: string, cache: Parameters<ReturnType<typeof createPage>["cache"]>[0]) {
	let renders = 0
	return createPage(id)
		.cache(cache)
		.loader(() => ({ text: `render ${++renders}` }))
		.render((props) => props.loaderData.text)
}

function one(id: string, path: string, module: unknown) {
	return serve([{ id, path, module }], { store: createMemoryStore() })
}

// An ssr page is stored for its ttl; after it the next request is a miss.
it("ssr ttl", async () => {
	const at = clock()
	const get = one("_root_/p", "/p", counted("_root_/p", { ssr: { ttl: "1m" } }))
	expect(cacheOf(await get("/p"))).toBe("miss")
	expect(bodyOf((await stored(get, "/p")).text)).toBe("render 1")
	at(MINUTE + 1)
	expect(cacheOf(await get("/p"))).toBe("miss")
	// The type requires `ttl`. An untyped config, or a staleTime past its ttl, is a bug the server meets when it loads
	// the route, before any render: the request is a 500 and the route renders nothing.
	const bad = createPage("_root_/q").cache({ ssr: {} as { ttl: string } })
	const long = createPage("_root_/q").cache({ ssr: { ttl: "1m", staleTime: "2m" } })
	for (const page of [bad, long]) {
		const answer = await one(
			"_root_/q",
			"/q",
			page.render(() => "q"),
		)("/q")
		expect([answer.status, bodyOf(answer.text)]).toEqual([500, ""])
	}
})

// A hit inside staleTime serves the stored body and renders nothing. Past it a hit still serves the stored body, and
// re-renders behind it; a later request gets the new one.
it("ssr stale", async () => {
	const at = clock()
	const get = one("_root_/p", "/p", counted("_root_/p", { ssr: { ttl: "1h", staleTime: "1m" } }))
	await get("/p")
	await stored(get, "/p")
	at(MINUTE - 1)
	expect(await freshOrStale(get)).toBe("fresh")
	at(MINUTE + 1)
	expect(await freshOrStale(get)).toBe("stale")
})

// A tag purge drops the entries whose tags it names: the tags function reads the route's params.
it("ssr tags", async () => {
	clock()
	const user = createPage("_root_/users/[id]")
		.cache({ ssr: { ttl: "1h", tags: ({ params }) => [`user:${params.id}`] } })
		.render(() => "user")
	const purge = createPage("_root_/purge").response(async () => {
		await revalidate({ tags: ["user:7"] })
		return new Response("purged")
	})
	const get = serve(
		[
			{ id: "_root_/users/[id]", path: "/users/[id]", module: user },
			{ id: "_root_/purge", path: "/purge", module: purge },
		],
		{ store: createMemoryStore() },
	)
	for (const path of ["/users/7", "/users/8"]) {
		await get(path)
		await stored(get, path)
	}
	await get("/purge")
	expect(cacheOf(await get("/users/7"))).toBe("miss")
	expect(cacheOf(await get("/users/8"))).toBe("hit")
})

// `isr: true` and `isr: {}` are stored for 24 hours, with no background refresh before. A `revalidate` goes stale at
// that age and expires at twice it, capped at 24 hours. A stale hit's re-render stores a new entry, so the expiry is
// read on a second server whose entry nothing refreshed.
it("isr ttl", async () => {
	const seen: unknown[] = []
	for (const [isr, staleAt, missAt] of [
		[true, undefined, 24 * HOUR],
		[{}, undefined, 24 * HOUR],
		[{ revalidate: "1m" }, MINUTE, 2 * MINUTE],
		[{ revalidate: "13h" }, 13 * HOUR, 24 * HOUR],
	] as const) {
		const at = clock()
		const ages = one("_root_/p", "/p", counted("_root_/p", { isr }))
		await stored(ages, "/p")
		at((staleAt ?? missAt) - 1)
		const before = await freshOrStale(ages)
		at((staleAt ?? missAt) + 1)
		// Without a revalidate this is past the ttl: a miss, which re-renders too.
		const after = staleAt === undefined ? cacheOf(await ages("/p")) : await freshOrStale(ages)
		at(0)
		const expires = one("_root_/p", "/p", counted("_root_/p", { isr }))
		await stored(expires, "/p")
		at(missAt + 1)
		seen.push([before, after, cacheOf(await expires("/p"))])
		vi.useRealTimers()
	}
	expect(seen).toEqual([
		["fresh", "miss", "miss"],
		["fresh", "miss", "miss"],
		["fresh", "stale", "miss"],
		["fresh", "stale", "miss"],
	])
})

// The `"resolve"` default awaits a deferred value before the store write: the stored body holds it inline, with no
// hole left for a fill.
it("defer resolve", async () => {
	clock()
	const page = createPage("_root_/p")
		.cache({ isr: true })
		.loader(({ defer }) => ({ late: defer(() => Promise.resolve("settled")) }))
		.render(() => "p")
	const get = one("_root_/p", "/p", page)
	await get("/p")
	const hit = await stored(get, "/p")
	expect(hit.text).toContain('"settled"')
	expect(hit.text).not.toContain('"fill":true')
})

// Concurrent misses of one key share one render, but never one visitor's cookies: a render that sets a cookie per
// request gives each coalesced request its own, and none is stored (plan 21 7.4, BUGS.md 152).
it("coalesced cookies", async () => {
	let renders = 0
	const page = createPage("_root_/c")
		.cache({ isr: true })
		.loader(async () => {
			await new Promise((resolve) => setTimeout(resolve, 30))
			return {}
		})
		.headers(() => ({ "set-cookie": `visit=${(renders += 1)}; Path=/` }))
		.render(() => "c")
	const get = one("_root_/c", "/c", page)
	const answers = await Promise.all([get("/c"), get("/c"), get("/c"), get("/c")])
	const cookies = answers.map((answer) => answer.headers.getSetCookie())
	expect(answers.map((answer) => answer.status)).toEqual([200, 200, 200, 200])
	expect(cookies.every((list) => list.length === 1)).toBe(true)
	expect(new Set(cookies.flat()).size).toBe(4)
	for (const answer of answers) expect(answer.headers.get("cache-control")).toBe(PRIVATE)
})

// A miss whose loader hangs blocks its page for 30 s at most: a request that joined it then renders live, and the next
// miss renders and stores again, so one hung render never holds the page until restart (plan 21 7.5).
it("hung miss", async () => {
	vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] })
	let calls = 0
	const page = createPage("_root_/h")
		.cache({ isr: true })
		.loader(() => ((calls += 1) === 1 ? new Promise<never>(() => undefined) : { call: calls }))
		.render(() => "h")
	const get = one("_root_/h", "/h", page)
	void get("/h")
	await vi.advanceTimersByTimeAsync(10)
	const joined = get("/h")
	await vi.advanceTimersByTimeAsync(30_000)
	const live = await joined
	expect([live.status, live.headers.get("cache-control")]).toEqual([200, PRIVATE])
	expect(stateIn(live.text).at(-1)?.["data"]).toEqual({ call: 2 })
	const next = await get("/h")
	expect([cacheOf(next), stateIn(next.text).at(-1)?.["data"]]).toEqual(["miss", { call: 3 }])
})

// A purge drops the in-flight renders it may affect: a request after a mutation never joins a render that read the data
// before it, and gets its own (plan 21 3.4).
it("purge drops the flight", async () => {
	const store = createMemoryStore()
	const gate = Promise.withResolvers<void>()
	let version = 1
	const page = createPage("_root_/v")
		.cache({ isr: true })
		.loader(async () => {
			const seen = version
			await gate.promise
			return { seen }
		})
		.render((props) => `version ${props.loaderData.seen}`)
	const get = serve([{ id: "_root_/v", path: "/v", module: page }], { store })
	const before = get("/v")
	await new Promise((resolve) => setTimeout(resolve, 10))
	version = 2
	await createRevalidateFn(store)({ tags: ["posts"] })
	const after = get("/v")
	await new Promise((resolve) => setTimeout(resolve, 10))
	gate.resolve()
	expect([bodyOf((await before).text), bodyOf((await after).text)]).toEqual(["version 1", "version 2"])
})

// The page `/p` served over `store`, and the `console.error` lines that name the store.
function overStore(store: FlareStore) {
	const errors = vi.spyOn(console, "error").mockImplementation(() => undefined)
	// One spy per test file run: each store counts its own lines.
	errors.mockClear()
	const get = serve([{ id: "_root_/p", path: "/p", module: counted("_root_/p", { isr: true }) }], { store })
	const logged = () => errors.mock.calls.filter((call) => call.join(" ").includes("store")).length
	return { get, logged }
}

// A store whose read throws, and one whose read never answers, leave the page rendering live, `private, no-store`,
// never a 500 or a hang; each failed read logs once (plan 21 3.3).
it("store read fails", async () => {
	vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] })
	const memory = createMemoryStore()
	const down = overStore({ ...memory, get: () => Promise.reject(new Error("store down")) })
	const thrown = await down.get("/p")
	expect([thrown.status, thrown.headers.get("cache-control"), bodyOf(thrown.text)]).toEqual([200, PRIVATE, "render 1"])
	expect(down.logged()).toBe(1)
	const hung = overStore({ ...memory, get: () => new Promise(() => undefined) })
	const waiting = hung.get("/p")
	await vi.advanceTimersByTimeAsync(2000)
	const answer = await waiting
	expect([answer.status, answer.headers.get("cache-control"), bodyOf(answer.text)]).toEqual([200, PRIVATE, "render 1"])
	expect(hung.logged()).toBe(1)
})

// A record whose envelope is not one the store was given, a `storedAt` that is no number or `tags` that are no list,
// is a miss: the render writes a good record over it, so the page heals; it logs once (plan 21 3.3).
it("corrupt record heals", async () => {
	const memory = createMemoryStore()
	let reads = 0
	const corrupt = { data: "junk", storedAt: "never", tags: "t" } as unknown as FlareStoreEntry
	const read = (key: string) =>
		!key.startsWith("epoch:") && (reads += 1) === 1 ? Promise.resolve(corrupt) : memory.get(key)
	const healing = overStore({ ...memory, get: read })
	const miss = await healing.get("/p")
	expect([miss.status, cacheOf(miss), bodyOf(miss.text)]).toEqual([200, "miss", "render 1"])
	const hit = await stored(healing.get, "/p")
	expect(bodyOf(hit.text)).toBe("render 1")
	expect(healing.logged()).toBe(1)
})

// The request nonce an answer's CSP header carries.
const nonceOf = (answer: Answer) => /'nonce-([^']+)'/.exec(answer.headers.get("content-security-policy") ?? "")?.[1]

// The state script's JSON in a document: the last `<script …>self.flare=` the server wrote, after the page's content.
function stateOf(html: string): Record<string, unknown> {
	const at = html.lastIndexOf(">self.flare=")
	return JSON.parse(html.slice(at + ">self.flare=".length, html.indexOf("</script>", at))) as Record<string, unknown>
}

// Page text and an inline head script that hold `self.flare=` do not confuse the stored copy: a hit replays with the
// state intact, its nonce the hit's own, as the miss's was (plan 21 2.6, BUGS.md 167).
it("state text", async () => {
	const page = createPage("_root_/st")
		.cache({ ssr: { ttl: "1m" } })
		.loader(() => ({ note: "self.flare={} is how the state is written" }))
		.head(() => ({ custom: { scripts: [{ children: 'self.flare={"nonce":"app"}' }] } }))
		.render((props) => `say ${props.loaderData.note}`)
	const get = one("_root_/st", "/st", page)
	const miss = await get("/st")
	expect(cacheOf(miss)).toBe("miss")
	expect(stateOf(miss.text)["nonce"]).toBe(nonceOf(miss))
	const hit = await stored(get, "/st")
	expect(stateOf(hit.text)["nonce"]).toBe(nonceOf(hit))
	expect(bodyOf(hit.text)).toContain("say self.flare={} is how the state is written")
})

// The stored copy's state script is written back with the inline-script escape after its nonce swap, so loader data
// holding a closing script tag replays as data on a hit, never as markup (plan 21 7.3).
it("state escape", async () => {
	const note = "</script><script>self.pwned=1</script><!--"
	const page = createPage("_root_/se")
		.cache({ ssr: { ttl: "1m" } })
		.loader(() => ({ note }))
		.render(() => "escaped")
	const get = one("_root_/se", "/se", page)
	for (const answer of [await get("/se"), await stored(get, "/se")]) {
		expect(answer.text).not.toContain("<script>self.pwned")
		expect(stateIn(answer.text).at(-1)?.["data"]).toEqual({ note })
	}
})

// Every header an edge cache acts on, which a route's `.headers()` could set.
const EDGE = {
	"surrogate-control": "max-age=3600",
	"surrogate-key": "user-7",
	"cdn-cache-control": "max-age=60",
	"cloudflare-cdn-cache-control": "max-age=60",
	"vercel-cdn-cache-control": "max-age=60",
	"netlify-cdn-cache-control": "max-age=60",
	"edge-control": "cache-maxage=60s",
	"x-accel-expires": "60",
	"cache-tag": "user-7",
}

// A private answer carries no header that tells an edge cache to keep it, whatever the route's `.headers()` set: a
// rendered page, and a `.response()` page behind auth (plan 21 12.10, BUGS.md 162).
it("private edge headers", async () => {
	const page = createPage("_root_/me")
		.headers(() => ({ ...EDGE, "x-kept": "1" }))
		.render(() => "me")
	const get = serve([{ id: "_root_/me", path: "/me", module: page }], { store: createMemoryStore() })
	for (const path of ["/me", "/me?_flare=data"]) {
		const answer = await get(path)
		expect([path, answer.headers.get("cache-control")]).toEqual([path, PRIVATE])
		for (const name of Object.keys(EDGE)) expect([path, name, answer.headers.get(name)]).toEqual([path, name, null])
		expect(answer.headers.get("x-kept")).toBe("1")
	}
})

// cdn on a public page: browsers get `max-age=0` with the CDN's `s-maxage`, the CDN gets `CDN-Cache-Control` with
// `stale-while-revalidate`, and `Cache-Tag` from the tags function over the raw params, on the miss and on a hit.
it("cdn headers", async () => {
	clock()
	const page = createPage("_root_/users/[id]")
		.cache({ isr: true, cdn: { maxAge: "60s", swr: "30s", tags: ({ params }) => [`u${params.id}`, "users"] } })
		.render(() => "user")
	const get = one("_root_/users/[id]", "/users/[id]", page)
	for (const answer of [await get("/users/7"), await stored(get, "/users/7")]) {
		expect(answer.headers.get("cache-control")).toBe("public, max-age=0, s-maxage=60")
		expect(answer.headers.get("cdn-cache-control")).toBe("public, max-age=60, stale-while-revalidate=30")
		expect(answer.headers.get("cache-tag")).toBe("u7, users, flare-build-dev")
	}
})

// `private: true` on a layout makes every page under it private and unstored: a child's `false` cannot undo it.
it("cdn private", async () => {
	const area = createLayout("_root_/(area)")
		.cache({ cdn: { private: true } })
		.render((props) => props.children)
	const page = counted("_root_/(area)/p", { isr: true, cdn: { private: false, maxAge: "60s" } })
	const get = serve([{ id: "_root_/(area)/p", path: "/p", module: page }], {
		store: createMemoryStore(),
		layouts: { "_root_/(area)": area },
	})
	const first = await get("/p")
	expect(first.headers.get("cache-control")).toBe(PRIVATE)
	await new Promise((resolve) => setTimeout(resolve, 50))
	const second = await get("/p")
	expect(cacheOf(second)).not.toBe("hit")
	expect(bodyOf(second.text)).toBe("render 2")
})

// `allowCookies`: the route's cookie keeps the answer shared and stored, but only the miss that set it sends it; the
// stored entry never replays it.
it("allow cookies", async () => {
	clock()
	const page = createPage("_root_/p")
		.cache({ isr: true, cdn: { maxAge: "60s", allowCookies: true } })
		.headers(() => ({ "set-cookie": "seen=1" }))
		.render(() => "p")
	const get = one("_root_/p", "/p", page)
	const miss = await get("/p")
	expect(miss.headers.get("cache-control")).toBe("public, max-age=0, s-maxage=60")
	expect(miss.headers.getSetCookie()).toEqual(["seen=1"])
	const hit = await stored(get, "/p")
	expect(hit.headers.getSetCookie()).toEqual([])
	expect(hit.headers.get("cache-control")).toBe("public, max-age=0, s-maxage=60")
})

// The decision table: no mode is never stored; a public mode is stored and public; a required chain is never stored;
// a chain that reads auth stores the anonymous render but sends it `private, no-store` with no Cache-Tag, and renders
// a session's live. The mode is the page's: a mode on a layout stores nothing, and a segment's `cdn` is the default
// for the pages under it.
it("decision", async () => {
	clock()
	const cdn = { maxAge: "60s", tags: ["t"] }
	const area = createLayout("_root_/(area)")
		.cache({ isr: true })
		.render((props) => props.children)
	const segment = createPathSegment("_root_/seg").cache({ cdn: { maxAge: "90s" } })
	const routes = [
		{ id: "_root_/none", path: "/none", module: counted("_root_/none", { cdn }) },
		{ id: "_root_/open", path: "/open", module: counted("_root_/open", { isr: true, cdn }) },
		{
			id: "_root_/closed",
			path: "/closed",
			module: createPage("_root_/closed")
				.cache({ isr: true, cdn })
				.authenticate()
				.render(() => "closed"),
		},
		{
			id: "_root_/reads",
			path: "/reads",
			module: createPage("_root_/reads")
				.cache({ isr: true, cdn })
				.authenticateOptional()
				.render(() => "reads"),
		},
		{ id: "_root_/(area)/under", path: "/under", module: counted("_root_/(area)/under", { cdn: { maxAge: "60s" } }) },
		{ id: "_root_/seg/p", path: "/seg/p", module: counted("_root_/seg/p", { isr: true }) },
	]
	const get = serve(routes, {
		store: createMemoryStore(),
		layouts: { "_root_/(area)": area, "_root_/seg": segment },
		authenticate: ({ request }) => request.headers.get("x-user"),
	})
	const signedIn = { headers: { "x-user": "ana" } }
	expect((await get("/none")).headers.get("cache-control")).toBe(PRIVATE)
	expect((await get("/open")).headers.get("cache-control")).toBe("public, max-age=0, s-maxage=60")
	expect(cacheOf(await stored(get, "/open"))).toBe("hit")
	expect((await get("/closed", signedIn)).headers.get("cache-control")).toBe(PRIVATE)
	const anonymous = await get("/reads")
	expect(anonymous.headers.get("cache-control")).toBe(PRIVATE)
	expect(anonymous.headers.has("cache-tag")).toBe(false)
	expect(cacheOf(await stored(get, "/reads"))).toBe("hit")
	expect(cacheOf(await get("/reads", signedIn))).not.toBe("hit")
	expect((await get("/seg/p")).headers.get("cache-control")).toBe("public, max-age=0, s-maxage=90")
	await new Promise((resolve) => setTimeout(resolve, 50))
	for (const path of ["/none", "/closed", "/under"]) {
		expect(cacheOf(await get(path, path === "/closed" ? signedIn : {}))).not.toBe("hit")
	}
	expect(bodyOf((await get("/none")).text)).toBe("render 3")
	expect(bodyOf((await get("/under")).text)).toBe("render 2")
})
