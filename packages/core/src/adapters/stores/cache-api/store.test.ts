import { readFileSync } from "node:fs"
import { expect, it, vi } from "vitest"
import { lookup } from "../../../server/cache/epoch.ts"
import { createRevalidateFn } from "../../../server/cache/revalidate.ts"
import { createCacheApiStore } from "./store.ts"

// A fake CacheStorage: one map per cache name, holding Responses by URL.
function fakeCaches(): { caches: CacheStorage; names: string[] } {
	const names: string[] = []
	const opened = new Map<string, Map<string, Response>>()
	const open = async (name: string) => {
		names.push(name)
		const held = opened.get(name) ?? new Map<string, Response>()
		opened.set(name, held)
		return {
			match: async (request: RequestInfo) =>
				held.get(String(request instanceof Request ? request.url : request))?.clone(),
			put: async (request: RequestInfo, response: Response) => {
				held.set(String(request instanceof Request ? request.url : request), response)
			},
			delete: async (request: RequestInfo) => held.delete(String(request instanceof Request ? request.url : request)),
		}
	}
	return { caches: { open } as unknown as CacheStorage, names }
}

const entry = { data: { html: "<p>a</p>" }, storedAt: 1, tags: ["t"] }

it("round trip", async () => {
	const { caches, names } = fakeCaches()
	const store = createCacheApiStore({ caches })
	expect(await store.get("k")).toBeNull()
	await store.set("k", entry, 60_000)
	expect(await store.get("k")).toEqual(entry)
	expect(names.every((name) => name === "flare")).toBe(true)
	const other = createCacheApiStore({ caches, cacheName: "other" })
	expect(await other.get("k")).toBeNull()
})

// The store never lists keys: the Cache API has no cheap listing, and a purge does not need one.
it("no list", () => {
	const source = readFileSync(new URL("./store.ts", import.meta.url), "utf8")
	expect(source).not.toContain("keys(")
})

// A key purge writes the tombstone into the cache, and a get returns it without listing. A tag purge bumps the epoch.
it("tombstone in cache", async () => {
	vi.useFakeTimers({ now: 5000, toFake: ["Date"] })
	const { caches } = fakeCaches()
	const store = createCacheApiStore({ caches })
	await store.set("k", entry)
	await createRevalidateFn(store)({ keys: ["k"] })
	expect(await store.get("k")).toEqual({ data: { tombstone: true }, storedAt: 5000 })
	await store.set("j", { ...entry, storedAt: 4000 })
	await store.deleteByKeys?.(["x"])
	expect((await store.get("x"))?.data).toEqual({ tombstone: true })
	await store.delete("y")
	expect((await store.get("y"))?.data).toEqual({ tombstone: true })
	await store.deleteByTags(["t"])
	expect((await lookup(store, "j"))?.purged).toBe(true)
	vi.useRealTimers()
})

// Production passes no `caches`: the store opens the global one.
it("global caches", async () => {
	const { caches, names } = fakeCaches()
	vi.stubGlobal("caches", caches)
	const store = createCacheApiStore()
	await store.set("k", entry)
	expect(await store.get("k")).toEqual(entry)
	expect(names).toEqual(["flare", "flare"])
	vi.unstubAllGlobals()
})

// A key or tag holding a lone surrogate is a key like any other, as on the memory and filesystem stores: each one is
// its own entry, and a tag purge of one resolves (BUGS.md 404).
it("lone surrogate", async () => {
	const { caches } = fakeCaches()
	const store = createCacheApiStore({ caches })
	await store.set("k\uD800", { ...entry, data: "high" })
	await store.set("k\uDC00", { ...entry, data: "low" })
	await store.set("k\uFFFD", { ...entry, data: "replacement" })
	const read = async (key: string) => (await store.get(key))?.data
	expect([await read("k\uD800"), await read("k\uDC00"), await read("k\uFFFD"), await read("k%uD800")]).toEqual([
		"high",
		"low",
		"replacement",
		undefined,
	])
	await expect(createRevalidateFn(store)({ tags: ["\uD800"] })).resolves.toBeUndefined()
	expect(typeof (await store.get("epoch:\uD800"))?.data).toBe("number")
})

// Where the store keeps a key.
function url(key: string): string {
	return `https://flare.cache/${encodeURIComponent(key)}`
}

// A cached body that is no entry is logged and read as a miss for a page, removed; for an epoch it reads as a purge now,
// written back, unless a good epoch is there by then (BUGS.md 394).
it("damaged entry", async () => {
	vi.spyOn(console, "error").mockImplementation(() => undefined)
	vi.useFakeTimers({ now: 3000, toFake: ["Date"] })
	const { caches } = fakeCaches()
	const cache = await caches.open("flare")
	const store = createCacheApiStore({ caches })
	await cache.put(url("page"), new Response("{trunc"))
	expect([await store.get("page"), await cache.match(url("page"))]).toEqual([null, undefined])
	await cache.put(url("epoch:t"), new Response("null"))
	expect(await store.get("epoch:t")).toEqual({ data: 3000, storedAt: 3000 })
	expect(await store.get("epoch:t")).toEqual({ data: 3000, storedAt: 3000 })
	// A purge that wrote a good epoch between the damaged read and the rewrite stands, and nothing is written over it.
	const put = vi.fn<Cache["put"]>()
	const match = vi.fn<Cache["match"]>()
	match.mockResolvedValueOnce(new Response("null")).mockResolvedValueOnce(Response.json({ data: 4000, storedAt: 4000 }))
	const raced = createCacheApiStore({ caches: { open: async () => ({ match, put }) } as unknown as CacheStorage })
	expect([await raced.get("epoch:t"), put.mock.calls.length]).toEqual([{ data: 4000, storedAt: 4000 }, 0])
	// One gone by then is written.
	match.mockResolvedValueOnce(new Response("{")).mockResolvedValueOnce(undefined)
	expect([await raced.get("epoch:t"), put.mock.calls.length]).toEqual([{ data: 3000, storedAt: 3000 }, 1])
	// An epoch body that parses but holds no finite number is damaged too.
	for (const body of ["{}", '{"data":"x"}']) {
		await cache.put(url("epoch:u"), new Response(body))
		expect(await store.get("epoch:u")).toEqual({ data: 3000, storedAt: 3000 })
	}
	vi.useRealTimers()
	vi.restoreAllMocks()
})
