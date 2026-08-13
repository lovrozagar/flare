import { describe, expect, it, vi } from "vitest"
import { dedupe } from "../../../src/dedupe/index.ts"

/* Mock server context */
vi.mock("../../../src/server-context", () => {
	const store = new Map<string, unknown>()
	return {
		getServerRequestContext: () => ({
			get: <T>(key: string) => store.get(key) as T | undefined,
			set: (key: string, value: unknown) => store.set(key, value),
		}),
	}
})

describe("dedupe — null vs undefined argument handling", () => {
	it("distinguishes null and undefined as separate cache keys", async () => {
		const fn = vi.fn(async (val: unknown) => (val === null ? "was-null" : "was-undefined"))
		const deduped = dedupe(fn)

		const resultNull = await deduped(null)
		const resultUndefined = await deduped(undefined)

		expect(resultNull).toBe("was-null")
		expect(resultUndefined).toBe("was-undefined")
		expect(fn).toHaveBeenCalledTimes(2)
	})

	it("distinguishes [null] and [undefined] in nested args", async () => {
		const fn = vi.fn(async (arr: unknown[]) =>
			arr[0] === null ? "nested-null" : "nested-undefined",
		)
		const deduped = dedupe(fn)

		const resultNull = await deduped([null])
		const resultUndefined = await deduped([undefined])

		expect(resultNull).toBe("nested-null")
		expect(resultUndefined).toBe("nested-undefined")
		expect(fn).toHaveBeenCalledTimes(2)
	})

	it("still deduplicates identical null args", async () => {
		const fn = vi.fn(async (val: unknown) => "result")
		const deduped = dedupe(fn)

		const r1 = await deduped(null)
		const r2 = await deduped(null)

		expect(r1).toBe("result")
		expect(r2).toBe("result")
		expect(fn).toHaveBeenCalledTimes(1)
	})

	it("still deduplicates identical undefined args", async () => {
		const fn = vi.fn(async (val: unknown) => "result")
		const deduped = dedupe(fn)

		const r1 = await deduped(undefined)
		const r2 = await deduped(undefined)

		expect(r1).toBe("result")
		expect(r2).toBe("result")
		expect(fn).toHaveBeenCalledTimes(1)
	})
})
