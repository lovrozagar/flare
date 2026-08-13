/**
 * History Integration Tests
 *
 * Tests browser history API integration.
 * Verifies popstate, pushState, replaceState handling.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
	createHistoryState,
	createScrollPosition,
	parseHistoryState,
} from "../../../src/client/history"

describe("createHistoryState", () => {
	it("creates state with pathname and key", () => {
		const state = createHistoryState("/products", { id: "123" })

		expect(state.pathname).toBe("/products")
		expect(state.params).toEqual({ id: "123" })
		expect(typeof state.key).toBe("string")
		expect(state.key.length).toBeGreaterThan(0)
	})

	it("generates unique keys for each state", () => {
		const state1 = createHistoryState("/a")
		const state2 = createHistoryState("/b")

		expect(state1.key).not.toBe(state2.key)
	})

	it("includes search and hash if provided", () => {
		const state = createHistoryState("/products", {}, "?page=2", "#reviews")

		expect(state.search).toBe("?page=2")
		expect(state.hash).toBe("#reviews")
	})

	it("defaults search and hash to empty string", () => {
		const state = createHistoryState("/products")

		expect(state.search).toBe("")
		expect(state.hash).toBe("")
	})
})

describe("parseHistoryState", () => {
	it("parses valid history state", () => {
		const input = {
			hash: "#test",
			key: "abc123",
			params: { id: "1" },
			pathname: "/products",
			search: "?q=hello",
		}

		const result = parseHistoryState(input)

		expect(result).toEqual({
			...input,
			historyIndex: 0,
			navFormat: undefined,
		})
	})

	it("returns null for null state", () => {
		expect(parseHistoryState(null)).toBeNull()
	})

	it("returns null for undefined state", () => {
		expect(parseHistoryState(undefined)).toBeNull()
	})

	it("returns null for state without pathname", () => {
		expect(parseHistoryState({ key: "abc" })).toBeNull()
	})

	it("returns null for state without key", () => {
		expect(parseHistoryState({ pathname: "/test" })).toBeNull()
	})

	it("returns null for non-object state", () => {
		expect(parseHistoryState("string")).toBeNull()
		expect(parseHistoryState(123)).toBeNull()
		expect(parseHistoryState([])).toBeNull()
	})
})

describe("createScrollPosition", () => {
	it("creates scroll position with x and y", () => {
		const pos = createScrollPosition(100, 200)

		expect(pos.x).toBe(100)
		expect(pos.y).toBe(200)
	})

	it("defaults to 0, 0", () => {
		const pos = createScrollPosition()

		expect(pos.x).toBe(0)
		expect(pos.y).toBe(0)
	})
})

describe("scroll position storage", () => {
	it("stores scroll position by history key", async () => {
		const { createScrollStore } = await import("../../../src/client/history")
		const store = createScrollStore()

		store.save("key1", { x: 0, y: 100 })
		store.save("key2", { x: 0, y: 200 })

		expect(store.get("key1")).toEqual({ x: 0, y: 100 })
		expect(store.get("key2")).toEqual({ x: 0, y: 200 })
	})

	it("returns null for unknown key", async () => {
		const { createScrollStore } = await import("../../../src/client/history")
		const store = createScrollStore()

		expect(store.get("unknown")).toBeNull()
	})

	it("limits stored positions to prevent memory leak", async () => {
		const { createScrollStore } = await import("../../../src/client/history")
		const store = createScrollStore(3)

		store.save("key1", { x: 0, y: 100 })
		store.save("key2", { x: 0, y: 200 })
		store.save("key3", { x: 0, y: 300 })
		store.save("key4", { x: 0, y: 400 })

		/* Oldest entry evicted */
		expect(store.get("key1")).toBeNull()
		expect(store.get("key4")).toEqual({ x: 0, y: 400 })
	})

	it("uses LRU eviction - accessing moves to end", async () => {
		const { createScrollStore } = await import("../../../src/client/history")
		const store = createScrollStore(3)

		store.save("key1", { x: 0, y: 100 })
		store.save("key2", { x: 0, y: 200 })
		store.save("key3", { x: 0, y: 300 })

		/* Re-save key1 to move it to end (most recent) */
		store.save("key1", { x: 0, y: 150 })

		/* Add key4 - should evict key2 (oldest) not key1 */
		store.save("key4", { x: 0, y: 400 })

		expect(store.get("key1")).toEqual({ x: 0, y: 150 })
		expect(store.get("key2")).toBeNull()
		expect(store.get("key3")).toEqual({ x: 0, y: 300 })
		expect(store.get("key4")).toEqual({ x: 0, y: 400 })
	})

	it("defaults to 50 max entries when no size specified", async () => {
		const { createScrollStore } = await import("../../../src/client/history")
		const store = createScrollStore()

		/* Fill with 50 entries */
		for (let i = 0; i < 50; i++) {
			store.save(`key${i}`, { x: 0, y: i * 10 })
		}

		/* All 50 should exist */
		expect(store.get("key0")).toEqual({ x: 0, y: 0 })
		expect(store.get("key49")).toEqual({ x: 0, y: 490 })

		/* Add 51st - should evict key0 */
		store.save("key50", { x: 0, y: 500 })
		expect(store.get("key0")).toBeNull()
		expect(store.get("key50")).toEqual({ x: 0, y: 500 })
	})
})

describe("history listener", () => {
	let popstateListeners: EventListener[]
	let originalAddEventListener: typeof globalThis.addEventListener | undefined
	let originalRemoveEventListener: typeof globalThis.removeEventListener | undefined

	beforeEach(() => {
		popstateListeners = []

		/* Save originals if they exist */
		originalAddEventListener = globalThis.addEventListener
		originalRemoveEventListener = globalThis.removeEventListener

		/* Mock window.addEventListener/removeEventListener */
		globalThis.addEventListener = ((event: string, handler: EventListenerOrEventListenerObject) => {
			if (event === "popstate" && typeof handler === "function") {
				popstateListeners.push(handler)
			}
		}) as typeof globalThis.addEventListener

		globalThis.removeEventListener = ((
			event: string,
			handler: EventListenerOrEventListenerObject,
		) => {
			if (event === "popstate" && typeof handler === "function") {
				const idx = popstateListeners.indexOf(handler)
				if (idx > -1) popstateListeners.splice(idx, 1)
			}
		}) as typeof globalThis.removeEventListener
	})

	afterEach(() => {
		/* Restore originals or delete mocks */
		if (originalAddEventListener) {
			globalThis.addEventListener = originalAddEventListener
		} else {
			delete (globalThis as Record<string, unknown>).addEventListener
		}
		if (originalRemoveEventListener) {
			globalThis.removeEventListener = originalRemoveEventListener
		} else {
			delete (globalThis as Record<string, unknown>).removeEventListener
		}
		vi.restoreAllMocks()
	})

	it("registers popstate listener", async () => {
		const { createHistoryListener } = await import("../../../src/client/history")

		const onNavigate = vi.fn()
		createHistoryListener(onNavigate)

		expect(popstateListeners.length).toBe(1)
	})

	it("calls onNavigate when popstate fires with valid state", async () => {
		const { createHistoryListener, createHistoryState } =
			await import("../../../src/client/history")

		const onNavigate = vi.fn()
		createHistoryListener(onNavigate)

		const state = createHistoryState("/products", { id: "123" })
		/* Simulate popstate event by creating mock PopStateEvent-like object */
		const listener = popstateListeners[0]
		if (listener) {
			/* Call listener with a mock event object that has the state property */
			const mockPopState = Object.assign(new Event("popstate"), { state })
			listener(mockPopState)
		}

		expect(onNavigate).toHaveBeenCalledWith({
			hash: "",
			historyIndex: 0,
			key: state.key,
			navFormat: undefined,
			params: { id: "123" },
			pathname: "/products",
			search: "",
			type: "popstate",
		})
	})

	it("does not call onNavigate for null state", async () => {
		const { createHistoryListener } = await import("../../../src/client/history")

		const onNavigate = vi.fn()
		createHistoryListener(onNavigate)

		const listener = popstateListeners[0]
		if (listener) {
			const mockPopState = Object.assign(new Event("popstate"), { state: null })
			listener(mockPopState)
		}

		expect(onNavigate).not.toHaveBeenCalled()
	})

	it("cleanup removes listener", async () => {
		const { createHistoryListener } = await import("../../../src/client/history")

		const onNavigate = vi.fn()
		const cleanup = createHistoryListener(onNavigate)

		expect(popstateListeners.length).toBe(1)

		cleanup()

		expect(popstateListeners.length).toBe(0)
	})
})

describe("history navigation", () => {
	let originalHistory: typeof history | undefined
	let pushStateSpy: ReturnType<typeof vi.fn>
	let replaceStateSpy: ReturnType<typeof vi.fn>

	beforeEach(() => {
		pushStateSpy = vi.fn()
		replaceStateSpy = vi.fn()
		originalHistory = globalThis.history

		Object.defineProperty(globalThis, "history", {
			configurable: true,
			value: {
				pushState: pushStateSpy,
				replaceState: replaceStateSpy,
				state: null,
			},
		})
	})

	afterEach(() => {
		if (originalHistory) {
			Object.defineProperty(globalThis, "history", {
				configurable: true,
				value: originalHistory,
			})
		}
	})

	it("pushState with history state", async () => {
		const { pushHistoryState } = await import("../../../src/client/history")

		pushHistoryState("/products", { id: "123" })

		expect(pushStateSpy).toHaveBeenCalledTimes(1)
		const [state, , url] = pushStateSpy.mock.calls[0] as [unknown, string, string]
		expect((state as { pathname: string }).pathname).toBe("/products")
		expect(url).toBe("/products")
	})

	it("pushState with search and hash", async () => {
		const { pushHistoryState } = await import("../../../src/client/history")

		pushHistoryState("/products", {}, "?page=2", "#reviews")

		const [, , url] = pushStateSpy.mock.calls[0] as [unknown, string, string]
		expect(url).toBe("/products?page=2#reviews")
	})

	it("replaceState with history state", async () => {
		const { replaceHistoryState } = await import("../../../src/client/history")

		replaceHistoryState("/about")

		expect(replaceStateSpy).toHaveBeenCalledTimes(1)
		const [state, , url] = replaceStateSpy.mock.calls[0] as [unknown, string, string]
		expect((state as { pathname: string }).pathname).toBe("/about")
		expect(url).toBe("/about")
	})
})
