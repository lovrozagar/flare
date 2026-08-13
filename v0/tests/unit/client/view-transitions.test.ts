/**
 * View Transitions Tests
 *
 * Tests view transitions utilities.
 * Verifies direction detection, feature detection, and transition execution.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
	detectDirection,
	getHistoryIndex,
	incrementHistoryIndex,
	initHistoryIndex,
	type LocationChangeInfo,
	prefersReducedMotion,
	resolveTransitionTypes,
	setHistoryIndex,
	shouldUseViewTransitions,
	supportsViewTransitions,
	supportsViewTransitionTypes,
	type ViewTransitionConfig,
	withViewTransition,
} from "../../../src/client/view-transitions"

describe("history index tracking", () => {
	beforeEach(() => {
		initHistoryIndex(0)
	})

	it("initializes history index to provided value", () => {
		initHistoryIndex(5)
		expect(getHistoryIndex()).toBe(5)
	})

	it("initializes to 0 when undefined", () => {
		initHistoryIndex(undefined as unknown as number)
		expect(getHistoryIndex()).toBe(0)
	})

	it("increments history index", () => {
		initHistoryIndex(0)
		incrementHistoryIndex()
		expect(getHistoryIndex()).toBe(1)
		incrementHistoryIndex()
		expect(getHistoryIndex()).toBe(2)
	})

	it("sets history index to specific value", () => {
		initHistoryIndex(0)
		setHistoryIndex(10)
		expect(getHistoryIndex()).toBe(10)
	})
})

describe("detectDirection", () => {
	it("returns forward when toIndex > fromIndex", () => {
		expect(detectDirection(0, 1)).toBe("forward")
		expect(detectDirection(5, 10)).toBe("forward")
	})

	it("returns back when toIndex < fromIndex", () => {
		expect(detectDirection(1, 0)).toBe("back")
		expect(detectDirection(10, 5)).toBe("back")
	})

	it("returns none when indices are equal", () => {
		expect(detectDirection(0, 0)).toBe("none")
		expect(detectDirection(5, 5)).toBe("none")
	})
})

describe("supportsViewTransitions", () => {
	let originalDocument: typeof document | undefined

	beforeEach(() => {
		originalDocument = globalThis.document
	})

	afterEach(() => {
		if (originalDocument) {
			Object.defineProperty(globalThis, "document", {
				configurable: true,
				value: originalDocument,
			})
		}
	})

	it("returns true when startViewTransition exists", () => {
		Object.defineProperty(globalThis, "document", {
			configurable: true,
			value: {
				startViewTransition: () => {},
			},
		})
		expect(supportsViewTransitions()).toBe(true)
	})

	it("returns false when startViewTransition does not exist", () => {
		Object.defineProperty(globalThis, "document", {
			configurable: true,
			value: {},
		})
		expect(supportsViewTransitions()).toBe(false)
	})

	it("returns false when document is undefined", () => {
		Object.defineProperty(globalThis, "document", {
			configurable: true,
			value: undefined,
		})
		expect(supportsViewTransitions()).toBe(false)
	})
})

describe("supportsViewTransitionTypes", () => {
	let originalDocument: typeof document | undefined
	let originalViewTransition: unknown

	beforeEach(() => {
		originalDocument = globalThis.document
		originalViewTransition = (globalThis as Record<string, unknown>).ViewTransition
	})

	afterEach(() => {
		if (originalDocument) {
			Object.defineProperty(globalThis, "document", {
				configurable: true,
				value: originalDocument,
			})
		}
		if (originalViewTransition !== undefined) {
			;(globalThis as Record<string, unknown>).ViewTransition = originalViewTransition
		} else {
			delete (globalThis as Record<string, unknown>).ViewTransition
		}
	})

	it("returns true when ViewTransition constructor exists", () => {
		Object.defineProperty(globalThis, "document", {
			configurable: true,
			value: { startViewTransition: () => {} },
		})
		;(globalThis as Record<string, unknown>).ViewTransition = () => {}
		expect(supportsViewTransitionTypes()).toBe(true)
	})

	it("returns false when ViewTransition constructor does not exist", () => {
		Object.defineProperty(globalThis, "document", {
			configurable: true,
			value: { startViewTransition: () => {} },
		})
		delete (globalThis as Record<string, unknown>).ViewTransition
		expect(supportsViewTransitionTypes()).toBe(false)
	})

	it("returns false when startViewTransition does not exist", () => {
		Object.defineProperty(globalThis, "document", {
			configurable: true,
			value: {},
		})
		;(globalThis as Record<string, unknown>).ViewTransition = () => {}
		expect(supportsViewTransitionTypes()).toBe(false)
	})
})

describe("prefersReducedMotion", () => {
	let originalWindow: typeof globalThis.window | undefined

	beforeEach(() => {
		originalWindow = (globalThis as Record<string, unknown>).window as typeof window | undefined
	})

	afterEach(() => {
		if (originalWindow !== undefined) {
			;(globalThis as Record<string, unknown>).window = originalWindow
		} else {
			delete (globalThis as Record<string, unknown>).window
		}
	})

	it("returns true when prefers-reduced-motion is reduce", () => {
		const mockMatchMedia = vi.fn().mockReturnValue({ matches: true })
		;(globalThis as Record<string, unknown>).window = { matchMedia: mockMatchMedia }
		expect(prefersReducedMotion()).toBe(true)
		expect(mockMatchMedia).toHaveBeenCalledWith("(prefers-reduced-motion: reduce)")
	})

	it("returns false when prefers-reduced-motion is not reduce", () => {
		;(globalThis as Record<string, unknown>).window = {
			matchMedia: vi.fn().mockReturnValue({ matches: false }),
		}
		expect(prefersReducedMotion()).toBe(false)
	})

	it("returns false when window is not available", () => {
		delete (globalThis as Record<string, unknown>).window
		expect(prefersReducedMotion()).toBe(false)
	})
})

describe("shouldUseViewTransitions", () => {
	let originalDocument: typeof document | undefined
	let originalWindow: typeof globalThis.window | undefined

	beforeEach(() => {
		originalDocument = globalThis.document
		originalWindow = (globalThis as Record<string, unknown>).window as typeof window | undefined
		/* Default: support view transitions, no reduced motion */
		Object.defineProperty(globalThis, "document", {
			configurable: true,
			value: { startViewTransition: () => {} },
		})
		;(globalThis as Record<string, unknown>).window = {
			matchMedia: vi.fn().mockReturnValue({ matches: false }),
		}
	})

	afterEach(() => {
		if (originalDocument) {
			Object.defineProperty(globalThis, "document", {
				configurable: true,
				value: originalDocument,
			})
		}
		if (originalWindow !== undefined) {
			;(globalThis as Record<string, unknown>).window = originalWindow
		} else {
			delete (globalThis as Record<string, unknown>).window
		}
	})

	it("returns true when config is true and browser supports it", () => {
		expect(shouldUseViewTransitions(true)).toBe(true)
	})

	it("returns true when config is object and browser supports it", () => {
		expect(shouldUseViewTransitions({ types: ["fade"] })).toBe(true)
	})

	it("returns false when config is undefined", () => {
		expect(shouldUseViewTransitions(undefined)).toBe(false)
	})

	it("returns false when config is false", () => {
		expect(shouldUseViewTransitions(false)).toBe(false)
	})

	it("returns false when browser does not support view transitions", () => {
		Object.defineProperty(globalThis, "document", {
			configurable: true,
			value: {},
		})
		expect(shouldUseViewTransitions(true)).toBe(false)
	})

	it("returns false when user prefers reduced motion", () => {
		;(globalThis as Record<string, unknown>).window = {
			matchMedia: vi.fn().mockReturnValue({ matches: true }),
		}
		expect(shouldUseViewTransitions(true)).toBe(false)
	})
})

describe("resolveTransitionTypes", () => {
	const baseInfo: LocationChangeInfo = {
		direction: "forward",
		fromLocation: { hash: "", pathname: "/", search: "" },
		pathChanged: true,
		toLocation: { hash: "", pathname: "/about", search: "" },
	}

	it("returns direction array for boolean true config", () => {
		expect(resolveTransitionTypes(true, baseInfo)).toEqual(["forward"])
		expect(resolveTransitionTypes(true, { ...baseInfo, direction: "back" })).toEqual(["back"])
		expect(resolveTransitionTypes(true, { ...baseInfo, direction: "none" })).toEqual(["none"])
	})

	it("returns static types array from config", () => {
		const config: ViewTransitionConfig = { types: ["fade", "slide"] }
		expect(resolveTransitionTypes(config, baseInfo)).toEqual(["fade", "slide"])
	})

	it("calls function with location info", () => {
		const typesFn = vi.fn().mockReturnValue(["custom"])
		const config: ViewTransitionConfig = { types: typesFn }

		const result = resolveTransitionTypes(config, baseInfo)

		expect(typesFn).toHaveBeenCalledWith(baseInfo)
		expect(result).toEqual(["custom"])
	})

	it("returns false when function returns false", () => {
		const config: ViewTransitionConfig = { types: () => false }
		expect(resolveTransitionTypes(config, baseInfo)).toBe(false)
	})

	it("computes direction-based types from function", () => {
		const config: ViewTransitionConfig = {
			types: (info) => [`slide-${info.direction}`],
		}

		expect(resolveTransitionTypes(config, { ...baseInfo, direction: "forward" })).toEqual([
			"slide-forward",
		])
		expect(resolveTransitionTypes(config, { ...baseInfo, direction: "back" })).toEqual([
			"slide-back",
		])
	})

	it("can conditionally skip transitions based on pathChanged", () => {
		const config: ViewTransitionConfig = {
			types: (info) => (info.pathChanged ? ["fade"] : false),
		}

		expect(resolveTransitionTypes(config, { ...baseInfo, pathChanged: true })).toEqual(["fade"])
		expect(resolveTransitionTypes(config, { ...baseInfo, pathChanged: false })).toBe(false)
	})
})

describe("withViewTransition", () => {
	let originalDocument: typeof document | undefined
	let originalWindow: typeof globalThis.window | undefined
	let mockStartViewTransition: ReturnType<typeof vi.fn>
	let mockDocumentElement: { dataset: Record<string, string | undefined> }

	const baseInfo: LocationChangeInfo = {
		direction: "forward",
		fromLocation: { hash: "", pathname: "/", search: "" },
		pathChanged: true,
		toLocation: { hash: "", pathname: "/about", search: "" },
	}

	beforeEach(() => {
		originalDocument = globalThis.document
		originalWindow = (globalThis as Record<string, unknown>).window as typeof window | undefined

		mockDocumentElement = { dataset: {} }
		mockStartViewTransition = vi.fn().mockImplementation((callbackOrOptions) => {
			/* Execute callback to simulate transition, awaiting if async */
			const callback =
				typeof callbackOrOptions === "function" ? callbackOrOptions : callbackOrOptions.update
			const result = callback()
			const finishedPromise = result instanceof Promise ? result : Promise.resolve()
			return {
				finished: finishedPromise,
				ready: Promise.resolve(),
				updateCallbackDone: finishedPromise,
			}
		})

		Object.defineProperty(globalThis, "document", {
			configurable: true,
			value: {
				documentElement: mockDocumentElement,
				startViewTransition: mockStartViewTransition,
			},
		})
		;(globalThis as Record<string, unknown>).window = {
			matchMedia: vi.fn().mockReturnValue({ matches: false }),
		}
	})

	afterEach(() => {
		if (originalDocument) {
			Object.defineProperty(globalThis, "document", {
				configurable: true,
				value: originalDocument,
			})
		}
		if (originalWindow !== undefined) {
			;(globalThis as Record<string, unknown>).window = originalWindow
		} else {
			delete (globalThis as Record<string, unknown>).window
		}
	})

	it("calls callback directly when config is undefined", async () => {
		const callback = vi.fn()
		await withViewTransition(callback, undefined, baseInfo)

		expect(callback).toHaveBeenCalled()
		expect(mockStartViewTransition).not.toHaveBeenCalled()
	})

	it("calls callback directly when config is false", async () => {
		const callback = vi.fn()
		await withViewTransition(callback, false, baseInfo)

		expect(callback).toHaveBeenCalled()
		expect(mockStartViewTransition).not.toHaveBeenCalled()
	})

	it("calls callback directly when types function returns false", async () => {
		const callback = vi.fn()
		await withViewTransition(callback, { types: () => false }, baseInfo)

		expect(callback).toHaveBeenCalled()
		expect(mockStartViewTransition).not.toHaveBeenCalled()
	})

	it("wraps callback in startViewTransition when enabled", async () => {
		const callback = vi.fn()
		await withViewTransition(callback, true, baseInfo)

		expect(mockStartViewTransition).toHaveBeenCalledTimes(1)
	})

	it("sets data-transition-direction on documentElement", async () => {
		const callback = vi.fn()
		await withViewTransition(callback, true, baseInfo)

		/* The callback should have been called with direction set */
		expect(mockStartViewTransition).toHaveBeenCalled()
	})

	it("sets data-transition-types when types are provided", async () => {
		const callback = vi.fn()
		await withViewTransition(callback, { types: ["fade", "slide"] }, baseInfo)

		expect(mockStartViewTransition).toHaveBeenCalled()
	})

	it("cleans up data attributes after transition", async () => {
		const callback = vi.fn()
		await withViewTransition(callback, true, baseInfo)

		/* Wait for finally callback to execute (cleanup runs in finally of finished promise) */
		await Promise.resolve()

		/* After transition completes, attributes should be cleaned up */
		expect(mockDocumentElement.dataset.transitionDirection).toBeUndefined()
		expect(mockDocumentElement.dataset.transitionTypes).toBeUndefined()
	})

	it("handles async callbacks", async () => {
		let resolved = false
		const callback = vi.fn().mockImplementation(async () => {
			await new Promise((r) => setTimeout(r, 10))
			resolved = true
		})

		await withViewTransition(callback, true, baseInfo)

		expect(resolved).toBe(true)
	})

	it("calls callback directly when user prefers reduced motion", async () => {
		;(globalThis as Record<string, unknown>).window = {
			matchMedia: vi.fn().mockReturnValue({ matches: true }),
		}

		const callback = vi.fn()
		await withViewTransition(callback, true, baseInfo)

		expect(callback).toHaveBeenCalled()
		expect(mockStartViewTransition).not.toHaveBeenCalled()
	})
})
