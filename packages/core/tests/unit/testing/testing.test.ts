import { describe, expect, it, vi } from "vitest"
import {
	assertFlareStateShape,
	FlarePage,
	type FlarePageInterface,
	filterByPatterns,
	isHydrationError,
} from "../../../src/testing.ts"

function mockEval(value: unknown): FlarePageInterface["evaluate"] {
	return vi.fn(() => Promise.resolve(value)) as FlarePageInterface["evaluate"]
}

function makeMockPage(overrides?: Partial<FlarePageInterface>): FlarePageInterface {
	return {
		evaluate: mockEval(null),
		getByText: vi.fn(() => ({ click: vi.fn(() => Promise.resolve()) })),
		goto: vi.fn(() => Promise.resolve({ status: () => 200 })),
		locator: vi.fn(),
		on: vi.fn(),
		url: vi.fn(() => "http://localhost:3000/"),
		waitForFunction: vi.fn(() => Promise.resolve()),
		waitForLoadState: vi.fn(() => Promise.resolve()),
		waitForSelector: vi.fn(() => Promise.resolve()),
		...overrides,
	}
}

describe("isHydrationError", () => {
	it("'hydration' → true", () => {
		expect(isHydrationError("Hydration mismatch")).toBe(true)
	})

	it("'mismatch' → true", () => {
		expect(isHydrationError("DOM mismatch detected")).toBe(true)
	})

	it("'Unable to find DOM nodes' → true", () => {
		expect(isHydrationError("Unable to find DOM nodes")).toBe(true)
	})

	it("random error → false", () => {
		expect(isHydrationError("TypeError: x is not a function")).toBe(false)
	})

	it("case insensitive → hydration", () => {
		expect(isHydrationError("HYDRATION error")).toBe(true)
	})

	it("case insensitive → mismatch", () => {
		expect(isHydrationError("MISMATCH error")).toBe(true)
	})
})

describe("filterByPatterns", () => {
	it("no patterns → all returned", () => {
		const msgs = ["err1", "err2"]
		expect(filterByPatterns(msgs, [])).toEqual(["err1", "err2"])
	})

	it("matching pattern → filtered out", () => {
		const msgs = ["err1", "known-warning", "err2"]
		expect(filterByPatterns(msgs, [/known-warning/])).toEqual(["err1", "err2"])
	})

	it("multiple patterns → all matching filtered", () => {
		const msgs = ["err1", "known-a", "known-b"]
		expect(filterByPatterns(msgs, [/known-a/, /known-b/])).toEqual(["err1"])
	})

	it("no matches → all returned", () => {
		const msgs = ["err1", "err2"]
		expect(filterByPatterns(msgs, [/nomatch/])).toEqual(["err1", "err2"])
	})
})

describe("assertFlareStateShape", () => {
	it("valid state → no error", () => {
		const state = { c: {}, m: [], p: "/", r: {}, s: {} }
		expect(() => assertFlareStateShape(state)).not.toThrow()
	})

	it("null → throws", () => {
		expect(() => assertFlareStateShape(null)).toThrow()
	})

	it("missing p → throws", () => {
		expect(() => assertFlareStateShape({ c: {}, m: [], r: {}, s: {} })).toThrow()
	})

	it("missing r → throws", () => {
		expect(() => assertFlareStateShape({ c: {}, m: [], p: "/", s: {} })).toThrow()
	})

	it("missing c → throws", () => {
		expect(() => assertFlareStateShape({ m: [], p: "/", r: {}, s: {} })).toThrow()
	})

	it("p not string → throws", () => {
		expect(() => assertFlareStateShape({ c: {}, m: [], p: 42, r: {}, s: {} })).toThrow()
	})
})

describe("FlarePage", () => {
	describe("capturing", () => {
		it("startCapturing registers console + pageerror listeners", () => {
			const page = makeMockPage()
			const fp = new FlarePage(page)
			fp.startCapturing()

			expect(page.on).toHaveBeenCalledWith("console", expect.any(Function))
			expect(page.on).toHaveBeenCalledWith("pageerror", expect.any(Function))
		})

		it("startCapturing idempotent", () => {
			const page = makeMockPage()
			const fp = new FlarePage(page)
			fp.startCapturing()
			fp.startCapturing()

			/* on called exactly twice: once for console, once for pageerror */
			expect(page.on).toHaveBeenCalledTimes(2)
		})

		it("console errors captured", () => {
			const page = makeMockPage()
			const fp = new FlarePage(page)
			fp.startCapturing()

			/* Simulate console error via captured handler */
			const onCalls = (page.on as ReturnType<typeof vi.fn>).mock.calls
			const consoleHandler = onCalls.find((c) => c[0] === "console")?.[1]
			consoleHandler({ text: () => "test error", type: () => "error" })

			expect(fp.getConsoleErrors()).toEqual(["test error"])
		})

		it("console warnings captured", () => {
			const page = makeMockPage()
			const fp = new FlarePage(page)
			fp.startCapturing()

			const onCalls = (page.on as ReturnType<typeof vi.fn>).mock.calls
			const consoleHandler = onCalls.find((c) => c[0] === "console")?.[1]
			consoleHandler({ text: () => "test warn", type: () => "warning" })

			expect(fp.getConsoleWarnings()).toEqual(["test warn"])
		})

		it("console logs captured", () => {
			const page = makeMockPage()
			const fp = new FlarePage(page)
			fp.startCapturing()

			const onCalls = (page.on as ReturnType<typeof vi.fn>).mock.calls
			const consoleHandler = onCalls.find((c) => c[0] === "console")?.[1]
			consoleHandler({ text: () => "test log", type: () => "log" })

			expect(fp.getConsoleLogs()).toEqual(["test log"])
		})

		it("page errors captured with stack", () => {
			const page = makeMockPage()
			const fp = new FlarePage(page)
			fp.startCapturing()

			const onCalls = (page.on as ReturnType<typeof vi.fn>).mock.calls
			const errorHandler = onCalls.find((c) => c[0] === "pageerror")?.[1]
			errorHandler({ message: "Uncaught", stack: "at line 1" })

			expect(fp.getPageErrors()).toEqual([{ message: "Uncaught", stack: "at line 1" }])
		})

		it("clearCaptures resets all", () => {
			const page = makeMockPage()
			const fp = new FlarePage(page)
			fp.startCapturing()

			const onCalls = (page.on as ReturnType<typeof vi.fn>).mock.calls
			const consoleHandler = onCalls.find((c) => c[0] === "console")?.[1]
			const errorHandler = onCalls.find((c) => c[0] === "pageerror")?.[1]

			consoleHandler({ text: () => "err", type: () => "error" })
			consoleHandler({ text: () => "warn", type: () => "warning" })
			consoleHandler({ text: () => "log", type: () => "log" })
			errorHandler({ message: "oops" })

			fp.clearCaptures()

			expect(fp.getConsoleErrors()).toEqual([])
			expect(fp.getConsoleWarnings()).toEqual([])
			expect(fp.getConsoleLogs()).toEqual([])
			expect(fp.getPageErrors()).toEqual([])
		})
	})

	describe("navigation", () => {
		it("goto → page.goto called with path", async () => {
			const page = makeMockPage()
			const fp = new FlarePage(page)

			await fp.goto("/about")

			expect(page.goto).toHaveBeenCalledWith("/about", { waitUntil: "domcontentloaded" })
			expect(page.waitForSelector).toHaveBeenCalledWith("body", { timeout: 15_000 })
		})

		it("load → goto + waitForHydration + networkidle", async () => {
			const page = makeMockPage()
			const fp = new FlarePage(page)

			await fp.load("/about")

			expect(page.goto).toHaveBeenCalled()
			expect(page.waitForFunction).toHaveBeenCalled()
			expect(page.waitForLoadState).toHaveBeenCalledWith("networkidle")
		})

		it("clickLink → getByText + click", async () => {
			const mockClick = vi.fn(() => Promise.resolve())
			const page = makeMockPage({
				getByText: vi.fn(() => ({ click: mockClick })),
			})
			const fp = new FlarePage(page)

			await fp.clickLink("About")

			expect(page.getByText).toHaveBeenCalledWith("About")
			expect(mockClick).toHaveBeenCalled()
		})

		it("navigateNdjson → marker + click + networkidle", async () => {
			const page = makeMockPage()
			const fp = new FlarePage(page)

			await fp.navigateNdjson("About")

			expect(page.evaluate).toHaveBeenCalled()
			expect(page.getByText).toHaveBeenCalledWith("About")
			expect(page.waitForLoadState).toHaveBeenCalledWith("networkidle")
		})
	})

	describe("hydration", () => {
		it("waitForHydration → polls for data-hydrated", async () => {
			const page = makeMockPage()
			const fp = new FlarePage(page)

			await fp.waitForHydration()

			expect(page.waitForFunction).toHaveBeenCalledWith(
				"document.documentElement.hasAttribute('data-hydrated')",
				undefined,
				{ timeout: 15_000 },
			)
		})

		it("custom timeout forwarded", async () => {
			const page = makeMockPage()
			const fp = new FlarePage(page)

			await fp.waitForHydration(5000)

			expect(page.waitForFunction).toHaveBeenCalledWith(
				"document.documentElement.hasAttribute('data-hydrated')",
				undefined,
				{ timeout: 5000 },
			)
		})
	})

	describe("CSR detection", () => {
		it("setNavigationMarker sets window marker", async () => {
			const page = makeMockPage()
			const fp = new FlarePage(page)

			await fp.setNavigationMarker()

			expect(page.evaluate).toHaveBeenCalledWith("window.__FLARE_NAV_MARKER__ = true")
		})

		it("wasClientNavigation reads marker", async () => {
			const page = makeMockPage({
				evaluate: vi.fn(() => Promise.resolve(true)),
			})
			const fp = new FlarePage(page)

			const result = await fp.wasClientNavigation()
			expect(result).toBe(true)
		})
	})

	describe("flare state", () => {
		it("getFlareState calls page.evaluate", async () => {
			const page = makeMockPage({
				evaluate: vi.fn(() => Promise.resolve({ c: {}, p: "/", r: {} })),
			})
			const fp = new FlarePage(page)

			const state = await fp.getFlareState()
			expect(state).toEqual({ c: {}, p: "/", r: {} })
		})

		it("assertFlareStateValid → validates shape", async () => {
			const page = makeMockPage({
				evaluate: vi.fn(() => Promise.resolve({ c: {}, p: "/", r: {} })),
			})
			const fp = new FlarePage(page)

			await expect(fp.assertFlareStateValid()).resolves.toBeUndefined()
		})

		it("assertFlareStateValid → throws if missing", async () => {
			const page = makeMockPage({
				evaluate: vi.fn(() => Promise.resolve(null)),
			})
			const fp = new FlarePage(page)

			await expect(fp.assertFlareStateValid()).rejects.toThrow()
		})
	})

	describe("assertions", () => {
		it("assertHealthy → passes on clean page", () => {
			const page = makeMockPage()
			const fp = new FlarePage(page)
			expect(() => fp.assertHealthy()).not.toThrow()
		})

		it("assertHealthy → fails on console error", () => {
			const page = makeMockPage()
			const fp = new FlarePage(page)
			fp.startCapturing()

			const onCalls = (page.on as ReturnType<typeof vi.fn>).mock.calls
			const handler = onCalls.find((c) => c[0] === "console")?.[1]
			handler({ text: () => "Something broke", type: () => "error" })

			expect(() => fp.assertHealthy()).toThrow("console error(s)")
		})

		it("assertHealthy → fails on page error", () => {
			const page = makeMockPage()
			const fp = new FlarePage(page)
			fp.startCapturing()

			const onCalls = (page.on as ReturnType<typeof vi.fn>).mock.calls
			const handler = onCalls.find((c) => c[0] === "pageerror")?.[1]
			handler({ message: "Uncaught TypeError" })

			expect(() => fp.assertHealthy()).toThrow("page error(s)")
		})

		it("assertHealthy → fails on hydration error", () => {
			const page = makeMockPage()
			const fp = new FlarePage(page)
			fp.startCapturing()

			const onCalls = (page.on as ReturnType<typeof vi.fn>).mock.calls
			const handler = onCalls.find((c) => c[0] === "console")?.[1]
			handler({ text: () => "Hydration mismatch detected", type: () => "error" })

			expect(() => fp.assertHealthy()).toThrow()
		})

		it("assertNoConsoleErrors with ignorePatterns → skips matched", () => {
			const page = makeMockPage()
			const fp = new FlarePage(page)
			fp.startCapturing()

			const onCalls = (page.on as ReturnType<typeof vi.fn>).mock.calls
			const handler = onCalls.find((c) => c[0] === "console")?.[1]
			handler({ text: () => "Known third-party warning", type: () => "error" })

			expect(() => fp.assertNoConsoleErrors([/Known third-party/])).not.toThrow()
		})

		it("assertFullyHealthy → fails on warning", () => {
			const page = makeMockPage()
			const fp = new FlarePage(page)
			fp.startCapturing()

			const onCalls = (page.on as ReturnType<typeof vi.fn>).mock.calls
			const handler = onCalls.find((c) => c[0] === "console")?.[1]
			handler({ text: () => "Deprecation notice", type: () => "warning" })

			expect(() => fp.assertFullyHealthy()).toThrow("console warning(s)")
		})
	})

	describe("hydration error detection", () => {
		it("hasHydrationErrors → true for hydration errors", () => {
			const page = makeMockPage()
			const fp = new FlarePage(page)
			fp.startCapturing()

			const onCalls = (page.on as ReturnType<typeof vi.fn>).mock.calls
			const handler = onCalls.find((c) => c[0] === "console")?.[1]
			handler({ text: () => "Hydration failed", type: () => "error" })

			expect(fp.hasHydrationErrors()).toBe(true)
			expect(fp.getHydrationErrors()).toEqual(["Hydration failed"])
		})

		it("hasHydrationErrors → false for non-hydration errors", () => {
			const page = makeMockPage()
			const fp = new FlarePage(page)
			fp.startCapturing()

			const onCalls = (page.on as ReturnType<typeof vi.fn>).mock.calls
			const handler = onCalls.find((c) => c[0] === "console")?.[1]
			handler({ text: () => "Regular error", type: () => "error" })

			expect(fp.hasHydrationErrors()).toBe(false)
		})

		it("page errors also checked for hydration", () => {
			const page = makeMockPage()
			const fp = new FlarePage(page)
			fp.startCapturing()

			const onCalls = (page.on as ReturnType<typeof vi.fn>).mock.calls
			const handler = onCalls.find((c) => c[0] === "pageerror")?.[1]
			handler({ message: "Unable to find DOM nodes" })

			expect(fp.hasHydrationErrors()).toBe(true)
		})
	})
})
