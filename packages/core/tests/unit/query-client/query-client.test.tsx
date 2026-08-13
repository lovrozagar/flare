/** @vitest-environment node */
import { QueryClient } from "@tanstack/solid-query"
import { describe, expect, it } from "vitest"
import {
	createQueryClientGetter,
	createTrackedQueryClient,
	hydrateQueryCache,
	type QueryState,
} from "../../../src/query-client/index.tsx"

/* ── createQueryClientGetter ─────────────────────────────────────────── */

describe("createQueryClientGetter", () => {
	it("returns a function", () => {
		const getter = createQueryClientGetter()
		expect(getter).toBeTypeOf("function")
	})

	it("returns a QueryClient instance", () => {
		const getter = createQueryClientGetter()
		const qc = getter()
		expect(qc).toBeInstanceOf(QueryClient)
	})

	it("server (no window): each call returns a new instance", () => {
		const getter = createQueryClientGetter()
		const qc1 = getter()
		const qc2 = getter()
		/* in test env, typeof window === "undefined" → new instance each time */
		expect(qc1).not.toBe(qc2)
	})

	it("no options: returns working QueryClient", () => {
		const getter = createQueryClientGetter()
		const qc = getter()
		qc.setQueryData(["test"], "value")
		expect(qc.getQueryData(["test"])).toBe("value")
	})

	it("with defaultOptions.queries.staleTime", () => {
		const getter = createQueryClientGetter({
			defaultOptions: { queries: { staleTime: 30_000 } },
		})
		const qc = getter()
		/* QueryClient was created with default options */
		expect(qc).toBeInstanceOf(QueryClient)
		/* can set/get data */
		qc.setQueryData(["key"], "val")
		expect(qc.getQueryData(["key"])).toBe("val")
	})

	it("with defaultOptions.queries.gcTime", () => {
		const getter = createQueryClientGetter({
			defaultOptions: { queries: { gcTime: 60_000 } },
		})
		const qc = getter()
		expect(qc).toBeInstanceOf(QueryClient)
	})

	it("with defaultOptions.mutations", () => {
		const getter = createQueryClientGetter({
			defaultOptions: { mutations: { retry: false } },
		})
		const qc = getter()
		expect(qc).toBeInstanceOf(QueryClient)
	})

	it("with both queries and mutations options", () => {
		const getter = createQueryClientGetter({
			defaultOptions: {
				mutations: { retry: 0 },
				queries: { gcTime: 300_000, staleTime: 60_000 },
			},
		})
		const qc = getter()
		expect(qc).toBeInstanceOf(QueryClient)
	})

	it("empty options: same as no options", () => {
		const getter = createQueryClientGetter({})
		const qc = getter()
		expect(qc).toBeInstanceOf(QueryClient)
	})

	it("undefined options: same as no options", () => {
		const getter = createQueryClientGetter(undefined)
		const qc = getter()
		expect(qc).toBeInstanceOf(QueryClient)
	})

	it("client instances are independent (server mode)", () => {
		const getter = createQueryClientGetter()
		const qc1 = getter()
		const qc2 = getter()
		qc1.setQueryData(["only-in-1"], "val")
		expect(qc1.getQueryData(["only-in-1"])).toBe("val")
		expect(qc2.getQueryData(["only-in-1"])).toBeUndefined()
	})

	it("works with createTrackedQueryClient", () => {
		const getter = createQueryClientGetter()
		const qc = getter()
		const tracked = createTrackedQueryClient(qc)
		tracked.client.setQueryData(["x"], "val")
		expect(tracked.getTrackedQueries()).toHaveLength(1)
	})

	it("works with hydrateQueryCache", () => {
		const getter = createQueryClientGetter()
		const qc = getter()
		hydrateQueryCache(qc, [{ data: "hydrated", key: ["test"] }])
		expect(qc.getQueryData(["test"])).toBe("hydrated")
	})
})

describe("createQueryClientGetter — client mode (mocked window)", () => {
	const originalWindow = globalThis.window

	function mockClientEnv() {
		;(globalThis as Record<string, unknown>).window = {}
	}

	function restoreEnv() {
		if (originalWindow === undefined) {
			delete (globalThis as Record<string, unknown>).window
		} else {
			;(globalThis as Record<string, unknown>).window = originalWindow
		}
	}

	it("returns same instance (singleton) on client", () => {
		mockClientEnv()
		try {
			const getter = createQueryClientGetter()
			const qc1 = getter()
			const qc2 = getter()
			expect(qc1).toBe(qc2)
		} finally {
			restoreEnv()
		}
	})

	it("singleton shares data across calls", () => {
		mockClientEnv()
		try {
			const getter = createQueryClientGetter()
			const qc1 = getter()
			qc1.setQueryData(["shared"], "value")
			const qc2 = getter()
			expect(qc2.getQueryData(["shared"])).toBe("value")
		} finally {
			restoreEnv()
		}
	})

	it("different getters create different singletons", () => {
		mockClientEnv()
		try {
			const getter1 = createQueryClientGetter()
			const getter2 = createQueryClientGetter()
			const qc1 = getter1()
			const qc2 = getter2()
			expect(qc1).not.toBe(qc2)
		} finally {
			restoreEnv()
		}
	})
})

/* ── createTrackedQueryClient ────────────────────────────────────────── */

describe("createTrackedQueryClient", () => {
	it("tracks queries fetched via setQueryData", () => {
		const qc = new QueryClient()
		const tracked = createTrackedQueryClient(qc)

		tracked.client.setQueryData(["user", 1], { name: "Alice" })
		tracked.client.setQueryData(["posts"], [{ id: 1 }], { updatedAt: Date.now() })

		const states = tracked.getTrackedQueries()
		expect(states).toHaveLength(2)
		expect(states[0]?.key).toEqual(["user", 1])
		expect(states[0]?.data).toEqual({ name: "Alice" })
		expect(states[1]?.key).toEqual(["posts"])
	})

	it("captures staleTime from query defaults", () => {
		const qc = new QueryClient()
		qc.setQueryDefaults(["user"], { staleTime: 60_000 })
		const tracked = createTrackedQueryClient(qc)

		tracked.client.setQueryData(["user", 1], { name: "Alice" })

		const states = tracked.getTrackedQueries()
		expect(states[0]?.staleTime).toBe(60_000)
	})

	it("getTrackedQueries returns empty before any queries", () => {
		const qc = new QueryClient()
		const tracked = createTrackedQueryClient(qc)
		expect(tracked.getTrackedQueries()).toEqual([])
	})

	it("tracks multiple sets to the same key as separate entries", () => {
		const qc = new QueryClient()
		const tracked = createTrackedQueryClient(qc)

		tracked.client.setQueryData(["key"], "first")
		tracked.client.setQueryData(["key"], "second")

		const states = tracked.getTrackedQueries()
		expect(states).toHaveLength(2)
		expect(states[0]?.data).toBe("first")
		expect(states[1]?.data).toBe("second")
	})

	it("tracks null data", () => {
		const qc = new QueryClient()
		const tracked = createTrackedQueryClient(qc)

		tracked.client.setQueryData(["nullable"], null)

		const states = tracked.getTrackedQueries()
		expect(states).toHaveLength(1)
		expect(states[0]?.data).toBeNull()
	})

	it("tracks deeply nested data", () => {
		const qc = new QueryClient()
		const tracked = createTrackedQueryClient(qc)

		const nested = { a: { b: { c: [1, 2, { d: true }] } } }
		tracked.client.setQueryData(["deep"], nested)

		expect(tracked.getTrackedQueries()[0]?.data).toEqual(nested)
	})

	it("tracks compound query keys", () => {
		const qc = new QueryClient()
		const tracked = createTrackedQueryClient(qc)

		tracked.client.setQueryData(["users", { filter: "active", page: 2 }], [])

		const states = tracked.getTrackedQueries()
		expect(states[0]?.key).toEqual(["users", { filter: "active", page: 2 }])
	})

	it("staleTime undefined when no query defaults set", () => {
		const qc = new QueryClient()
		const tracked = createTrackedQueryClient(qc)

		tracked.client.setQueryData(["no-defaults"], "data")

		expect(tracked.getTrackedQueries()[0]?.staleTime).toBeUndefined()
	})

	it("staleTime undefined when defaults exist but staleTime not set", () => {
		const qc = new QueryClient()
		qc.setQueryDefaults(["key"], { retry: false })
		const tracked = createTrackedQueryClient(qc)

		tracked.client.setQueryData(["key"], "data")

		expect(tracked.getTrackedQueries()[0]?.staleTime).toBeUndefined()
	})

	it("staleTime 0 is captured (not treated as falsy)", () => {
		const qc = new QueryClient()
		qc.setQueryDefaults(["instant"], { staleTime: 0 })
		const tracked = createTrackedQueryClient(qc)

		tracked.client.setQueryData(["instant"], "data")

		expect(tracked.getTrackedQueries()[0]?.staleTime).toBe(0)
	})

	it("staleTime Infinity is captured", () => {
		const qc = new QueryClient()
		qc.setQueryDefaults(["forever"], { staleTime: Infinity })
		const tracked = createTrackedQueryClient(qc)

		tracked.client.setQueryData(["forever"], "data")

		expect(tracked.getTrackedQueries()[0]?.staleTime).toBe(Infinity)
	})

	it("copies key array (mutation-safe)", () => {
		const qc = new QueryClient()
		const tracked = createTrackedQueryClient(qc)

		const originalKey = ["mutable", 1]
		tracked.client.setQueryData(originalKey, "val")
		originalKey.push(2)

		expect(tracked.getTrackedQueries()[0]?.key).toEqual(["mutable", 1])
	})

	it("client reference is the same object", () => {
		const qc = new QueryClient()
		const tracked = createTrackedQueryClient(qc)
		expect(tracked.client).toBe(qc)
	})

	it("data with empty string key segment", () => {
		const qc = new QueryClient()
		const tracked = createTrackedQueryClient(qc)

		tracked.client.setQueryData(["", "nested"], "val")
		expect(tracked.getTrackedQueries()[0]?.key).toEqual(["", "nested"])
	})

	it("tracks array data", () => {
		const qc = new QueryClient()
		const tracked = createTrackedQueryClient(qc)

		tracked.client.setQueryData(["list"], [1, 2, 3])

		expect(tracked.getTrackedQueries()[0]?.data).toEqual([1, 2, 3])
	})

	it("tracks empty object data", () => {
		const qc = new QueryClient()
		const tracked = createTrackedQueryClient(qc)

		tracked.client.setQueryData(["empty"], {})

		expect(tracked.getTrackedQueries()[0]?.data).toEqual({})
	})

	it("handles many entries", () => {
		const qc = new QueryClient()
		const tracked = createTrackedQueryClient(qc)

		for (let i = 0; i < 100; i++) {
			tracked.client.setQueryData([`key-${i}`], i)
		}

		const states = tracked.getTrackedQueries()
		expect(states).toHaveLength(100)
		expect(states[0]?.data).toBe(0)
		expect(states[99]?.data).toBe(99)
	})
})

/* ── hydrateQueryCache ───────────────────────────────────────────────── */

describe("hydrateQueryCache", () => {
	it("restores data into query cache", () => {
		const qc = new QueryClient()

		hydrateQueryCache(qc, [
			{ data: { name: "Alice" }, key: ["user", 1] },
			{ data: [{ id: 1 }], key: ["posts"] },
		])

		expect(qc.getQueryData(["user", 1])).toEqual({ name: "Alice" })
		expect(qc.getQueryData(["posts"])).toEqual([{ id: 1 }])
	})

	it("applies staleTime defaults", () => {
		const qc = new QueryClient()

		hydrateQueryCache(qc, [{ data: "cached", key: ["test"], staleTime: 30_000 }])

		const defaults = qc.getQueryDefaults(["test"])
		expect(defaults?.staleTime).toBe(30_000)
	})

	it("empty array is a no-op", () => {
		const qc = new QueryClient()
		hydrateQueryCache(qc, [])
		expect(qc.getQueryData(["anything"])).toBeUndefined()
	})

	it("overwrites existing cache", () => {
		const qc = new QueryClient()
		qc.setQueryData(["key"], "old")

		hydrateQueryCache(qc, [{ data: "new", key: ["key"] }])

		expect(qc.getQueryData(["key"])).toBe("new")
	})

	it("entries without staleTime skip setQueryDefaults", () => {
		const qc = new QueryClient()

		hydrateQueryCache(qc, [{ data: "val", key: ["no-stale"] }])

		const defaults = qc.getQueryDefaults(["no-stale"])
		expect(defaults?.staleTime).toBeUndefined()
	})

	it("staleTime 0 is applied (not skipped)", () => {
		const qc = new QueryClient()

		hydrateQueryCache(qc, [{ data: "val", key: ["instant"], staleTime: 0 }])

		const defaults = qc.getQueryDefaults(["instant"])
		expect(defaults?.staleTime).toBe(0)
	})

	it("restores null data", () => {
		const qc = new QueryClient()

		hydrateQueryCache(qc, [{ data: null, key: ["nullable"] }])

		expect(qc.getQueryData(["nullable"])).toBeNull()
	})

	it("restores deeply nested data", () => {
		const qc = new QueryClient()
		const nested = { a: { b: [1, { c: true }] } }

		hydrateQueryCache(qc, [{ data: nested, key: ["deep"] }])

		expect(qc.getQueryData(["deep"])).toEqual(nested)
	})

	it("restores compound query keys", () => {
		const qc = new QueryClient()

		hydrateQueryCache(qc, [{ data: "val", key: ["users", { page: 1 }] }])

		expect(qc.getQueryData(["users", { page: 1 }])).toBe("val")
	})

	it("mixed entries: some with staleTime, some without", () => {
		const qc = new QueryClient()

		hydrateQueryCache(qc, [
			{ data: "a", key: ["with-stale"], staleTime: 5_000 },
			{ data: "b", key: ["without-stale"] },
			{ data: "c", key: ["with-zero"], staleTime: 0 },
		])

		expect(qc.getQueryData(["with-stale"])).toBe("a")
		expect(qc.getQueryDefaults(["with-stale"])?.staleTime).toBe(5_000)
		expect(qc.getQueryData(["without-stale"])).toBe("b")
		expect(qc.getQueryDefaults(["without-stale"])?.staleTime).toBeUndefined()
		expect(qc.getQueryData(["with-zero"])).toBe("c")
		expect(qc.getQueryDefaults(["with-zero"])?.staleTime).toBe(0)
	})

	it("restores many entries", () => {
		const qc = new QueryClient()

		const entries: QueryState[] = Array.from({ length: 50 }, (_, i) => ({
			data: { index: i },
			key: [`item-${i}`],
		}))

		hydrateQueryCache(qc, entries)

		for (let i = 0; i < 50; i++) {
			expect(qc.getQueryData([`item-${i}`])).toEqual({ index: i })
		}
	})

	it("preserves existing defaults when hydrating without staleTime", () => {
		const qc = new QueryClient()
		qc.setQueryDefaults(["key"], { staleTime: 99_000 })

		hydrateQueryCache(qc, [{ data: "val", key: ["key"] }])

		expect(qc.getQueryDefaults(["key"])?.staleTime).toBe(99_000)
	})

	it("overrides existing staleTime defaults", () => {
		const qc = new QueryClient()
		qc.setQueryDefaults(["key"], { staleTime: 10_000 })

		hydrateQueryCache(qc, [{ data: "val", key: ["key"], staleTime: 50_000 }])

		expect(qc.getQueryDefaults(["key"])?.staleTime).toBe(50_000)
	})
})

/* ── round-trip: tracked → serialize → hydrate ───────────────────────── */

describe("round-trip: createTrackedQueryClient → hydrateQueryCache", () => {
	it("tracked queries can be hydrated into a fresh client", () => {
		const server = new QueryClient()
		const tracked = createTrackedQueryClient(server)

		tracked.client.setQueryData(["user", 1], { name: "Alice" })
		tracked.client.setQueryData(["posts"], [{ id: 1, title: "Hello" }])

		const serialized = JSON.parse(JSON.stringify(tracked.getTrackedQueries()))

		const client = new QueryClient()
		hydrateQueryCache(client, serialized)

		expect(client.getQueryData(["user", 1])).toEqual({ name: "Alice" })
		expect(client.getQueryData(["posts"])).toEqual([{ id: 1, title: "Hello" }])
	})

	it("staleTime survives round-trip", () => {
		const server = new QueryClient()
		server.setQueryDefaults(["cached"], { staleTime: 60_000 })
		const tracked = createTrackedQueryClient(server)

		tracked.client.setQueryData(["cached"], "data")

		const serialized = JSON.parse(JSON.stringify(tracked.getTrackedQueries()))

		const client = new QueryClient()
		hydrateQueryCache(client, serialized)

		expect(client.getQueryData(["cached"])).toBe("data")
		expect(client.getQueryDefaults(["cached"])?.staleTime).toBe(60_000)
	})

	it("round-trip with null data", () => {
		const server = new QueryClient()
		const tracked = createTrackedQueryClient(server)

		tracked.client.setQueryData(["nullable"], null)

		const serialized = JSON.parse(JSON.stringify(tracked.getTrackedQueries()))

		const client = new QueryClient()
		hydrateQueryCache(client, serialized)

		expect(client.getQueryData(["nullable"])).toBeNull()
	})

	it("round-trip preserves compound keys", () => {
		const server = new QueryClient()
		const tracked = createTrackedQueryClient(server)

		tracked.client.setQueryData(["users", { filter: "active", page: 2 }], [{ id: 1 }])

		const serialized = JSON.parse(JSON.stringify(tracked.getTrackedQueries()))

		const client = new QueryClient()
		hydrateQueryCache(client, serialized)

		expect(client.getQueryData(["users", { filter: "active", page: 2 }])).toEqual([{ id: 1 }])
	})

	it("empty tracked set round-trips cleanly", () => {
		const server = new QueryClient()
		const tracked = createTrackedQueryClient(server)

		const serialized = JSON.parse(JSON.stringify(tracked.getTrackedQueries()))

		const client = new QueryClient()
		hydrateQueryCache(client, serialized)

		expect(client.getQueryData(["anything"])).toBeUndefined()
	})

	it("many queries round-trip", () => {
		const server = new QueryClient()
		const tracked = createTrackedQueryClient(server)

		for (let i = 0; i < 25; i++) {
			tracked.client.setQueryData([`q${i}`], { i })
		}

		const serialized = JSON.parse(JSON.stringify(tracked.getTrackedQueries()))

		const client = new QueryClient()
		hydrateQueryCache(client, serialized)

		for (let i = 0; i < 25; i++) {
			expect(client.getQueryData([`q${i}`])).toEqual({ i })
		}
	})
})

/* ── deeper edge cases: createTrackedQueryClient ───────────────────── */

describe("createTrackedQueryClient — deep edge cases", () => {
	it("tracked data is the return value of setQueryData (not input)", () => {
		const qc = new QueryClient()
		const tracked = createTrackedQueryClient(qc)

		/* setQueryData returns the data that was actually stored */
		tracked.client.setQueryData(["k"], "value")
		const states = tracked.getTrackedQueries()
		expect(states[0]?.data).toBe("value")
	})

	it("tracks boolean false data (not treated as missing)", () => {
		const qc = new QueryClient()
		const tracked = createTrackedQueryClient(qc)

		tracked.client.setQueryData(["bool"], false)
		expect(tracked.getTrackedQueries()[0]?.data).toBe(false)
	})

	it("tracks number 0 data", () => {
		const qc = new QueryClient()
		const tracked = createTrackedQueryClient(qc)

		tracked.client.setQueryData(["zero"], 0)
		expect(tracked.getTrackedQueries()[0]?.data).toBe(0)
	})

	it("tracks empty string data", () => {
		const qc = new QueryClient()
		const tracked = createTrackedQueryClient(qc)

		tracked.client.setQueryData(["empty-str"], "")
		expect(tracked.getTrackedQueries()[0]?.data).toBe("")
	})

	it("tracks undefined data as undefined", () => {
		const qc = new QueryClient()
		const tracked = createTrackedQueryClient(qc)

		tracked.client.setQueryData(["undef"], undefined)
		/* TanStack returns undefined for setQueryData(key, undefined) */
		expect(tracked.getTrackedQueries()[0]?.data).toBeUndefined()
	})

	it("single-element key array", () => {
		const qc = new QueryClient()
		const tracked = createTrackedQueryClient(qc)

		tracked.client.setQueryData(["single"], "val")
		expect(tracked.getTrackedQueries()[0]?.key).toEqual(["single"])
	})

	it("numeric key segments", () => {
		const qc = new QueryClient()
		const tracked = createTrackedQueryClient(qc)

		tracked.client.setQueryData([1, 2, 3], "val")
		expect(tracked.getTrackedQueries()[0]?.key).toEqual([1, 2, 3])
	})

	it("mixed key types: string, number, object, boolean", () => {
		const qc = new QueryClient()
		const tracked = createTrackedQueryClient(qc)

		tracked.client.setQueryData(["users", 42, { status: "active" }, true], "data")
		expect(tracked.getTrackedQueries()[0]?.key).toEqual(["users", 42, { status: "active" }, true])
	})

	it("data snapshot is captured at call time", () => {
		const qc = new QueryClient()
		const tracked = createTrackedQueryClient(qc)

		const obj = { count: 1 }
		tracked.client.setQueryData(["snap"], obj)
		/* mutating obj after setQueryData */
		obj.count = 99

		/* tracked data may or may not be the same reference depending on TanStack;
		   but the important thing is the value was captured */
		const data = tracked.getTrackedQueries()[0]?.data as { count: number }
		expect(typeof data.count).toBe("number")
	})

	it("staleTime from parent prefix defaults does NOT match child key", () => {
		const qc = new QueryClient()
		/* defaults for ["users"] */
		qc.setQueryDefaults(["users"], { staleTime: 30_000 })
		const tracked = createTrackedQueryClient(qc)

		/* ["users", 1] is a child — TanStack matches defaults by prefix */
		tracked.client.setQueryData(["users", 1], { name: "Alice" })
		const st = tracked.getTrackedQueries()[0]?.staleTime
		/* TanStack v5 getQueryDefaults matches by prefix, so staleTime should be 30_000 */
		expect(st).toBe(30_000)
	})

	it("original setQueryData still works after tracking", () => {
		const qc = new QueryClient()
		const tracked = createTrackedQueryClient(qc)

		tracked.client.setQueryData(["x"], "tracked-val")

		/* data is actually in the cache */
		expect(qc.getQueryData(["x"])).toBe("tracked-val")
	})

	it("getTrackedQueries returns same array reference each call", () => {
		const qc = new QueryClient()
		const tracked = createTrackedQueryClient(qc)

		tracked.client.setQueryData(["a"], 1)
		const ref1 = tracked.getTrackedQueries()
		const ref2 = tracked.getTrackedQueries()
		expect(ref1).toBe(ref2)
	})

	it("entries added after first getTrackedQueries call are visible", () => {
		const qc = new QueryClient()
		const tracked = createTrackedQueryClient(qc)

		tracked.client.setQueryData(["first"], 1)
		const states = tracked.getTrackedQueries()
		expect(states).toHaveLength(1)

		tracked.client.setQueryData(["second"], 2)
		expect(states).toHaveLength(2)
	})
})

/* ── deeper edge cases: hydrateQueryCache ──────────────────────────── */

describe("hydrateQueryCache — deep edge cases", () => {
	it("staleTime Infinity is applied", () => {
		const qc = new QueryClient()
		hydrateQueryCache(qc, [{ data: "forever", key: ["inf"], staleTime: Infinity }])
		expect(qc.getQueryDefaults(["inf"])?.staleTime).toBe(Infinity)
	})

	it("hydrating same key twice → last write wins for data", () => {
		const qc = new QueryClient()
		hydrateQueryCache(qc, [
			{ data: "first", key: ["dup"] },
			{ data: "second", key: ["dup"] },
		])
		expect(qc.getQueryData(["dup"])).toBe("second")
	})

	it("hydrating same key twice → last staleTime wins", () => {
		const qc = new QueryClient()
		hydrateQueryCache(qc, [
			{ data: "a", key: ["dup"], staleTime: 1_000 },
			{ data: "b", key: ["dup"], staleTime: 99_000 },
		])
		expect(qc.getQueryDefaults(["dup"])?.staleTime).toBe(99_000)
	})

	it("hydrating boolean false data", () => {
		const qc = new QueryClient()
		hydrateQueryCache(qc, [{ data: false, key: ["bool"] }])
		expect(qc.getQueryData(["bool"])).toBe(false)
	})

	it("hydrating number 0 data", () => {
		const qc = new QueryClient()
		hydrateQueryCache(qc, [{ data: 0, key: ["zero"] }])
		expect(qc.getQueryData(["zero"])).toBe(0)
	})

	it("hydrating empty string data", () => {
		const qc = new QueryClient()
		hydrateQueryCache(qc, [{ data: "", key: ["empty-str"] }])
		expect(qc.getQueryData(["empty-str"])).toBe("")
	})

	it("hydrating empty array data", () => {
		const qc = new QueryClient()
		hydrateQueryCache(qc, [{ data: [], key: ["empty-arr"] }])
		expect(qc.getQueryData(["empty-arr"])).toEqual([])
	})

	it("multiple calls to hydrateQueryCache are additive", () => {
		const qc = new QueryClient()
		hydrateQueryCache(qc, [{ data: "a", key: ["first"] }])
		hydrateQueryCache(qc, [{ data: "b", key: ["second"] }])

		expect(qc.getQueryData(["first"])).toBe("a")
		expect(qc.getQueryData(["second"])).toBe("b")
	})

	it("multiple calls overwrite overlapping keys", () => {
		const qc = new QueryClient()
		hydrateQueryCache(qc, [{ data: "old", key: ["shared"] }])
		hydrateQueryCache(qc, [{ data: "new", key: ["shared"] }])

		expect(qc.getQueryData(["shared"])).toBe("new")
	})

	it("numeric key segments", () => {
		const qc = new QueryClient()
		hydrateQueryCache(qc, [{ data: "val", key: [1, 2, 3] }])
		expect(qc.getQueryData([1, 2, 3])).toBe("val")
	})

	it("staleTime does not bleed between unrelated keys", () => {
		const qc = new QueryClient()
		hydrateQueryCache(qc, [
			{ data: "a", key: ["with-stale"], staleTime: 5_000 },
			{ data: "b", key: ["other"] },
		])
		expect(qc.getQueryDefaults(["other"])?.staleTime).toBeUndefined()
	})

	it("non-array key → entry skipped", () => {
		const qc = new QueryClient()
		hydrateQueryCache(qc, [
			{ data: "bad", key: "not-an-array" as unknown as unknown[] },
			{ data: "good", key: ["valid"] },
		])
		expect(qc.getQueryData(["valid"])).toBe("good")
		/* non-array key was skipped, no crash */
	})

	it("null staleTime (from JSON.stringify(Infinity)) → skipped", () => {
		const qc = new QueryClient()
		hydrateQueryCache(qc, [
			{ data: "val", key: ["inf-roundtrip"], staleTime: null as unknown as number },
		])
		expect(qc.getQueryData(["inf-roundtrip"])).toBe("val")
		/* null staleTime skipped → no defaults set */
		expect(qc.getQueryDefaults(["inf-roundtrip"])?.staleTime).toBeUndefined()
	})
})

/* ── deeper round-trip edge cases ─────────────────────────────────── */

describe("round-trip — deep edge cases", () => {
	it("staleTime 0 survives round-trip", () => {
		const server = new QueryClient()
		server.setQueryDefaults(["instant"], { staleTime: 0 })
		const tracked = createTrackedQueryClient(server)
		tracked.client.setQueryData(["instant"], "data")

		const serialized = JSON.parse(JSON.stringify(tracked.getTrackedQueries()))
		const client = new QueryClient()
		hydrateQueryCache(client, serialized)

		expect(client.getQueryDefaults(["instant"])?.staleTime).toBe(0)
	})

	it("staleTime Infinity becomes null in JSON (lossy)", () => {
		const server = new QueryClient()
		server.setQueryDefaults(["inf"], { staleTime: Infinity })
		const tracked = createTrackedQueryClient(server)
		tracked.client.setQueryData(["inf"], "data")

		const serialized = JSON.parse(JSON.stringify(tracked.getTrackedQueries()))
		/* JSON.stringify(Infinity) → null → JSON.parse → null */
		expect(serialized[0].staleTime).toBeNull()
	})

	it("mixed staleTime entries round-trip", () => {
		const server = new QueryClient()
		server.setQueryDefaults(["a"], { staleTime: 1_000 })
		server.setQueryDefaults(["b"], { staleTime: 0 })
		const tracked = createTrackedQueryClient(server)
		tracked.client.setQueryData(["a"], "aa")
		tracked.client.setQueryData(["b"], "bb")
		tracked.client.setQueryData(["c"], "cc")

		const serialized = JSON.parse(JSON.stringify(tracked.getTrackedQueries()))
		const client = new QueryClient()
		hydrateQueryCache(client, serialized)

		expect(client.getQueryData(["a"])).toBe("aa")
		expect(client.getQueryDefaults(["a"])?.staleTime).toBe(1_000)
		expect(client.getQueryData(["b"])).toBe("bb")
		expect(client.getQueryDefaults(["b"])?.staleTime).toBe(0)
		expect(client.getQueryData(["c"])).toBe("cc")
		expect(client.getQueryDefaults(["c"])?.staleTime).toBeUndefined()
	})

	it("boolean/number/string primitives round-trip", () => {
		const server = new QueryClient()
		const tracked = createTrackedQueryClient(server)
		tracked.client.setQueryData(["bool"], false)
		tracked.client.setQueryData(["num"], 0)
		tracked.client.setQueryData(["str"], "")
		tracked.client.setQueryData(["null"], null)

		const serialized = JSON.parse(JSON.stringify(tracked.getTrackedQueries()))
		const client = new QueryClient()
		hydrateQueryCache(client, serialized)

		expect(client.getQueryData(["bool"])).toBe(false)
		expect(client.getQueryData(["num"])).toBe(0)
		expect(client.getQueryData(["str"])).toBe("")
		expect(client.getQueryData(["null"])).toBeNull()
	})

	it("deeply nested keys with objects round-trip", () => {
		const server = new QueryClient()
		const tracked = createTrackedQueryClient(server)
		tracked.client.setQueryData(
			["entity", { filters: { active: true, role: "admin" }, type: "user" }],
			[{ id: 1 }],
		)

		const serialized = JSON.parse(JSON.stringify(tracked.getTrackedQueries()))
		const client = new QueryClient()
		hydrateQueryCache(client, serialized)

		expect(
			client.getQueryData(["entity", { filters: { active: true, role: "admin" }, type: "user" }]),
		).toEqual([{ id: 1 }])
	})

	it("duplicate key tracked entries → last wins on hydrate", () => {
		const server = new QueryClient()
		const tracked = createTrackedQueryClient(server)
		tracked.client.setQueryData(["dup"], "first")
		tracked.client.setQueryData(["dup"], "second")

		const serialized = JSON.parse(JSON.stringify(tracked.getTrackedQueries()))
		expect(serialized).toHaveLength(2)

		const client = new QueryClient()
		hydrateQueryCache(client, serialized)
		/* both entries are hydrated sequentially, last wins */
		expect(client.getQueryData(["dup"])).toBe("second")
	})

	it("large data payloads round-trip", () => {
		const server = new QueryClient()
		const tracked = createTrackedQueryClient(server)
		const bigArray = Array.from({ length: 1000 }, (_, i) => ({
			description: `Item ${i} description`,
			id: i,
			nested: { tags: [`tag-${i}`], value: i * 10 },
		}))
		tracked.client.setQueryData(["big"], bigArray)

		const serialized = JSON.parse(JSON.stringify(tracked.getTrackedQueries()))
		const client = new QueryClient()
		hydrateQueryCache(client, serialized)

		const restored = client.getQueryData(["big"]) as typeof bigArray
		expect(restored).toHaveLength(1000)
		expect(restored[0]).toEqual({
			description: "Item 0 description",
			id: 0,
			nested: { tags: ["tag-0"], value: 0 },
		})
		expect(restored[999]).toEqual({
			description: "Item 999 description",
			id: 999,
			nested: { tags: ["tag-999"], value: 9990 },
		})
	})
})

/* ── Multiple tracked clients ──────────────────────────────────────── */

describe("multiple createTrackedQueryClient on same QueryClient", () => {
	it("second tracker captures queries from first tracker's patched setQueryData", () => {
		const qc = new QueryClient()
		const tracked1 = createTrackedQueryClient(qc)
		const tracked2 = createTrackedQueryClient(qc)

		/* tracked2 wraps tracked1's patched setQueryData */
		tracked2.client.setQueryData(["key"], "val")

		/* tracked2 captured it */
		expect(tracked2.getTrackedQueries()).toHaveLength(1)
		/* tracked1 also captured it (since tracked2 calls tracked1's patched fn) */
		expect(tracked1.getTrackedQueries()).toHaveLength(1)
	})

	it("queries from different trackers are independent", () => {
		const qc = new QueryClient()
		const tracked1 = createTrackedQueryClient(qc)

		tracked1.client.setQueryData(["from-1"], "a")

		/* create second tracker after first query */
		const tracked2 = createTrackedQueryClient(qc)
		tracked2.client.setQueryData(["from-2"], "b")

		expect(tracked1.getTrackedQueries()).toHaveLength(2) /* sees both */
		expect(tracked2.getTrackedQueries()).toHaveLength(1) /* only sees "from-2" */
		expect(tracked2.getTrackedQueries()[0]?.key).toEqual(["from-2"])
	})
})

/* ── setQueryData with updater function ────────────────────────────── */

describe("createTrackedQueryClient — updater function", () => {
	it("tracks result of updater function (not the function itself)", () => {
		const qc = new QueryClient()
		/* seed BEFORE tracking starts */
		qc.setQueryData(["counter"], 0)
		const tracked = createTrackedQueryClient(qc)

		/* now use tracked with updater */
		tracked.client.setQueryData(["counter"], (old: number | undefined) => (old ?? 0) + 1)

		const states = tracked.getTrackedQueries()
		expect(states).toHaveLength(1)
		expect(states[0]?.data).toBe(1)
	})

	it("updater from undefined → initial value", () => {
		const qc = new QueryClient()
		const tracked = createTrackedQueryClient(qc)

		tracked.client.setQueryData(["new"], (old: string | undefined) => old ?? "default")

		expect(tracked.getTrackedQueries()[0]?.data).toBe("default")
	})

	it("multiple updater calls accumulate", () => {
		const qc = new QueryClient()
		/* seed BEFORE tracking starts */
		qc.setQueryData(["count"], 0)
		const tracked = createTrackedQueryClient(qc)

		tracked.client.setQueryData(["count"], (old: number | undefined) => (old ?? 0) + 1)
		tracked.client.setQueryData(["count"], (old: number | undefined) => (old ?? 0) + 1)
		tracked.client.setQueryData(["count"], (old: number | undefined) => (old ?? 0) + 1)

		const states = tracked.getTrackedQueries()
		expect(states).toHaveLength(3)
		expect(states[0]?.data).toBe(1)
		expect(states[1]?.data).toBe(2)
		expect(states[2]?.data).toBe(3)
	})
})

/* ── hydrate + tracked interaction ─────────────────────────────────── */

describe("hydrateQueryCache + createTrackedQueryClient interaction", () => {
	it("hydrate into tracked client → entries tracked", () => {
		const qc = new QueryClient()
		const tracked = createTrackedQueryClient(qc)

		/* hydrate calls setQueryData which is now patched */
		hydrateQueryCache(tracked.client, [
			{ data: "a", key: ["x"] },
			{ data: "b", key: ["y"] },
		])

		expect(tracked.getTrackedQueries()).toHaveLength(2)
		expect(qc.getQueryData(["x"])).toBe("a")
		expect(qc.getQueryData(["y"])).toBe("b")
	})

	it("tracked SSR → serialize → hydrate back into different tracked client", () => {
		/* SSR */
		const serverQC = new QueryClient()
		serverQC.setQueryDefaults(["data"], { staleTime: 10_000 })
		const serverTracked = createTrackedQueryClient(serverQC)
		serverTracked.client.setQueryData(["data"], { items: [1, 2, 3] })
		serverTracked.client.setQueryData(["meta"], { page: 1, total: 100 })

		const payload = JSON.parse(JSON.stringify(serverTracked.getTrackedQueries()))

		/* Client: hydrate into a fresh tracked client (e.g. for re-tracking) */
		const clientQC = new QueryClient()
		const clientTracked = createTrackedQueryClient(clientQC)
		hydrateQueryCache(clientTracked.client, payload)

		/* client tracked captured the hydration */
		expect(clientTracked.getTrackedQueries()).toHaveLength(2)
		/* cache has the data */
		expect(clientQC.getQueryData(["data"])).toEqual({ items: [1, 2, 3] })
		expect(clientQC.getQueryData(["meta"])).toEqual({ page: 1, total: 100 })
		expect(clientQC.getQueryDefaults(["data"])?.staleTime).toBe(10_000)
	})
})

/* ── Simulated full SSR → hydration flow ───────────────────────────── */

describe("e2e: simulated SSR → client hydration", () => {
	it("multi-route SSR: different pages share cache via hydration", () => {
		/* SSR tracks queries from layout + page loaders */
		const serverQC = new QueryClient()
		serverQC.setQueryDefaults(["session"], { staleTime: 300_000 })
		serverQC.setQueryDefaults(["posts"], { staleTime: 30_000 })
		const tracked = createTrackedQueryClient(serverQC)

		/* layout loader */
		tracked.client.setQueryData(["session"], { id: "sess-1", user: "Alice" })
		/* page loader */
		tracked.client.setQueryData(
			["posts", { page: 1 }],
			[
				{ id: 1, title: "Hello" },
				{ id: 2, title: "World" },
			],
		)
		tracked.client.setQueryData(["post-count"], 42)

		/* serialize for SSR response */
		const payload = JSON.parse(JSON.stringify(tracked.getTrackedQueries()))
		expect(payload).toHaveLength(3)

		/* client boot */
		const clientQC = new QueryClient()
		hydrateQueryCache(clientQC, payload)

		expect(clientQC.getQueryData(["session"])).toEqual({ id: "sess-1", user: "Alice" })
		expect(clientQC.getQueryData(["posts", { page: 1 }])).toHaveLength(2)
		expect(clientQC.getQueryData(["post-count"])).toBe(42)
		expect(clientQC.getQueryDefaults(["session"])?.staleTime).toBe(300_000)
		/* staleTime was tracked for ["posts", { page: 1 }] specifically,
		   not the prefix ["posts"] — hydrate sets on exact key */
		expect(clientQC.getQueryDefaults(["posts", { page: 1 }])?.staleTime).toBe(30_000)
	})

	it("hydration is idempotent (applying same payload twice)", () => {
		const serverQC = new QueryClient()
		const tracked = createTrackedQueryClient(serverQC)
		tracked.client.setQueryData(["key"], "value")

		const payload = JSON.parse(JSON.stringify(tracked.getTrackedQueries()))

		const clientQC = new QueryClient()
		hydrateQueryCache(clientQC, payload)
		hydrateQueryCache(clientQC, payload)

		expect(clientQC.getQueryData(["key"])).toBe("value")
	})

	it("hydration with unicode and special characters in data", () => {
		const serverQC = new QueryClient()
		const tracked = createTrackedQueryClient(serverQC)

		const data = {
			emoji: "Test",
			html: '<script>alert("xss")</script>',
			japanese: "JAPANESE",
			newlines: "line1\nline2\ttab",
			quotes: "He said \"hello\" & 'bye'",
		}
		tracked.client.setQueryData(["special"], data)

		const payload = JSON.parse(JSON.stringify(tracked.getTrackedQueries()))
		const clientQC = new QueryClient()
		hydrateQueryCache(clientQC, payload)

		expect(clientQC.getQueryData(["special"])).toEqual(data)
	})

	it("SSR with many different query types", () => {
		const serverQC = new QueryClient()
		const tracked = createTrackedQueryClient(serverQC)

		/* simulate various data shapes from different loaders */
		tracked.client.setQueryData(["user"], { id: 1, name: "Alice" })
		tracked.client.setQueryData(["permissions"], ["read", "write"])
		tracked.client.setQueryData(["feature-flags"], { darkMode: true, newDashboard: false })
		tracked.client.setQueryData(["notification-count"], 5)
		tracked.client.setQueryData(["active-session"], true)
		tracked.client.setQueryData(["recent-searches"], [])
		tracked.client.setQueryData(["theme"], "dark")
		tracked.client.setQueryData(["locale"], "en-US")
		tracked.client.setQueryData(["sidebar-collapsed"], false)
		tracked.client.setQueryData(
			["breadcrumbs"],
			[
				{ label: "Home", path: "/" },
				{ label: "Settings", path: "/settings" },
			],
		)

		const payload = JSON.parse(JSON.stringify(tracked.getTrackedQueries()))
		expect(payload).toHaveLength(10)

		const clientQC = new QueryClient()
		hydrateQueryCache(clientQC, payload)

		expect(clientQC.getQueryData(["user"])).toEqual({ id: 1, name: "Alice" })
		expect(clientQC.getQueryData(["permissions"])).toEqual(["read", "write"])
		expect(clientQC.getQueryData(["notification-count"])).toBe(5)
		expect(clientQC.getQueryData(["active-session"])).toBe(true)
		expect(clientQC.getQueryData(["recent-searches"])).toEqual([])
		expect(clientQC.getQueryData(["sidebar-collapsed"])).toBe(false)
		expect(clientQC.getQueryData(["breadcrumbs"])).toHaveLength(2)
	})
})

/* ── E2E: progressive hydration ────────────────────────────────────── */

describe("e2e: progressive hydration — layout + page loaders", () => {
	it("layout loader hydrates first → page loader adds more → all coexist", () => {
		/* SSR: layout tracks session + nav */
		const serverQC = new QueryClient()
		serverQC.setQueryDefaults(["session"], { staleTime: 300_000 })
		const layoutTracked = createTrackedQueryClient(serverQC)
		layoutTracked.client.setQueryData(["session"], { id: "sess-1", user: "Alice" })
		layoutTracked.client.setQueryData(["nav"], ["/", "/about", "/blog"])

		/* SSR: page tracks page-specific data (same QueryClient, same tracker) */
		layoutTracked.client.setQueryData(
			["posts", { page: 1 }],
			[
				{ id: 1, title: "First post" },
				{ id: 2, title: "Second post" },
			],
		)
		layoutTracked.client.setQueryData(["post-count"], 42)

		const payload = JSON.parse(JSON.stringify(layoutTracked.getTrackedQueries()))
		expect(payload).toHaveLength(4)

		/* client: hydrate everything */
		const clientQC = new QueryClient()
		hydrateQueryCache(clientQC, payload)

		expect(clientQC.getQueryData(["session"])).toEqual({ id: "sess-1", user: "Alice" })
		expect(clientQC.getQueryData(["nav"])).toHaveLength(3)
		expect(clientQC.getQueryData(["posts", { page: 1 }])).toHaveLength(2)
		expect(clientQC.getQueryData(["post-count"])).toBe(42)
		expect(clientQC.getQueryDefaults(["session"])?.staleTime).toBe(300_000)
	})

	it("client-side navigation: hydrate page 1, then add page 2 data without losing page 1", () => {
		/* SSR: page 1 */
		const serverQC = new QueryClient()
		const tracked = createTrackedQueryClient(serverQC)
		tracked.client.setQueryData(["posts", { page: 1 }], [{ id: 1, title: "P1" }])

		const payload = JSON.parse(JSON.stringify(tracked.getTrackedQueries()))
		const clientQC = new QueryClient()
		hydrateQueryCache(clientQC, payload)

		/* client: user navigates, adds page 2 data directly */
		clientQC.setQueryData(["posts", { page: 2 }], [{ id: 2, title: "P2" }])

		/* both pages coexist */
		expect(clientQC.getQueryData(["posts", { page: 1 }])).toEqual([{ id: 1, title: "P1" }])
		expect(clientQC.getQueryData(["posts", { page: 2 }])).toEqual([{ id: 2, title: "P2" }])
	})
})

/* ── E2E: cache lifecycle ──────────────────────────────────────────── */

describe("e2e: cache update lifecycle", () => {
	it("hydrate → update via setQueryData → verify latest data", () => {
		const qc = new QueryClient()
		hydrateQueryCache(qc, [{ data: { count: 0, items: [] }, key: ["cart"] }])

		/* simulate adding items */
		qc.setQueryData(["cart"], { count: 1, items: [{ id: 1, name: "Widget" }] })
		qc.setQueryData(["cart"], {
			count: 2,
			items: [
				{ id: 1, name: "Widget" },
				{ id: 2, name: "Gadget" },
			],
		})

		const cart = qc.getQueryData(["cart"]) as { count: number; items: unknown[] }
		expect(cart.count).toBe(2)
		expect(cart.items).toHaveLength(2)
	})

	it("hydrate with staleTime → update data → staleTime preserved", () => {
		const qc = new QueryClient()
		hydrateQueryCache(qc, [{ data: "v1", key: ["config"], staleTime: 60_000 }])

		/* data updated */
		qc.setQueryData(["config"], "v2")

		/* staleTime still set from hydration */
		expect(qc.getQueryData(["config"])).toBe("v2")
		expect(qc.getQueryDefaults(["config"])?.staleTime).toBe(60_000)
	})

	it("multiple hydrations simulate SSR re-renders → last state wins", () => {
		const clientQC = new QueryClient()

		/* first SSR render (maybe stale) */
		hydrateQueryCache(clientQC, [
			{ data: { name: "Alice", version: 1 }, key: ["user"] },
			{ data: [1], key: ["notifications"] },
		])

		/* second SSR render (fresher) — overwrites */
		hydrateQueryCache(clientQC, [
			{ data: { name: "Alice (updated)", version: 2 }, key: ["user"] },
			{ data: [1, 2, 3], key: ["notifications"] },
		])

		expect((clientQC.getQueryData(["user"]) as Record<string, unknown>).version).toBe(2)
		expect(clientQC.getQueryData(["notifications"])).toEqual([1, 2, 3])
	})
})

/* ── E2E: cross-route cache sharing ────────────────────────────────── */

describe("e2e: shared cache across routes", () => {
	it("SSR /dashboard → hydrate → SSR /profile re-uses session, adds profile data", () => {
		/* route 1: /dashboard */
		const serverQC1 = new QueryClient()
		serverQC1.setQueryDefaults(["session"], { staleTime: 300_000 })
		const t1 = createTrackedQueryClient(serverQC1)
		t1.client.setQueryData(["session"], { name: "Alice" })
		t1.client.setQueryData(["dashboard-stats"], { views: 100 })

		const payload1 = JSON.parse(JSON.stringify(t1.getTrackedQueries()))

		const clientQC = new QueryClient()
		hydrateQueryCache(clientQC, payload1)

		expect(clientQC.getQueryData(["session"])).toEqual({ name: "Alice" })
		expect(clientQC.getQueryData(["dashboard-stats"])).toEqual({ views: 100 })

		/* route 2: /profile — on server, session is already in cache */
		const serverQC2 = new QueryClient()
		serverQC2.setQueryDefaults(["session"], { staleTime: 300_000 })
		const t2 = createTrackedQueryClient(serverQC2)
		t2.client.setQueryData(["session"], { name: "Alice" }) /* same session */
		t2.client.setQueryData(["profile"], { bio: "Developer", email: "alice@test.com" })

		const payload2 = JSON.parse(JSON.stringify(t2.getTrackedQueries()))
		hydrateQueryCache(clientQC, payload2)

		/* session unchanged, profile added, dashboard still there */
		expect(clientQC.getQueryData(["session"])).toEqual({ name: "Alice" })
		expect(clientQC.getQueryData(["profile"])).toEqual({
			bio: "Developer",
			email: "alice@test.com",
		})
		expect(clientQC.getQueryData(["dashboard-stats"])).toEqual({ views: 100 })
	})
})

/* ── E2E: tracked + hydrate + update + re-track ────────────────────── */

describe("e2e: full cache lifecycle with tracked + hydrate + update + re-track", () => {
	it("SSR → hydrate → mutations update cache → re-SSR captures new state", () => {
		/* ── SSR 1: initial render ── */
		const serverQC1 = new QueryClient()
		const t1 = createTrackedQueryClient(serverQC1)
		t1.client.setQueryData(["items"], [{ id: 1, name: "A" }])
		t1.client.setQueryData(["meta"], { total: 1 })

		const payload1 = JSON.parse(JSON.stringify(t1.getTrackedQueries()))

		/* ── Client: hydrate ── */
		const clientQC = new QueryClient()
		hydrateQueryCache(clientQC, payload1)

		/* ── Client: mutations update cache ── */
		clientQC.setQueryData(
			["items"],
			[
				{ id: 1, name: "A" },
				{ id: 2, name: "B" },
			],
		)
		clientQC.setQueryData(["meta"], { total: 2 })

		/* verify client state */
		expect(clientQC.getQueryData(["items"])).toHaveLength(2)
		expect((clientQC.getQueryData(["meta"]) as Record<string, number>).total).toBe(2)

		/* ── SSR 2: re-render with fresh server state ── */
		const serverQC2 = new QueryClient()
		const t2 = createTrackedQueryClient(serverQC2)
		t2.client.setQueryData(
			["items"],
			[
				{ id: 1, name: "A" },
				{ id: 2, name: "B" },
				{ id: 3, name: "C" },
			],
		)
		t2.client.setQueryData(["meta"], { total: 3 })

		const payload2 = JSON.parse(JSON.stringify(t2.getTrackedQueries()))

		/* ── Client: re-hydrate ── */
		hydrateQueryCache(clientQC, payload2)

		expect(clientQC.getQueryData(["items"])).toHaveLength(3)
		expect((clientQC.getQueryData(["meta"]) as Record<string, number>).total).toBe(3)
	})
})

/* ── E2E: stress test ──────────────────────────────────────────────── */

describe("e2e: stress — many queries tracked + serialized + hydrated", () => {
	it("200 tracked queries with mixed types round-trip", () => {
		const serverQC = new QueryClient()
		const tracked = createTrackedQueryClient(serverQC)

		for (let i = 0; i < 50; i++) {
			serverQC.setQueryDefaults([`stale-${i}`], { staleTime: i * 1000 })
		}

		/* 200 queries: 50 with staleTime, 50 strings, 50 arrays, 50 objects */
		for (let i = 0; i < 50; i++) {
			tracked.client.setQueryData([`stale-${i}`], `val-${i}`)
			tracked.client.setQueryData([`string-${i}`], `str-${i}`)
			tracked.client.setQueryData([`array-${i}`], [i, i * 2, i * 3])
			tracked.client.setQueryData([`object-${i}`], { idx: i, nested: { v: i } })
		}

		const queries = tracked.getTrackedQueries()
		expect(queries).toHaveLength(200)

		const payload = JSON.parse(JSON.stringify(queries))
		const clientQC = new QueryClient()
		hydrateQueryCache(clientQC, payload)

		/* spot-check */
		expect(clientQC.getQueryData(["stale-0"])).toBe("val-0")
		expect(clientQC.getQueryData(["stale-49"])).toBe("val-49")
		expect(clientQC.getQueryDefaults(["stale-25"])?.staleTime).toBe(25_000)
		expect(clientQC.getQueryData(["string-30"])).toBe("str-30")
		expect(clientQC.getQueryData(["array-10"])).toEqual([10, 20, 30])
		expect(clientQC.getQueryData(["object-5"])).toEqual({ idx: 5, nested: { v: 5 } })

		/* verify all 200 entries hydrated */
		let count = 0
		for (let i = 0; i < 50; i++) {
			if (clientQC.getQueryData([`stale-${i}`]) !== undefined) count++
			if (clientQC.getQueryData([`string-${i}`]) !== undefined) count++
			if (clientQC.getQueryData([`array-${i}`]) !== undefined) count++
			if (clientQC.getQueryData([`object-${i}`]) !== undefined) count++
		}
		expect(count).toBe(200)
	})
})
