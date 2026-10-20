import { createComponent, type Element } from "solid-js"
import { Dynamic } from "@solidjs/web"
import { expect, it, vi } from "vitest"
import { artifactPath } from "../../shared/cache/index.ts"
import type { ParamsFn } from "../../shared/route-builder/chain.ts"
import { createPage } from "../../shared/route-builder/page.ts"
import { createRootLayout } from "../../shared/route-builder/root-layout.ts"
import { createRouter, type RouteModule } from "../../shared/router/create-router.ts"
import { serveWith } from "../lifecycle/create.ts"
import type { Logger } from "../lifecycle/logger.ts"
import { createAssetsStore } from "./assets.ts"
import type { FlareStore } from "./contract.ts"
import { createMemoryStore } from "./memory.ts"
import { epochKey, keyEpochKey } from "./epoch.ts"
import { acceptSeed, listed, seedLookup } from "./seed.ts"

it("valid", () => {
	expect(acceptSeed({ seed: true, key: "k", renderedAt: 5, tags: ["a"], data: "page" }, "k")).toEqual({
		data: "page",
		tags: ["a"],
		storedAt: 5,
	})
})

it("no flag", () => {
	expect(acceptSeed({ key: "k", renderedAt: 5, tags: ["a"], data: "page" }, "k")).toBeUndefined()
	expect(acceptSeed(null, "k")).toBeUndefined()
	expect(acceptSeed({ seed: true, key: "k", renderedAt: "5", tags: [], data: "page" }, "k")).toBeUndefined()
	// A seed holds its key, and one written for another key is refused.
	expect(acceptSeed({ seed: true, key: "other", renderedAt: 5, tags: [], data: "page" }, "k")).toBeUndefined()
	expect(acceptSeed({ seed: true, renderedAt: 5, tags: [], data: "page" }, "k")).toBeUndefined()
})

it("no tags", () => {
	expect(acceptSeed({ seed: true, key: "k", renderedAt: 5, data: "page" }, "k")).toBeUndefined()
	expect(acceptSeed({ seed: true, key: "k", renderedAt: 5, tags: [1], data: "page" }, "k")).toBeUndefined()
})

it("empty tags", () => {
	expect(acceptSeed({ seed: true, key: "k", renderedAt: 5, tags: [], data: "page" }, "k")).toEqual({
		data: "page",
		tags: [],
		storedAt: 5,
	})
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

const SITE = "https://example.com"
const root = createRootLayout("_root_").render((props) => documentOf(props.children))

// A seed file as prerender writes it, holding a stored page under its key.
function seedFile(key: string, text: string, at: { renderedAt: number; render: "isr" | "ssg" }): Uint8Array {
	const { renderedAt, render } = at
	const sentinel = "__FLARE_NONCE_11111111111111111111111111111111"
	const html = `<html><head></head><body>${text}<script id="flare-state" nonce="${sentinel}">self.flare={"matches":[],"nonce":"${sentinel}"}</script></body></html>`
	const data = { html, ndjson: '{"t":"r"}\n{"t":"d"}\n', headers: [], security: {}, sentinel, render }
	return new TextEncoder().encode(JSON.stringify({ seed: true, key, renderedAt, tags: [], data }))
}

type Served = { app: ReturnType<typeof serveWith>; store: FlareStore; set: ReturnType<typeof vi.fn>; reads: string[] }

// One page at `path`, a watched mutable store, and seeds served from a map of artifact paths.
function serve(page: RouteModule, at: { id: string; path: string; seeds: Record<string, Uint8Array> }): Served {
	const reads: string[] = []
	const files = new Map(Object.entries(at.seeds))
	const seeds = createAssetsStore(async (file) => {
		reads.push(file)
		return files.get(file) ?? null
	})
	const memory = createMemoryStore()
	const set = vi.fn<FlareStore["set"]>(memory.set)
	const store = { ...memory, set }
	const router = createRouter({ layouts: { _root_: root }, routeTree: [{ id: at.id, path: at.path, module: page }] })
	const app = serveWith({ router, site: SITE, store, static: seeds }, { dev: false, log: quiet })
	return { app, store, set, reads }
}

const pathOf = async (key: string): Promise<string> => (await artifactPath(key, { build: "dev" })) ?? ""

// A purge `get` hides an ISR seed unless the seed was rendered after it (B86).
it("purged beats seed", async () => {
	const key = "static:dev:_root_/p"
	const page = createPage("_root_/p")
		.cache({ isr: true })
		.render(() => "live")
	for (const [renderedAt, expected] of [
		[1000, "live"],
		[1001, "seeded"],
	] as const) {
		const { app, store } = serve(page, {
			id: "_root_/p",
			path: "/p",
			seeds: { [await pathOf(key)]: seedFile(key, "seeded", { renderedAt: renderedAt, render: "isr" }) },
		})
		vi.useFakeTimers({ now: 1000, toFake: ["Date"] })
		await store.delete(key)
		vi.setSystemTime(2000)
		const body = await (await app.fetch(new Request(`${SITE}/p`))).text()
		vi.useRealTimers()
		expect(body).toContain(expected)
	}
})

// An SSG page and an ISR page whose static read throws or never answers, with the error lines the server logged.
function failingStatic(read: () => Promise<Uint8Array | null>) {
	const errors: string[] = []
	const log: Logger = { ...quiet, error: (...parts: unknown[]) => void errors.push(parts.map(String).join(" ")) }
	const memory = createMemoryStore()
	const set = vi.fn<FlareStore["set"]>(memory.set)
	const ssg = createPage("_root_/s")
		.cache({ ssg: true })
		.render(() => "live")
	const isr = createPage("_root_/i")
		.cache({ isr: { revalidate: "30s" } })
		.render(() => "live")
	const routeTree = [
		{ id: "_root_/s", path: "/s", module: ssg },
		{ id: "_root_/i", path: "/i", module: isr },
	]
	const router = createRouter({ layouts: { _root_: root }, routeTree })
	const app = serveWith(
		{ router, site: SITE, store: { ...memory, set }, static: createAssetsStore(read) },
		{ dev: false, log },
	)
	return { app, errors, set }
}

// One answer through a failing static store, after `wait` ms of fake time.
async function failedAnswer(app: ReturnType<typeof serveWith>, path: string, wait = 0): Promise<unknown[]> {
	const pending = app.fetch(new Request(`${SITE}${path}`))
	await vi.advanceTimersByTimeAsync(wait)
	const response = await pending
	return [path, response.status, response.headers.get("cache-control"), (await response.text()).includes("live")]
}

// A static read that throws or does not answer within 2 s, an SSG page's or an ISR seed's, is logged and the page
// renders live, private, and is not stored, as a failing mutable read does (BUGS.md 391).
it("static read fails", async () => {
	vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] })
	const down = failingStatic(() => Promise.reject(new Error("binding down")))
	const hung = failingStatic(() => new Promise(() => undefined))
	const answers = [
		await failedAnswer(down.app, "/s"),
		await failedAnswer(down.app, "/i"),
		await failedAnswer(hung.app, "/s", 2000),
		await failedAnswer(hung.app, "/i", 2000),
	]
	vi.useRealTimers()
	expect(answers).toEqual([
		["/s", 200, "private, no-store", true],
		["/i", 200, "private, no-store", true],
		["/s", 200, "private, no-store", true],
		["/i", 200, "private, no-store", true],
	])
	expect([down.errors.length, hung.errors.length, down.set.mock.calls.length, hung.set.mock.calls.length]).toEqual([
		2, 2, 0, 0,
	])
	expect(down.errors.every((line) => line.includes("served live"))).toBe(true)
})

const slugs = () => [{ slug: "a" }]

// A slug the page's `params()` did not return is the normal 404, document and data alike.
it("absent slug", async () => {
	const page = createPage("_root_/post/[slug]")
		.cache({ ssg: slugs })
		.render(() => "post")
	const { app, set } = serve(page, { id: "_root_/post/[slug]", path: "/post/[slug]", seeds: {} })
	expect((await app.fetch(new Request(`${SITE}/post/b`))).status).toBe(404)
	expect((await app.fetch(new Request(`${SITE}/post/b?_flare=data`))).status).toBe(404)
	expect(set).not.toHaveBeenCalled()
})

// A listed slug whose seed file is missing renders live once, and nothing is written anywhere.
it("missing file", async () => {
	const page = createPage("_root_/post/[slug]")
		.cache({ ssg: { params: slugs } })
		.render(() => "rendered live")
	const { app, set, reads } = serve(page, { id: "_root_/post/[slug]", path: "/post/[slug]", seeds: {} })
	const response = await app.fetch(new Request(`${SITE}/post/a`))
	expect(response.status).toBe(200)
	expect(await response.text()).toContain("rendered live")
	expect(reads).toEqual([await pathOf("static:dev:_root_/post/[slug]:a")])
	await new Promise((resolve) => setTimeout(resolve, 10))
	expect(set).not.toHaveBeenCalled()
})

// SSG reads only the static seed. A tombstone in the mutable store does not hide it.
it("ssg ignores tombstone", async () => {
	const key = "static:dev:_root_/about"
	const page = createPage("_root_/about")
		.cache({ ssg: true })
		.render(() => "live")
	const { app, store } = serve(page, {
		id: "_root_/about",
		path: "/about",
		seeds: { [await pathOf(key)]: seedFile(key, "seeded", { renderedAt: 1, render: "ssg" }) },
	})
	await store.delete(key)
	const response = await app.fetch(new Request(`${SITE}/about`))
	expect(response.headers.get("flare-cache")).toBe("hit")
	expect(response.headers.get("flare-render")).toBe("ssg")
	expect(await response.text()).toContain("seeded")
})

const paths: ParamsFn = (): Record<string, string | string[]>[] => [{ path: ["a", "b"] }, { lang: "en", slug: "x" }]

// A listed entry matches when each of its own params equals the URL's: a catch-all by its joined segments, and a
// param the URL lacks never matches. A page that lists nothing takes any slug.
it("listed slugs", async () => {
	const cache = { ssg: { params: paths } }
	expect(await listed(cache, { path: ["a", "b"] }, false)).toBe(true)
	expect(await listed(cache, { path: "a/b" }, false)).toBe(true)
	expect(await listed(cache, { path: ["a"] }, false)).toBe(false)
	expect(await listed(cache, { slug: "x" }, false)).toBe(false)
	expect(await listed(cache, { lang: "en", slug: "x" }, false)).toBe(true)
	expect(await listed(cache, { lang: "en", slug: "x", extra: "y" }, false)).toBe(true)
	expect(await listed({ isr: { params: paths } }, { path: "z" }, false)).toBe(true)
	expect(await listed({ isr: { params: paths, dynamicParams: false } }, { path: "z" }, false)).toBe(false)
	expect(await listed(undefined, {}, false)).toBe(true)
	expect(await listed({ ssg: () => [{}] }, { slug: "x" }, false)).toBe(true)
	expect(await listed({ ssg: () => [] }, {}, false)).toBe(false)
})

const encodedSlugs: ParamsFn = (): Record<string, string | string[]>[] => [
	{ slug: "a b" },
	{ slug: "é" },
	{ slug: "x%20y" },
	{ path: ["c d", "e"] },
]

// A listed value matches the URL `buildUrl` writes for it: the request's raw param and the listed value compare as
// that one encoding, so a slug that needs percent-encoding, listed decoded or encoded, is served (BUGS.md 388).
it("listed encoded", async () => {
	const cache = { ssg: encodedSlugs }
	for (const slug of ["a%20b", "%C3%A9", "%c3%a9", "x%20y"])
		expect([slug, await listed(cache, { slug }, false)]).toEqual([slug, true])
	expect(await listed(cache, { path: "c%20d/e" }, false)).toBe(true)
	expect(await listed(cache, { path: ["c%20d", "e"] }, false)).toBe(true)
	expect(await listed(cache, { slug: "a" }, false)).toBe(false)
	expect(await listed({ ssg: () => [{ slug: ".." }] }, { slug: ".." }, false)).toBe(true)
})

// Outside dev a page's `params()` runs once per server, with `ctx.params` as `{}` like the prerender's call
// (dx/cache.md): unique URLs cost a lookup each, not a call, and hold no memory of their own (plan 21 16.7).
it("params once", async () => {
	const list = vi.fn<ParamsFn>(() => [{ slug: "a" }])
	const cache = { ssg: list }
	const checks = await Promise.all(Array.from({ length: 100_000 }, (_, n) => listed(cache, { slug: `s${n}` }, false)))
	expect(checks.some(Boolean)).toBe(false)
	expect(await listed(cache, { slug: "a" }, false)).toBe(true)
	expect(list).toHaveBeenCalledTimes(1)
	expect(list).toHaveBeenCalledWith({ params: {} })
})

// Through the server: three requests, one call.
it("params once served", async () => {
	const list = vi.fn<ParamsFn>(slugs)
	const page = createPage("_root_/post/[slug]")
		.cache({ ssg: list })
		.render(() => "post")
	const { app } = serve(page, { id: "_root_/post/[slug]", path: "/post/[slug]", seeds: {} })
	expect((await app.fetch(new Request(`${SITE}/post/a`))).status).toBe(200)
	expect((await app.fetch(new Request(`${SITE}/post/b`))).status).toBe(404)
	expect((await app.fetch(new Request(`${SITE}/post/a?_flare=data`))).status).toBe(200)
	expect(list).toHaveBeenCalledTimes(1)
})

// Dev calls `params()` on each request, so an edited list shows at once; a failed call is not kept, so the next
// request calls again.
it("params dev and failure", async () => {
	const list = vi.fn<ParamsFn>(slugs)
	await listed({ ssg: list }, { slug: "a" }, true)
	await listed({ ssg: list }, { slug: "a" }, true)
	expect(list).toHaveBeenCalledTimes(2)
	const flaky = vi
		.fn<ParamsFn>()
		.mockRejectedValueOnce(new Error("db down"))
		.mockResolvedValue([{ slug: "a" }])
	await expect(listed({ ssg: flaky }, { slug: "a" }, false)).rejects.toThrow("db down")
	expect(await listed({ ssg: flaky }, { slug: "a" }, false)).toBe(true)
	expect(flaky).toHaveBeenCalledTimes(2)
})

// An ISR seed is read only as a stand-in. A missing seed, one no newer than the store's record, and one a key or
// tag epoch has passed give no hit.
it("seed epochs", async () => {
	const key = "static:dev:_root_/p"
	const seeds = createAssetsStore(async () => seedFile(key, "seeded", { renderedAt: 100, render: "isr" }))
	const store = createMemoryStore()
	expect(
		await seedLookup(
			createAssetsStore(async () => null),
			{ store, key, looked: null },
		),
	).toBeNull()
	const older = { entry: { data: null, storedAt: 100 }, purged: false }
	expect(await seedLookup(seeds, { store, key, looked: older })).toBeNull()
	expect((await seedLookup(seeds, { store, key, looked: null }))?.purged).toBe(false)
	await store.set(keyEpochKey(key), { data: 100, storedAt: 100 })
	expect((await seedLookup(seeds, { store, key, looked: null }))?.purged).toBe(true)
	const tagged = createAssetsStore(async () =>
		new TextEncoder().encode(JSON.stringify({ seed: true, key, renderedAt: 200, tags: ["t"], data: null })),
	)
	await store.set(epochKey("t"), { data: 300, storedAt: 300 })
	expect((await seedLookup(tagged, { store, key, looked: null }))?.purged).toBe(true)
	// A static store of the app's own may hand back an entry with no tags.
	const untagged = { ...createMemoryStore(), get: async () => ({ data: null, storedAt: 500 }) }
	expect((await seedLookup(untagged, { store, key, looked: null }))?.purged).toBe(false)
})

// `authorize` runs before a static seed is read, as before a stored one (B73).
it("ssg authorize", async () => {
	const key = "static:dev:_root_/about"
	const page = createPage("_root_/about")
		.cache({ ssg: true })
		.authorize(() => false)
		.render(() => "live")
	const { app } = serve(page, {
		id: "_root_/about",
		path: "/about",
		seeds: { [await pathOf(key)]: seedFile(key, "SEEDED", { renderedAt: 1, render: "ssg" }) },
	})
	const response = await app.fetch(new Request(`${SITE}/about`))
	expect(response.status).toBe(403)
	expect(await response.text()).not.toContain("SEEDED")
})
