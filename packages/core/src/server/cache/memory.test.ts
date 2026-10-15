import { afterEach, expect, it, vi } from "vitest"
import { createMemoryStore } from "./memory.ts"

afterEach(() => {
	vi.useRealTimers()
})

const entry = { data: { html: "<p>a</p>" }, storedAt: 1, tags: ["p"] }

it("round trip", async () => {
	const store = createMemoryStore()
	expect(await store.get("k")).toBeNull()
	await store.set("k", entry)
	expect(await store.get("k")).toEqual(entry)
	await store.set("j", { data: 2, storedAt: 1 })
	await store.deleteByTags(["p"])
	expect(await store.get("k")).toBeNull()
	expect(await store.get("j")).toEqual({ data: 2, storedAt: 1 })
})

it("isolated", async () => {
	const one = createMemoryStore()
	const two = createMemoryStore()
	await one.set("k", entry)
	expect(await two.get("k")).toBeNull()
})

// `ttl` is milliseconds. A store that ignored it would keep the entry forever (dx/store.md).
it("ttl", async () => {
	vi.useFakeTimers({ now: 0 })
	const store = createMemoryStore()
	await store.set("k", entry, 1000)
	vi.setSystemTime(999)
	expect(await store.get("k")).toEqual(entry)
	vi.setSystemTime(1000)
	expect(await store.get("k")).toBeNull()
})
