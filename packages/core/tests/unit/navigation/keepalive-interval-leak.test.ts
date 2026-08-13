/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { resetNavigationState, setupNavigation } from "../../../src/navigation/index.ts"

let addEventSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
	addEventSpy = vi.spyOn(document, "addEventListener")
})

afterEach(() => {
	resetNavigationState()
	vi.restoreAllMocks()
	vi.useRealTimers()
})

describe("Bug 48: keepalive interval leak on rapid visibility changes", () => {
	it("should clear old interval before creating new on re-visible", () => {
		vi.useFakeTimers()
		const clearIntervalSpy = vi.spyOn(globalThis, "clearInterval")

		/* Minimal provider context for setupNavigation */
		const mockCtx = {
			intercepted: () => null,
			matchCache: {
				delete: vi.fn(),
				get: vi.fn(),
				getAll: () => [],
				set: vi.fn(),
			},
			matches: () => [],
			params: () => ({}),
			prefetchCache: { cleanup: vi.fn() },
			search: () => ({}),
			setIntercepted: vi.fn(),
			setIsNavigating: vi.fn(),
			setMatches: vi.fn(),
			setParams: vi.fn(),
			setSearch: vi.fn(),
		}

		setupNavigation(mockCtx as never, vi.fn() as never, { keepalive: 30_000 })

		/* Find the visibilitychange handler */
		const visCall = addEventSpy.mock.calls.find((c: unknown[]) => c[0] === "visibilitychange")
		expect(visCall).toBeTruthy()
		const visHandler = visCall![1] as () => void

		/* Simulate: tab becomes visible (first re-visible) */
		Object.defineProperty(document, "visibilityState", {
			configurable: true,
			value: "visible",
		})
		visHandler()
		const clearAfterFirst = clearIntervalSpy.mock.calls.length

		/* Second visible event WITHOUT hidden in between */
		visHandler()
		const clearAfterSecond = clearIntervalSpy.mock.calls.length

		/* Bug: second visible event should call clearInterval to avoid leaking the first interval.
		 * Without fix: clearAfterSecond === clearAfterFirst (no clear before new interval)
		 * With fix: clearAfterSecond > clearAfterFirst */
		expect(clearAfterSecond).toBeGreaterThan(clearAfterFirst)
	})
})
