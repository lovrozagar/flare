import { describe, expect, it, vi } from "vitest"
import { fetchNDJSON } from "../../../src/ndjson-client/index.ts"

function line(obj: Record<string, unknown>): string {
	return JSON.stringify(obj)
}

function createLockTrackingResponse(lines: string[]) {
	const body = `${lines.join("\n")}\n`
	const encoder = new TextEncoder()
	const encoded = encoder.encode(body)

	let read = false
	const releaseLockSpy = vi.fn()
	const cancelSpy = vi.fn()

	const reader = {
		cancel: cancelSpy,
		read: vi.fn(() => {
			if (!read) {
				read = true
				return { done: false, value: encoded }
			}
			return { done: true, value: undefined }
		}),
		releaseLock: releaseLockSpy,
	}

	const response = {
		body: { getReader: () => reader },
		ok: true,
	} as unknown as Response

	return { cancelSpy, reader, releaseLockSpy, response }
}

describe("NDJSON client reader lock release", () => {
	it("releaseLock called after successful stream completion", async () => {
		const { releaseLockSpy, response } = createLockTrackingResponse([
			line({ d: { title: "ok" }, m: "match1", t: "l" }),
			line({ t: "d" }),
		])
		const fetchSpy = vi.fn().mockResolvedValue(response)
		vi.stubGlobal("fetch", fetchSpy)

		await fetchNDJSON({ url: "/test" })

		expect(releaseLockSpy).toHaveBeenCalled()
		vi.unstubAllGlobals()
	})

	it("releaseLock called after abort signal", async () => {
		const controller = new AbortController()
		controller.abort()

		const { releaseLockSpy, response } = createLockTrackingResponse([line({ t: "d" })])
		const fetchSpy = vi.fn().mockResolvedValue(response)
		vi.stubGlobal("fetch", fetchSpy)

		await fetchNDJSON({ signal: controller.signal, url: "/test" })

		expect(releaseLockSpy).toHaveBeenCalled()
		vi.unstubAllGlobals()
	})

	it("releaseLock called on error path (already works)", async () => {
		const releaseLockSpy = vi.fn()
		const reader = {
			cancel: vi.fn(),
			read: vi.fn(() => {
				throw new Error("stream exploded")
			}),
			releaseLock: releaseLockSpy,
		}

		const response = {
			body: { getReader: () => reader },
			ok: true,
		} as unknown as Response

		const fetchSpy = vi.fn().mockResolvedValue(response)
		vi.stubGlobal("fetch", fetchSpy)

		try {
			await fetchNDJSON({ url: "/test" })
		} catch {
			/* expected */
		}

		expect(releaseLockSpy).toHaveBeenCalled()
		vi.unstubAllGlobals()
	})
})
