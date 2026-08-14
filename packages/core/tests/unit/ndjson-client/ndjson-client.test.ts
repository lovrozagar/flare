import { describe, expect, it, vi } from "vitest"
import {
	NotFoundError,
	RedirectResponse,
	UnauthenticatedError,
	UnauthorizedError,
} from "../../../src/errors/index.ts"
import { fetchNDJSON } from "../../../src/ndjson-client/index.ts"

function createMockResponse(lines: string[], init?: { ok?: boolean; status?: number }): Response {
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

	const ok = init?.ok ?? true
	return {
		body: { getReader: () => reader },
		headers: { get: (name: string) => (name.toLowerCase() === "content-type" ? "application/x-ndjson" : null) },
		ok,
		status: init?.status ?? (ok ? 200 : 500),
	} as unknown as Response
}

function createChunkedResponse(chunks: Uint8Array[]): Response {
	let idx = 0
	const reader = {
		cancel: vi.fn(),
		read: vi.fn(() => {
			if (idx < chunks.length) {
				const value = chunks[idx]
				idx++
				return { done: false, value }
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

describe("request building", () => {
	it("basic nav → headers: { x-d: 1 }", async () => {
		const fetchSpy = vi.fn().mockResolvedValue(createMockResponse([line({ t: "d" })]))
		vi.stubGlobal("fetch", fetchSpy)

		await fetchNDJSON({ url: "/api" })
		expect(fetchSpy.mock.calls[0][1].headers["x-d"]).toBe("1")

		vi.unstubAllGlobals()
	})

	it("with matchIds → x-m: a,b,c", async () => {
		const fetchSpy = vi.fn().mockResolvedValue(createMockResponse([line({ t: "d" })]))
		vi.stubGlobal("fetch", fetchSpy)

		await fetchNDJSON({ matchIds: ["a", "b", "c"], url: "/api" })
		expect(fetchSpy.mock.calls[0][1].headers["x-m"]).toBe("a,b,c")

		vi.unstubAllGlobals()
	})

	it("with prefetch → x-p: 1", async () => {
		const fetchSpy = vi.fn().mockResolvedValue(createMockResponse([line({ t: "d" })]))
		vi.stubGlobal("fetch", fetchSpy)

		await fetchNDJSON({ prefetch: true, url: "/api" })
		expect(fetchSpy.mock.calls[0][1].headers["x-p"]).toBe("1")

		vi.unstubAllGlobals()
	})

	it("with signal → passed to fetch", async () => {
		const controller = new AbortController()
		const fetchSpy = vi.fn().mockResolvedValue(createMockResponse([line({ t: "d" })]))
		vi.stubGlobal("fetch", fetchSpy)

		await fetchNDJSON({ signal: controller.signal, url: "/api" })
		expect(fetchSpy.mock.calls[0][1].signal).toBe(controller.signal)

		vi.unstubAllGlobals()
	})
})

describe("loader messages", () => {
	it("single loader → one FetchedMatch in result", async () => {
		vi.stubGlobal(
			"fetch",
			vi
				.fn()
				.mockResolvedValue(
					createMockResponse([line({ d: { greeting: "hi" }, m: "m1", t: "l" }), line({ t: "d" })]),
				),
		)

		const result = await fetchNDJSON({ url: "/api" })
		expect(result.matches).toHaveLength(1)
		expect(result.matches[0]?.matchId).toBe("m1")
		expect(result.matches[0]?.loaderData).toEqual({ greeting: "hi" })

		vi.unstubAllGlobals()
	})

	it("multiple loaders → ordered by arrival", async () => {
		vi.stubGlobal(
			"fetch",
			vi
				.fn()
				.mockResolvedValue(
					createMockResponse([
						line({ d: "a", m: "m1", t: "l" }),
						line({ d: "b", m: "m2", t: "l" }),
						line({ t: "d" }),
					]),
				),
		)

		const result = await fetchNDJSON({ url: "/api" })
		expect(result.matches).toHaveLength(2)
		expect(result.matches[0]?.matchId).toBe("m1")
		expect(result.matches[1]?.matchId).toBe("m2")

		vi.unstubAllGlobals()
	})

	it("loader with preloaderContext → preserved in match", async () => {
		vi.stubGlobal(
			"fetch",
			vi
				.fn()
				.mockResolvedValue(
					createMockResponse([
						line({ d: null, m: "m1", p: { user: "1" }, t: "l" }),
						line({ t: "d" }),
					]),
				),
		)

		const result = await fetchNDJSON({ url: "/api" })
		expect(result.matches[0]?.preloaderContext).toEqual({ user: "1" })

		vi.unstubAllGlobals()
	})

	it("loader with deferred markers → hydrated to promise", async () => {
		vi.stubGlobal(
			"fetch",
			vi
				.fn()
				.mockResolvedValue(
					createMockResponse([
						line({ d: { __deferred: true, key: "d0" }, m: "m1", t: "l" }),
						line({ t: "r" }),
						line({ d: "resolved", k: "d0", m: "m1", t: "c" }),
						line({ t: "d" }),
					]),
				),
		)

		const result = await fetchNDJSON({ url: "/api" })
		const data = result.matches[0]?.loaderData as Record<string, unknown>
		expect(data.__deferred).toBe(true)
		expect(data.promise).toBeInstanceOf(Promise)

		vi.unstubAllGlobals()
	})

	it("non-prefetch loader with deferred → hasDeferredMarkers set", async () => {
		vi.stubGlobal(
			"fetch",
			vi
				.fn()
				.mockResolvedValue(
					createMockResponse([
						line({ d: { __deferred: true, key: "d0" }, m: "m1", t: "l" }),
						line({ t: "r" }),
						line({ d: "resolved", k: "d0", m: "m1", t: "c" }),
						line({ t: "d" }),
					]),
				),
		)

		const result = await fetchNDJSON({ url: "/api" })
		expect(result.matches[0]?.hasDeferredMarkers).toBe(true)

		vi.unstubAllGlobals()
	})

	it("non-prefetch loader without deferred → hasDeferredMarkers undefined", async () => {
		vi.stubGlobal(
			"fetch",
			vi
				.fn()
				.mockResolvedValue(
					createMockResponse([line({ d: { name: "plain" }, m: "m1", t: "l" }), line({ t: "d" })]),
				),
		)

		const result = await fetchNDJSON({ url: "/api" })
		expect(result.matches[0]?.hasDeferredMarkers).toBeUndefined()

		vi.unstubAllGlobals()
	})
})

describe("chunk messages", () => {
	it("chunk resolves matching deferred promise", async () => {
		vi.stubGlobal(
			"fetch",
			vi
				.fn()
				.mockResolvedValue(
					createMockResponse([
						line({ d: { __deferred: true, key: "d0" }, m: "m1", t: "l" }),
						line({ t: "r" }),
						line({ d: "resolved-value", k: "d0", m: "m1", t: "c" }),
						line({ t: "d" }),
					]),
				),
		)

		const result = await fetchNDJSON({ url: "/api" })
		const data = result.matches[0]?.loaderData as Record<string, unknown>
		const value = await (data.promise as Promise<unknown>)
		expect(value).toBe("resolved-value")

		vi.unstubAllGlobals()
	})

	it("chunk for unknown key → ignored", async () => {
		vi.stubGlobal(
			"fetch",
			vi
				.fn()
				.mockResolvedValue(
					createMockResponse([line({ d: "val", k: "unknown", m: "m1", t: "c" }), line({ t: "d" })]),
				),
		)

		const result = await fetchNDJSON({ url: "/api" })
		expect(result.success).toBe(true)

		vi.unstubAllGlobals()
	})

	it("multiple chunks for same route → each resolves independently", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue(
				createMockResponse([
					line({
						d: { a: { __deferred: true, key: "d0" }, b: { __deferred: true, key: "d1" } },
						m: "m1",
						t: "l",
					}),
					line({ t: "r" }),
					line({ d: "v0", k: "d0", m: "m1", t: "c" }),
					line({ d: "v1", k: "d1", m: "m1", t: "c" }),
					line({ t: "d" }),
				]),
			),
		)

		const result = await fetchNDJSON({ url: "/api" })
		const data = result.matches[0]?.loaderData as Record<string, Record<string, unknown>>
		const v0 = await (data.a.promise as Promise<unknown>)
		const v1 = await (data.b.promise as Promise<unknown>)
		expect(v0).toBe("v0")
		expect(v1).toBe("v1")

		vi.unstubAllGlobals()
	})
})

describe("error messages", () => {
	it("error with key → rejects specific deferred", async () => {
		vi.stubGlobal(
			"fetch",
			vi
				.fn()
				.mockResolvedValue(
					createMockResponse([
						line({ d: { __deferred: true, key: "d0" }, m: "m1", t: "l" }),
						line({ t: "r" }),
						line({ e: { message: "fail" }, k: "d0", m: "m1", t: "e" }),
						line({ t: "d" }),
					]),
				),
		)

		const result = await fetchNDJSON({ url: "/api" })
		const data = result.matches[0]?.loaderData as Record<string, unknown>
		await expect(data.promise as Promise<unknown>).rejects.toThrow("fail")

		vi.unstubAllGlobals()
	})

	it("error without key → stored as error on FetchedMatch", async () => {
		vi.stubGlobal(
			"fetch",
			vi
				.fn()
				.mockResolvedValue(
					createMockResponse([
						line({ e: { message: "route-error" }, m: "m1", t: "e" }),
						line({ t: "d" }),
					]),
				),
		)

		const result = await fetchNDJSON({ url: "/api" })
		expect(result.matches[0]?.error).toBeInstanceOf(Error)
		expect(result.matches[0]?.error?.message).toBe("route-error")

		vi.unstubAllGlobals()
	})
})

describe("head messages", () => {
	it("per-route head → stored in perRouteHeads", async () => {
		vi.stubGlobal(
			"fetch",
			vi
				.fn()
				.mockResolvedValue(
					createMockResponse([line({ d: { title: "Home" }, m: "m1", t: "h" }), line({ t: "d" })]),
				),
		)

		const result = await fetchNDJSON({ url: "/api" })
		expect(result.perRouteHeads).toHaveLength(1)
		expect(result.perRouteHeads[0]).toEqual({ head: { title: "Home" }, matchId: "m1" })

		vi.unstubAllGlobals()
	})

	it("multiple head messages → all collected", async () => {
		vi.stubGlobal(
			"fetch",
			vi
				.fn()
				.mockResolvedValue(
					createMockResponse([
						line({ d: { title: "A" }, m: "m1", t: "h" }),
						line({ d: { title: "B" }, m: "m2", t: "h" }),
						line({ t: "d" }),
					]),
				),
		)

		const result = await fetchNDJSON({ url: "/api" })
		expect(result.perRouteHeads).toHaveLength(2)

		vi.unstubAllGlobals()
	})
})

describe("redirect", () => {
	it("t:x → throws RedirectResponse", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue(createMockResponse([line({ s: 302, t: "x", u: "/login" })])),
		)

		await expect(fetchNDJSON({ url: "/api" })).rejects.toThrow(RedirectResponse)

		vi.unstubAllGlobals()
	})

	it("redirect URL and status preserved", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue(createMockResponse([line({ r: true, s: 301, t: "x", u: "/new" })])),
		)

		try {
			await fetchNDJSON({ url: "/api" })
		} catch (e) {
			expect(e).toBeInstanceOf(RedirectResponse)
			const rr = e as RedirectResponse
			expect(rr.url).toBe("/new")
			expect(rr.status).toBe(301)
			expect(rr.replace).toBe(true)
		}

		vi.unstubAllGlobals()
	})

	it("external redirect (xl:true) → RedirectResponse with external=true", async () => {
		vi.stubGlobal(
			"fetch",
			vi
				.fn()
				.mockResolvedValue(
					createMockResponse([line({ s: 302, t: "x", u: "https://example.com", xl: true })]),
				),
		)

		try {
			await fetchNDJSON({ url: "/api" })
		} catch (e) {
			expect(e).toBeInstanceOf(RedirectResponse)
			const rr = e as RedirectResponse
			expect(rr.url).toBe("https://example.com")
			expect(rr.external).toBe(true)
		}

		vi.unstubAllGlobals()
	})

	it("internal redirect (no xl) → RedirectResponse with external=false", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue(createMockResponse([line({ s: 302, t: "x", u: "/login" })])),
		)

		try {
			await fetchNDJSON({ url: "/api" })
		} catch (e) {
			expect(e).toBeInstanceOf(RedirectResponse)
			const rr = e as RedirectResponse
			expect(rr.url).toBe("/login")
			expect(rr.external).toBe(false)
		}

		vi.unstubAllGlobals()
	})

	it("redirect with r:false → replace is false (not inverted to true)", async () => {
		vi.stubGlobal(
			"fetch",
			vi
				.fn()
				.mockResolvedValue(createMockResponse([line({ r: false, s: 302, t: "x", u: "/target" })])),
		)

		try {
			await fetchNDJSON({ url: "/api" })
		} catch (e) {
			expect(e).toBeInstanceOf(RedirectResponse)
			const rr = e as RedirectResponse
			expect(rr.replace).toBe(false)
		}

		vi.unstubAllGlobals()
	})
})

describe("ready/done", () => {
	it("t:r → fetchNDJSON returns", async () => {
		vi.stubGlobal(
			"fetch",
			vi
				.fn()
				.mockResolvedValue(
					createMockResponse([
						line({ d: "x", m: "m1", t: "l" }),
						line({ t: "r" }),
						line({ t: "d" }),
					]),
				),
		)

		const result = await fetchNDJSON({ url: "/api" })
		expect(result.success).toBe(true)

		vi.unstubAllGlobals()
	})

	it("t:d without prior t:r → resolves (fallback)", async () => {
		vi.stubGlobal(
			"fetch",
			vi
				.fn()
				.mockResolvedValue(
					createMockResponse([line({ d: "x", m: "m1", t: "l" }), line({ t: "d" })]),
				),
		)

		const result = await fetchNDJSON({ url: "/api" })
		expect(result.success).toBe(true)
		expect(result.matches).toHaveLength(1)

		vi.unstubAllGlobals()
	})
})

describe("stream parsing", () => {
	it("partial line → buffered until complete", async () => {
		const encoder = new TextEncoder()
		const chunk1 = encoder.encode(`{"t":"l","m":"m1","d":"he`)
		const chunk2 = encoder.encode(`llo"}\n{"t":"d"}\n`)

		vi.stubGlobal("fetch", vi.fn().mockResolvedValue(createChunkedResponse([chunk1, chunk2])))

		const result = await fetchNDJSON({ url: "/api" })
		expect(result.matches[0]?.loaderData).toBe("hello")

		vi.unstubAllGlobals()
	})

	it("empty line → skipped", async () => {
		vi.stubGlobal(
			"fetch",
			vi
				.fn()
				.mockResolvedValue(
					createMockResponse(["", line({ d: "x", m: "m1", t: "l" }), "", line({ t: "d" })]),
				),
		)

		const result = await fetchNDJSON({ url: "/api" })
		expect(result.matches).toHaveLength(1)

		vi.unstubAllGlobals()
	})

	it("empty response body → empty matches", async () => {
		vi.stubGlobal("fetch", vi.fn().mockResolvedValue(createMockResponse([line({ t: "d" })])))

		const result = await fetchNDJSON({ url: "/api" })
		expect(result.matches).toHaveLength(0)

		vi.unstubAllGlobals()
	})

	it("only done message → empty result", async () => {
		vi.stubGlobal("fetch", vi.fn().mockResolvedValue(createMockResponse([line({ t: "d" })])))

		const result = await fetchNDJSON({ url: "/api" })
		expect(result.matches).toHaveLength(0)
		expect(result.success).toBe(true)

		vi.unstubAllGlobals()
	})
})

/* ── JSON validation edge cases ─────────────────────────────────────── */

describe("error messages", () => {
	it("error with empty message → uses default", async () => {
		vi.stubGlobal(
			"fetch",
			vi
				.fn()
				.mockResolvedValue(
					createMockResponse([line({ e: {}, m: "m1", t: "e" }), line({ t: "d" })]),
				),
		)

		const result = await fetchNDJSON({ url: "/api" })
		expect(result.matches[0]?.error?.message).toBe("Unknown error")

		vi.unstubAllGlobals()
	})
})

describe("malformed input handling", () => {
	it("JSON array line → skipped (not object)", async () => {
		vi.stubGlobal(
			"fetch",
			vi
				.fn()
				.mockResolvedValue(
					createMockResponse(["[1,2,3]", line({ d: "ok", m: "m1", t: "l" }), line({ t: "d" })]),
				),
		)

		const result = await fetchNDJSON({ url: "/api" })
		expect(result.matches).toHaveLength(1)
		expect(result.matches[0]?.loaderData).toBe("ok")

		vi.unstubAllGlobals()
	})

	it("JSON number line → skipped (not object)", async () => {
		vi.stubGlobal(
			"fetch",
			vi
				.fn()
				.mockResolvedValue(
					createMockResponse(["42", line({ d: "ok", m: "m1", t: "l" }), line({ t: "d" })]),
				),
		)

		const result = await fetchNDJSON({ url: "/api" })
		expect(result.matches).toHaveLength(1)

		vi.unstubAllGlobals()
	})

	it("JSON string line → skipped (not object)", async () => {
		vi.stubGlobal(
			"fetch",
			vi
				.fn()
				.mockResolvedValue(
					createMockResponse([
						'"just a string"',
						line({ d: "ok", m: "m1", t: "l" }),
						line({ t: "d" }),
					]),
				),
		)

		const result = await fetchNDJSON({ url: "/api" })
		expect(result.matches).toHaveLength(1)

		vi.unstubAllGlobals()
	})

	it("object without t field → skipped", async () => {
		vi.stubGlobal(
			"fetch",
			vi
				.fn()
				.mockResolvedValue(
					createMockResponse([
						line({ d: "no type field" }),
						line({ d: "ok", m: "m1", t: "l" }),
						line({ t: "d" }),
					]),
				),
		)

		const result = await fetchNDJSON({ url: "/api" })
		expect(result.matches).toHaveLength(1)

		vi.unstubAllGlobals()
	})

	it("object with numeric t field → skipped", async () => {
		vi.stubGlobal(
			"fetch",
			vi
				.fn()
				.mockResolvedValue(
					createMockResponse([
						line({ t: 123 }),
						line({ d: "ok", m: "m1", t: "l" }),
						line({ t: "d" }),
					]),
				),
		)

		const result = await fetchNDJSON({ url: "/api" })
		expect(result.matches).toHaveLength(1)

		vi.unstubAllGlobals()
	})

	it("malformed JSON line → silently skipped", async () => {
		vi.stubGlobal(
			"fetch",
			vi
				.fn()
				.mockResolvedValue(
					createMockResponse([
						"not valid json {{{",
						line({ d: { x: 1 }, m: "m1", t: "l" }),
						line({ t: "d" }),
					]),
				),
		)

		const result = await fetchNDJSON({ url: "/api" })
		expect(result.matches).toHaveLength(1)
		expect(result.matches[0]?.matchId).toBe("m1")

		vi.unstubAllGlobals()
	})

	it("empty lines → ignored", async () => {
		const body = `\n\n${line({ d: "data", m: "m1", t: "l" })}\n\n${line({ t: "d" })}\n`
		const encoder = new TextEncoder()
		let read = false
		const reader = {
			cancel: vi.fn(),
			read: vi.fn(() => {
				if (!read) {
					read = true
					return { done: false, value: encoder.encode(body) }
				}
				return { done: true, value: undefined }
			}),
		}
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue({
				body: { getReader: () => reader },
				ok: true,
			}),
		)

		const result = await fetchNDJSON({ url: "/api" })
		expect(result.matches).toHaveLength(1)

		vi.unstubAllGlobals()
	})
})

/* ── Signal abort ────────────────────────────────────────────────────── */

describe("abort signal", () => {
	it("pre-aborted signal → stream read stops, returns empty", async () => {
		const controller = new AbortController()
		controller.abort()

		const readerCancel = vi.fn()
		const reader = {
			cancel: readerCancel,
			read: vi.fn(() => {
				/* signal is already aborted, so first iteration should break */
				return { done: false, value: new TextEncoder().encode(`${line({ t: "d" })}\n`) }
			}),
		}
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue({
				body: { getReader: () => reader },
				ok: true,
			}),
		)

		const result = await fetchNDJSON({ signal: controller.signal, url: "/api" })
		expect(readerCancel).toHaveBeenCalled()
		expect(result.matches).toHaveLength(0)

		vi.unstubAllGlobals()
	})

	it("redirect message → reader.cancel called", async () => {
		const readerCancel = vi.fn()
		let read = false
		const reader = {
			cancel: readerCancel,
			read: vi.fn(() => {
				if (!read) {
					read = true
					const msg = line({
						s: 302,
						t: "x",
						u: "/dashboard",
					})
					return { done: false, value: new TextEncoder().encode(`${msg}\n`) }
				}
				return { done: true, value: undefined }
			}),
		}
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue({
				body: { getReader: () => reader },
				ok: true,
			}),
		)

		try {
			await fetchNDJSON({ url: "/api" })
		} catch (e) {
			expect(e).toBeInstanceOf(RedirectResponse)
		}
		expect(readerCancel).toHaveBeenCalled()

		vi.unstubAllGlobals()
	})
})

/* ── reconstructError type mapping ─────────────────────────────────── */

describe("reconstructError via error messages", () => {
	it("NotFoundError name → instanceof NotFoundError", async () => {
		vi.stubGlobal(
			"fetch",
			vi
				.fn()
				.mockResolvedValue(
					createMockResponse([
						line({ e: { message: "page missing", name: "NotFoundError" }, m: "m1", t: "e" }),
						line({ t: "d" }),
					]),
				),
		)

		const result = await fetchNDJSON({ url: "/api" })
		expect(result.matches[0]?.error).toBeInstanceOf(NotFoundError)
		expect(result.matches[0]?.error?.message).toBe("page missing")

		vi.unstubAllGlobals()
	})

	it("UnauthenticatedError name → instanceof UnauthenticatedError", async () => {
		vi.stubGlobal(
			"fetch",
			vi
				.fn()
				.mockResolvedValue(
					createMockResponse([
						line({ e: { message: "no session", name: "UnauthenticatedError" }, m: "m1", t: "e" }),
						line({ t: "d" }),
					]),
				),
		)

		const result = await fetchNDJSON({ url: "/api" })
		expect(result.matches[0]?.error).toBeInstanceOf(UnauthenticatedError)
		expect(result.matches[0]?.error?.message).toBe("no session")

		vi.unstubAllGlobals()
	})

	it("UnauthorizedError name → instanceof UnauthorizedError", async () => {
		vi.stubGlobal(
			"fetch",
			vi
				.fn()
				.mockResolvedValue(
					createMockResponse([
						line({ e: { message: "forbidden", name: "UnauthorizedError" }, m: "m1", t: "e" }),
						line({ t: "d" }),
					]),
				),
		)

		const result = await fetchNDJSON({ url: "/api" })
		expect(result.matches[0]?.error).toBeInstanceOf(UnauthorizedError)
		expect(result.matches[0]?.error?.message).toBe("forbidden")

		vi.unstubAllGlobals()
	})

	it("unknown error name → generic Error with name set", async () => {
		vi.stubGlobal(
			"fetch",
			vi
				.fn()
				.mockResolvedValue(
					createMockResponse([
						line({ e: { message: "custom fail", name: "CustomError" }, m: "m1", t: "e" }),
						line({ t: "d" }),
					]),
				),
		)

		const result = await fetchNDJSON({ url: "/api" })
		const err = result.matches[0]?.error
		expect(err).toBeInstanceOf(Error)
		expect(err).not.toBeInstanceOf(NotFoundError)
		expect(err?.name).toBe("CustomError")
		expect(err?.message).toBe("custom fail")

		vi.unstubAllGlobals()
	})

	it("error with no name → generic Error", async () => {
		vi.stubGlobal(
			"fetch",
			vi
				.fn()
				.mockResolvedValue(
					createMockResponse([
						line({ e: { message: "unnamed" }, m: "m1", t: "e" }),
						line({ t: "d" }),
					]),
				),
		)

		const result = await fetchNDJSON({ url: "/api" })
		expect(result.matches[0]?.error).toBeInstanceOf(Error)
		expect(result.matches[0]?.error?.message).toBe("unnamed")

		vi.unstubAllGlobals()
	})

	it("error with undefined e → 'Unknown error' fallback", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue(createMockResponse([line({ m: "m1", t: "e" }), line({ t: "d" })])),
		)

		const result = await fetchNDJSON({ url: "/api" })
		expect(result.matches[0]?.error?.message).toBe("Unknown error")

		vi.unstubAllGlobals()
	})
})

/* ── Missing field defaults ────────────────────────────────────────── */

describe("missing field defaults", () => {
	it("loader without m → matchId defaults to empty string", async () => {
		vi.stubGlobal(
			"fetch",
			vi
				.fn()
				.mockResolvedValue(createMockResponse([line({ d: "data", t: "l" }), line({ t: "d" })])),
		)

		const result = await fetchNDJSON({ url: "/api" })
		expect(result.matches[0]?.matchId).toBe("")

		vi.unstubAllGlobals()
	})

	it("error without m → matchId defaults to empty string", async () => {
		vi.stubGlobal(
			"fetch",
			vi
				.fn()
				.mockResolvedValue(
					createMockResponse([line({ e: { message: "oops" }, t: "e" }), line({ t: "d" })]),
				),
		)

		const result = await fetchNDJSON({ url: "/api" })
		expect(result.matches[0]?.matchId).toBe("")

		vi.unstubAllGlobals()
	})

	it("head without m → matchId defaults to empty string", async () => {
		vi.stubGlobal(
			"fetch",
			vi
				.fn()
				.mockResolvedValue(
					createMockResponse([line({ d: { title: "T" }, t: "h" }), line({ t: "d" })]),
				),
		)

		const result = await fetchNDJSON({ url: "/api" })
		expect(result.perRouteHeads[0]?.matchId).toBe("")

		vi.unstubAllGlobals()
	})

	it("redirect without u → defaults to '/'", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue(createMockResponse([line({ s: 302, t: "x" })])),
		)

		try {
			await fetchNDJSON({ url: "/api" })
		} catch (e) {
			expect(e).toBeInstanceOf(RedirectResponse)
			expect((e as RedirectResponse).url).toBe("/")
		}

		vi.unstubAllGlobals()
	})
})

/* ── Stream read error propagation ─────────────────────────────────── */

describe("stream read error propagation", () => {
	it("error before loadersReady → propagates to caller", async () => {
		let readCount = 0
		const reader = {
			cancel: vi.fn(),
			read: vi.fn(() => {
				readCount++
				if (readCount === 1) {
					throw new Error("network down")
				}
				return { done: true, value: undefined }
			}),
		}
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue({
				body: { getReader: () => reader },
				ok: true,
			}),
		)

		await expect(fetchNDJSON({ url: "/api" })).rejects.toThrow("network down")

		vi.unstubAllGlobals()
	})

	it("error after loadersReady → swallowed (no unhandled rejection)", async () => {
		let readCount = 0
		const reader = {
			cancel: vi.fn(),
			read: vi.fn(() => {
				readCount++
				if (readCount === 1) {
					return {
						done: false,
						value: new TextEncoder().encode(
							`${line({ d: "ok", m: "m1", t: "l" })}\n${line({ t: "r" })}\n`,
						),
					}
				}
				if (readCount === 2) {
					throw new Error("connection dropped")
				}
				return { done: true, value: undefined }
			}),
		}
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue({
				body: { getReader: () => reader },
				ok: true,
			}),
		)

		/* Should resolve successfully — error happens in background after loadersReady */
		const result = await fetchNDJSON({ url: "/api" })
		expect(result.success).toBe(true)
		expect(result.matches).toHaveLength(1)

		vi.unstubAllGlobals()
	})

	it("pending deferred resolvers rejected on stream end", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue(
				createMockResponse([
					line({ d: { __deferred: true, key: "d0" }, m: "m1", t: "l" }),
					line({ t: "r" }),
					/* No chunk message for d0 — stream ends */
				]),
			),
		)

		const result = await fetchNDJSON({ url: "/api" })
		const data = result.matches[0]?.loaderData as Record<string, unknown>
		await expect(data.promise as Promise<unknown>).rejects.toThrow("Navigation cancelled")

		vi.unstubAllGlobals()
	})

	it("redirect error in stream → propagates RedirectResponse", async () => {
		let readCount = 0
		const reader = {
			cancel: vi.fn(),
			read: vi.fn(() => {
				readCount++
				if (readCount === 1) {
					return {
						done: false,
						value: new TextEncoder().encode(`${line({ s: 302, t: "x", u: "/login" })}\n`),
					}
				}
				return { done: true, value: undefined }
			}),
		}
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue({
				body: { getReader: () => reader },
				ok: true,
			}),
		)

		await expect(fetchNDJSON({ url: "/api" })).rejects.toThrow(RedirectResponse)

		vi.unstubAllGlobals()
	})
})

describe("response.body null handling", () => {
	it("returns success:false when response.body is null", async () => {
		const response = {
			body: null,
			ok: true,
		} as unknown as Response

		const originalFetch = globalThis.fetch
		globalThis.fetch = (() => Promise.resolve(response)) as typeof fetch

		const result = await fetchNDJSON({ url: "/api" })
		expect(result.success).toBe(false)
		expect(result.matches).toHaveLength(0)
		expect(result.perRouteHeads).toHaveLength(0)

		globalThis.fetch = originalFetch
	})
})

describe("non-OK NDJSON bodies", () => {
	it("HTTP 500 with x-ndjson still parses loader and error messages", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue(
				createMockResponse(
					[
						line({ d: { attempt: 2 }, m: "m1", t: "l" }),
						line({ t: "d" }),
					],
					{ ok: false, status: 500 },
				),
			),
		)

		const result = await fetchNDJSON({ url: "/retry-test" })
		expect(result.success).toBe(true)
		expect(result.matches).toHaveLength(1)
		expect(result.matches[0]?.loaderData).toEqual({ attempt: 2 })

		vi.unstubAllGlobals()
	})

	it("HTTP 500 HTML is still a failed fetch", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue({
				body: { getReader: () => ({ cancel: vi.fn(), read: async () => ({ done: true }) }) },
				headers: { get: () => "text/html" },
				ok: false,
				status: 500,
			}),
		)

		const result = await fetchNDJSON({ url: "/retry-test" })
		expect(result.success).toBe(false)
		expect(result.matches).toHaveLength(0)

		vi.unstubAllGlobals()
	})
})
