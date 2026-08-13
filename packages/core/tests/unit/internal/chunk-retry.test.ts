import { describe, expect, it } from "vitest"
import { isChunkLoadError, retryImport } from "../../../src/internal.ts"

describe("isChunkLoadError", () => {
	it("detects Chrome error message", () => {
		expect(
			isChunkLoadError(new Error("Failed to fetch dynamically imported module: /foo.js")),
		).toBe(true)
	})

	it("detects Firefox error message", () => {
		expect(isChunkLoadError(new Error("error loading dynamically imported module: /foo.js"))).toBe(
			true,
		)
	})

	it("detects Safari error message", () => {
		expect(isChunkLoadError(new Error("Importing a module script failed."))).toBe(true)
	})

	it("detects Vite Loading chunk error", () => {
		expect(isChunkLoadError(new Error("Loading chunk abc123 failed."))).toBe(true)
	})

	it("detects Vite Loading CSS chunk error", () => {
		expect(isChunkLoadError(new Error("Loading CSS chunk styles-abc123 failed."))).toBe(true)
	})

	it("returns false for TypeError", () => {
		expect(isChunkLoadError(new TypeError("Cannot read properties of null"))).toBe(false)
	})

	it("returns false for generic Error", () => {
		expect(isChunkLoadError(new Error("Something went wrong"))).toBe(false)
	})

	it("returns false for non-Error string", () => {
		expect(isChunkLoadError("Failed to fetch dynamically imported module")).toBe(false)
	})

	it("returns false for null", () => {
		expect(isChunkLoadError(null)).toBe(false)
	})

	it("returns false for undefined", () => {
		expect(isChunkLoadError(undefined)).toBe(false)
	})

	it("returns false for number", () => {
		expect(isChunkLoadError(42)).toBe(false)
	})
})

describe("retryImport", () => {
	it("succeeds on first try without retry", async () => {
		let calls = 0
		const result = await retryImport(() => {
			calls++
			return Promise.resolve("ok")
		})
		expect(result).toBe("ok")
		expect(calls).toBe(1)
	})

	it("retries on chunk error and succeeds on second try", async () => {
		let calls = 0
		const result = await retryImport(() => {
			calls++
			if (calls === 1) {
				return Promise.reject(new Error("Failed to fetch dynamically imported module: /x.js"))
			}
			return Promise.resolve("recovered")
		})
		expect(result).toBe("recovered")
		expect(calls).toBe(2)
	})

	it("throws after exhausting all retries on chunk errors", async () => {
		let calls = 0
		await expect(
			retryImport(() => {
				calls++
				return Promise.reject(new Error("Failed to fetch dynamically imported module: /x.js"))
			}),
		).rejects.toThrow("Failed to fetch dynamically imported module")
		/* default 2 retries → 3 total calls (1 initial + 2 retries) */
		expect(calls).toBe(3)
	})

	it("throws immediately for non-chunk errors without retry", async () => {
		let calls = 0
		await expect(
			retryImport(() => {
				calls++
				return Promise.reject(new TypeError("Cannot read properties of null"))
			}),
		).rejects.toThrow("Cannot read properties of null")
		expect(calls).toBe(1)
	})

	it("respects custom retry count", async () => {
		let calls = 0
		await expect(
			retryImport(() => {
				calls++
				return Promise.reject(new Error("Loading chunk abc failed."))
			}, 1),
		).rejects.toThrow("Loading chunk")
		/* 1 retry → 2 total calls */
		expect(calls).toBe(2)
	})

	it("returns correct type", async () => {
		const result = await retryImport(() => Promise.resolve({ default: 42 }))
		expect(result.default).toBe(42)
	})
})
