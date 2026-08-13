import { describe, expect, it, vi } from "vitest"
import { background, runWithServerContext } from "../../../src/server-context/index.ts"

describe("background()", () => {
	it("throws outside request context", () => {
		expect(() => background(Promise.resolve())).toThrow("called outside request context")
	})

	it("delegates to waitUntil when present", () => {
		const waitUntil = vi.fn()
		const promise = Promise.resolve("done")

		runWithServerContext(
			{
				nonce: "abc",
				request: new Request("http://localhost/"),
				waitUntil,
			},
			() => {
				background(promise)
			},
		)

		expect(waitUntil).toHaveBeenCalledWith(promise)
	})

	it("fire-and-forgets when no waitUntil", async () => {
		let resolved = false
		const promise = new Promise<void>((resolve) => {
			setTimeout(() => {
				resolved = true
				resolve()
			}, 10)
		})

		runWithServerContext(
			{
				nonce: "abc",
				request: new Request("http://localhost/"),
			},
			() => {
				/* should not throw */
				background(promise)
			},
		)

		/* wait for promise to settle */
		await promise
		expect(resolved).toBe(true)
	})

	it("swallows errors in fire-and-forget mode", () => {
		const rejecting = Promise.reject(new Error("bg fail"))

		expect(() => {
			runWithServerContext(
				{
					nonce: "abc",
					request: new Request("http://localhost/"),
				},
				() => {
					background(rejecting)
				},
			)
		}).not.toThrow()
	})
})
