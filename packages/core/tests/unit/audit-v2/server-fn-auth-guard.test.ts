/** @vitest-environment node */
import { describe, expect, it } from "vitest"
import { createServerFn } from "../../../src/server-fn/index.ts"

describe("Server fn — auth guard on direct invocation (GREEN confirmation)", () => {
	it("authenticated handler fn throws on direct call", async () => {
		const fn = createServerFn({ name: "authTest" })
			.authenticate()
			.handler(async (ctx) => ctx.auth)

		await expect(fn()).rejects.toThrow("requires authentication and cannot be called directly")
	})

	it("authenticated stream fn throws on direct call", () => {
		const fn = createServerFn({ name: "streamAuthTest" })
			.authenticate()
			.stream(async function* (ctx) {
				yield ctx.auth
			})

		expect(() => fn(undefined)).toThrow("requires authentication and cannot be called directly")
	})

	it("non-authenticated handler fn succeeds with auth: null", async () => {
		const fn = createServerFn({ name: "noAuthTest" }).handler(async (ctx) => ({
			auth: ctx.auth,
			ok: true,
		}))

		const result = await fn()
		expect(result).toEqual({ auth: null, ok: true })
	})

	it("non-authenticated stream fn succeeds with auth: null", async () => {
		const fn = createServerFn({ name: "noAuthStreamTest" }).stream(async function* (ctx) {
			yield { auth: ctx.auth, ok: true }
		})

		const chunks: unknown[] = []
		for await (const chunk of fn(undefined)) {
			chunks.push(chunk)
		}
		expect(chunks).toHaveLength(1)
		expect(chunks[0]).toEqual({ auth: null, ok: true })
	})
})
