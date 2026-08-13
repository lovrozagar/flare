/** @vitest-environment node */
import { describe, expect, it } from "vitest"
import { collectDeferredPromises } from "../../../src/caches/index.ts"

describe("Bug 49: collectDeferredPromises circular ref guard", () => {
	it("should not stack overflow on direct circular reference", () => {
		const obj: Record<string, unknown> = { name: "test" }
		obj["self"] = obj

		expect(() => collectDeferredPromises(obj)).not.toThrow()
		expect(collectDeferredPromises(obj)).toEqual([])
	})

	it("should not stack overflow on mutual circular reference", () => {
		const a: Record<string, unknown> = { type: "a" }
		const b: Record<string, unknown> = { type: "b" }
		a["ref"] = b
		b["ref"] = a

		expect(() => collectDeferredPromises(a)).not.toThrow()
	})

	it("should still collect deferred markers from non-circular structures", () => {
		const deferred = {
			__deferred: true,
			__key: "test-key",
			promise: Promise.resolve("value"),
		}
		const data = { items: [deferred, { nested: { deep: "value" } }] }

		const result = collectDeferredPromises(data)
		expect(result).toHaveLength(1)
		expect(result[0].key).toBe("test-key")
	})

	it("should handle circular ref containing a deferred marker", () => {
		const deferred = {
			__deferred: true,
			__key: "found",
			promise: Promise.resolve("x"),
		}
		const obj: Record<string, unknown> = { data: deferred }
		obj["cycle"] = obj

		const result = collectDeferredPromises(obj)
		expect(result).toHaveLength(1)
		expect(result[0].key).toBe("found")
	})
})
