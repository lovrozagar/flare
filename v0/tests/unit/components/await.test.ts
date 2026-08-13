/**
 * Await Component Unit Tests
 *
 * Tests the Await component types and helpers.
 * Await renders deferred data with loading/error states.
 */

import { describe, expect, it } from "vitest"
import {
	type AwaitProps,
	type Deferred,
	getPromise,
	isDeferred,
} from "../../../src/components/await"

describe("isDeferred", () => {
	it("returns true for Deferred object", () => {
		const deferred: Deferred<string> = {
			__deferred: true,
			promise: Promise.resolve("test"),
		}

		expect(isDeferred(deferred)).toBe(true)
	})

	it("returns false for plain Promise", () => {
		const promise = Promise.resolve("test")

		expect(isDeferred(promise)).toBe(false)
	})

	it("returns false for null", () => {
		expect(isDeferred(null as unknown as Promise<unknown>)).toBe(false)
	})

	it("returns false for object without __deferred", () => {
		const obj = { promise: Promise.resolve("test") }

		expect(isDeferred(obj as unknown as Promise<unknown>)).toBe(false)
	})

	it("returns false for object with __deferred: false", () => {
		const obj = { __deferred: false, promise: Promise.resolve("test") }

		expect(isDeferred(obj as unknown as Promise<unknown>)).toBe(false)
	})
})

describe("getPromise", () => {
	it("extracts promise from Deferred", async () => {
		const deferred: Deferred<string> = {
			__deferred: true,
			promise: Promise.resolve("deferred-value"),
		}

		const promise = getPromise(deferred)
		const result = await promise

		expect(result).toBe("deferred-value")
	})

	it("returns Promise directly if not Deferred", async () => {
		const promise = Promise.resolve("direct-value")

		const result = await getPromise(promise)

		expect(result).toBe("direct-value")
	})
})

describe("Deferred type", () => {
	it("can be created with correct structure", () => {
		const deferred: Deferred<{ reviews: number[] }> = {
			__deferred: true,
			promise: Promise.resolve({ reviews: [1, 2, 3] }),
		}

		expect(deferred.__deferred).toBe(true)
		expect(deferred.promise).toBeInstanceOf(Promise)
	})

	it("supports generic types", async () => {
		interface ReviewData {
			id: string
			rating: number
		}

		const deferred: Deferred<ReviewData[]> = {
			__deferred: true,
			promise: Promise.resolve([
				{ id: "1", rating: 5 },
				{ id: "2", rating: 4 },
			]),
		}

		const data = await deferred.promise

		expect(data).toHaveLength(2)
		expect(data[0]?.rating).toBe(5)
	})
})

describe("AwaitProps", () => {
	it("requires promise and children", () => {
		const props: AwaitProps<string> = {
			children: (data) => `Resolved: ${data}`,
			promise: {
				__deferred: true,
				promise: Promise.resolve("data"),
			},
		}

		expect("__deferred" in props.promise && props.promise.__deferred).toBe(true)
		expect(typeof props.children).toBe("function")
	})

	it("accepts plain Promise for promise prop", () => {
		const props: AwaitProps<string> = {
			children: (data) => `Resolved: ${data}`,
			promise: Promise.resolve("data"),
		}

		expect(props.promise).toBeInstanceOf(Promise)
	})

	it("allows optional pending", () => {
		const props: AwaitProps<string> = {
			children: (data) => `Resolved: ${data}`,
			pending: "Loading...",
			promise: Promise.resolve("data"),
		}

		expect(props.pending).toBe("Loading...")
	})

	it("allows optional error handler", () => {
		const error = (err: Error, _reset: () => void) => `Error: ${err.message}`
		const props: AwaitProps<string> = {
			children: (data) => `Resolved: ${data}`,
			error,
			promise: Promise.resolve("data"),
		}

		expect(typeof props.error).toBe("function")
	})

	it("allows null error to swallow errors", () => {
		const props: AwaitProps<string> = {
			children: (data) => `Resolved: ${data}`,
			error: null,
			promise: Promise.resolve("data"),
		}

		expect(props.error).toBeNull()
	})
})

describe("Await behavior per spec", () => {
	it("default pending is undefined (nothing shown)", () => {
		const props: AwaitProps<string> = {
			children: (data) => data,
			promise: Promise.resolve("data"),
		}

		expect(props.pending).toBeUndefined()
	})

	it("children is render function receiving data", () => {
		const props: AwaitProps<string> = {
			children: (data: string) => `Result: ${data}`,
			promise: Promise.resolve("test"),
		}

		const result = props.children("test")

		expect(result).toBe("Result: test")
	})

	it("error handler receives Error and reset function", () => {
		const reset = () => {}
		const errorHandler = (err: Error, _resetFn: () => void) => `Error: ${err.message}`
		const error = new Error("Test error")

		const result = errorHandler(error, reset)

		expect(result).toBe("Error: Test error")
	})
})

describe("getResolvedValue", () => {
	it("returns undefined for plain Promise", async () => {
		const { getResolvedValue } = await import("../../../src/components/await")
		const promise = Promise.resolve("data")

		expect(getResolvedValue(promise)).toBeUndefined()
	})

	it("returns undefined for Deferred without __resolved", async () => {
		const { getResolvedValue } = await import("../../../src/components/await")
		const deferred: Deferred<string> = {
			__deferred: true,
			promise: Promise.resolve("data"),
		}

		expect(getResolvedValue(deferred)).toBeUndefined()
	})

	it("returns __resolved value when present", async () => {
		const { getResolvedValue } = await import("../../../src/components/await")
		const deferred = {
			__deferred: true as const,
			__resolved: "pre-resolved-value",
			promise: Promise.resolve("data"),
		}

		expect(getResolvedValue(deferred)).toBe("pre-resolved-value")
	})

	it("returns complex objects from __resolved", async () => {
		const { getResolvedValue } = await import("../../../src/components/await")
		const resolvedData = { reviews: [1, 2, 3], total: 3 }
		const deferred = {
			__deferred: true as const,
			__resolved: resolvedData,
			promise: Promise.resolve(resolvedData),
		}

		expect(getResolvedValue(deferred)).toEqual({ reviews: [1, 2, 3], total: 3 })
	})
})

describe("Deferred with SSR pre-resolution", () => {
	it("supports __resolved property for SSR hydration", () => {
		const deferred = {
			__deferred: true as const,
			__key: "reviews",
			__resolved: [1, 2, 3],
			promise: Promise.resolve([1, 2, 3]),
		}

		expect(deferred.__resolved).toEqual([1, 2, 3])
		expect(deferred.__key).toBe("reviews")
	})

	it("Deferred without __resolved has undefined value", () => {
		const deferred: Deferred<string> = {
			__deferred: true,
			promise: Promise.resolve("data"),
		}

		expect("__resolved" in deferred).toBe(false)
	})
})

describe("Promise type narrowing", () => {
	it("isDeferred narrows Deferred|Promise union to Deferred", () => {
		const deferred: Deferred<string> = {
			__deferred: true,
			promise: Promise.resolve("test"),
		}

		if (isDeferred(deferred)) {
			/* TypeScript knows this is Deferred<string> */
			expect(deferred.__deferred).toBe(true)
			expect(deferred.promise).toBeInstanceOf(Promise)
		}
	})

	it("isDeferred returns false for Promise, enabling else branch", () => {
		const promise = Promise.resolve("test")

		if (!isDeferred(promise)) {
			/* TypeScript knows this is Promise<string> */
			expect(promise).toBeInstanceOf(Promise)
		}
	})
})

describe("getPromise consistency", () => {
	it("always returns same promise instance for Deferred", () => {
		const originalPromise = Promise.resolve("data")
		const deferred: Deferred<string> = {
			__deferred: true,
			promise: originalPromise,
		}

		const extracted = getPromise(deferred)
		expect(extracted).toBe(originalPromise)
	})

	it("returns same promise for plain Promise input", () => {
		const originalPromise = Promise.resolve("data")

		const extracted = getPromise(originalPromise)
		expect(extracted).toBe(originalPromise)
	})
})
