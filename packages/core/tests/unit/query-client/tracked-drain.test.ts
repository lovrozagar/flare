/** @vitest-environment node */
import { QueryClient } from "@tanstack/solid-query"
import { describe, expect, it } from "vitest"
import { createTrackedQueryClient } from "../../../src/query-client/index.tsx"

describe("createTrackedQueryClient drain()", () => {
	it("drain() returns tracked entries and clears the internal list", () => {
		const qc = new QueryClient()
		const tracked = createTrackedQueryClient(qc)

		tracked.client.setQueryData(["a"], "alpha")
		tracked.client.setQueryData(["b"], "beta")

		const drained = tracked.drain()
		expect(drained).toHaveLength(2)
		expect(drained[0].key).toEqual(["a"])
		expect(drained[0].data).toBe("alpha")
		expect(drained[1].key).toEqual(["b"])
		expect(drained[1].data).toBe("beta")

		/* internal list is empty after drain */
		expect(tracked.getTrackedQueries()).toHaveLength(0)
	})

	it("drain() returns empty array when nothing tracked", () => {
		const qc = new QueryClient()
		const tracked = createTrackedQueryClient(qc)

		expect(tracked.drain()).toEqual([])
	})

	it("drain() only returns entries since last drain", () => {
		const qc = new QueryClient()
		const tracked = createTrackedQueryClient(qc)

		tracked.client.setQueryData(["first"], 1)
		tracked.drain()

		tracked.client.setQueryData(["second"], 2)
		const second = tracked.drain()

		expect(second).toHaveLength(1)
		expect(second[0].key).toEqual(["second"])
	})

	it("getTrackedQueries still reflects accumulated state before drain", () => {
		const qc = new QueryClient()
		const tracked = createTrackedQueryClient(qc)

		tracked.client.setQueryData(["x"], "val")
		expect(tracked.getTrackedQueries()).toHaveLength(1)

		tracked.drain()
		expect(tracked.getTrackedQueries()).toHaveLength(0)

		tracked.client.setQueryData(["y"], "val2")
		expect(tracked.getTrackedQueries()).toHaveLength(1)
	})
})
