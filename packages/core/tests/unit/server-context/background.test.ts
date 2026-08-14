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

	it("does not throw when waitUntil rejects an unbound this", () => {
		const executionCtx = {
			waitUntil(this: unknown, _p: Promise<unknown>) {
				if (this !== executionCtx) {
					throw new TypeError(
						"Illegal invocation: function called with incorrect `this` reference.",
					)
				}
			},
		}
		const unbound = executionCtx.waitUntil

		expect(() => {
			runWithServerContext(
				{
					nonce: "abc",
					request: new Request("http://localhost/"),
					waitUntil: unbound,
				},
				() => {
					background(Promise.resolve("bg"))
				},
			)
		}).not.toThrow()
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
