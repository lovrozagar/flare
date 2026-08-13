import { createRoot } from "solid-js"
import { describe, expect, it } from "vitest"
import { SSRContextProvider, type SSRContextValue, useSSRContext } from "../../../src/components/index.ts"

function makeValue(overrides?: Partial<SSRContextValue>): SSRContextValue {
	return {
		flareStateScript: "self.flare={}",
		isServer: false,
		nonce: "abc123",
		...overrides,
	}
}

describe("SSRContextProvider + useSSRContext", () => {
	it("provides value to children", () => {
		createRoot((dispose) => {
			let result: SSRContextValue | undefined

			const value = makeValue()
			const el = (
				<SSRContextProvider value={value}>
					{(() => {
						result = useSSRContext()
						return null
					})()}
				</SSRContextProvider>
			)
			/* Force evaluation */
			void el

			expect(result).toBeDefined()
			expect(result?.nonce).toBe("abc123")
			expect(result?.flareStateScript).toBe("self.flare={}")
			expect(result?.isServer).toBe(false)

			dispose()
		})
	})

	it("useSSRContext outside provider → undefined", () => {
		createRoot((dispose) => {
			let result: SSRContextValue | undefined = makeValue()
			result = useSSRContext()
			expect(result).toBeUndefined()
			dispose()
		})
	})

	it("passes entryScript through", () => {
		createRoot((dispose) => {
			let result: SSRContextValue | undefined

			const value = makeValue({ entryScript: "/assets/client-abc.js" })
			const el = (
				<SSRContextProvider value={value}>
					{(() => {
						result = useSSRContext()
						return null
					})()}
				</SSRContextProvider>
			)
			void el

			expect(result?.entryScript).toBe("/assets/client-abc.js")

			dispose()
		})
	})

	it("passes resolvedHead through", () => {
		createRoot((dispose) => {
			let result: SSRContextValue | undefined

			const value = makeValue({
				resolvedHead: { title: "Test Page" } as SSRContextValue["resolvedHead"],
			})
			const el = (
				<SSRContextProvider value={value}>
					{(() => {
						result = useSSRContext()
						return null
					})()}
				</SSRContextProvider>
			)
			void el

			expect(result?.resolvedHead).toEqual({ title: "Test Page" })

			dispose()
		})
	})
})
