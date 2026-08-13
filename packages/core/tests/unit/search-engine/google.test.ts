import { describe, expect, it, vi } from "vitest"
import {
	batchNotifyGoogleIndexing,
	notifyGoogleIndexing,
	submitSitemapToGoogle,
} from "../../../src/search-engine/google.ts"
import * as jwt from "../../../src/search-engine/google-jwt.ts"

/* ── submitSitemapToGoogle ─────────────────────────────────────────────── */

describe("submitSitemapToGoogle", () => {
	it("calls correct URL with PUT and bearer token", async () => {
		vi.spyOn(jwt, "getGoogleAccessToken").mockResolvedValue("test-token")
		let capturedUrl = ""
		let capturedMethod = ""
		let capturedAuth = ""
		const originalFetch = globalThis.fetch
		globalThis.fetch = vi.fn(async (url: string, init: RequestInit) => {
			capturedUrl = url
			capturedMethod = init.method ?? ""
			capturedAuth = (init.headers as Record<string, string>).Authorization ?? ""
			return new Response(null, { status: 200 })
		}) as unknown as typeof fetch

		try {
			const result = await submitSitemapToGoogle({
				credentials: { clientEmail: "test@test.com", privateKey: "key" },
				siteUrl: "https://example.com",
				sitemapUrl: "https://example.com/sitemap.xml",
			})

			expect(result.ok).toBe(true)
			expect(capturedMethod).toBe("PUT")
			expect(capturedAuth).toBe("Bearer test-token")
			expect(capturedUrl).toContain("webmasters/v3/sites/")
			expect(capturedUrl).toContain(encodeURIComponent("https://example.com"))
			expect(capturedUrl).toContain(encodeURIComponent("https://example.com/sitemap.xml"))
		} finally {
			globalThis.fetch = originalFetch
			vi.restoreAllMocks()
		}
	})

	it("returns error on failure", async () => {
		vi.spyOn(jwt, "getGoogleAccessToken").mockResolvedValue("test-token")
		const originalFetch = globalThis.fetch
		globalThis.fetch = vi.fn(
			async () => new Response("forbidden", { status: 403 }),
		) as unknown as typeof fetch

		try {
			const result = await submitSitemapToGoogle({
				credentials: { clientEmail: "test@test.com", privateKey: "key" },
				siteUrl: "https://example.com",
				sitemapUrl: "https://example.com/sitemap.xml",
			})
			expect(result.ok).toBe(false)
			expect(result.error).toContain("403")
		} finally {
			globalThis.fetch = originalFetch
			vi.restoreAllMocks()
		}
	})
})

/* ── notifyGoogleIndexing ─────────────────────────────────────────────── */

describe("notifyGoogleIndexing", () => {
	it("sends POST with correct body", async () => {
		vi.spyOn(jwt, "getGoogleAccessToken").mockResolvedValue("test-token")
		let capturedBody = ""
		const originalFetch = globalThis.fetch
		globalThis.fetch = vi.fn(async (_url: string, init: RequestInit) => {
			capturedBody = init.body as string
			return new Response(null, { status: 200 })
		}) as unknown as typeof fetch

		try {
			const result = await notifyGoogleIndexing(
				{ clientEmail: "test@test.com", privateKey: "key" },
				{ type: "URL_UPDATED", url: "https://example.com/page" },
			)
			expect(result.ok).toBe(true)
			const body = JSON.parse(capturedBody)
			expect(body.url).toBe("https://example.com/page")
			expect(body.type).toBe("URL_UPDATED")
		} finally {
			globalThis.fetch = originalFetch
			vi.restoreAllMocks()
		}
	})
})

/* ── batchNotifyGoogleIndexing ────────────────────────────────────────── */

describe("batchNotifyGoogleIndexing", () => {
	it("processes batch and reports errors", async () => {
		vi.spyOn(jwt, "getGoogleAccessToken").mockResolvedValue("test-token")
		let callCount = 0
		const originalFetch = globalThis.fetch
		globalThis.fetch = vi.fn(async () => {
			callCount++
			if (callCount === 2) return new Response("fail", { status: 500 })
			return new Response(null, { status: 200 })
		}) as unknown as typeof fetch

		try {
			const result = await batchNotifyGoogleIndexing({
				concurrency: 1,
				credentials: { clientEmail: "test@test.com", privateKey: "key" },
				notifications: [
					{ type: "URL_UPDATED", url: "https://example.com/1" },
					{ type: "URL_UPDATED", url: "https://example.com/2" },
					{ type: "URL_UPDATED", url: "https://example.com/3" },
				],
			})
			expect(result.total).toBe(3)
			expect(result.errors).toHaveLength(1)
		} finally {
			globalThis.fetch = originalFetch
			vi.restoreAllMocks()
		}
	})

	it("caps at 100 notifications", async () => {
		vi.spyOn(jwt, "getGoogleAccessToken").mockResolvedValue("test-token")
		let callCount = 0
		const originalFetch = globalThis.fetch
		globalThis.fetch = vi.fn(async () => {
			callCount++
			return new Response(null, { status: 200 })
		}) as unknown as typeof fetch

		try {
			const notifications = Array.from({ length: 150 }, (_, i) => ({
				type: "URL_UPDATED" as const,
				url: `https://example.com/${i}`,
			}))
			const result = await batchNotifyGoogleIndexing({
				credentials: { clientEmail: "test@test.com", privateKey: "key" },
				notifications,
			})
			expect(result.total).toBe(100)
		} finally {
			globalThis.fetch = originalFetch
			vi.restoreAllMocks()
		}
	})
})
