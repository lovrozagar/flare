/**
 * Client Data Fetch Unit Tests
 *
 * Tests NDJSON data fetching for CSR navigation.
 * Parses loader and chunk messages from server.
 */

import { describe, expect, it, vi } from "vitest"
import { createDataFetcher, parseNdjsonLine } from "../../../src/client/data-fetch"
import { MockFetchBuilder } from "../../utils/mock-fetch"
import { createNDJSONResponse, ndjson, toNdjsonString } from "../../utils/ndjson"

describe("parseNdjsonLine", () => {
	it("parses loader message", () => {
		const line = toNdjsonString([ndjson.loader("_root_/products", { products: [] })])
		const msg = parseNdjsonLine(line)

		expect(msg).toEqual({
			d: { products: [] },
			m: "_root_/products",
			t: "l",
		})
	})

	it("parses chunk message", () => {
		const line = toNdjsonString([ndjson.chunk("_root_/products", "reviews", [1, 2, 3])])
		const msg = parseNdjsonLine(line)

		expect(msg).toEqual({
			d: [1, 2, 3],
			k: "reviews",
			m: "_root_/products",
			t: "c",
		})
	})

	it("parses error message", () => {
		const line = toNdjsonString([ndjson.error("_root_/analytics", { message: "Failed" })])
		const msg = parseNdjsonLine(line)

		expect(msg?.t).toBe("e")
		expect(msg?.m).toBe("_root_/analytics")
		expect((msg as { e: { message: string } }).e.message).toBe("Failed")
	})

	it("parses done message", () => {
		const line = toNdjsonString([ndjson.done()])
		const msg = parseNdjsonLine(line)

		expect(msg).toEqual({ t: "d" })
	})

	it("returns null for empty line", () => {
		expect(parseNdjsonLine("")).toBeNull()
		expect(parseNdjsonLine("  ")).toBeNull()
	})

	it("returns null for invalid JSON", () => {
		expect(parseNdjsonLine("not json")).toBeNull()
		expect(parseNdjsonLine("{invalid}")).toBeNull()
	})
})

describe("createDataFetcher", () => {
	it("creates fetcher with config", () => {
		const fetcher = createDataFetcher({
			baseUrl: "https://example.com",
		})

		expect(fetcher).toBeDefined()
		expect(typeof fetcher.fetch).toBe("function")
	})
})

describe("data fetcher", () => {
	it("builds correct request headers", async () => {
		const { fetch: mockFetch, getCapturedHeaders } = new MockFetchBuilder()
			.onUrl("/products", createNDJSONResponse([ndjson.done()]))
			.build()

		const fetcher = createDataFetcher({
			baseUrl: "",
			fetch: mockFetch,
		})

		await fetcher.fetch({
			matchIds: ["_root_", "_root_/products"],
			url: "/products",
		})

		expect(getCapturedHeaders()[0]?.get("x-d")).toBe("1")
		expect(getCapturedHeaders()[0]?.get("x-m")).toBe("_root_,_root_/products")
	})

	it("calls onLoader for loader messages", async () => {
		const onLoader = vi.fn()
		const { fetch: mockFetch } = new MockFetchBuilder()
			.onUrl("/", createNDJSONResponse([ndjson.loader("_root_", { user: "alice" }), ndjson.done()]))
			.build()

		const fetcher = createDataFetcher({
			baseUrl: "",
			fetch: mockFetch,
		})

		await fetcher.fetch({
			matchIds: ["_root_"],
			onLoader,
			url: "/",
		})

		expect(onLoader).toHaveBeenCalledWith("_root_", { user: "alice" })
	})

	it("calls onChunk for chunk messages", async () => {
		const onChunk = vi.fn()
		const { fetch: mockFetch } = new MockFetchBuilder()
			.onUrl(
				"/products",
				createNDJSONResponse([ndjson.chunk("_root_/products", "reviews", [1, 2]), ndjson.done()]),
			)
			.build()

		const fetcher = createDataFetcher({
			baseUrl: "",
			fetch: mockFetch,
		})

		await fetcher.fetch({
			matchIds: ["_root_/products"],
			onChunk,
			url: "/products",
		})

		expect(onChunk).toHaveBeenCalledWith("_root_/products", "reviews", [1, 2])
	})

	it("calls onError for error messages", async () => {
		const onError = vi.fn()
		const { fetch: mockFetch } = new MockFetchBuilder()
			.onUrl(
				"/analytics",
				createNDJSONResponse([
					ndjson.error("_root_/analytics", { message: "Failed" }),
					ndjson.done(),
				]),
			)
			.build()

		const fetcher = createDataFetcher({
			baseUrl: "",
			fetch: mockFetch,
		})

		await fetcher.fetch({
			matchIds: ["_root_/analytics"],
			onError,
			url: "/analytics",
		})

		expect(onError).toHaveBeenCalledWith(
			"_root_/analytics",
			expect.objectContaining({ message: "Failed" }),
		)
	})

	it("calls onDone when stream completes", async () => {
		const onDone = vi.fn()
		const { fetch: mockFetch } = new MockFetchBuilder()
			.onUrl("/", createNDJSONResponse([ndjson.done()]))
			.build()

		const fetcher = createDataFetcher({
			baseUrl: "",
			fetch: mockFetch,
		})

		await fetcher.fetch({
			matchIds: [],
			onDone,
			url: "/",
		})

		expect(onDone).toHaveBeenCalled()
	})

	it("handles prefetch header", async () => {
		const { fetch: mockFetch, getCapturedHeaders } = new MockFetchBuilder()
			.onUrl("/products", createNDJSONResponse([ndjson.done()]))
			.build()

		const fetcher = createDataFetcher({
			baseUrl: "",
			fetch: mockFetch,
		})

		await fetcher.fetch({
			matchIds: [],
			prefetch: true,
			url: "/products",
		})

		expect(getCapturedHeaders()[0]?.get("x-p")).toBe("1")
	})
})
