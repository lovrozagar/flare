import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

/* Mock the JWT module to avoid real crypto operations */
vi.mock("../../../src/search-engine/google-jwt.ts", () => ({
	getGoogleAccessToken: vi.fn(async () => "mock-token"),
	signJwt: vi.fn(async () => "mock-jwt"),
}))

import { batchNotifyGoogleIndexing } from "../../../src/search-engine/google.ts"
import { getGoogleAccessToken } from "../../../src/search-engine/google-jwt.ts"

describe("batchNotifyGoogleIndexing — token reuse", () => {
	const originalFetch = globalThis.fetch

	beforeEach(() => {
		vi.mocked(getGoogleAccessToken).mockClear()
		globalThis.fetch = vi.fn(async () => new Response(null, { status: 200 })) as typeof fetch
	})

	afterEach(() => {
		globalThis.fetch = originalFetch
	})

	it("acquires token only once for batch of 5 notifications", async () => {
		const notifications = Array.from({ length: 5 }, (_, i) => ({
			type: "URL_UPDATED" as const,
			url: `https://example.com/page-${i}`,
		}))

		await batchNotifyGoogleIndexing({
			credentials: {
				clientEmail: "test@test.iam.gserviceaccount.com",
				privateKey: "fake-key",
			},
			notifications,
		})

		expect(getGoogleAccessToken).toHaveBeenCalledTimes(1)
	})

	it("acquires token only once even with concurrency", async () => {
		const notifications = Array.from({ length: 10 }, (_, i) => ({
			type: "URL_UPDATED" as const,
			url: `https://example.com/page-${i}`,
		}))

		await batchNotifyGoogleIndexing({
			concurrency: 5,
			credentials: {
				clientEmail: "test@test.iam.gserviceaccount.com",
				privateKey: "fake-key",
			},
			notifications,
		})

		expect(getGoogleAccessToken).toHaveBeenCalledTimes(1)
	})

	it("sends correct Authorization header to all notification requests", async () => {
		const notifications = Array.from({ length: 3 }, (_, i) => ({
			type: "URL_UPDATED" as const,
			url: `https://example.com/page-${i}`,
		}))

		await batchNotifyGoogleIndexing({
			credentials: {
				clientEmail: "test@test.iam.gserviceaccount.com",
				privateKey: "fake-key",
			},
			notifications,
		})

		const fetchMock = vi.mocked(globalThis.fetch)
		for (const call of fetchMock.mock.calls) {
			const init = call[1] as RequestInit
			const headers = init.headers as Record<string, string>
			expect(headers.Authorization).toBe("Bearer mock-token")
		}
	})
})
