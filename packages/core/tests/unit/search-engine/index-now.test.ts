import { describe, expect, it, vi } from "vitest"
import { indexNowVerification, submitIndexNow } from "../../../src/search-engine/index-now.ts"

/* ── submitIndexNow ───────────────────────────────────────────────────── */

describe("submitIndexNow", () => {
	it("sends POST to IndexNow API with correct body", async () => {
		let capturedUrl = ""
		let capturedBody = ""
		const originalFetch = globalThis.fetch
		globalThis.fetch = vi.fn(async (url: string, init: RequestInit) => {
			capturedUrl = url
			capturedBody = init.body as string
			return new Response(null, { status: 200 })
		}) as unknown as typeof fetch

		try {
			const result = await submitIndexNow({
				host: "example.com",
				key: "my-key",
				urls: ["https://example.com/page1", "https://example.com/page2"],
			})

			expect(result.ok).toBe(true)
			expect(capturedUrl).toBe("https://api.indexnow.org/indexnow")

			const body = JSON.parse(capturedBody)
			expect(body.host).toBe("example.com")
			expect(body.key).toBe("my-key")
			expect(body.urlList).toEqual(["https://example.com/page1", "https://example.com/page2"])
		} finally {
			globalThis.fetch = originalFetch
		}
	})

	it("includes keyLocation when provided", async () => {
		let capturedBody = ""
		const originalFetch = globalThis.fetch
		globalThis.fetch = vi.fn(async (_url: string, init: RequestInit) => {
			capturedBody = init.body as string
			return new Response(null, { status: 200 })
		}) as unknown as typeof fetch

		try {
			await submitIndexNow({
				host: "example.com",
				key: "my-key",
				keyLocation: "https://example.com/my-key.txt",
				urls: ["https://example.com/page"],
			})

			const body = JSON.parse(capturedBody)
			expect(body.keyLocation).toBe("https://example.com/my-key.txt")
		} finally {
			globalThis.fetch = originalFetch
		}
	})

	it("returns error on failure", async () => {
		const originalFetch = globalThis.fetch
		globalThis.fetch = vi.fn(
			async () => new Response("error", { status: 422 }),
		) as unknown as typeof fetch

		try {
			const result = await submitIndexNow({
				host: "example.com",
				key: "key",
				urls: ["https://example.com/page"],
			})
			expect(result.ok).toBe(false)
			expect(result.error).toContain("422")
		} finally {
			globalThis.fetch = originalFetch
		}
	})
})

/* ── indexNowVerification middleware ───────────────────────────────────── */

describe("indexNowVerification", () => {
	const middleware = indexNowVerification("abc123")

	function makeCtx(method: string, pathname: string) {
		return {
			bypass: (response: Response) => Object.freeze({ response, type: "bypass" as const }),
			env: {},
			error: () => {},
			log: () => {},
			next: vi.fn(() => Promise.resolve(Object.freeze({ type: "next" as const }))),
			nonce: "nonce",
			onResponse: () => {},
			request: new Request(`https://example.com${pathname}`, { method }),
			requestType: "page" as const,
			respond: (response: Response) => Object.freeze({ response, type: "respond" as const }),
			serverContext: {},
			url: new URL(`https://example.com${pathname}`),
			warn: () => {},
		}
	}

	it("serves key as text/plain on matching path", async () => {
		const ctx = makeCtx("GET", "/abc123.txt")
		const result = await middleware(ctx)

		expect(ctx.next).not.toHaveBeenCalled()
		expect(result.type).toBe("respond")
		if (result.type === "respond") {
			expect(result.response.status).toBe(200)
			const text = await result.response.text()
			expect(text).toBe("abc123")
			expect(result.response.headers.get("Content-Type")).toContain("text/plain")
		}
	})

	it("passes through for non-matching path", async () => {
		const ctx = makeCtx("GET", "/other.txt")
		const result = await middleware(ctx)
		expect(ctx.next).toHaveBeenCalled()
		expect(result.type).toBe("next")
	})

	it("passes through for non-GET requests", async () => {
		const ctx = makeCtx("POST", "/abc123.txt")
		const result = await middleware(ctx)
		expect(ctx.next).toHaveBeenCalled()
		expect(result.type).toBe("next")
	})
})
