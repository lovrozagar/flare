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
