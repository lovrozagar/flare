/**
 * SSR Context Unit Tests
 *
 * Tests SSR context provider and hooks.
 */

import { createRoot } from "solid-js"
import { describe, expect, it } from "vitest"
import {
	SSRContextProvider,
	type SSRContextValue,
	useSSRContext,
} from "../../../src/components/ssr-context"

describe("ssr-context", () => {
	describe("SSRContextProvider", () => {
		it("provides context to children", () => {
			let captured: SSRContextValue | undefined

			createRoot(() => {
				const value: SSRContextValue = {
					flareStateScript: "self.flare={};",
					isServer: true,
					nonce: "test-nonce",
					resolvedHead: { title: "Test" },
				}

				return (
					<SSRContextProvider value={value}>
						{(() => {
							captured = useSSRContext()
							return null
						})()}
					</SSRContextProvider>
				)
			})

			expect(captured).toBeDefined()
			expect(captured?.isServer).toBe(true)
			expect(captured?.nonce).toBe("test-nonce")
			expect(captured?.resolvedHead?.title).toBe("Test")
		})

		it("provides isServer=true for SSR", () => {
			let captured: SSRContextValue | undefined

			createRoot(() => {
				const value: SSRContextValue = {
					flareStateScript: "",
					isServer: true,
					nonce: "",
				}

				return (
					<SSRContextProvider value={value}>
						{(() => {
							captured = useSSRContext()
							return null
						})()}
					</SSRContextProvider>
				)
			})

			expect(captured?.isServer).toBe(true)
		})

		it("provides isServer=false for client", () => {
			let captured: SSRContextValue | undefined

			createRoot(() => {
				const value: SSRContextValue = {
					flareStateScript: "",
					isServer: false,
					nonce: "",
				}

				return (
					<SSRContextProvider value={value}>
						{(() => {
							captured = useSSRContext()
							return null
						})()}
					</SSRContextProvider>
				)
			})

			expect(captured?.isServer).toBe(false)
		})

		it("provides flareStateScript", () => {
			let captured: SSRContextValue | undefined

			createRoot(() => {
				const value: SSRContextValue = {
					flareStateScript: "self.flare={r:{pathname:'/test'}};",
					isServer: true,
					nonce: "abc123",
				}

				return (
					<SSRContextProvider value={value}>
						{(() => {
							captured = useSSRContext()
							return null
						})()}
					</SSRContextProvider>
				)
			})

			expect(captured?.flareStateScript).toBe("self.flare={r:{pathname:'/test'}};")
		})

		it("provides resolvedHead when present", () => {
			let captured: SSRContextValue | undefined

			createRoot(() => {
				const value: SSRContextValue = {
					flareStateScript: "",
					isServer: true,
					nonce: "",
					resolvedHead: {
						description: "Test description",
						title: "Test Title",
					},
				}

				return (
					<SSRContextProvider value={value}>
						{(() => {
							captured = useSSRContext()
							return null
						})()}
					</SSRContextProvider>
				)
			})

			expect(captured?.resolvedHead?.title).toBe("Test Title")
			expect(captured?.resolvedHead?.description).toBe("Test description")
		})

		it("provides undefined resolvedHead when not set", () => {
			let captured: SSRContextValue | undefined

			createRoot(() => {
				const value: SSRContextValue = {
					flareStateScript: "",
					isServer: true,
					nonce: "",
				}

				return (
					<SSRContextProvider value={value}>
						{(() => {
							captured = useSSRContext()
							return null
						})()}
					</SSRContextProvider>
				)
			})

			expect(captured?.resolvedHead).toBeUndefined()
		})
	})

	describe("useSSRContext", () => {
		it("returns undefined outside provider", () => {
			let captured: SSRContextValue | undefined

			createRoot(() => {
				captured = useSSRContext()
				return null
			})

			expect(captured).toBeUndefined()
		})
	})
})
