/**
 * NDJSON Navigation Client Tests
 *
 * Tests for client-side NDJSON parsing and navigation fetcher.
 */

import { describe, expect, it, vi } from "vitest"
import { createNdjsonNavFetcher, parseNdjsonLine } from "../../../src/client/ndjson-nav"
import { CSR_HEADERS, NAV_FORMAT } from "../../../src/server/handler/constants"
import { createNDJSONResponse, createStreamingNDJSONResponse, ndjson } from "../../utils"

/* ============================================================================
 * parseNdjsonLine
 * ============================================================================ */

describe("parseNdjsonLine", () => {
	describe("invalid input", () => {
		it("returns null for empty line", () => {
			expect(parseNdjsonLine("")).toBeNull()
		})

		it("returns null for whitespace-only line", () => {
			expect(parseNdjsonLine("   ")).toBeNull()
			expect(parseNdjsonLine("\t")).toBeNull()
			expect(parseNdjsonLine("\n")).toBeNull()
		})

		it("returns null for invalid JSON", () => {
			expect(parseNdjsonLine("not json")).toBeNull()
			expect(parseNdjsonLine("{invalid}")).toBeNull()
			expect(parseNdjsonLine("{'single': 'quotes'}")).toBeNull()
		})

		it("returns null for incomplete JSON", () => {
			expect(parseNdjsonLine('{"t":"l"')).toBeNull()
			expect(parseNdjsonLine('{"t":')).toBeNull()
		})
	})

	describe("loader message (t: l)", () => {
		it("parses loader message with data", () => {
			const line = JSON.stringify(ndjson.loader("_root_", { user: "alice" }))
			const msg = parseNdjsonLine(line)

			expect(msg).not.toBeNull()
			expect(msg?.t).toBe("l")
			if (msg?.t === "l") {
				expect(msg.m).toBe("_root_")
				expect(msg.d).toEqual({ user: "alice" })
			}
		})

		it("parses loader message with preloader context", () => {
			const line = JSON.stringify(ndjson.loader("_root_", { items: [] }, { auth: { userId: 1 } }))
			const msg = parseNdjsonLine(line)

			expect(msg?.t).toBe("l")
			if (msg?.t === "l") {
				expect(msg.p).toEqual({ auth: { userId: 1 } })
			}
		})

		it("parses loader message with null data", () => {
			const line = JSON.stringify(ndjson.loader("test", null))
			const msg = parseNdjsonLine(line)

			if (msg?.t === "l") {
				expect(msg.d).toBeNull()
			}
		})

		it("parses loader message with complex nested data", () => {
			const complexData = {
				items: [1, 2, 3],
				nested: { a: { b: { c: "deep" } } },
				special: [null, undefined, true, false],
			}
			const line = JSON.stringify(ndjson.loader("test", complexData))
			const msg = parseNdjsonLine(line)

			if (msg?.t === "l") {
				expect(msg.d).toEqual({
					items: [1, 2, 3],
					nested: { a: { b: { c: "deep" } } },
					special: [null, null, true, false],
				})
			}
		})

		it("parses loader message with deferred marker", () => {
			const dataWithDeferred = {
				immediate: "value",
				lazy: ndjson.deferred("lazyKey"),
			}
			const line = JSON.stringify(ndjson.loader("_root_", dataWithDeferred))
			const msg = parseNdjsonLine(line)

			if (msg?.t === "l") {
				expect((msg.d as Record<string, unknown>).lazy).toEqual({
					__deferred: true,
					__key: "lazyKey",
				})
			}
		})
	})

	describe("chunk message (t: c)", () => {
		it("parses chunk message", () => {
			const line = JSON.stringify(ndjson.chunk("_root_/page", "reviews", [1, 2, 3]))
			const msg = parseNdjsonLine(line)

			expect(msg?.t).toBe("c")
			if (msg?.t === "c") {
				expect(msg.m).toBe("_root_/page")
				expect(msg.k).toBe("reviews")
				expect(msg.d).toEqual([1, 2, 3])
			}
		})

		it("parses chunk message with complex data", () => {
			const chunkData = { users: [{ name: "Alice" }, { name: "Bob" }] }
			const line = JSON.stringify(ndjson.chunk("_root_", "users", chunkData))
			const msg = parseNdjsonLine(line)

			if (msg?.t === "c") {
				expect(msg.d).toEqual(chunkData)
			}
		})
	})

	describe("error message (t: e)", () => {
		it("parses error message", () => {
			const line = JSON.stringify(ndjson.error("_root_/fail", { message: "Load failed" }))
			const msg = parseNdjsonLine(line)

			expect(msg?.t).toBe("e")
			if (msg?.t === "e") {
				expect(msg.m).toBe("_root_/fail")
				expect(msg.e.message).toBe("Load failed")
			}
		})

		it("parses error message with key for deferred error", () => {
			const line = JSON.stringify(ndjson.error("_root_", { message: "Chunk failed" }, "lazyKey"))
			const msg = parseNdjsonLine(line)

			if (msg?.t === "e") {
				expect(msg.k).toBe("lazyKey")
			}
		})
	})

	describe("control messages", () => {
		it("parses ready message", () => {
			const line = JSON.stringify(ndjson.ready())
			const msg = parseNdjsonLine(line)

			expect(msg).not.toBeNull()
			expect(msg?.t).toBe("r")
		})

		it("parses done message", () => {
			const line = JSON.stringify(ndjson.done())
			const msg = parseNdjsonLine(line)

			expect(msg).not.toBeNull()
			expect(msg?.t).toBe("d")
		})
	})

	describe("head message (t: h)", () => {
		it("parses merged head message (no matchId)", () => {
			const line = JSON.stringify(ndjson.head({ title: "Page Title" }))
			const msg = parseNdjsonLine(line)

			expect(msg?.t).toBe("h")
			if (msg?.t === "h") {
				expect(msg.d.title).toBe("Page Title")
				expect(msg.m).toBeUndefined()
			}
		})

		it("parses per-route head message (with matchId)", () => {
			const line = JSON.stringify(ndjson.head({ title: "Products" }, "_root_/products"))
			const msg = parseNdjsonLine(line)

			if (msg?.t === "h") {
				expect(msg.m).toBe("_root_/products")
			}
		})
	})

	describe("query message (t: q)", () => {
		it("parses query message", () => {
			const queries = [
				{ data: { name: "Alice" }, key: ["user", 1] },
				{ data: [1, 2, 3], key: ["items"] },
			]
			const line = JSON.stringify(ndjson.query(queries))
			const msg = parseNdjsonLine(line)

			expect(msg?.t).toBe("q")
			if (msg?.t === "q") {
				expect(msg.d).toEqual(queries)
			}
		})
	})
})

/* ============================================================================
 * createNdjsonNavFetcher
 * ============================================================================ */

describe("createNdjsonNavFetcher", () => {
	describe("request configuration", () => {
		it("returns fetcher with fetch method", () => {
			const fetcher = createNdjsonNavFetcher({ baseUrl: "" })

			expect(fetcher).toHaveProperty("fetch")
			expect(typeof fetcher.fetch).toBe("function")
		})

		it("sends X-Flare-Data header", async () => {
			const mockFetch = vi
				.fn()
				.mockResolvedValue(
					createNDJSONResponse([ndjson.loader("_root_", {}), ndjson.ready(), ndjson.done()]),
				)

			const fetcher = createNdjsonNavFetcher({ baseUrl: "", fetch: mockFetch })
			await fetcher.fetch({ url: "/test" })

			expect(mockFetch).toHaveBeenCalledWith(
				"/test",
				expect.objectContaining({
					headers: expect.objectContaining({
						[CSR_HEADERS.DATA_REQUEST]: "1",
					}),
				}),
			)
		})

		it("sends X-Flare-Nav header with ndjson value", async () => {
			const mockFetch = vi
				.fn()
				.mockResolvedValue(
					createNDJSONResponse([ndjson.loader("_root_", {}), ndjson.ready(), ndjson.done()]),
				)

			const fetcher = createNdjsonNavFetcher({ baseUrl: "", fetch: mockFetch })
			await fetcher.fetch({ url: "/test" })

			expect(mockFetch).toHaveBeenCalledWith(
				"/test",
				expect.objectContaining({
					headers: expect.objectContaining({
						[CSR_HEADERS.NAV_FORMAT]: NAV_FORMAT.NDJSON,
					}),
				}),
			)
		})

		it("sends X-Flare-Prefetch header when prefetch option is true", async () => {
			const mockFetch = vi
				.fn()
				.mockResolvedValue(
					createNDJSONResponse([ndjson.loader("_root_", {}), ndjson.ready(), ndjson.done()]),
				)

			const fetcher = createNdjsonNavFetcher({ baseUrl: "", fetch: mockFetch })
			await fetcher.fetch({ prefetch: true, url: "/test" })

			expect(mockFetch).toHaveBeenCalledWith(
				"/test",
				expect.objectContaining({
					headers: expect.objectContaining({
						[CSR_HEADERS.PREFETCH]: "1",
					}),
				}),
			)
		})

		it("prepends baseUrl to request URL", async () => {
			const mockFetch = vi
				.fn()
				.mockResolvedValue(
					createNDJSONResponse([ndjson.loader("_root_", {}), ndjson.ready(), ndjson.done()]),
				)

			const fetcher = createNdjsonNavFetcher({
				baseUrl: "https://example.com",
				fetch: mockFetch,
			})
			await fetcher.fetch({ url: "/products" })

			expect(mockFetch).toHaveBeenCalledWith("https://example.com/products", expect.anything())
		})
	})

	describe("successful responses", () => {
		it("returns success with parsed state", async () => {
			const mockFetch = vi
				.fn()
				.mockResolvedValue(
					createNDJSONResponse([
						ndjson.loader("_root_", { user: "alice" }),
						ndjson.loader("_root_/products", { items: [1, 2, 3] }),
						ndjson.ready(),
						ndjson.done(),
					]),
				)

			const fetcher = createNdjsonNavFetcher({ baseUrl: "", fetch: mockFetch })
			const result = await fetcher.fetch({ url: "/products" })

			expect(result.success).toBe(true)
			if (result.success && result.state) {
				expect(result.state.matches).toHaveLength(2)
				expect(result.state.matches[0].id).toBe("_root_")
				expect(result.state.matches[0].loaderData).toEqual({ user: "alice" })
				expect(result.state.matches[1].id).toBe("_root_/products")
				expect(result.state.matches[1].loaderData).toEqual({ items: [1, 2, 3] })
			}
		})

		it("includes preloader context in matches", async () => {
			const mockFetch = vi
				.fn()
				.mockResolvedValue(
					createNDJSONResponse([
						ndjson.loader("_root_", { data: "test" }, { auth: { role: "admin" } }),
						ndjson.ready(),
						ndjson.done(),
					]),
				)

			const fetcher = createNdjsonNavFetcher({ baseUrl: "", fetch: mockFetch })
			const result = await fetcher.fetch({ url: "/test" })

			if (result.success && result.state) {
				expect(result.state.matches[0].preloaderContext).toEqual({ auth: { role: "admin" } })
			}
		})

		it("returns merged head config", async () => {
			const mockFetch = vi
				.fn()
				.mockResolvedValue(
					createNDJSONResponse([
						ndjson.loader("_root_", {}),
						ndjson.head({ description: "Page description", title: "Page Title" }),
						ndjson.ready(),
						ndjson.done(),
					]),
				)

			const fetcher = createNdjsonNavFetcher({ baseUrl: "", fetch: mockFetch })
			const result = await fetcher.fetch({ url: "/test" })

			if (result.success) {
				expect(result.head).toEqual({ description: "Page description", title: "Page Title" })
			}
		})

		it("returns per-route head configs", async () => {
			const mockFetch = vi
				.fn()
				.mockResolvedValue(
					createNDJSONResponse([
						ndjson.loader("_root_", {}),
						ndjson.loader("_root_/products", {}),
						ndjson.head({ title: "Root" }, "_root_"),
						ndjson.head({ title: "Products" }, "_root_/products"),
						ndjson.ready(),
						ndjson.done(),
					]),
				)

			const fetcher = createNdjsonNavFetcher({ baseUrl: "", fetch: mockFetch })
			const result = await fetcher.fetch({ url: "/products" })

			if (result.success && result.perRouteHeads) {
				expect(result.perRouteHeads).toHaveLength(2)
				expect(result.perRouteHeads).toContainEqual({ head: { title: "Root" }, matchId: "_root_" })
				expect(result.perRouteHeads).toContainEqual({
					head: { title: "Products" },
					matchId: "_root_/products",
				})
			}
		})

		it("includes query state for hydration", async () => {
			const mockFetch = vi.fn().mockResolvedValue(
				createNDJSONResponse([
					ndjson.loader("_root_", {}),
					ndjson.query([
						{ data: { name: "Alice" }, key: ["user", 1] },
						{ data: [1, 2, 3], key: ["items"] },
					]),
					ndjson.ready(),
					ndjson.done(),
				]),
			)

			const fetcher = createNdjsonNavFetcher({ baseUrl: "", fetch: mockFetch })
			const result = await fetcher.fetch({ url: "/test" })

			if (result.success && result.state) {
				expect(result.state.queries).toHaveLength(2)
				expect(result.state.queries[0]).toEqual({ data: { name: "Alice" }, key: ["user", 1] })
			}
		})

		it("sets pathname from url option", async () => {
			const mockFetch = vi
				.fn()
				.mockResolvedValue(
					createNDJSONResponse([ndjson.loader("_root_", {}), ndjson.ready(), ndjson.done()]),
				)

			const fetcher = createNdjsonNavFetcher({ baseUrl: "", fetch: mockFetch })
			const result = await fetcher.fetch({ url: "/my-page" })

			if (result.success && result.state) {
				expect(result.state.pathname).toBe("/my-page")
			}
		})
	})

	describe("deferred data handling", () => {
		it("hydrates deferred markers into promises", async () => {
			const mockFetch = vi.fn().mockResolvedValue(
				createNDJSONResponse([
					ndjson.loader("_root_", {
						immediate: "value",
						lazy: ndjson.deferred("lazyKey"),
					}),
					ndjson.ready(),
					ndjson.chunk("_root_", "lazyKey", { resolved: true }),
					ndjson.done(),
				]),
			)

			const fetcher = createNdjsonNavFetcher({ baseUrl: "", fetch: mockFetch })
			const result = await fetcher.fetch({ url: "/test" })

			if (result.success && result.state) {
				const loaderData = result.state.matches[0].loaderData as Record<string, unknown>
				expect(loaderData.immediate).toBe("value")
				expect(loaderData.lazy).toHaveProperty("promise")
				expect(loaderData.lazy).toHaveProperty("__deferred", true)
			}
		})

		it("resolves deferred promise when chunk arrives", async () => {
			const mockFetch = vi.fn().mockResolvedValue(
				createStreamingNDJSONResponse([
					{
						messages: [ndjson.loader("_root_", { lazy: ndjson.deferred("data") }), ndjson.ready()],
					},
					{
						delay: 10,
						messages: [ndjson.chunk("_root_", "data", { loaded: true })],
					},
					{ messages: [ndjson.done()] },
				]),
			)

			const fetcher = createNdjsonNavFetcher({ baseUrl: "", fetch: mockFetch })
			const result = await fetcher.fetch({ url: "/test" })

			if (result.success && result.state) {
				const loaderData = result.state.matches[0].loaderData as Record<
					string,
					{ promise: Promise<unknown> }
				>
				const resolved = await loaderData.lazy.promise

				expect(resolved).toEqual({ loaded: true })
			}
		})

		it("handles multiple deferred values independently", async () => {
			const mockFetch = vi.fn().mockResolvedValue(
				createStreamingNDJSONResponse([
					{
						messages: [
							ndjson.loader("_root_", {
								first: ndjson.deferred("first"),
								second: ndjson.deferred("second"),
							}),
							ndjson.ready(),
						],
					},
					{ delay: 5, messages: [ndjson.chunk("_root_", "second", "second-value")] },
					{ delay: 5, messages: [ndjson.chunk("_root_", "first", "first-value")] },
					{ messages: [ndjson.done()] },
				]),
			)

			const fetcher = createNdjsonNavFetcher({ baseUrl: "", fetch: mockFetch })
			const result = await fetcher.fetch({ url: "/test" })

			if (result.success && result.state) {
				const loaderData = result.state.matches[0].loaderData as Record<
					string,
					{ promise: Promise<unknown> }
				>

				const [first, second] = await Promise.all([
					loaderData.first.promise,
					loaderData.second.promise,
				])

				expect(first).toBe("first-value")
				expect(second).toBe("second-value")
			}
		})

		it("handles deferred in nested route", async () => {
			const mockFetch = vi.fn().mockResolvedValue(
				createStreamingNDJSONResponse([
					{
						messages: [
							ndjson.loader("_root_", { user: "alice" }),
							ndjson.loader("_root_/products", { lazy: ndjson.deferred("items") }),
							ndjson.ready(),
						],
					},
					{ delay: 10, messages: [ndjson.chunk("_root_/products", "items", [1, 2, 3])] },
					{ messages: [ndjson.done()] },
				]),
			)

			const fetcher = createNdjsonNavFetcher({ baseUrl: "", fetch: mockFetch })
			const result = await fetcher.fetch({ url: "/products" })

			if (result.success && result.state) {
				const productsData = result.state.matches[1].loaderData as Record<
					string,
					{ promise: Promise<unknown> }
				>
				const items = await productsData.lazy.promise

				expect(items).toEqual([1, 2, 3])
			}
		})
	})

	describe("error handling", () => {
		it("returns error for non-ok response", async () => {
			const mockFetch = vi.fn().mockResolvedValue(new Response("Not Found", { status: 404 }))

			const fetcher = createNdjsonNavFetcher({ baseUrl: "", fetch: mockFetch })
			const result = await fetcher.fetch({ url: "/missing" })

			expect(result.success).toBe(false)
			if (!result.success) {
				expect(result.error?.message).toContain("404")
			}
		})

		it("returns error for response without body", async () => {
			const response = new Response(null, { status: 200 })
			Object.defineProperty(response, "body", { value: null })

			const mockFetch = vi.fn().mockResolvedValue(response)

			const fetcher = createNdjsonNavFetcher({ baseUrl: "", fetch: mockFetch })
			const result = await fetcher.fetch({ url: "/test" })

			expect(result.success).toBe(false)
			if (!result.success) {
				expect(result.error?.message).toContain("no body")
			}
		})

		it("returns error for network failure", async () => {
			const mockFetch = vi.fn().mockRejectedValue(new Error("Network error"))

			const fetcher = createNdjsonNavFetcher({ baseUrl: "", fetch: mockFetch })
			const result = await fetcher.fetch({ url: "/test" })

			expect(result.success).toBe(false)
			if (!result.success) {
				expect(result.error?.message).toBe("Network error")
			}
		})

		it("handles AbortError gracefully", async () => {
			const abortError = new Error("Aborted")
			abortError.name = "AbortError"
			const mockFetch = vi.fn().mockRejectedValue(abortError)

			const fetcher = createNdjsonNavFetcher({ baseUrl: "", fetch: mockFetch })
			const result = await fetcher.fetch({ url: "/test" })

			expect(result.success).toBe(false)
			expect(result.error).toBeUndefined()
		})

		it("passes signal to fetch for abort support", async () => {
			const mockFetch = vi
				.fn()
				.mockResolvedValue(
					createNDJSONResponse([ndjson.loader("_root_", {}), ndjson.ready(), ndjson.done()]),
				)

			const controller = new AbortController()
			const fetcher = createNdjsonNavFetcher({ baseUrl: "", fetch: mockFetch })
			await fetcher.fetch({ signal: controller.signal, url: "/test" })

			expect(mockFetch).toHaveBeenCalledWith(
				expect.anything(),
				expect.objectContaining({
					signal: controller.signal,
				}),
			)
		})
	})

	describe("streaming behavior", () => {
		it("returns after ready message before all chunks arrive", async () => {
			let chunkSent = false

			const mockFetch = vi.fn().mockImplementation(() => {
				const encoder = new TextEncoder()
				const stream = new ReadableStream({
					async start(controller) {
						controller.enqueue(encoder.encode(`${JSON.stringify(ndjson.loader("_root_", {}))}\n`))
						controller.enqueue(encoder.encode(`${JSON.stringify(ndjson.ready())}\n`))

						await new Promise((resolve) => setTimeout(resolve, 50))
						chunkSent = true
						controller.enqueue(
							encoder.encode(`${JSON.stringify(ndjson.chunk("_root_", "data", "value"))}\n`),
						)
						controller.enqueue(encoder.encode(`${JSON.stringify(ndjson.done())}\n`))
						controller.close()
					},
				})

				return Promise.resolve(
					new Response(stream, {
						headers: { "Content-Type": "application/x-ndjson" },
					}),
				)
			})

			const fetcher = createNdjsonNavFetcher({ baseUrl: "", fetch: mockFetch })
			const result = await fetcher.fetch({ url: "/test" })

			expect(result.success).toBe(true)
			expect(chunkSent).toBe(false)
		})

		it("handles done message as fallback ready signal", async () => {
			const mockFetch = vi
				.fn()
				.mockResolvedValue(
					createNDJSONResponse([ndjson.loader("_root_", { data: "test" }), ndjson.done()]),
				)

			const fetcher = createNdjsonNavFetcher({ baseUrl: "", fetch: mockFetch })
			const result = await fetcher.fetch({ url: "/test" })

			expect(result.success).toBe(true)
			if (result.success && result.state) {
				expect(result.state.matches).toHaveLength(1)
			}
		})

		it("ignores malformed JSON lines in stream", async () => {
			const mockFetch = vi.fn().mockImplementation(() => {
				const encoder = new TextEncoder()
				const stream = new ReadableStream({
					start(controller) {
						controller.enqueue(
							encoder.encode(`${JSON.stringify(ndjson.loader("_root_", { ok: true }))}\n`),
						)
						controller.enqueue(encoder.encode("not valid json\n"))
						controller.enqueue(encoder.encode(`${JSON.stringify(ndjson.ready())}\n`))
						controller.enqueue(encoder.encode(`${JSON.stringify(ndjson.done())}\n`))
						controller.close()
					},
				})

				return Promise.resolve(new Response(stream))
			})

			const fetcher = createNdjsonNavFetcher({ baseUrl: "", fetch: mockFetch })
			const result = await fetcher.fetch({ url: "/test" })

			expect(result.success).toBe(true)
			if (result.success && result.state) {
				expect(result.state.matches[0].loaderData).toEqual({ ok: true })
			}
		})

		it("handles empty stream gracefully", async () => {
			const mockFetch = vi.fn().mockImplementation(() => {
				const stream = new ReadableStream({
					start(controller) {
						controller.enqueue(new TextEncoder().encode(`${JSON.stringify(ndjson.done())}\n`))
						controller.close()
					},
				})
				return Promise.resolve(new Response(stream))
			})

			const fetcher = createNdjsonNavFetcher({ baseUrl: "", fetch: mockFetch })
			const result = await fetcher.fetch({ url: "/test" })

			expect(result.success).toBe(true)
			if (result.success && result.state) {
				expect(result.state.matches).toHaveLength(0)
			}
		})
	})
})
