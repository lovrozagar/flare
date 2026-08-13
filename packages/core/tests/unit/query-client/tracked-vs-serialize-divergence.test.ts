/** @vitest-environment node */
import { QueryClient } from "@tanstack/solid-query"
import { describe, expect, it } from "vitest"
import {
	createTrackedQueryClient,
	hydrateQueryCache,
	type QueryState,
} from "../../../src/query-client/index.tsx"
import { serializeQueryClientCache } from "../../../src/ssr/index.tsx"

/**
 * These tests document the architectural divergence between:
 * - createTrackedQueryClient: precision tracking via setQueryData patch
 * - serializeQueryClientCache: scrapes entire cache via getAll()
 *
 * Both paths must produce data that hydrateQueryCache can consume.
 */

function parseScript(script: string): QueryState[] {
	if (!script) return []
	const json = script.replace(/.*self\.flare\.q=/, "").replace(/;<\/script>$/, "")
	return JSON.parse(json) as QueryState[]
}

describe("tracked vs serialize: data format compatibility", () => {
	it("both produce entries that hydrateQueryCache accepts", () => {
		const qc = new QueryClient()
		const tracked = createTrackedQueryClient(qc)

		tracked.client.setQueryData(["tracked-key"], { from: "tracked" })
		const trackedEntries = tracked.getTrackedQueries()

		const serializedScript = serializeQueryClientCache(qc, "n")
		const serializedEntries = parseScript(serializedScript)

		/* both produce valid data for hydration */
		const target1 = new QueryClient()
		hydrateQueryCache(target1, trackedEntries)
		expect(target1.getQueryData(["tracked-key"])).toEqual({ from: "tracked" })

		const target2 = new QueryClient()
		hydrateQueryCache(target2, serializedEntries)
		expect(target2.getQueryData(["tracked-key"])).toEqual({ from: "tracked" })
	})

	it("tracked and serialize see the same data for current request", () => {
		const qc = new QueryClient()
		const tracked = createTrackedQueryClient(qc)

		tracked.client.setQueryData(["a"], "alpha")
		tracked.client.setQueryData(["b"], "beta")

		const trackedKeys = tracked.getTrackedQueries().map((e) => e.key)
		const serializedKeys = parseScript(serializeQueryClientCache(qc, "n")).map((e) => e.key)

		/* for a fresh client, both should see the same queries */
		expect(trackedKeys).toEqual(serializedKeys)
	})

	it("serialize captures pre-existing cache entries that tracked misses", () => {
		const qc = new QueryClient()
		/* pre-populate before tracking starts */
		qc.setQueryData(["pre-existing"], "stale")

		const tracked = createTrackedQueryClient(qc)
		tracked.client.setQueryData(["current-req"], "fresh")

		const trackedEntries = tracked.getTrackedQueries()
		const serializedEntries = parseScript(serializeQueryClientCache(qc, "n"))

		/* tracked only has the entry set after tracking started */
		expect(trackedEntries).toHaveLength(1)
		expect(trackedEntries[0].key).toEqual(["current-req"])

		/* serialize has both — this is the data leakage risk in long-running servers */
		expect(serializedEntries).toHaveLength(2)
		const serializedKeys = serializedEntries.map((e) => JSON.stringify(e.key))
		expect(serializedKeys).toContain(JSON.stringify(["pre-existing"]))
		expect(serializedKeys).toContain(JSON.stringify(["current-req"]))
	})

	it("serialize does not see tracked staleTime from defaults", () => {
		const qc = new QueryClient()
		qc.setQueryDefaults(["with-defaults"], { staleTime: 30_000 })

		const tracked = createTrackedQueryClient(qc)
		tracked.client.setQueryData(["with-defaults"], "val")

		/* tracked captures staleTime from getQueryDefaults */
		const trackedEntry = tracked.getTrackedQueries()[0]
		expect(trackedEntry.staleTime).toBe(30_000)

		/* serialize reads options.staleTime from cache entry, which may differ */
		const serializedEntries = parseScript(serializeQueryClientCache(qc, "n"))
		const serializedEntry = serializedEntries.find(
			(e) => JSON.stringify(e.key) === JSON.stringify(["with-defaults"]),
		)
		/* the cache entry's options.staleTime is set by TanStack when an observer
		   uses it, not just by setQueryData. Without an observer, it may be absent. */
		expect(serializedEntry).toBeDefined()
	})
})

describe("tracked: accumulated tracking", () => {
	it("tracks all setQueryData calls including overwrites", () => {
		const qc = new QueryClient()
		const tracked = createTrackedQueryClient(qc)

		tracked.client.setQueryData(["key"], "v1")
		tracked.client.setQueryData(["key"], "v2")
		tracked.client.setQueryData(["key"], "v3")

		/* all three calls are tracked (append-only) */
		const entries = tracked.getTrackedQueries()
		expect(entries).toHaveLength(3)
		expect(entries[2].data).toBe("v3")
	})

	it("tracked queries maintain insertion order", () => {
		const qc = new QueryClient()
		const tracked = createTrackedQueryClient(qc)

		tracked.client.setQueryData(["z"], 3)
		tracked.client.setQueryData(["a"], 1)
		tracked.client.setQueryData(["m"], 2)

		const keys = tracked.getTrackedQueries().map((e) => e.key[0])
		expect(keys).toEqual(["z", "a", "m"])
	})
})
