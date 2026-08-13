/**
 * Lazy Loading Integration Tests
 *
 * Tests lazy(), clientLazy(), and preload() behavior in context.
 */

import { describe, expect, it } from "vitest"
import { clientLazy } from "../../src/client-lazy"
import { lazy } from "../../src/lazy"
import { preload } from "../../src/preload"

describe("lazy() integration", () => {
	it("creates component that can be rendered", () => {
		const TestComponent = lazy({
			loader: () => Promise.resolve({ default: () => "test content" }),
		})

		expect(typeof TestComponent).toBe("function")
	})

	it("supports pending and error options together", () => {
		const TestComponent = lazy({
			error: (err, retry) => `Error: ${err.message} - ${typeof retry}`,
			loader: () => Promise.resolve({ default: () => "content" }),
			pending: () => "loading...",
		})

		expect(typeof TestComponent).toBe("function")
	})

	it("generic props flow through", () => {
		interface Props {
			items: string[]
			title: string
		}

		const TestComponent = lazy<Props>({
			loader: () =>
				Promise.resolve({
					default: (props: Props) => `${props.title}: ${props.items.join(", ")}`,
				}),
		})

		expect(typeof TestComponent).toBe("function")
	})
})

describe("clientLazy() integration", () => {
	it("creates component that can be rendered", () => {
		const TestComponent = clientLazy({
			loader: () => Promise.resolve({ default: () => "test content" }),
		})

		expect(typeof TestComponent).toBe("function")
	})

	it("supports all options together", () => {
		const TestComponent = clientLazy({
			eager: true,
			error: (err, retry) => `Error: ${err.message} - ${typeof retry}`,
			loader: () => Promise.resolve({ default: () => "content" }),
			pending: () => "loading...",
		})

		expect(typeof TestComponent).toBe("function")
	})

	it("returns pending fallback on server (SSR mode)", () => {
		const TestComponent = clientLazy({
			loader: () => Promise.resolve({ default: () => "real content" }),
			pending: () => "loading fallback",
		})

		/* In vitest SSR mode, isServer is true */
		const result = TestComponent({})
		expect(result).toBe("loading fallback")
	})

	it("returns null if no pending fallback on server", () => {
		const TestComponent = clientLazy({
			loader: () => Promise.resolve({ default: () => "real content" }),
		})

		const result = TestComponent({})
		expect(result).toBeNull()
	})

	it("prop pending overrides factory pending on server", () => {
		const TestComponent = clientLazy({
			loader: () => Promise.resolve({ default: () => "real content" }),
			pending: () => "factory pending",
		})

		const result = TestComponent({ pending: "prop pending" })
		expect(result).toBe("prop pending")
	})
})

describe("preload() integration", () => {
	it("creates preload result with all methods", () => {
		const util = preload({
			loader: () => Promise.resolve({ default: { value: 42 } }),
		})

		expect(typeof util.preload).toBe("function")
		expect(typeof util.load).toBe("function")
		expect(typeof util.reset).toBe("function")
	})

	it("throws: false returns T | undefined type", async () => {
		const util = preload({
			loader: () => Promise.resolve({ default: { value: 42 } }),
			throws: false,
		})

		const result = await util.load()

		/* TypeScript: result is { value: number } | undefined */
		expect(result?.value).toBe(42)
	})

	it("throws: true returns T type", async () => {
		const util = preload({
			loader: () => Promise.resolve({ default: { value: 42 } }),
			throws: true,
		})

		const result = await util.load()

		/* TypeScript: result is { value: number } */
		expect(result.value).toBe(42)
	})

	it("caches result across multiple load calls", async () => {
		let callCount = 0
		const util = preload({
			loader: () => {
				callCount++
				return Promise.resolve({ default: { count: callCount } })
			},
		})

		const result1 = await util.load()
		const result2 = await util.load()

		expect(result1).toBe(result2)
		expect(callCount).toBe(1)
	})

	it("reset allows fresh load", async () => {
		let callCount = 0
		const util = preload({
			loader: () => {
				callCount++
				return Promise.resolve({ default: { count: callCount } })
			},
		})

		await util.load()
		expect(callCount).toBe(1)

		util.reset()
		await util.load()
		expect(callCount).toBe(2)
	})
})

describe("lazy and clientLazy API consistency", () => {
	it("both accept same loader signature", () => {
		const loader = () => Promise.resolve({ default: () => "content" })

		const LazyComp = lazy({ loader })
		const ClientLazyComp = clientLazy({ loader })

		expect(typeof LazyComp).toBe("function")
		expect(typeof ClientLazyComp).toBe("function")
	})

	it("both accept pending as factory function", () => {
		const pending = () => "loading..."

		const LazyComp = lazy({
			loader: () => Promise.resolve({ default: () => "content" }),
			pending,
		})
		const ClientLazyComp = clientLazy({
			loader: () => Promise.resolve({ default: () => "content" }),
			pending,
		})

		expect(typeof LazyComp).toBe("function")
		expect(typeof ClientLazyComp).toBe("function")
	})

	it("both accept error as function with retry", () => {
		const error = (err: Error, retry: () => void) => `${err.message} - ${typeof retry}`

		const LazyComp = lazy({
			error,
			loader: () => Promise.resolve({ default: () => "content" }),
		})
		const ClientLazyComp = clientLazy({
			error,
			loader: () => Promise.resolve({ default: () => "content" }),
		})

		expect(typeof LazyComp).toBe("function")
		expect(typeof ClientLazyComp).toBe("function")
	})

	it("only clientLazy has eager option", () => {
		/* clientLazy supports eager */
		const ClientLazyComp = clientLazy({
			eager: true,
			loader: () => Promise.resolve({ default: () => "content" }),
		})

		/* lazy does NOT have eager option - this is type-checked */
		const LazyComp = lazy({
			loader: () => Promise.resolve({ default: () => "content" }),
		})

		expect(typeof LazyComp).toBe("function")
		expect(typeof ClientLazyComp).toBe("function")
	})
})

describe("module export structure", () => {
	it("exports lazy function from separate module", async () => {
		const { lazy } = await import("../../src/lazy")
		expect(typeof lazy).toBe("function")
	})

	it("exports clientLazy function from separate module", async () => {
		const { clientLazy } = await import("../../src/client-lazy")
		expect(typeof clientLazy).toBe("function")
	})

	it("exports preload function from separate module", async () => {
		const { preload } = await import("../../src/preload")
		expect(typeof preload).toBe("function")
	})
})
