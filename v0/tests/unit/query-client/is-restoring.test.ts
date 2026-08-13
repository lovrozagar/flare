/**
 * IsRestoring Unit Tests
 *
 * Tests hydration state context.
 */

import { createRoot, createSignal } from "solid-js"
import { describe, expect, it } from "vitest"
import { IsRestoringProvider, useIsRestoring } from "../../../src/query-client/is-restoring"

describe("useIsRestoring", () => {
	it("returns false by default", () => {
		let result: boolean | undefined

		createRoot((dispose) => {
			const isRestoring = useIsRestoring()
			result = isRestoring()
			dispose()
		})

		expect(result).toBe(false)
	})

	it("returns accessor function", () => {
		createRoot((dispose) => {
			const isRestoring = useIsRestoring()
			expect(typeof isRestoring).toBe("function")
			dispose()
		})
	})
})

describe("IsRestoringProvider", () => {
	it("provides custom value", () => {
		let result: boolean | undefined

		createRoot((dispose) => {
			const [isRestoring] = createSignal(true)

			IsRestoringProvider({
				get children() {
					const restoring = useIsRestoring()
					result = restoring()
					return null
				},
				value: isRestoring,
			})

			dispose()
		})

		expect(result).toBe(true)
	})

	it("provides reactive value", () => {
		const results: boolean[] = []

		createRoot((dispose) => {
			const [isRestoring, setIsRestoring] = createSignal(false)

			IsRestoringProvider({
				get children() {
					const restoring = useIsRestoring()
					results.push(restoring())
					return null
				},
				value: isRestoring,
			})

			/* Update the signal */
			setIsRestoring(true)

			dispose()
		})

		expect(results[0]).toBe(false)
	})
})
