/**
 * Preload Utility Unit Tests
 *
 * Tests the preload utility for lazy loading non-component modules.
 * Features: fire & forget preloading, auto-retry, throws behavior.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { preload } from "../../../src/preload"

describe("preload", () => {
	beforeEach(() => {
		vi.useFakeTimers()
	})

	afterEach(() => {
		vi.useRealTimers()
	})

	describe("basic loading", () => {
		it("load() returns default export on success", async () => {
			const defaultExport = { foo: "bar" }
			const mockModule = { default: defaultExport }
			const loader = vi.fn().mockResolvedValue(mockModule)

			const p = preload({ loader })
			const result = await p.load()

			expect(result).toBe(defaultExport)
			expect(loader).toHaveBeenCalledTimes(1)
		})

		it("load() caches the module", async () => {
			const defaultExport = { value: 123 }
			const mockModule = { default: defaultExport }
			const loader = vi.fn().mockResolvedValue(mockModule)

			const p = preload({ loader })

			const result1 = await p.load()
			const result2 = await p.load()

			expect(result1).toBe(defaultExport)
			expect(result2).toBe(defaultExport)
			expect(loader).toHaveBeenCalledTimes(1)
		})

		it("preload() starts loading without waiting", () => {
			const loader = vi.fn().mockResolvedValue({ default: { value: 1 } })

			const p = preload({ loader })
			p.preload()

			expect(loader).toHaveBeenCalledTimes(1)
		})

		it("preload() does not call loader if already cached", async () => {
			const loader = vi.fn().mockResolvedValue({ default: { value: 1 } })

			const p = preload({ loader })
			await p.load()
			p.preload()

			expect(loader).toHaveBeenCalledTimes(1)
		})

		it("load() after preload() uses cached promise", async () => {
			const defaultExport = { value: "preloaded" }
			const mockModule = { default: defaultExport }
			const loader = vi.fn().mockResolvedValue(mockModule)

			const p = preload({ loader })
			p.preload()
			const result = await p.load()

			expect(result).toBe(defaultExport)
			expect(loader).toHaveBeenCalledTimes(1)
		})
	})

	describe("retry behavior", () => {
		it("retries once on failure before giving up", async () => {
			const loader = vi.fn().mockRejectedValue(new Error("Load failed"))

			const p = preload({ loader, throws: true })

			/* Start load and handle rejection */
			let caughtError: Error | null = null
			const loadPromise = p.load().catch((e) => {
				caughtError = e as Error
			})

			/* First attempt fails immediately */
			await vi.advanceTimersByTimeAsync(0)

			/* Retry after 1000ms */
			await vi.advanceTimersByTimeAsync(1000)

			/* Wait for all promises to settle */
			await vi.runAllTimersAsync()
			await loadPromise

			expect(caughtError).toBeInstanceOf(Error)
			expect(caughtError?.message).toBe("Load failed")
			expect(loader).toHaveBeenCalledTimes(2)
		})

		it("succeeds on retry if second attempt works", async () => {
			const defaultExport = { value: "success" }
			const mockModule = { default: defaultExport }
			const loader = vi
				.fn()
				.mockRejectedValueOnce(new Error("First fail"))
				.mockResolvedValueOnce(mockModule)

			const p = preload({ loader })
			const loadPromise = p.load()

			/* First attempt fails */
			await vi.advanceTimersByTimeAsync(0)

			/* Retry after 1000ms succeeds */
			await vi.advanceTimersByTimeAsync(1000)

			const result = await loadPromise
			expect(result).toBe(defaultExport)
			expect(loader).toHaveBeenCalledTimes(2)
		})
	})

	describe("throws option", () => {
		it("throws: false (default) returns undefined on error", async () => {
			const loader = vi.fn().mockRejectedValue(new Error("Load failed"))

			const p = preload({ loader })
			const loadPromise = p.load()

			await vi.advanceTimersByTimeAsync(0)
			await vi.advanceTimersByTimeAsync(1000)

			const result = await loadPromise
			expect(result).toBeUndefined()
		})

		it("throws: true throws error after retries exhausted", async () => {
			const loader = vi.fn().mockRejectedValue(new Error("Load failed"))

			const p = preload({ loader, throws: true })

			let caughtError: Error | null = null
			const loadPromise = p.load().catch((e) => {
				caughtError = e as Error
			})

			await vi.advanceTimersByTimeAsync(0)
			await vi.advanceTimersByTimeAsync(1000)
			await vi.runAllTimersAsync()
			await loadPromise

			expect(caughtError).toBeInstanceOf(Error)
			expect(caughtError?.message).toBe("Load failed")
		})
	})

	describe("reset()", () => {
		it("reset() clears cache allowing fresh load", async () => {
			const loader = vi
				.fn()
				.mockResolvedValueOnce({ default: { value: 1 } })
				.mockResolvedValueOnce({ default: { value: 2 } })

			const p = preload({ loader })

			const first = await p.load()
			expect(first).toEqual({ value: 1 })

			p.reset()

			const second = await p.load()
			expect(second).toEqual({ value: 2 })
			expect(loader).toHaveBeenCalledTimes(2)
		})

		it("reset() clears retry count", async () => {
			const loader = vi
				.fn()
				.mockRejectedValueOnce(new Error("Fail 1"))
				.mockRejectedValueOnce(new Error("Fail 2"))
				.mockRejectedValueOnce(new Error("Fail 3"))
				.mockRejectedValueOnce(new Error("Fail 4"))

			const p = preload({ loader })

			/* First load: 2 attempts (initial + 1 retry) */
			const firstLoad = p.load()
			await vi.advanceTimersByTimeAsync(0)
			await vi.advanceTimersByTimeAsync(1000)
			await firstLoad

			expect(loader).toHaveBeenCalledTimes(2)

			/* Reset and try again */
			p.reset()
			const secondLoad = p.load()
			await vi.advanceTimersByTimeAsync(0)
			await vi.advanceTimersByTimeAsync(1000)
			await secondLoad

			/* Should have 4 total attempts (2 + 2) */
			expect(loader).toHaveBeenCalledTimes(4)
		})
	})

	describe("type safety", () => {
		it("throws: false returns T | undefined", async () => {
			const loader = vi.fn().mockResolvedValue({ default: { value: 42 } })

			const p = preload({ loader })
			const result = await p.load()

			/* TypeScript: result is { value: number } | undefined */
			if (result) {
				expect(result.value).toBe(42)
			}
		})

		it("throws: true returns T", async () => {
			const loader = vi.fn().mockResolvedValue({ default: { value: 42 } })

			const p = preload({ loader, throws: true })
			const result = await p.load()

			/* TypeScript: result is { value: number } */
			expect(result.value).toBe(42)
		})
	})

	describe("concurrent calls", () => {
		it("multiple load() calls share same promise", async () => {
			let resolveLoader: (value: unknown) => void
			const loaderPromise = new Promise((resolve) => {
				resolveLoader = resolve
			})
			const loader = vi.fn().mockReturnValue(loaderPromise)

			const p = preload({ loader })

			const promise1 = p.load()
			const promise2 = p.load()
			const promise3 = p.load()

			expect(loader).toHaveBeenCalledTimes(1)

			resolveLoader?.({ default: { value: "shared" } })

			const [result1, result2, result3] = await Promise.all([promise1, promise2, promise3])

			expect(result1).toEqual({ value: "shared" })
			expect(result2).toEqual({ value: "shared" })
			expect(result3).toEqual({ value: "shared" })
		})

		it("preload() then load() share same promise", async () => {
			let resolveLoader: (value: unknown) => void
			const loaderPromise = new Promise((resolve) => {
				resolveLoader = resolve
			})
			const loader = vi.fn().mockReturnValue(loaderPromise)

			const p = preload({ loader })

			p.preload()
			const loadPromise = p.load()

			expect(loader).toHaveBeenCalledTimes(1)

			resolveLoader?.({ default: { value: "preloaded" } })

			const result = await loadPromise
			expect(result).toEqual({ value: "preloaded" })
		})
	})
})
