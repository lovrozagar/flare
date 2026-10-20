import { afterEach, expect, it, vi } from "vitest"
import { createMemoryStore, utf8Length } from "./memory.ts"

afterEach(() => {
	vi.restoreAllMocks()
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

// An entry past its ttl that nothing reads again is dropped too: each write sweeps a few slots, so anonymous requests
// over endless slugs cannot grow the map without bound (BUGS.md 380).
it("expired swept", async () => {
	vi.useFakeTimers({ now: 0 })
	// The store's map is private: it is the Map its first write wrote "kept" to.
	const sets = vi.spyOn(Map.prototype, "set")
	const store = createMemoryStore()
	await store.set("kept", entry)
	const slots = sets.mock.contexts.find((map): map is Map<string, unknown> => map instanceof Map && map.has("kept"))
	if (slots === undefined) throw new Error("the store's map was not found")
	for (let index = 0; index < 1000; index++) await store.set(`old${index}`, entry, 1)
	vi.setSystemTime(1)
	for (let index = 0; index < 1000; index++) await store.set(`new${index}`, entry, 1000)
	expect([...slots.keys()].filter((key) => !key.startsWith("new"))).toEqual(["kept"])
	expect(await store.get("new999")).toEqual(entry)
})

// The map is an LRU over the UTF-8 length of each entry's JSON: a read makes an entry the most recent, a write past
// `maxBytes` evicts the least recent, an entry over the bound is not stored, and an epoch record is never counted
// nor evicted (B147, BUGS.md 380).
const page = (text: string) => ({ data: text, storedAt: 1 })

it("lru bound", async () => {
	const size = new TextEncoder().encode(JSON.stringify(page("é".repeat(10)))).length
	const store = createMemoryStore({ maxBytes: size * 2 })
	await store.set("epoch:t", { data: 5, storedAt: 5 })
	await store.set("a", page("é".repeat(10)))
	await store.set("b", page("é".repeat(10)))
	expect(await store.get("a")).toEqual(page("é".repeat(10)))
	await store.set("c", page("é".repeat(10)))
	expect([await store.get("a"), await store.get("b"), await store.get("c")]).toEqual([
		page("é".repeat(10)),
		null,
		page("é".repeat(10)),
	])
	await store.set("huge", page("é".repeat(100)))
	expect(await store.get("huge")).toBeNull()
	for (const key of ["d", "e", "f"]) await store.set(key, page("é".repeat(10)))
	expect(await store.get("epoch:t")).toEqual({ data: 5, storedAt: 5 })
	expect([await store.get("d"), await store.get("e"), await store.get("f")]).toEqual([
		null,
		page("é".repeat(10)),
		page("é".repeat(10)),
	])
	for (const maxBytes of [0, 1.5, Number.NaN, -1]) {
		expect(() => createMemoryStore({ maxBytes })).toThrow("createMemoryStore: maxBytes must be a positive whole number")
	}
})

// An entry's size is counted without encoding it, and matches TextEncoder's byte length for every kind of code
// point: ASCII, two-byte, three-byte, a surrogate pair, and a lone surrogate, which encodes as U+FFFD (B147).
it("utf8 length", () => {
	for (const text of ["", "plain", "é", "€", "😀", "a😀é€", "\uD800", "x\uDC00", "\uD800\uD800"]) {
		expect([text, utf8Length(text)]).toEqual([text, new TextEncoder().encode(text).length])
	}
})
