import { describe, expect, it } from "vitest"
import { getServerContext, runWithServerContext } from "../../../src/server-context/index.ts"

describe("getServerContext", () => {
	it("returns factory result within runWithServerContext", () => {
		const ctx = { db: "test-db", requestId: "abc-123" }
		runWithServerContext(
			{ nonce: "x", request: new Request("http://localhost/"), serverContext: ctx },
			() => {
				expect(getServerContext()).toBe(ctx)
			},
		)
	})

	it("returns empty object outside request context", () => {
		expect(getServerContext()).toEqual({})
	})

	it("defaults to empty object when serverContext option omitted", () => {
		runWithServerContext({ nonce: "x", request: new Request("http://localhost/") }, () => {
			expect(getServerContext()).toEqual({})
		})
	})

	it("mutations visible via getServerContext within same request", () => {
		runWithServerContext(
			{
				nonce: "x",
				request: new Request("http://localhost/"),
				serverContext: { count: 0 },
			},
			() => {
				const ctx = getServerContext()
				ctx.count = 42
				expect(getServerContext().count).toBe(42)
			},
		)
	})

	it("isolated between concurrent requests", async () => {
		const results = await Promise.all([
			runWithServerContext(
				{
					nonce: "a",
					request: new Request("http://localhost/a"),
					serverContext: { id: "request-a" },
				},
				async () => {
					await new Promise((r) => setTimeout(r, 10))
					return getServerContext().id
				},
			),
			runWithServerContext(
				{
					nonce: "b",
					request: new Request("http://localhost/b"),
					serverContext: { id: "request-b" },
				},
				async () => {
					await new Promise((r) => setTimeout(r, 5))
					return getServerContext().id
				},
			),
		])
		expect(results).toEqual(["request-a", "request-b"])
	})

	it("async factory result preserved through awaits", async () => {
		const result = await runWithServerContext(
			{
				nonce: "x",
				request: new Request("http://localhost/"),
				serverContext: { token: "secret" },
			},
			async () => {
				await Promise.resolve()
				await new Promise((r) => setTimeout(r, 5))
				return getServerContext().token
			},
		)
		expect(result).toBe("secret")
	})
})
