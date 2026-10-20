import { createHash } from "node:crypto"
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { createComponent, type Element } from "solid-js"
import { Dynamic } from "@solidjs/web"
import { afterEach, expect, it, vi } from "vitest"
import { createCacheApiStore } from "../../src/adapters/stores/cache-api/store.ts"
import { fileAssets } from "../../src/adapters/stores/fs/assets.ts"
import { createFilesystemStore } from "../../src/adapters/stores/fs/store.ts"
import { createAssetsStore } from "../../src/server/cache/assets.ts"
import type { FlareStore, FlareStoreEntry } from "../../src/server/cache/contract.ts"
import { createMemoryStore } from "../../src/server/cache/memory.ts"
import { createRevalidateFn, revalidate, type RevalidateOptions } from "../../src/server/cache/revalidate.ts"
import { createServer } from "../../src/server/lifecycle/create.ts"
import { artifactPath } from "../../src/shared/cache/index.ts"
import { createPage } from "../../src/shared/route-builder/page.ts"
import { createRootLayout } from "../../src/shared/route-builder/root-layout.ts"
import { createRouter, type RouteModule } from "../../src/shared/router/create-router.ts"

// Every dx/store.md row through the real createServer(...).fetch: a store behind a stored page, read, written, and
// purged as a request does it (B96). A recording store is a plain FlareStore that keeps what it was asked.

const SITE = "https://example.com"
const KEY = "static:dev:_root_/p"
const dirs: string[] = []

afterEach(() => {
	for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

function temp(): string {
	const dir = mkdtempSync(join(tmpdir(), "flare-store-"))
	dirs.push(dir)
	return dir
}

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

// /p, stored on demand with a 30 s revalidate (so a 60 s ttl) and the cache tag `t`, rendering `p` and counting its renders,
// and /purge, a `.response()` route that calls the handler's revalidate.
function serve(
	stores: { store?: FlareStore; static?: FlareStore },
	input: { ssg?: boolean; purge?: RevalidateOptions } = {},
) {
	const renders = { count: 0 }
	const cdn = { tags: ["t"] }
	const cache = input.ssg === true ? { ssg: true as const, cdn } : { isr: { revalidate: "30s" }, cdn }
	const page = createPage("_root_/p")
		.cache(cache)
		.render(() => {
			renders.count += 1
			return "p"
		})
	const purger = createPage("_root_/purge").response(async () => {
		await revalidate(input.purge ?? { keys: [KEY] })
		return new Response("purged")
	})
	const routeTree = [
		{ id: "_root_/p", path: "/p", module: page as RouteModule },
		{ id: "_root_/purge", path: "/purge", module: purger as RouteModule, response: true },
	]
	const app = createServer({ router: createRouter({ layouts: { _root_: root }, routeTree }), site: SITE, ...stores })
	const get = async (path = "/p"): Promise<{ cache: string | null; text: string }> => {
		const response = await app.fetch(new Request(`${SITE}${path}`))
		return { cache: response.headers.get("flare-cache"), text: await response.text() }
	}
	return { app, renders, get }
}

type Call = { method: string; args: unknown[] }

// A store that does what `inner` does and keeps each call. `withBatch` false leaves deleteByKeys out.
function recording(inner: FlareStore, withBatch = true): FlareStore & { calls: Call[] } {
	const calls: Call[] = []
	const keep = (method: string, args: unknown[]): void => void calls.push({ method, args })
	const store: FlareStore & { calls: Call[] } = {
		calls,
		get: (key) => (keep("get", [key]), inner.get(key)),
		set: (key, entry, ttl) => (keep("set", [key, entry, ttl]), inner.set(key, entry, ttl)),
		delete: (key) => (keep("delete", [key]), inner.delete(key)),
		deleteByTags: (tags) => (keep("deleteByTags", [tags]), inner.deleteByTags(tags)),
	}
	if (withBatch)
		store.deleteByKeys = (keys) => (keep("deleteByKeys", [keys]), inner.deleteByKeys?.(keys) ?? Promise.resolve())
	return store
}

const methods = (store: { calls: Call[] }) => store.calls.map((call) => call.method)

// A request's miss writes the page with `set(key, entry, ttl)`: the framework's key, `storedAt` a time it set, the
// tags, and the ttl in milliseconds; the next request is a hit read by `get` and renders nothing (store.md FlareStore).
it("store set and get", async () => {
	const store = recording(createMemoryStore())
	const { get, renders } = serve({ store })
	expect(await get()).toMatchObject({ cache: "miss", text: expect.stringContaining("p") })
	await vi.waitFor(() => expect(methods(store)).toContain("set"))
	const set = store.calls.find((call) => call.method === "set")
	const [key, entry, ttl] = set?.args ?? []
	expect(key).toBe(KEY)
	expect(entry).toMatchObject({ storedAt: expect.any(Number), tags: ["t"] })
	expect(ttl).toBe(60_000)
	expect(await get()).toMatchObject({ cache: "hit", text: expect.stringContaining("p") })
	expect(renders.count).toBe(1)
	expect(await store.get("static:dev:_root_/nothing")).toBeNull()
})

// A key purge leaves a tombstone, not null, which the next request does not serve: it renders again. A store with
// deleteByKeys gets one batch; one without gets a delete per key (store.md delete, deleteByKeys; revalidate keys).
it("store delete", async () => {
	for (const withBatch of [true, false]) {
		const store = recording(createMemoryStore(), withBatch)
		const { get, renders } = serve({ store })
		await get()
		await vi.waitFor(async () => expect((await get()).cache).toBe("hit"))
		store.calls.length = 0
		await createRevalidateFn(store)({ keys: [KEY] })
		expect(methods(store).filter((method) => method.startsWith("delete"))).toEqual(
			withBatch ? ["deleteByKeys"] : ["delete"],
		)
		expect(await store.get(KEY)).toMatchObject({ data: { tombstone: true }, storedAt: expect.any(Number) })
		expect((await get()).cache).toBe("miss")
		expect(renders.count).toBe(2)
	}
})

// A tag purge bumps `epoch:<tag>`, a number, and never calls deleteByTags; the tagged page renders again
// (store.md deleteByTags; revalidate tags).
it("store tags", async () => {
	const store = recording(createMemoryStore())
	const { get, renders } = serve({ store })
	await get()
	await vi.waitFor(async () => expect((await get()).cache).toBe("hit"))
	await createRevalidateFn(store)({ tags: ["t"] })
	expect(methods(store)).not.toContain("deleteByTags")
	expect((await store.get("epoch:t"))?.data).toEqual(expect.any(Number))
	expect((await get()).cache).toBe("miss")
	expect(renders.count).toBe(2)
})

// The handler's revalidate and createRevalidateFn purge the same store; neither field throws at the call, and a v0
// field throws when the options are read (store.md revalidate).
it("revalidate", async () => {
	const store = createMemoryStore()
	const { get } = serve({ store })
	await get()
	await vi.waitFor(async () => expect((await get()).cache).toBe("hit"))
	expect((await get("/purge")).text).toBe("purged")
	expect((await get()).cache).toBe("miss")
	expect(() => createRevalidateFn(store)({})).toThrow(/keys or tags/)
	expect(() => createRevalidateFn(store)({ keys: [KEY], tiers: ["cdn"] } as RevalidateOptions)).toThrow(/tiers/)
})

// Two memory stores share nothing: a page stored in one is a miss in the other (store.md createMemoryStore).
it("memory isolated", async () => {
	const one = serve({ store: createMemoryStore() })
	await one.get()
	await vi.waitFor(async () => expect((await one.get()).cache).toBe("hit"))
	expect((await serve({ store: createMemoryStore() }).get()).cache).toBe("miss")
})

// A page larger than the memory store's `maxBytes` is not stored, so every request renders it (B147).
it("memory bound", async () => {
	const bounded = serve({ store: createMemoryStore({ maxBytes: 64 }) })
	await bounded.get()
	await new Promise((resolve) => setTimeout(resolve, 50))
	expect([(await bounded.get()).cache, bounded.renders.count]).toEqual(["miss", 2])
})

// Past the filesystem store's `maxBytes`, the next write's pass removes the oldest-written record, so a stored page
// is a miss again (B147).
it("filesystem bound", async () => {
	const dir = temp()
	const first = serve({ store: createFilesystemStore({ dir }) })
	await first.get()
	await vi.waitFor(async () => expect((await first.get()).cache).toBe("hit"))
	const store = createFilesystemStore({ dir, maxBytes: 64 })
	await store.set("other", { data: 1, storedAt: 1 })
	const second = serve({ store })
	expect((await second.get()).cache).toBe("miss")
	// The miss's own write lands before the temp dir goes, so no later case joins a flight into a removed dir.
	await vi.waitFor(async () => expect((await second.get()).cache).toBe("hit"))
})

// The filesystem store writes one file per key under `dir`, named by the SHA-256 hex of the key, and a second store
// over the same dir, as after a restart, serves it (store.md createFilesystemStore, dir).
it("filesystem store", async () => {
	const dir = temp()
	const first = serve({ store: createFilesystemStore({ dir }) })
	await first.get()
	const file = join(dir, createHash("sha256").update(KEY).digest("hex"))
	await vi.waitFor(() => expect(existsSync(file) || existsSync(`${file}.json`)).toBe(true))
	const second = serve({ store: createFilesystemStore({ dir }) })
	expect((await second.get()).cache).toBe("hit")
	expect(second.renders.count).toBe(0)
})

// A seed written where prerender writes it: the record a real write stored, as `{ seed, key, renderedAt, tags, data }`
// at the artifact path for this build under `base`.
async function seedFrom(dir: string, base?: string): Promise<FlareStoreEntry> {
	const memory = createMemoryStore()
	const source = serve({ store: memory })
	await source.get()
	await vi.waitFor(async () => expect(await memory.get(KEY)).not.toBeNull())
	const entry = (await memory.get(KEY)) ?? never()
	const path = (await artifactPath(KEY, { build: "dev", ...(base === undefined ? {} : { base }) })) ?? never()
	const json = { seed: true, key: KEY, renderedAt: entry.storedAt, tags: entry.tags ?? [], data: entry.data }
	mkdirSync(dirname(join(dir, path)), { recursive: true })
	writeFileSync(join(dir, path), JSON.stringify(json))
	return entry
}

// An SSG page is served from the seed the assets store reads through fileAssets on disk, rendering nothing; the store
// is read-only (store.md fileAssets, createAssetsStore, read).
it("assets store", async () => {
	const dir = temp()
	await seedFrom(dir)
	const assets = createAssetsStore(fileAssets(dir))
	const app = serve({ static: assets }, { ssg: true })
	expect(await app.get()).toMatchObject({ text: expect.stringContaining("p") })
	expect(app.renders.count).toBe(0)
	await expect(assets.set(KEY, { data: 1, storedAt: 0 })).rejects.toThrow(/read-only/)
	await expect(fileAssets(dir)("/../../etc/passwd")).rejects.toThrow(/escapes/)
	expect(await fileAssets(dir)("/missing.json")).toBeNull()
})

// A `read` that answers Responses, as the Workers binding does, at the public prefix passed as `base`; a Response that
// is not ok is a miss (store.md createAssetsStore read, base).
it("assets store base", async () => {
	const dir = temp()
	await seedFrom(dir, "/static/seeds")
	const read = fileAssets(dir)
	const binding = async (path: string): Promise<Response> => {
		const bytes = await read(path)
		return bytes === null ? new Response(null, { status: 404 }) : new Response(new Uint8Array(bytes))
	}
	const app = serve({ static: createAssetsStore(binding, { base: "/static/seeds" }) }, { ssg: true })
	await app.get()
	expect(app.renders.count).toBe(0)
	expect(await createAssetsStore(binding).get(KEY)).toBeNull()
})

function urlOf(request: RequestInfo | URL): string {
	return request instanceof Request ? request.url : String(request)
}

// A CacheStorage over memory: what a Workers runtime gives `caches`, one cache per name.
function memoryCaches(): CacheStorage {
	const named = new Map<string, Map<string, Response>>()
	const open = async (name: string): Promise<Cache> => {
		const entries = named.get(name) ?? new Map<string, Response>()
		named.set(name, entries)
		const cache = {
			match: async (request: RequestInfo | URL) => entries.get(urlOf(request))?.clone(),
			put: async (request: RequestInfo | URL, response: Response) => void entries.set(urlOf(request), response.clone()),
			delete: async (request: RequestInfo | URL) => entries.delete(urlOf(request)),
			keys: async () => {
				throw new Error("the store must not list keys")
			},
		}
		return cache as unknown as Cache
	}
	return {
		open,
		has: async (name: string) => named.has(name),
		delete: async (name: string) => named.delete(name),
		keys: async () => [...named.keys()],
		match: async () => undefined,
	} as unknown as CacheStorage
}

// The Cache API store keeps entries in the cache `caches.open(cacheName)` gives, and two names are two stores
// (store.md createCacheApiStore, cacheName, caches).
it("cache api store", async () => {
	const caches = memoryCaches()
	const one = serve({ store: createCacheApiStore({ caches }) })
	await one.get()
	await vi.waitFor(async () => expect((await one.get()).cache).toBe("hit"))
	expect(await caches.has("flare")).toBe(true)
	expect((await serve({ store: createCacheApiStore({ caches, cacheName: "other" }) }).get()).cache).toBe("miss")
	expect((await serve({ store: createCacheApiStore({ caches }) }).get()).cache).toBe("hit")
})

function never(): never {
	throw new Error("unreachable")
}
