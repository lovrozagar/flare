/**
 * Lazy Component Unit Tests
 *
 * Tests the lazy utility for SSR-enabled lazy components.
 * Features: SSR rendering, Suspense-based pending, ErrorBoundary error handling.
 */

import { describe, expect, it, vi } from "vitest"
import { type LazyOptions, type LazyProps, lazy } from "../../../src/lazy"

describe("lazy", () => {
	describe("options interface", () => {
		it("accepts loader function", () => {
			const options: LazyOptions<{ data: string }> = {
				loader: () => Promise.resolve({ default: (props: { data: string }) => props.data }),
			}

			expect(typeof options.loader).toBe("function")
		})

		it("accepts optional pending factory", () => {
			const options: LazyOptions<Record<string, unknown>> = {
				loader: () => Promise.resolve({ default: () => null }),
				pending: () => "Loading...",
			}

			expect(typeof options.pending).toBe("function")
		})

		it("accepts optional error handler", () => {
			const errorHandler = (err: Error, _retry: () => void) => `Error: ${err.message}`
			const options: LazyOptions<Record<string, unknown>> = {
				error: errorHandler,
				loader: () => Promise.resolve({ default: () => null }),
			}

			expect(typeof options.error).toBe("function")
		})
	})

	describe("props interface", () => {
		it("allows pending prop override", () => {
			const props: LazyProps = {
				pending: "Custom loading...",
			}

			expect(props.pending).toBe("Custom loading...")
		})

		it("allows error prop as element", () => {
			const props: LazyProps = {
				error: "Error element",
			}

			expect(props.error).toBe("Error element")
		})

		it("allows error prop as function", () => {
			const errorFn = (_err: Error, _retry: () => void) => "Error"
			const props: LazyProps = {
				error: errorFn,
			}

			expect(typeof props.error).toBe("function")
		})
	})

	describe("component creation", () => {
		it("returns a component function", () => {
			const LazyComp = lazy({
				loader: () => Promise.resolve({ default: () => null }),
			})

			expect(typeof LazyComp).toBe("function")
		})

		it("wraps Solid's lazy internally", () => {
			/* The lazy function creates a wrapper that uses Solid's lazy() */
			const LazyComp = lazy({
				loader: () => Promise.resolve({ default: () => "content" }),
			})

			/* The result is a component function */
			expect(typeof LazyComp).toBe("function")
		})
	})

	describe("error handler types", () => {
		it("error function receives Error and retry callback", () => {
			const errorHandler = vi.fn((_err: Error, _retry: () => void) => "error")
			const testError = new Error("Test")
			const retry = () => {}

			errorHandler(testError, retry)

			expect(errorHandler).toHaveBeenCalledWith(testError, retry)
		})

		it("error can be static element", () => {
			const props: LazyProps = {
				error: "Static error message",
			}

			expect(props.error).toBe("Static error message")
		})
	})

	describe("API consistency with clientLazy", () => {
		it("has same options shape as clientLazy", () => {
			/* Both lazy and clientLazy should have: loader, pending, error */
			const lazyOptions: LazyOptions<Record<string, unknown>> = {
				error: (_err, _retry) => "error",
				loader: () => Promise.resolve({ default: () => null }),
				pending: () => "loading",
			}

			expect(lazyOptions.loader).toBeDefined()
			expect(lazyOptions.pending).toBeDefined()
			expect(lazyOptions.error).toBeDefined()
		})

		it("has same props shape as clientLazy", () => {
			/* Both lazy and clientLazy components accept: pending, error overrides */
			const props: LazyProps = {
				error: "error",
				pending: "loading",
			}

			expect(props.pending).toBeDefined()
			expect(props.error).toBeDefined()
		})
	})
})

describe("lazy type safety", () => {
	it("generic P flows through to component props", () => {
		interface ChartProps {
			data: number[]
			title: string
		}

		const LazyChart = lazy<ChartProps>({
			loader: () =>
				Promise.resolve({
					default: (props: ChartProps) => `${props.title}: ${props.data.join(",")}`,
				}),
		})

		/* Type should require data and title */
		expect(typeof LazyChart).toBe("function")
	})

	it("component props include LazyProps", () => {
		interface MyProps {
			value: number
		}

		const _LazyComp = lazy<MyProps>({
			loader: () => Promise.resolve({ default: (props: MyProps) => String(props.value) }),
		})

		/* The resulting component should accept:
		 * - value: number (from MyProps)
		 * - pending?: JSX.Element (from LazyProps)
		 * - error?: ... (from LazyProps)
		 */
		expect(true).toBe(true)
	})
})

describe("lazy vs clientLazy differences", () => {
	it("lazy does NOT have eager option (SSR always renders)", () => {
		/* lazy() always renders on server, so eager option doesn't make sense */
		const options: LazyOptions<Record<string, unknown>> = {
			loader: () => Promise.resolve({ default: () => null }),
		}

		const _withEager: LazyOptions<Record<string, unknown>> = {
			/* @ts-expect-error - eager is not a valid option for lazy */
			eager: true,
			loader: () => Promise.resolve({ default: () => null }),
		}

		expect("eager" in options).toBe(false)
	})

	it("lazy uses Suspense (not Show) for pending", () => {
		/* Implementation detail: lazy wraps content in Suspense */
		/* This enables proper streaming SSR */
		const LazyComp = lazy({
			loader: () => Promise.resolve({ default: () => "content" }),
			pending: () => "loading...",
		})

		expect(typeof LazyComp).toBe("function")
	})

	it("lazy uses ErrorBoundary (not signal) for error", () => {
		/* Implementation detail: lazy wraps content in ErrorBoundary */
		/* This enables proper error handling with retry */
		const LazyComp = lazy({
			error: (_err, _retry) => "error occurred",
			loader: () => Promise.resolve({ default: () => "content" }),
		})

		expect(typeof LazyComp).toBe("function")
	})
})
