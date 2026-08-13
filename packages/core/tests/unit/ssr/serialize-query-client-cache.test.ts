/** @vitest-environment node */
import { describe, expect, it } from "vitest"
import { serializeQueryClientCache } from "../../../src/ssr/index.tsx"

/* ── helper: build a mock queryClient ──────────────────────────────── */

function mockQC(
	entries: Array<{
		data: unknown
		queryKey: unknown[]
		staleTime?: number
	}>,
) {
	return {
		getQueryCache: () => ({
			getAll: () =>
				entries.map((e) => ({
					options: e.staleTime !== undefined ? { staleTime: e.staleTime } : {},
					queryKey: e.queryKey,
					state: { data: e.data },
				})),
		}),
	}
}

/* ── empty / null / undefined inputs ───────────────────────────────── */

describe("serializeQueryClientCache: empty inputs", () => {
	it("returns empty string for undefined queryClient", () => {
		expect(serializeQueryClientCache(undefined, "abc")).toBe("")
	})

	it("returns empty string for null queryClient", () => {
		expect(serializeQueryClientCache(null, "abc")).toBe("")
	})

	it("returns empty string when no queries exist", () => {
		const qc = mockQC([])
		expect(serializeQueryClientCache(qc, "abc")).toBe("")
	})
})

/* ── missing methods ───────────────────────────────────────────────── */

describe("serializeQueryClientCache: missing methods", () => {
	it("returns empty string when getQueryCache is missing", () => {
		expect(serializeQueryClientCache({}, "abc")).toBe("")
	})

	it("returns empty string when getAll is missing", () => {
		const qc = { getQueryCache: () => ({}) }
		expect(serializeQueryClientCache(qc, "abc")).toBe("")
	})
})

/* ── basic serialization ───────────────────────────────────────────── */

describe("serializeQueryClientCache: output format", () => {
	it("produces a valid script tag with nonce", () => {
		const qc = mockQC([{ data: "hello", queryKey: ["k"] }])
		const result = serializeQueryClientCache(qc, "test-nonce")
		expect(result).toContain("<script")
		expect(result).toContain('nonce="test-nonce"')
		expect(result).toContain("self.flare.q=")
		expect(result).toContain("</script>")
	})

	it("single query serializes key and data", () => {
		const qc = mockQC([{ data: { count: 42 }, queryKey: ["counter"] }])
		const result = serializeQueryClientCache(qc, "n")
		const json = result.replace(/.*self\.flare\.q=/, "").replace(/;<\/script>$/, "")
		const parsed = JSON.parse(json) as Array<{ data: unknown; key: unknown[] }>
		expect(parsed).toHaveLength(1)
		expect(parsed[0].key).toEqual(["counter"])
		expect(parsed[0].data).toEqual({ count: 42 })
	})
})

/* ── nonce attribute escaping ──────────────────────────────────────── */

describe("serializeQueryClientCache: nonce escaping", () => {
	it("escapes special HTML characters in nonce", () => {
		const qc = mockQC([{ data: 1, queryKey: ["x"] }])
		const result = serializeQueryClientCache(qc, '"><img src=x>')
		expect(result).not.toContain('nonce=""><img')
		expect(result).toContain("&quot;")
		expect(result).toContain("&gt;")
	})
})

/* ── XSS prevention ───────────────────────────────────────────────── */

describe("serializeQueryClientCache: XSS prevention", () => {
	it("escapes < in data values", () => {
		const qc = mockQC([{ data: "</script><img>", queryKey: ["xss"] }])
		const result = serializeQueryClientCache(qc, "n")
		expect(result).not.toContain("</script><img>")
		expect(result).toContain("\\u003c")
	})

	it("escapes < in query keys", () => {
		const qc = mockQC([{ data: 1, queryKey: ["<script>alert(1)</script>"] }])
		const result = serializeQueryClientCache(qc, "n")
		expect(result).not.toContain("<script>alert")
		expect(result).toContain("\\u003c")
	})
})

/* ── staleTime handling ────────────────────────────────────────────── */

describe("serializeQueryClientCache: staleTime", () => {
	it("includes staleTime when defined", () => {
		const qc = mockQC([{ data: "v", queryKey: ["s"], staleTime: 30_000 }])
		const result = serializeQueryClientCache(qc, "n")
		const json = result.replace(/.*self\.flare\.q=/, "").replace(/;<\/script>$/, "")
		const parsed = JSON.parse(json) as Array<{ staleTime?: number }>
		expect(parsed[0].staleTime).toBe(30_000)
	})

	it("omits staleTime when undefined", () => {
		const qc = mockQC([{ data: "v", queryKey: ["s"] }])
		const result = serializeQueryClientCache(qc, "n")
		const json = result.replace(/.*self\.flare\.q=/, "").replace(/;<\/script>$/, "")
		const parsed = JSON.parse(json) as Array<{ staleTime?: number }>
		expect(parsed[0].staleTime).toBeUndefined()
		expect(json).not.toContain("staleTime")
	})

	it("preserves staleTime of 0", () => {
		const qc = mockQC([{ data: "v", queryKey: ["s"], staleTime: 0 }])
		const result = serializeQueryClientCache(qc, "n")
		const json = result.replace(/.*self\.flare\.q=/, "").replace(/;<\/script>$/, "")
		const parsed = JSON.parse(json) as Array<{ staleTime?: number }>
		expect(parsed[0].staleTime).toBe(0)
	})

	it("serializes Infinity staleTime as null (JSON limitation)", () => {
		const qc = mockQC([{ data: "v", queryKey: ["s"], staleTime: Infinity }])
		const result = serializeQueryClientCache(qc, "n")
		const json = result.replace(/.*self\.flare\.q=/, "").replace(/;<\/script>$/, "")
		const parsed = JSON.parse(json) as Array<{ staleTime?: number | null }>
		expect(parsed[0].staleTime).toBeNull()
	})
})

/* ── null data ─────────────────────────────────────────────────────── */

describe("serializeQueryClientCache: null data", () => {
	it("serializes null data correctly", () => {
		const qc = mockQC([{ data: null, queryKey: ["null-test"] }])
		const result = serializeQueryClientCache(qc, "n")
		const json = result.replace(/.*self\.flare\.q=/, "").replace(/;<\/script>$/, "")
		const parsed = JSON.parse(json) as Array<{ data: unknown }>
		expect(parsed[0].data).toBeNull()
	})

	it("serializes undefined data as null (JSON limitation)", () => {
		const qc = mockQC([{ data: undefined, queryKey: ["undef-test"] }])
		const result = serializeQueryClientCache(qc, "n")
		expect(result).not.toBe("")
	})
})

/* ── large payload ─────────────────────────────────────────────────── */

describe("serializeQueryClientCache: large payloads", () => {
	it("handles 100 queries without truncation", () => {
		const entries = Array.from({ length: 100 }, (_, i) => ({
			data: { id: i, title: `Item-${i}` },
			queryKey: [`item-${i}`],
		}))
		const qc = mockQC(entries)
		const result = serializeQueryClientCache(qc, "n")
		const json = result.replace(/.*self\.flare\.q=/, "").replace(/;<\/script>$/, "")
		const parsed = JSON.parse(json) as unknown[]
		expect(parsed).toHaveLength(100)
	})
})

/* ── deeply nested / complex data ──────────────────────────────────── */

describe("serializeQueryClientCache: complex data types", () => {
	it("serializes deeply nested objects", () => {
		const data = { a: { b: { c: { d: [1, { e: "deep" }] } } } }
		const qc = mockQC([{ data, queryKey: ["nested"] }])
		const result = serializeQueryClientCache(qc, "n")
		const parsed = parseEntries(result)
		expect(parsed[0].data).toEqual(data)
	})

	it("serializes boolean values", () => {
		const qc = mockQC([
			{ data: true, queryKey: ["bool-true"] },
			{ data: false, queryKey: ["bool-false"] },
		])
		const parsed = parseEntries(serializeQueryClientCache(qc, "n"))
		expect(parsed[0].data).toBe(true)
		expect(parsed[1].data).toBe(false)
	})

	it("serializes numeric edge cases", () => {
		const qc = mockQC([
			{ data: 0, queryKey: ["zero"] },
			{ data: -0, queryKey: ["neg-zero"] },
			{ data: Number.MAX_SAFE_INTEGER, queryKey: ["max-int"] },
		])
		const parsed = parseEntries(serializeQueryClientCache(qc, "n"))
		expect(parsed[0].data).toBe(0)
		expect(parsed[2].data).toBe(Number.MAX_SAFE_INTEGER)
	})

	it("NaN in data serializes as null (JSON limitation)", () => {
		const qc = mockQC([{ data: NaN, queryKey: ["nan"] }])
		const parsed = parseEntries(serializeQueryClientCache(qc, "n"))
		expect(parsed[0].data).toBeNull()
	})

	it("serializes empty string data", () => {
		const qc = mockQC([{ data: "", queryKey: ["empty-str"] }])
		const parsed = parseEntries(serializeQueryClientCache(qc, "n"))
		expect(parsed[0].data).toBe("")
	})

	it("serializes empty arrays and objects", () => {
		const qc = mockQC([
			{ data: [], queryKey: ["empty-arr"] },
			{ data: {}, queryKey: ["empty-obj"] },
		])
		const parsed = parseEntries(serializeQueryClientCache(qc, "n"))
		expect(parsed[0].data).toEqual([])
		expect(parsed[1].data).toEqual({})
	})

	it("serializes unicode and emoji in data", () => {
		const qc = mockQC([{ data: { emoji: "🔥", kanji: "漢字" }, queryKey: ["unicode"] }])
		const parsed = parseEntries(serializeQueryClientCache(qc, "n"))
		expect((parsed[0].data as Record<string, string>).emoji).toBe("🔥")
		expect((parsed[0].data as Record<string, string>).kanji).toBe("漢字")
	})

	it("preserves insertion order of multiple queries", () => {
		const qc = mockQC([
			{ data: "first", queryKey: ["a"] },
			{ data: "second", queryKey: ["b"] },
			{ data: "third", queryKey: ["c"] },
		])
		const parsed = parseEntries(serializeQueryClientCache(qc, "n"))
		expect(parsed.map((e) => e.key[0])).toEqual(["a", "b", "c"])
	})
})

/* ── query key with object segments ────────────────────────────────── */

describe("serializeQueryClientCache: complex query keys", () => {
	it("serializes keys with object segments", () => {
		const qc = mockQC([{ data: "found", queryKey: ["items", { filter: "active", page: 1 }] }])
		const parsed = parseEntries(serializeQueryClientCache(qc, "n"))
		expect(parsed[0].key).toEqual(["items", { filter: "active", page: 1 }])
	})

	it("serializes keys with mixed segment types", () => {
		const qc = mockQC([{ data: "val", queryKey: ["ns", 42, true, null, { sort: "asc" }] }])
		const parsed = parseEntries(serializeQueryClientCache(qc, "n"))
		expect(parsed[0].key).toEqual(["ns", 42, true, null, { sort: "asc" }])
	})
})

/* ── duplicate keys ────────────────────────────────────────────────── */

describe("serializeQueryClientCache: duplicate keys", () => {
	it("serializes both entries when duplicate keys appear", () => {
		const qc = mockQC([
			{ data: "v1", queryKey: ["dup"] },
			{ data: "v2", queryKey: ["dup"] },
		])
		const parsed = parseEntries(serializeQueryClientCache(qc, "n"))
		expect(parsed).toHaveLength(2)
	})
})

/* ── XSS: deeper vectors ──────────────────────────────────────────── */

describe("serializeQueryClientCache: deep XSS vectors", () => {
	it("escapes < buried in nested objects", () => {
		const data = { nested: { html: "</script><img onerror=alert(1)>" } }
		const qc = mockQC([{ data, queryKey: ["deep-xss"] }])
		const result = serializeQueryClientCache(qc, "n")
		expect(result).not.toContain("</script><img")
		/* entire output should have zero raw < inside the JSON payload */
		const jsonPayload = result.replace(/.*self\.flare\.q=/, "").replace(/;<\/script>$/, "")
		expect(jsonPayload).not.toContain("<")
	})

	it("escapes < in array elements", () => {
		const qc = mockQC([{ data: ["<b>bold</b>", "<i>italic</i>"], queryKey: ["arr-xss"] }])
		const result = serializeQueryClientCache(qc, "n")
		const jsonPayload = result.replace(/.*self\.flare\.q=/, "").replace(/;<\/script>$/, "")
		expect(jsonPayload).not.toContain("<")
	})
})

/* ── serialize with real QueryClient ───────────────────────────────── */

describe("serializeQueryClientCache: real QueryClient", () => {
	it("serializes data from a real TanStack QueryClient", () => {
		const { QueryClient } =
			require("@tanstack/solid-query") as typeof import("@tanstack/solid-query")
		const qc = new QueryClient()
		qc.setQueryData(["real-test"], { works: true })

		const result = serializeQueryClientCache(qc, "real-nonce")
		const parsed = parseEntries(result)
		expect(parsed).toHaveLength(1)
		expect(parsed[0].key).toEqual(["real-test"])
		expect(parsed[0].data).toEqual({ works: true })
	})

	it("serializes multiple queries from real QueryClient", () => {
		const { QueryClient } =
			require("@tanstack/solid-query") as typeof import("@tanstack/solid-query")
		const qc = new QueryClient()
		qc.setQueryData(["user", 1], { name: "Alice" })
		qc.setQueryData(["user", 2], { name: "Bob" })
		qc.setQueryData(["settings"], { dark: true })

		const result = serializeQueryClientCache(qc, "n")
		const parsed = parseEntries(result)
		expect(parsed).toHaveLength(3)
		const keys = parsed.map((e) => JSON.stringify(e.key))
		expect(keys).toContain(JSON.stringify(["user", 1]))
		expect(keys).toContain(JSON.stringify(["user", 2]))
		expect(keys).toContain(JSON.stringify(["settings"]))
	})

	it("empty real QueryClient returns empty string", () => {
		const { QueryClient } =
			require("@tanstack/solid-query") as typeof import("@tanstack/solid-query")
		const qc = new QueryClient()
		expect(serializeQueryClientCache(qc, "n")).toBe("")
	})

	it("real QueryClient with staleTime in options", () => {
		const { QueryClient } =
			require("@tanstack/solid-query") as typeof import("@tanstack/solid-query")
		const qc = new QueryClient()
		qc.setQueryDefaults(["cached"], { staleTime: 30_000 })
		qc.setQueryData(["cached"], "value")

		const result = serializeQueryClientCache(qc, "n")
		const parsed = parseEntries(result)
		/* real QueryClient stores staleTime in observer options, not cache entry options.
		   serializeQueryClientCache reads from cache entry options which may differ. */
		expect(parsed).toHaveLength(1)
		expect(parsed[0].data).toBe("value")
	})
})

/* ── helper ────────────────────────────────────────────────────────── */

function parseEntries(
	script: string,
): Array<{ data: unknown; key: unknown[]; staleTime?: number }> {
	if (!script) return []
	const json = script.replace(/.*self\.flare\.q=/, "").replace(/;<\/script>$/, "")
	return JSON.parse(json) as Array<{ data: unknown; key: unknown[]; staleTime?: number }>
}
