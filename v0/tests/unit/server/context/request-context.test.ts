/**
 * Request Context Unit Tests
 *
 * Tests AsyncLocalStorage-based request context.
 * Request isolation, typed access, store operations.
 */

import { describe, expect, it } from "vitest"
import {
	createServerRequestContext,
	getServerNonce,
	getServerRequest,
	getServerRequestContext,
	runWithServerContext,
} from "../../../../src/server/context/request-context"

describe("createServerRequestContext", () => {
	it("creates empty store", () => {
		const store = createServerRequestContext()
		expect(store).toBeDefined()
	})

	it("stores and retrieves values", () => {
		const store = createServerRequestContext()
		store.set("user", { id: "123", name: "Test" })
		expect(store.get("user")).toEqual({ id: "123", name: "Test" })
	})

	it("returns undefined for missing keys", () => {
		const store = createServerRequestContext()
		expect(store.get("nonexistent")).toBeUndefined()
	})

	it("overwrites existing values", () => {
		const store = createServerRequestContext()
		store.set("value", "first")
		store.set("value", "second")
		expect(store.get("value")).toBe("second")
	})

	it("supports typed retrieval", () => {
		const store = createServerRequestContext()
		store.set("count", 42)
		const count = store.get<number>("count")
		expect(count).toBe(42)
	})
})

describe("runWithServerContext", () => {
	it("provides context to callback", async () => {
		const request = new Request("https://example.com")
		const nonce = "test-nonce-123"

		let capturedRequest: Request | undefined
		let capturedNonce: string | undefined

		await runWithServerContext({ nonce, request }, () => {
			capturedRequest = getServerRequest()
			capturedNonce = getServerNonce()
		})

		expect(capturedRequest).toBe(request)
		expect(capturedNonce).toBe(nonce)
	})

	it("isolates context between calls", async () => {
		const request1 = new Request("https://example.com/1")
		const request2 = new Request("https://example.com/2")

		let captured1: Request | undefined
		let captured2: Request | undefined

		await Promise.all([
			runWithServerContext({ nonce: "nonce1", request: request1 }, async () => {
				await new Promise((r) => setTimeout(r, 10))
				captured1 = getServerRequest()
			}),
			runWithServerContext({ nonce: "nonce2", request: request2 }, () => {
				captured2 = getServerRequest()
			}),
		])

		expect(captured1?.url).toBe("https://example.com/1")
		expect(captured2?.url).toBe("https://example.com/2")
	})

	it("returns callback result", async () => {
		const result = await runWithServerContext(
			{ nonce: "test", request: new Request("https://example.com") },
			() => "result-value",
		)
		expect(result).toBe("result-value")
	})

	it("propagates errors", () => {
		expect(() =>
			runWithServerContext({ nonce: "test", request: new Request("https://example.com") }, () => {
				throw new Error("test error")
			}),
		).toThrow("test error")
	})
})

describe("getServerRequest", () => {
	it("throws outside context", () => {
		expect(() => getServerRequest()).toThrow("getServerRequest called outside request context")
	})

	it("returns request inside context", async () => {
		const request = new Request("https://example.com/test")
		await runWithServerContext({ nonce: "test", request }, () => {
			const req = getServerRequest()
			expect(req.url).toBe("https://example.com/test")
		})
	})
})

describe("getServerNonce", () => {
	it("throws outside context", () => {
		expect(() => getServerNonce()).toThrow("getServerNonce called outside request context")
	})

	it("returns nonce inside context", async () => {
		const nonce = "abc123def456"
		await runWithServerContext({ nonce, request: new Request("https://example.com") }, () => {
			expect(getServerNonce()).toBe(nonce)
		})
	})
})

describe("getServerRequestContext", () => {
	it("throws outside context", () => {
		expect(() => getServerRequestContext()).toThrow(
			"getServerRequestContext called outside request context",
		)
	})

	it("returns store inside context", async () => {
		await runWithServerContext(
			{ nonce: "test", request: new Request("https://example.com") },
			() => {
				const ctx = getServerRequestContext()
				ctx.set("key", "value")
				expect(ctx.get("key")).toBe("value")
			},
		)
	})

	it("supports typed generic", async () => {
		interface MyContext {
			locale: string
			user: { id: string } | null
		}

		await runWithServerContext(
			{ nonce: "test", request: new Request("https://example.com") },
			() => {
				const ctx = getServerRequestContext<MyContext>()
				ctx.set("locale", "en")
				ctx.set("user", { id: "123" })

				expect(ctx.get("locale")).toBe("en")
				expect(ctx.get("user")).toEqual({ id: "123" })
			},
		)
	})
})

describe("concurrent requests", () => {
	it("maintains isolation with many concurrent requests", async () => {
		const results: Array<{ id: number; nonce: string }> = []

		await Promise.all(
			Array.from({ length: 100 }, (_, i) =>
				runWithServerContext(
					{
						nonce: `nonce-${i}`,
						request: new Request(`https://example.com/${i}`),
					},
					async () => {
						await new Promise((r) => setTimeout(r, Math.random() * 10))
						results.push({ id: i, nonce: getServerNonce() })
					},
				),
			),
		)

		for (const result of results) {
			expect(result.nonce).toBe(`nonce-${result.id}`)
		}
	})
})
