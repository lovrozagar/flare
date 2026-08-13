import { describe, expect, it, vi } from "vitest"
import { RedirectResponse } from "../../../src/errors/index.ts"
import { fetchNDJSON } from "../../../src/ndjson-client/index.ts"

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

function encode(text: string): Uint8Array {
	return new TextEncoder().encode(text)
}

describe("B4: NDJSON post-loaders error warning", () => {
	it("non-redirect error after loadersReady calls warn()", async () => {
		/* Chunk 1: loader data + ready signal. Chunk 2: a broken line that causes parse error */
		const chunk1 = encode(
			`${line({ d: { value: 1 }, m: "match1", t: "l" })}\n${line({ t: "r" })}\n`,
		)
		/* Chunk 2 simulates a stream error by having the reader throw */
		let callCount = 0
		const reader = {
			cancel: vi.fn(),
			read: vi.fn(() => {
				callCount++
				if (callCount === 1) {
					return { done: false, value: chunk1 }
				}
				if (callCount === 2) {
					/* Simulate stream error after loaders ready */
					throw new Error("network error mid-stream")
				}
				return { done: true, value: undefined }
			}),
		}

		const response = {
			body: { getReader: () => reader },
			ok: true,
		} as unknown as Response

		vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response))

		const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})

		const result = await fetchNDJSON({ url: "http://localhost/test" })

		/* Allow microtask for the readPromise catch to run */
		await new Promise<void>((r) => setTimeout(r, 10))

		expect(result.success).toBe(true)
		expect(result.matches).toHaveLength(1)

		/* The non-redirect error should have triggered a warn */
		expect(warnSpy).toHaveBeenCalledWith(
			"[flare:ndjson]",
			"post-loaders stream error",
			expect.any(Error),
		)
	})

	it("redirect after loadersReady still captured as pendingRedirect", async () => {
		const chunk1 = encode(
			`${line({ d: { value: 1 }, m: "match1", t: "l" })}\n${line({ t: "r" })}\n`,
		)
		/* Chunk 2: redirect */
		const chunk2 = encode(`${line({ t: "x", u: "/new-location" })}\n`)

		const response = createChunkedResponse([chunk1, chunk2])
		vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response))

		/* Redirect should propagate as before */
		await expect(fetchNDJSON({ url: "http://localhost/test" })).rejects.toBeInstanceOf(
			RedirectResponse,
		)
	})
})
