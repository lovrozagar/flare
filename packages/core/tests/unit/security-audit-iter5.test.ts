/**
 * Iteration 5 — TDD red-phase tests for security/perf audit.
 * Each test targets a specific bug found in the 5th review pass.
 * All tests should FAIL before fixes are applied.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

/* ── #1: sitemap changefreq not XML-escaped ────────────────────────── */

describe("#1: sitemap changefreq XML escaping", () => {
	it("escapes changefreq containing XML-special characters", async () => {
		const { generateSitemapXml } = await import("../../src/sitemap/index.ts")
		const xml = generateSitemapXml([
			{
				changefreq: "daily<script>alert(1)</script>" as never,
				loc: "https://example.com/",
			},
		])
		expect(xml).not.toContain("<script>")
		expect(xml).toContain("&lt;script&gt;")
	})
})

/* ── #2: bing error leaks response body text ───────────────────────── */

describe("#2: bing error text leak", () => {
	it("does not include response body in error message", async () => {
		const { submitUrlsToBing } = await import("../../src/search-engine/bing.ts")
		const originalFetch = globalThis.fetch
		globalThis.fetch = vi.fn(
			async () => new Response("Sensitive: db_password=hunter2", { status: 500 }),
		) as unknown as typeof fetch

		try {
			const result = await submitUrlsToBing({
				apiKey: "key",
				siteUrl: "https://example.com",
				urls: ["https://example.com/page"],
			})
			expect(result.ok).toBe(false)
			expect(result.error).toContain("500")
			expect(result.error).not.toContain("hunter2")
		} finally {
			globalThis.fetch = originalFetch
		}
	})
})

/* ── #3: server-fn jsonResponse missing charset ────────────────────── */

describe("#3: server-fn jsonResponse charset", () => {
	it("includes charset=utf-8 in content-type", async () => {
		const { handleServerFnRequest } = await import("../../src/server-fn/index.ts")
		const fns = new Map()
		const response = await handleServerFnRequest(
			new Request("http://localhost/_fn/nonexistent/fn", { method: "POST" }),
			{},
			fns,
		)
		expect(response.headers.get("content-type")).toBe("application/json; charset=utf-8")
	})
})

/* ── #4: head-client custom links bypass isSafeAttrName ────────────── */

describe("#4: head-client custom links event handler filtering", () => {
	let mockDoc: ReturnType<typeof createMockDocument>

	function createMockDocument() {
		const elements: Array<{
			attrs: Record<string, string>
			tag: string
		}> = []

		return {
			createElement(tag: string) {
				const el = {
					attrs: {} as Record<string, string>,
					getAttribute(name: string) {
						return this.attrs[name] ?? null
					},
					setAttribute(name: string, value: string) {
						this.attrs[name] = value
					},
					tag,
					textContent: "",
				}
				return el
			},
			elements,
			head: {
				appendChild(el: { tag: string; attrs: Record<string, string> }) {
					elements.push(el)
				},
				querySelector() {
					return null
				},
				querySelectorAll() {
					return {
						forEach() {},
						length: 0,
						[Symbol.iterator]() {
							return [][Symbol.iterator]()
						},
					}
				},
			},
			title: "",
		}
	}

	beforeEach(() => {
		mockDoc = createMockDocument()
		globalThis.document = mockDoc as unknown as Document
	})

	afterEach(() => {
		delete (globalThis as Record<string, unknown>).document
	})

	it("filters onclick from custom links", async () => {
		const { applyHeadConfig, clearRouteTracking, initRouteHierarchy } =
			await import("../../src/head-client/index.ts")
		clearRouteTracking()
		initRouteHierarchy(["root"])

		applyHeadConfig({
			custom: {
				links: [{ href: "/style.css", onclick: "alert(1)", rel: "prefetch" }],
			},
		})

		const linkEl = mockDoc.elements.find(
			(el) => el.tag === "link" && el.attrs["rel"] === "prefetch",
		)
		expect(linkEl).toBeDefined()
		/* onclick should NOT be set — isSafeAttrName should filter it */
		expect(linkEl?.attrs["onclick"]).toBeUndefined()
	})
})

/* ── #5: state-parser hydrateLoaderData uses {} not Object.create(null) ── */

describe("#5: state-parser prototype-free result", () => {
	it("hydrateLoaderData result has no Object.prototype properties", async () => {
		const { hydrateLoaderData } = await import("../../src/state-parser/index.ts")
		const resolvers = new Map()
		const data = { foo: "bar", name: "test" }
		const result = hydrateLoaderData("m1", data, resolvers) as Record<string, unknown>

		expect(result.foo).toBe("bar")
		expect(result.name).toBe("test")
		/* Should be prototype-free — Object.create(null) */
		expect("toString" in result).toBe(false)
		expect("constructor" in result).toBe(false)
		expect("hasOwnProperty" in result).toBe(false)
	})
})

/* ── #7: server-fn streaming iterator.return() not called ──────────── */

describe("#7: server-fn streaming cleanup", () => {
	it("calls iterator.return() when stream is cancelled", async () => {
		const { handleServerFnRequest } = await import("../../src/server-fn/index.ts")
		const { runWithServerContext } = await import("../../src/server-context/index.ts")

		let cleanedUp = false
		const reg = {
			authenticate: false,
			fn: async function* () {
				try {
					yield "chunk1"
					/* simulate long-running work */
					await new Promise((resolve) => setTimeout(resolve, 100_000))
					yield "chunk2"
				} finally {
					cleanedUp = true
				}
			},
			id: "stream-test",
			method: "post" as const,
			name: "streamTest",
			stream: true,
		}
		const fns = new Map([["stream-test", reg]])

		const response = await runWithServerContext(
			{ nonce: "test", request: new Request("http://localhost") },
			() =>
				handleServerFnRequest(
					new Request("http://localhost/_fn/stream-test/streamTest", {
						method: "POST",
					}),
					{},
					fns as never,
				),
		)

		const reader = response.body?.getReader()
		expect(reader).toBeDefined()
		/* read first chunk */
		await reader?.read()
		/* cancel the stream */
		await reader?.cancel()

		/* give the iterator.return() a tick to run */
		await new Promise((resolve) => setTimeout(resolve, 50))
		expect(cleanedUp).toBe(true)
	})
})

/* ── #8: ndjson redirect after ready message silently swallowed ─────── */

describe("#8: ndjson redirect after ready message", () => {
	it("propagates redirect even after ready signal", async () => {
		const { RedirectResponse } = await import("../../src/errors/index.ts")
		const { fetchNDJSON } = await import("../../src/ndjson-client/index.ts")

		const encoder = new TextEncoder()
		const lines = `${[
			JSON.stringify({ d: { foo: "bar" }, m: "m1", t: "l" }),
			JSON.stringify({ t: "r" }),
			JSON.stringify({ s: 302, t: "x", u: "/new-page" }),
		].join("\n")}\n`

		let readCount = 0
		const chunks = [encoder.encode(lines)]
		const reader = {
			cancel: vi.fn(),
			read: vi.fn(async () => {
				if (readCount < chunks.length) {
					const value = chunks[readCount]
					readCount++
					return { done: false, value }
				}
				return { done: true, value: undefined }
			}),
		}

		const originalFetch = globalThis.fetch
		globalThis.fetch = vi.fn(async () => ({
			body: { getReader: () => reader },
			ok: true,
		})) as unknown as typeof fetch

		try {
			await expect(fetchNDJSON({ url: "http://localhost/test" })).rejects.toThrow(RedirectResponse)
		} finally {
			globalThis.fetch = originalFetch
		}
	})
})
