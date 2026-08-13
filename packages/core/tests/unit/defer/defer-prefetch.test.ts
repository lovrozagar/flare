import { describe, expect, it, vi } from "vitest"
import { createDeferContext } from "../../../src/defer/index.ts"

describe("createDeferContext with prefetch mode", () => {
	it("defer() returns marker without calling fn", () => {
		const fn = vi.fn(() => Promise.resolve("data"))
		const ctx = createDeferContext("route-1", { prefetch: true })
		const d = ctx.defer(fn)

		expect(d.__deferred).toBe(true)
		expect(d.key).toBeTypeOf("string")
		expect(d.promise).toBeInstanceOf(Promise)
		expect(fn).not.toHaveBeenCalled()
	})

	it("entries() returns empty array in prefetch mode", () => {
		const ctx = createDeferContext("route-1", { prefetch: true })
		ctx.defer(() => Promise.resolve("data"))
		ctx.defer(() => Promise.resolve("data2"))

		expect(ctx.entries()).toEqual([])
	})

	it("auto-generates keys in prefetch mode", () => {
		const ctx = createDeferContext("route-1", { prefetch: true })
		const d0 = ctx.defer(() => Promise.resolve(1))
		const d1 = ctx.defer(() => Promise.resolve(2))

		expect(d0.key).toBe("d0")
		expect(d1.key).toBe("d1")
	})

	it("custom key works in prefetch mode", () => {
		const ctx = createDeferContext("route-1", { prefetch: true })
		const d = ctx.defer(() => Promise.resolve("data"), { key: "reviews" })

		expect(d.key).toBe("reviews")
	})

	it("deduplication works in prefetch mode (same key returns same deferred)", () => {
		const ctx = createDeferContext("route-1", { prefetch: true })
		const d1 = ctx.defer(() => Promise.resolve("a"), { key: "x" })
		const d2 = ctx.defer(() => Promise.resolve("b"), { key: "x" })

		expect(d1).toBe(d2)
	})
})

describe("createDeferContext without prefetch (default)", () => {
	it("existing behavior unchanged: fn() called synchronously", () => {
		const fn = vi.fn(() => Promise.resolve("data"))
		const ctx = createDeferContext("route-1")
		ctx.defer(fn)

		expect(fn).toHaveBeenCalledTimes(1)
	})

	it("existing behavior unchanged: entries() returns entries", () => {
		const ctx = createDeferContext("route-1")
		ctx.defer(() => Promise.resolve("data"))

		expect(ctx.entries()).toHaveLength(1)
		expect(ctx.entries()[0]?.matchId).toBe("route-1")
	})

	it("explicit prefetch: false behaves like default", () => {
		const fn = vi.fn(() => Promise.resolve("data"))
		const ctx = createDeferContext("route-1", { prefetch: false })
		ctx.defer(fn)

		expect(fn).toHaveBeenCalledTimes(1)
		expect(ctx.entries()).toHaveLength(1)
	})
})

describe("prefetch mode — promise behavior", () => {
	it("prefetch promise never resolves (placeholder)", async () => {
		const ctx = createDeferContext("r1", { prefetch: true })
		const d = ctx.defer(() => Promise.resolve("data"))

		/* Promise should be pending forever — race with a timeout to prove it */
		const result = await Promise.race([
			d.promise.then(() => "resolved"),
			new Promise<string>((r) => setTimeout(() => r("timeout"), 50)),
		])
		expect(result).toBe("timeout")
	})

	it("prefetch does not trigger unhandled rejection", async () => {
		const handler = vi.fn()
		process.on("unhandledRejection", handler)
		try {
			const ctx = createDeferContext("r1", { prefetch: true })
			/* fn would reject but shouldn't be called */
			ctx.defer(() => Promise.reject(new Error("should not run")))
			await new Promise((r) => setTimeout(r, 50))
			expect(handler).not.toHaveBeenCalled()
		} finally {
			process.removeListener("unhandledRejection", handler)
		}
	})

	it("multiple deferred in prefetch → all fns skipped, all entries empty", () => {
		const fn1 = vi.fn(() => Promise.resolve(1))
		const fn2 = vi.fn(() => Promise.resolve(2))
		const fn3 = vi.fn(() => Promise.resolve(3))
		const ctx = createDeferContext("r1", { prefetch: true })

		ctx.defer(fn1)
		ctx.defer(fn2, { key: "custom" })
		ctx.defer(fn3)

		expect(fn1).not.toHaveBeenCalled()
		expect(fn2).not.toHaveBeenCalled()
		expect(fn3).not.toHaveBeenCalled()
		expect(ctx.entries()).toHaveLength(0)
	})

	it("prefetch dedup: second call with same key reuses first placeholder", () => {
		const fn1 = vi.fn(() => Promise.resolve("a"))
		const fn2 = vi.fn(() => Promise.resolve("b"))
		const ctx = createDeferContext("r1", { prefetch: true })

		const d1 = ctx.defer(fn1, { key: "shared" })
		const d2 = ctx.defer(fn2, { key: "shared" })

		expect(d1).toBe(d2)
		expect(fn1).not.toHaveBeenCalled()
		expect(fn2).not.toHaveBeenCalled()
	})

	it("two separate prefetch contexts with same matchId are independent", () => {
		const ctx1 = createDeferContext("r1", { prefetch: true })
		const ctx2 = createDeferContext("r1", { prefetch: true })

		const d1 = ctx1.defer(() => Promise.resolve(1))
		const d2 = ctx2.defer(() => Promise.resolve(2))

		expect(d1.key).toBe("d0")
		expect(d2.key).toBe("d0")
		expect(d1).not.toBe(d2)
	})
})

describe("prefetch vs normal mode — isolation", () => {
	it("normal context after prefetch context works independently", () => {
		const prefetchCtx = createDeferContext("r1", { prefetch: true })
		prefetchCtx.defer(() => Promise.resolve("prefetch-data"))

		const normalCtx = createDeferContext("r1")
		const fn = vi.fn(() => Promise.resolve("normal-data"))
		normalCtx.defer(fn)

		/* Normal mode should execute fn and have entries */
		expect(fn).toHaveBeenCalledTimes(1)
		expect(normalCtx.entries()).toHaveLength(1)
		/* Prefetch should still have empty entries */
		expect(prefetchCtx.entries()).toHaveLength(0)
	})
})
