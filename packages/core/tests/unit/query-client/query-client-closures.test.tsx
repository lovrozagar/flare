/** @vitest-environment node */
import { QueryClient } from "@tanstack/solid-query"
import { describe, expect, it } from "vitest"
import {
	createTrackedQueryClient,
	hydrateQueryCache,
	type QueryState,
} from "../../../src/query-client/index.tsx"

/* ── Query client accessor patterns ──────────────────────────────── */

describe("query client accessor optimization", () => {
	it("createTrackedQueryClient tracks setQueryData calls", () => {
		const client = new QueryClient()
		const tracked = createTrackedQueryClient(client)

		tracked.client.setQueryData(["users", 1], { name: "Alice" })
		tracked.client.setQueryData(["users", 2], { name: "Bob" })

		const queries = tracked.getTrackedQueries()
		expect(queries).toHaveLength(2)
		expect(queries[0]?.data).toEqual({ name: "Alice" })
		expect(queries[1]?.data).toEqual({ name: "Bob" })
	})

	it("tracked queries preserve staleTime from defaults", () => {
		const client = new QueryClient()
		client.setQueryDefaults(["users"], { staleTime: 60_000 })
		const tracked = createTrackedQueryClient(client)

		tracked.client.setQueryData(["users", 1], { name: "Alice" })

		const queries = tracked.getTrackedQueries()
		expect(queries[0]?.staleTime).toBe(60_000)
	})

	it("hydrateQueryCache populates client from serialized state", () => {
		const client = new QueryClient()
		const states: QueryState[] = [
			{ data: { name: "Alice" }, key: ["users", 1] },
			{ data: { name: "Bob" }, key: ["users", 2], staleTime: 30_000 },
		]

		hydrateQueryCache(client, states)

		expect(client.getQueryData(["users", 1])).toEqual({ name: "Alice" })
		expect(client.getQueryData(["users", 2])).toEqual({ name: "Bob" })
	})

	it("hydrateQueryCache sets staleTime defaults when provided", () => {
		const client = new QueryClient()
		const states: QueryState[] = [{ data: "test", key: ["key"], staleTime: 45_000 }]

		hydrateQueryCache(client, states)

		/* Data should be set */
		expect(client.getQueryData(["key"])).toBe("test")
		/* staleTime default should be set */
		const defaults = client.getQueryDefaults(["key"])
		expect(defaults?.staleTime).toBe(45_000)
	})
})
