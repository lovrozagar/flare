/** @vitest-environment node */
import { QueryClient } from "@tanstack/solid-query"
import { describe, expect, it } from "vitest"
import { hydrateQueryCache, type QueryState } from "../../../src/query-client/index.tsx"

/* ── data=undefined vs data=null ───────────────────────────────────── */

describe("hydrateQueryCache: null vs undefined data", () => {
	it("hydrates null data correctly", () => {
		const client = new QueryClient()
		const entries: QueryState[] = [{ data: null, key: ["null-key"] }]
		hydrateQueryCache(client, entries)
		expect(client.getQueryData(["null-key"])).toBeNull()
	})

	it("hydrates undefined data (setQueryData stores undefined)", () => {
		const client = new QueryClient()
		const entries: QueryState[] = [{ data: undefined, key: ["undef-key"] }]
		hydrateQueryCache(client, entries)
		expect(client.getQueryData(["undef-key"])).toBeUndefined()
	})

	it("distinguishes null from undefined after hydration", () => {
		const client = new QueryClient()
		hydrateQueryCache(client, [
			{ data: null, key: ["a"] },
			{ data: undefined, key: ["b"] },
		])
		expect(client.getQueryData(["a"])).toBeNull()
		expect(client.getQueryData(["b"])).toBeUndefined()
	})
})

/* ── null segments in key arrays ───────────────────────────────────── */

describe("hydrateQueryCache: key edge cases", () => {
	it("handles null segments in key arrays", () => {
		const client = new QueryClient()
		const entries: QueryState[] = [{ data: "found", key: ["items", null, 42] }]
		hydrateQueryCache(client, entries)
		expect(client.getQueryData(["items", null, 42])).toBe("found")
	})

	it("skips entries where key is not an array", () => {
		const client = new QueryClient()
		const entries = [
			{ data: "valid", key: ["ok"] },
			{ data: "invalid", key: "not-array" as unknown as unknown[] },
		]
		hydrateQueryCache(client, entries)
		expect(client.getQueryData(["ok"])).toBe("valid")
	})
})

/* ── staleTime boundary values ─────────────────────────────────────── */

describe("hydrateQueryCache: staleTime boundaries", () => {
	it("sets staleTime=0 as query default", () => {
		const client = new QueryClient()
		hydrateQueryCache(client, [{ data: "x", key: ["zero-stale"], staleTime: 0 }])
		expect(client.getQueryData(["zero-stale"])).toBe("x")
		const defaults = client.getQueryDefaults(["zero-stale"])
		expect(defaults?.staleTime).toBe(0)
	})

	it("does not set staleTime when undefined", () => {
		const client = new QueryClient()
		hydrateQueryCache(client, [{ data: "x", key: ["no-stale"] }])
		const defaults = client.getQueryDefaults(["no-stale"])
		expect(defaults?.staleTime).toBeUndefined()
	})

	it("overwrites existing entry data", () => {
		const client = new QueryClient()
		client.setQueryData(["overwrite"], "old")
		hydrateQueryCache(client, [{ data: "new", key: ["overwrite"] }])
		expect(client.getQueryData(["overwrite"])).toBe("new")
	})

	it("overwrites existing entry and adds staleTime", () => {
		const client = new QueryClient()
		client.setQueryData(["overwrite2"], "old")
		hydrateQueryCache(client, [{ data: "new", key: ["overwrite2"], staleTime: 5000 }])
		expect(client.getQueryData(["overwrite2"])).toBe("new")
		expect(client.getQueryDefaults(["overwrite2"])?.staleTime).toBe(5000)
	})
})

/* ── empty entries ─────────────────────────────────────────────────── */

describe("hydrateQueryCache: empty input", () => {
	it("does nothing with empty entries array", () => {
		const client = new QueryClient()
		client.setQueryData(["existing"], "keep")
		hydrateQueryCache(client, [])
		expect(client.getQueryData(["existing"])).toBe("keep")
	})
})

/* ── staleTime null ────────────────────────────────────────────────── */

describe("hydrateQueryCache: staleTime=null", () => {
	it("staleTime=null does not set query defaults", () => {
		const client = new QueryClient()
		hydrateQueryCache(client, [
			{ data: "x", key: ["null-stale"], staleTime: null as unknown as number },
		])
		expect(client.getQueryData(["null-stale"])).toBe("x")
		const defaults = client.getQueryDefaults(["null-stale"])
		expect(defaults?.staleTime).toBeUndefined()
	})
})

/* ── multiple entries with same key (last-write-wins) ──────────────── */

describe("hydrateQueryCache: duplicate keys", () => {
	it("last entry wins for duplicate keys", () => {
		const client = new QueryClient()
		hydrateQueryCache(client, [
			{ data: "first", key: ["dup"] },
			{ data: "second", key: ["dup"] },
			{ data: "third", key: ["dup"] },
		])
		expect(client.getQueryData(["dup"])).toBe("third")
	})

	it("staleTime from last entry wins for duplicate keys", () => {
		const client = new QueryClient()
		hydrateQueryCache(client, [
			{ data: "a", key: ["dup-st"], staleTime: 1000 },
			{ data: "b", key: ["dup-st"], staleTime: 9999 },
		])
		expect(client.getQueryData(["dup-st"])).toBe("b")
		expect(client.getQueryDefaults(["dup-st"])?.staleTime).toBe(9999)
	})
})

/* ── deep nested data integrity ────────────────────────────────────── */

describe("hydrateQueryCache: complex data", () => {
	it("preserves deeply nested object structure", () => {
		const complex = {
			items: [
				{ id: 1, meta: { nested: { deep: true }, tags: ["a", "b"] } },
				{ id: 2, meta: { nested: { deep: false }, tags: [] } },
			],
			total: 2,
		}
		const client = new QueryClient()
		hydrateQueryCache(client, [{ data: complex, key: ["complex"] }])
		expect(client.getQueryData(["complex"])).toEqual(complex)
	})

	it("preserves array of primitives", () => {
		const client = new QueryClient()
		hydrateQueryCache(client, [{ data: [1, "two", true, null], key: ["mixed-arr"] }])
		expect(client.getQueryData(["mixed-arr"])).toEqual([1, "two", true, null])
	})

	it("preserves empty string data", () => {
		const client = new QueryClient()
		hydrateQueryCache(client, [{ data: "", key: ["empty-str"] }])
		expect(client.getQueryData(["empty-str"])).toBe("")
	})

	it("preserves numeric zero data", () => {
		const client = new QueryClient()
		hydrateQueryCache(client, [{ data: 0, key: ["zero"] }])
		expect(client.getQueryData(["zero"])).toBe(0)
	})

	it("preserves boolean false data", () => {
		const client = new QueryClient()
		hydrateQueryCache(client, [{ data: false, key: ["false-val"] }])
		expect(client.getQueryData(["false-val"])).toBe(false)
	})
})

/* ── key with object segments ──────────────────────────────────────── */

describe("hydrateQueryCache: keys with object segments", () => {
	it("hydrates query with object key segment", () => {
		const client = new QueryClient()
		const key = ["items", { filter: "active", page: 1 }]
		hydrateQueryCache(client, [{ data: "filtered", key }])
		expect(client.getQueryData(["items", { filter: "active", page: 1 }])).toBe("filtered")
	})
})

/* ── large batch hydration ─────────────────────────────────────────── */

describe("hydrateQueryCache: large batch", () => {
	it("hydrates 500 entries without error", () => {
		const client = new QueryClient()
		const entries: QueryState[] = Array.from({ length: 500 }, (_, i) => ({
			data: { id: i },
			key: [`batch-${i}`],
		}))
		hydrateQueryCache(client, entries)
		expect(client.getQueryData(["batch-0"])).toEqual({ id: 0 })
		expect(client.getQueryData(["batch-499"])).toEqual({ id: 499 })
	})
})
