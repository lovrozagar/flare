import { describe, expect, it, vi } from "vitest"
import { RedirectResponse } from "../../../src/errors/index.ts"
import { fetchNDJSON } from "../../../src/ndjson-client/index.ts"

function createMockResponse(lines: string[]): Response {
	const body = `${lines.join("\n")}\n`
	const encoder = new TextEncoder()
	const encoded = encoder.encode(body)

	let read = false
	const reader = {
		cancel: vi.fn(),
		read: vi.fn(() => {
			if (!read) {
				read = true
				return { done: false, value: encoded }
			}
			return { done: true, value: undefined }
		}),
	}

	return {
		body: { getReader: () => reader },
		ok: true,
	} as unknown as Response
}

function line(obj: Record<string, unknown>): string {
	return JSON.stringify(obj)
}

describe("prefetch mode — raw deferred markers", () => {
	it("prefetch fetch → loaderData contains raw markers (not promise shells)", async () => {
		const deferredMarker = { __deferred: true, key: "d0" }
		const fetchSpy = vi
			.fn()
			.mockResolvedValue(
				createMockResponse([
					line({ d: { deferred: deferredMarker, items: [1, 2] }, m: "route-1", t: "l" }),
					line({ t: "d" }),
				]),
			)
		vi.stubGlobal("fetch", fetchSpy)

		const result = await fetchNDJSON({ prefetch: true, url: "/api" })

		const match = result.matches[0]
		expect(match).toBeDefined()
		/* Raw marker should be preserved as-is, not hydrated into promise shell */
		const data = match?.loaderData as Record<string, unknown>
		expect((data.deferred as Record<string, unknown>).__deferred).toBe(true)
		expect((data.deferred as Record<string, unknown>).key).toBe("d0")

		vi.unstubAllGlobals()
	})

	it("prefetch fetch → hasDeferredMarkers: true for matches with deferred data", async () => {
		const deferredMarker = { __deferred: true, key: "d0" }
		const fetchSpy = vi
			.fn()
			.mockResolvedValue(
				createMockResponse([
					line({ d: { deferred: deferredMarker, name: "test" }, m: "route-1", t: "l" }),
					line({ t: "d" }),
				]),
			)
		vi.stubGlobal("fetch", fetchSpy)

		const result = await fetchNDJSON({ prefetch: true, url: "/api" })

		expect(result.matches[0]?.hasDeferredMarkers).toBe(true)

		vi.unstubAllGlobals()
	})

	it("prefetch fetch → hasDeferredMarkers absent for matches without deferred", async () => {
		const fetchSpy = vi
			.fn()
			.mockResolvedValue(
				createMockResponse([
					line({ d: { name: "test", value: 42 }, m: "route-1", t: "l" }),
					line({ t: "d" }),
				]),
			)
		vi.stubGlobal("fetch", fetchSpy)

		const result = await fetchNDJSON({ prefetch: true, url: "/api" })

		expect(result.matches[0]?.hasDeferredMarkers).toBeFalsy()

		vi.unstubAllGlobals()
	})

	it("non-prefetch fetch → loaderData hydrated normally (no hasDeferredMarkers)", async () => {
		const fetchSpy = vi
			.fn()
			.mockResolvedValue(
				createMockResponse([line({ d: { name: "test" }, m: "route-1", t: "l" }), line({ t: "d" })]),
			)
		vi.stubGlobal("fetch", fetchSpy)

		const result = await fetchNDJSON({ url: "/api" })

		expect(result.matches[0]?.hasDeferredMarkers).toBeUndefined()

		vi.unstubAllGlobals()
	})

	it("prefetch with nested deferred markers → detected", async () => {
		const nested = {
			deep: {
				items: [{ __deferred: true, key: "d0" }],
			},
			name: "test",
		}
		const fetchSpy = vi
			.fn()
			.mockResolvedValue(
				createMockResponse([line({ d: nested, m: "route-1", t: "l" }), line({ t: "d" })]),
			)
		vi.stubGlobal("fetch", fetchSpy)

		const result = await fetchNDJSON({ prefetch: true, url: "/api" })

		expect(result.matches[0]?.hasDeferredMarkers).toBe(true)

		vi.unstubAllGlobals()
	})

	it("prefetch preserves preloaderContext", async () => {
		const fetchSpy = vi.fn().mockResolvedValue(
			createMockResponse([
				line({
					d: { value: 1 },
					m: "route-1",
					p: { org: "acme" },
					t: "l",
				}),
				line({ t: "d" }),
			]),
		)
		vi.stubGlobal("fetch", fetchSpy)

		const result = await fetchNDJSON({ prefetch: true, url: "/api" })

		expect(result.matches[0]?.preloaderContext).toEqual({ org: "acme" })

		vi.unstubAllGlobals()
	})

	it("prefetch with multiple matches → each gets correct hasDeferredMarkers", async () => {
		const fetchSpy = vi
			.fn()
			.mockResolvedValue(
				createMockResponse([
					line({ d: { __deferred: true, key: "d0" }, m: "layout", t: "l" }),
					line({ d: { name: "plain" }, m: "page", t: "l" }),
					line({ t: "d" }),
				]),
			)
		vi.stubGlobal("fetch", fetchSpy)

		const result = await fetchNDJSON({ prefetch: true, url: "/api" })

		expect(result.matches).toHaveLength(2)
		expect(result.matches[0]?.hasDeferredMarkers).toBe(true)
		expect(result.matches[1]?.hasDeferredMarkers).toBeFalsy()

		vi.unstubAllGlobals()
	})

	it("prefetch with null loaderData → hasDeferredMarkers absent", async () => {
		const fetchSpy = vi
			.fn()
			.mockResolvedValue(
				createMockResponse([line({ d: null, m: "route-1", t: "l" }), line({ t: "d" })]),
			)
		vi.stubGlobal("fetch", fetchSpy)

		const result = await fetchNDJSON({ prefetch: true, url: "/api" })

		expect(result.matches[0]?.hasDeferredMarkers).toBeFalsy()
		expect(result.matches[0]?.loaderData).toBeNull()

		vi.unstubAllGlobals()
	})

	it("prefetch with array loaderData containing deferred → detected", async () => {
		const fetchSpy = vi
			.fn()
			.mockResolvedValue(
				createMockResponse([
					line({ d: [{ name: "a" }, { __deferred: true, key: "d0" }], m: "route-1", t: "l" }),
					line({ t: "d" }),
				]),
			)
		vi.stubGlobal("fetch", fetchSpy)

		const result = await fetchNDJSON({ prefetch: true, url: "/api" })

		expect(result.matches[0]?.hasDeferredMarkers).toBe(true)

		vi.unstubAllGlobals()
	})

	it("prefetch with top-level deferred marker → detected", async () => {
		const fetchSpy = vi
			.fn()
			.mockResolvedValue(
				createMockResponse([
					line({ d: { __deferred: true, key: "d0" }, m: "route-1", t: "l" }),
					line({ t: "d" }),
				]),
			)
		vi.stubGlobal("fetch", fetchSpy)

		const result = await fetchNDJSON({ prefetch: true, url: "/api" })

		expect(result.matches[0]?.hasDeferredMarkers).toBe(true)
		/* loaderData is the raw marker itself */
		const data = result.matches[0]?.loaderData as Record<string, unknown>
		expect(data.__deferred).toBe(true)

		vi.unstubAllGlobals()
	})

	it("prefetch with __deferred: false → not a marker", async () => {
		const fetchSpy = vi
			.fn()
			.mockResolvedValue(
				createMockResponse([
					line({ d: { __deferred: false, key: "d0" }, m: "route-1", t: "l" }),
					line({ t: "d" }),
				]),
			)
		vi.stubGlobal("fetch", fetchSpy)

		const result = await fetchNDJSON({ prefetch: true, url: "/api" })

		expect(result.matches[0]?.hasDeferredMarkers).toBeFalsy()

		vi.unstubAllGlobals()
	})

	it("prefetch with empty object → hasDeferredMarkers absent", async () => {
		const fetchSpy = vi
			.fn()
			.mockResolvedValue(
				createMockResponse([line({ d: {}, m: "route-1", t: "l" }), line({ t: "d" })]),
			)
		vi.stubGlobal("fetch", fetchSpy)

		const result = await fetchNDJSON({ prefetch: true, url: "/api" })

		expect(result.matches[0]?.hasDeferredMarkers).toBeFalsy()

		vi.unstubAllGlobals()
	})

	it("prefetch with string/number loaderData → hasDeferredMarkers absent", async () => {
		const fetchSpy = vi
			.fn()
			.mockResolvedValue(
				createMockResponse([line({ d: "hello", m: "route-1", t: "l" }), line({ t: "d" })]),
			)
		vi.stubGlobal("fetch", fetchSpy)

		const result = await fetchNDJSON({ prefetch: true, url: "/api" })

		expect(result.matches[0]?.hasDeferredMarkers).toBeFalsy()

		vi.unstubAllGlobals()
	})

	it("prefetch error message (t:e) still works correctly", async () => {
		const fetchSpy = vi
			.fn()
			.mockResolvedValue(
				createMockResponse([
					line({ e: { message: "loader failed", name: "Error" }, m: "route-1", t: "e" }),
					line({ t: "d" }),
				]),
			)
		vi.stubGlobal("fetch", fetchSpy)

		const result = await fetchNDJSON({ prefetch: true, url: "/api" })

		expect(result.matches[0]?.error).toBeInstanceOf(Error)
		expect(result.matches[0]?.error?.message).toBe("loader failed")

		vi.unstubAllGlobals()
	})

	it("prefetch redirect (t:x) throws RedirectResponse", async () => {
		const fetchSpy = vi
			.fn()
			.mockResolvedValue(createMockResponse([line({ s: 302, t: "x", u: "/login" })]))
		vi.stubGlobal("fetch", fetchSpy)

		await expect(fetchNDJSON({ prefetch: true, url: "/api" })).rejects.toThrow(RedirectResponse)

		vi.unstubAllGlobals()
	})

	it("prefetch head messages (t:h) still collected", async () => {
		const fetchSpy = vi
			.fn()
			.mockResolvedValue(
				createMockResponse([
					line({ d: { name: "test" }, m: "route-1", t: "l" }),
					line({ d: { title: "Page Title" }, m: "route-1", t: "h" }),
					line({ t: "d" }),
				]),
			)
		vi.stubGlobal("fetch", fetchSpy)

		const result = await fetchNDJSON({ prefetch: true, url: "/api" })

		expect(result.perRouteHeads).toHaveLength(1)
		expect(result.perRouteHeads[0]?.head).toEqual({ title: "Page Title" })

		vi.unstubAllGlobals()
	})
})
