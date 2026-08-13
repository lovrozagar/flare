/**
 * NDJSON Streaming Unit Tests
 *
 * Tests streaming response with deferred chunks.
 */

import { describe, expect, it } from "vitest"
import { createDeferContext } from "../../../src/server/handler/defer"
import {
	createStreamingNDJSONResponse,
	formatChunkMessage,
	formatDoneMessage,
	formatLoaderMessage,
	formatReadyMessage,
} from "../../../src/server/handler/ndjson-nav"

describe("createStreamingNDJSONResponse", () => {
	it("returns static response when no deferred promises", async () => {
		const results = [{ data: { x: 1 }, matchId: "test", status: "success" as const }]
		const deferContexts = new Map()

		const response = createStreamingNDJSONResponse(results, deferContexts)

		expect(response.headers.get("Content-Type")).toBe("application/x-ndjson")

		const body = await response.text()
		const lines = body.trim().split("\n")

		expect(lines).toHaveLength(2)
		expect(lines[0]).toBe(formatLoaderMessage("test", { x: 1 }))
		expect(lines[1]).toBe(formatDoneMessage())
	})

	it("returns static response when deferred dont stream", async () => {
		const results = [{ data: { x: 1 }, matchId: "test", status: "success" as const }]

		/* Create defer context with initialLoad: true (await mode) */
		const deferCtx = createDeferContext({
			disableDefer: false,
			initialLoad: true,
			matchId: "test",
		})

		/* Call defer - will be awaited, not streamed */
		deferCtx.defer(() => Promise.resolve({ deferred: true }))

		const deferContexts = new Map([["test", deferCtx]])
		const response = createStreamingNDJSONResponse(results, deferContexts)

		const body = await response.text()
		const lines = body.trim().split("\n")

		/* Should only have loader + done, no chunk */
		expect(lines).toHaveLength(2)
	})

	it("streams chunk messages for deferred promises", async () => {
		const results = [{ data: { x: 1 }, matchId: "test", status: "success" as const }]

		/* Create defer context with CSR nav (stream mode) */
		const deferCtx = createDeferContext({
			disableDefer: false,
			initialLoad: false,
			matchId: "test",
		})

		/* Call defer with key - will be streamed */
		deferCtx.defer(() => Promise.resolve({ reviews: [1, 2, 3] }), { key: "reviews" })

		const deferContexts = new Map([["test", deferCtx]])
		const response = createStreamingNDJSONResponse(results, deferContexts)

		expect(response.headers.get("Content-Type")).toBe("application/x-ndjson")
		expect(response.headers.get("Transfer-Encoding")).toBe("chunked")

		const body = await response.text()
		const lines = body.trim().split("\n")

		/* loader + ready + chunk + done = 4 */
		expect(lines).toHaveLength(4)
		expect(lines[0]).toBe(formatLoaderMessage("test", { x: 1 }))
		expect(lines[1]).toBe(formatReadyMessage())
		expect(lines[2]).toBe(formatChunkMessage("test", "reviews", { reviews: [1, 2, 3] }))
		expect(lines[3]).toBe(formatDoneMessage())
	})

	it("streams multiple deferred chunks", async () => {
		const results = [
			{ data: { product: "Widget" }, matchId: "_root_/product", status: "success" as const },
		]

		const deferCtx = createDeferContext({
			disableDefer: false,
			initialLoad: false,
			matchId: "_root_/product",
		})

		deferCtx.defer(() => Promise.resolve([1, 2, 3]), { key: "reviews" })
		deferCtx.defer(() => Promise.resolve(["A", "B"]), { key: "related" })

		const deferContexts = new Map([["_root_/product", deferCtx]])
		const response = createStreamingNDJSONResponse(results, deferContexts)

		const body = await response.text()
		const lines = body.trim().split("\n")

		/* loader + ready + 2 chunks + done = 5 */
		expect(lines).toHaveLength(5)
		expect(lines[0]).toContain('"t":"l"')
		expect(lines[1]).toBe(formatReadyMessage())
		expect(lines[4]).toBe(formatDoneMessage())

		/* Two chunk messages (order may vary due to parallel resolution) */
		const chunks = lines.slice(2, 4)
		expect(chunks.some((l) => l.includes('"k":"reviews"'))).toBe(true)
		expect(chunks.some((l) => l.includes('"k":"related"'))).toBe(true)
	})

	it("handles deferred promise rejection", async () => {
		const results = [{ data: {}, matchId: "test", status: "success" as const }]

		const deferCtx = createDeferContext({
			disableDefer: false,
			initialLoad: false,
			matchId: "test",
		})

		deferCtx.defer(() => Promise.reject(new Error("Load failed")), { key: "broken" })

		const deferContexts = new Map([["test", deferCtx]])
		const response = createStreamingNDJSONResponse(results, deferContexts)

		const body = await response.text()
		const lines = body.trim().split("\n")

		/* loader + ready + error + done = 4 */
		expect(lines).toHaveLength(4)
		expect(lines[2]).toContain('"t":"e"')
		expect(lines[2]).toContain("Load failed")
	})

	it("streams deferred from multiple routes", async () => {
		const results = [
			{ data: { layout: true }, matchId: "_root_", status: "success" as const },
			{ data: { page: true }, matchId: "_root_/page", status: "success" as const },
		]

		const rootDefer = createDeferContext({
			disableDefer: false,
			initialLoad: false,
			matchId: "_root_",
		})
		rootDefer.defer(() => Promise.resolve({ user: "alice" }), { key: "user" })

		const pageDefer = createDeferContext({
			disableDefer: false,
			initialLoad: false,
			matchId: "_root_/page",
		})
		pageDefer.defer(() => Promise.resolve({ items: [] }), { key: "items" })

		const deferContexts = new Map([
			["_root_", rootDefer],
			["_root_/page", pageDefer],
		])

		const response = createStreamingNDJSONResponse(results, deferContexts)

		const body = await response.text()
		const lines = body.trim().split("\n")

		/* 2 loaders + ready + 2 chunks + done = 6 */
		expect(lines).toHaveLength(6)
		expect(lines.filter((l) => l.includes('"t":"l"'))).toHaveLength(2)
		expect(lines.filter((l) => l.includes('"t":"r"'))).toHaveLength(1)
		expect(lines.filter((l) => l.includes('"t":"c"'))).toHaveLength(2)
		expect(lines[5]).toBe(formatDoneMessage())
	})
})

describe("streaming vs static behavior", () => {
	it("CSR nav (initialLoad: false) streams deferred", () => {
		const deferCtx = createDeferContext({
			disableDefer: false,
			initialLoad: false,
			matchId: "test",
		})

		deferCtx.defer(() => Promise.resolve("data"))

		const deferred = deferCtx.getDeferred()
		expect(deferred).toHaveLength(1)
		expect(deferred[0]?.stream).toBe(true)
	})

	it("initial load with disableDefer: true streams deferred", () => {
		const deferCtx = createDeferContext({
			disableDefer: true,
			initialLoad: true,
			matchId: "test",
		})

		deferCtx.defer(() => Promise.resolve("data"))

		const deferred = deferCtx.getDeferred()
		expect(deferred).toHaveLength(1)
		expect(deferred[0]?.stream).toBe(true)
	})

	it("initial load with disableDefer: false awaits deferred", () => {
		const deferCtx = createDeferContext({
			disableDefer: false,
			initialLoad: true,
			matchId: "test",
		})

		deferCtx.defer(() => Promise.resolve("data"))

		const deferred = deferCtx.getDeferred()
		expect(deferred).toHaveLength(1)
		expect(deferred[0]?.stream).toBe(false)
	})

	it("explicit stream: true overrides default", () => {
		const deferCtx = createDeferContext({
			disableDefer: false,
			initialLoad: true,
			matchId: "test",
		})

		deferCtx.defer(() => Promise.resolve("data"), { stream: true })

		const deferred = deferCtx.getDeferred()
		expect(deferred[0]?.stream).toBe(true)
	})

	it("explicit stream: false overrides default", () => {
		const deferCtx = createDeferContext({
			disableDefer: false,
			initialLoad: false,
			matchId: "test",
		})

		deferCtx.defer(() => Promise.resolve("data"), { stream: false })

		const deferred = deferCtx.getDeferred()
		expect(deferred[0]?.stream).toBe(false)
	})
})

describe("NDJSON message formatting", () => {
	it("formatLoaderMessage includes matchId and data", () => {
		const msg = formatLoaderMessage("_root_/test", { value: 123 })
		const parsed = JSON.parse(msg)

		expect(parsed.t).toBe("l")
		expect(parsed.m).toBe("_root_/test")
		expect(parsed.d).toEqual({ value: 123 })
	})

	it("formatChunkMessage includes matchId, key, and data", () => {
		const msg = formatChunkMessage("_root_/test", "reviews", [1, 2, 3])
		const parsed = JSON.parse(msg)

		expect(parsed.t).toBe("c")
		expect(parsed.m).toBe("_root_/test")
		expect(parsed.k).toBe("reviews")
		expect(parsed.d).toEqual([1, 2, 3])
	})

	it("formatReadyMessage has correct type", () => {
		const msg = formatReadyMessage()
		const parsed = JSON.parse(msg)

		expect(parsed.t).toBe("r")
	})

	it("formatDoneMessage has correct type", () => {
		const msg = formatDoneMessage()
		const parsed = JSON.parse(msg)

		expect(parsed.t).toBe("d")
	})
})

describe("mixed streaming and awaited deferred", () => {
	it("handles mix of stream: true and stream: false", async () => {
		const results = [{ data: { x: 1 }, matchId: "test", status: "success" as const }]

		const deferCtx = createDeferContext({
			disableDefer: false,
			initialLoad: true,
			matchId: "test",
		})

		/* This one is awaited (default for initialLoad: true) */
		deferCtx.defer(() => Promise.resolve({ awaited: true }), { key: "awaited" })

		/* This one is explicitly streamed */
		deferCtx.defer(() => Promise.resolve({ streamed: true }), { key: "streamed", stream: true })

		const deferContexts = new Map([["test", deferCtx]])
		const response = createStreamingNDJSONResponse(results, deferContexts)

		const body = await response.text()
		const lines = body.trim().split("\n")

		/* Check that only streamed chunk appears (awaited is not sent as chunk) */
		const chunkLines = lines.filter((l) => l.includes('"t":"c"'))
		expect(chunkLines).toHaveLength(1)
		expect(chunkLines[0]).toContain('"k":"streamed"')
	})

	it("ready message comes after loaders but before chunks", async () => {
		const results = [{ data: {}, matchId: "test", status: "success" as const }]

		const deferCtx = createDeferContext({
			disableDefer: false,
			initialLoad: false,
			matchId: "test",
		})

		deferCtx.defer(() => Promise.resolve("data"), { key: "chunk" })

		const deferContexts = new Map([["test", deferCtx]])
		const response = createStreamingNDJSONResponse(results, deferContexts)

		const body = await response.text()
		const lines = body.trim().split("\n")

		/* Find positions of each message type */
		const loaderIdx = lines.findIndex((l) => l.includes('"t":"l"'))
		const readyIdx = lines.findIndex((l) => l.includes('"t":"r"'))
		const chunkIdx = lines.findIndex((l) => l.includes('"t":"c"'))
		const doneIdx = lines.findIndex((l) => l.includes('"t":"d"'))

		expect(loaderIdx).toBeLessThan(readyIdx)
		expect(readyIdx).toBeLessThan(chunkIdx)
		expect(chunkIdx).toBeLessThan(doneIdx)
	})
})

describe("empty and edge cases", () => {
	it("handles empty results array", async () => {
		const results: Array<{ data: unknown; matchId: string; status: "success" }> = []
		const deferContexts = new Map()

		const response = createStreamingNDJSONResponse(results, deferContexts)
		const body = await response.text()
		const lines = body.trim().split("\n")

		/* Only done message */
		expect(lines).toHaveLength(1)
		expect(lines[0]).toBe(formatDoneMessage())
	})

	it("handles results with no deferred at all", async () => {
		const results = [
			{ data: { a: 1 }, matchId: "route-a", status: "success" as const },
			{ data: { b: 2 }, matchId: "route-b", status: "success" as const },
		]
		const deferContexts = new Map()

		const response = createStreamingNDJSONResponse(results, deferContexts)
		const body = await response.text()
		const lines = body.trim().split("\n")

		/* 2 loaders + done */
		expect(lines).toHaveLength(3)
		expect(lines.filter((l) => l.includes('"t":"l"'))).toHaveLength(2)
		expect(lines[2]).toBe(formatDoneMessage())
	})

	it("deferred with immediate resolve still works", async () => {
		const results = [{ data: {}, matchId: "test", status: "success" as const }]

		const deferCtx = createDeferContext({
			disableDefer: false,
			initialLoad: false,
			matchId: "test",
		})

		/* Already resolved before streaming starts */
		const alreadyResolved = Promise.resolve("instant")
		deferCtx.defer(() => alreadyResolved, { key: "instant" })

		const deferContexts = new Map([["test", deferCtx]])
		const response = createStreamingNDJSONResponse(results, deferContexts)

		const body = await response.text()
		const lines = body.trim().split("\n")

		expect(lines.some((l) => l.includes('"k":"instant"'))).toBe(true)
	})
})
