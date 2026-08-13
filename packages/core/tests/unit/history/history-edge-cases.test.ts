import { describe, expect, it, vi } from "vitest"
import {
	createHistoryListener,
	createHistoryState,
	createScrollStore,
	getCurrentScroll,
	getHistoryIndex,
	incrementHistoryIndex,
	initHistoryIndex,
	parseHistoryState,
	restoreScroll,
	scrollToTop,
	setHistoryIndex,
} from "../../../src/history/index.ts"

/* ── parseHistoryState edge cases ────────────────────────────────── */

describe("parseHistoryState edge cases", () => {
	it("null → null", () => {
		expect(parseHistoryState(null)).toBeNull()
	})

	it("undefined → null", () => {
		expect(parseHistoryState(undefined)).toBeNull()
	})

	it("string → null", () => {
		expect(parseHistoryState("hello")).toBeNull()
	})

	it("number → null", () => {
		expect(parseHistoryState(42)).toBeNull()
	})

	it("array → null", () => {
		expect(parseHistoryState([1, 2, 3])).toBeNull()
	})

	it("object without pathname → null", () => {
		expect(parseHistoryState({ key: "k1" })).toBeNull()
	})

	it("object without key → null", () => {
		expect(parseHistoryState({ pathname: "/about" })).toBeNull()
	})

	it("minimal valid state → parsed", () => {
		const result = parseHistoryState({ key: "k1", pathname: "/about" })
		expect(result).not.toBeNull()
		expect(result?.pathname).toBe("/about")
		expect(result?.key).toBe("k1")
		expect(result?.historyIndex).toBe(0)
		expect(result?.search).toBe("")
		expect(result?.params).toEqual({})
	})

	it("full state → all fields preserved", () => {
		const result = parseHistoryState({
			historyIndex: 5,
			key: "k1",
			params: { id: "42" },
			pathname: "/products/42",
			scroll: { x: 0, y: 100 },
			search: "?page=2",
			state: { custom: true },
		})
		expect(result?.historyIndex).toBe(5)
		expect(result?.params).toEqual({ id: "42" })
		expect(result?.scroll).toEqual({ x: 0, y: 100 })
		expect(result?.search).toBe("?page=2")
		expect(result?.state).toEqual({ custom: true })
	})

	it("non-numeric historyIndex defaults to 0", () => {
		const result = parseHistoryState({ historyIndex: "five", key: "k1", pathname: "/" })
		expect(result?.historyIndex).toBe(0)
	})

	it("non-string search defaults to empty", () => {
		const result = parseHistoryState({ key: "k1", pathname: "/", search: 42 })
		expect(result?.search).toBe("")
	})

	it("non-object params defaults to empty", () => {
		const result = parseHistoryState({ key: "k1", params: "invalid", pathname: "/" })
		expect(result?.params).toEqual({})
	})

	it("invalid scroll (missing fields) → undefined", () => {
		const result = parseHistoryState({ key: "k1", pathname: "/", scroll: { x: 0 } })
		expect(result?.scroll).toBeUndefined()
	})

	it("scroll with NaN values → undefined", () => {
		const result = parseHistoryState({
			key: "k1",
			pathname: "/",
			scroll: { x: Number.NaN, y: 0 },
		})
		expect(result?.scroll).toBeUndefined()
	})

	it("scroll with Infinity → undefined", () => {
		const result = parseHistoryState({
			key: "k1",
			pathname: "/",
			scroll: { x: 0, y: Number.POSITIVE_INFINITY },
		})
		expect(result?.scroll).toBeUndefined()
	})

	it("scroll with negative values is valid", () => {
		const result = parseHistoryState({
			key: "k1",
			pathname: "/",
			scroll: { x: -10, y: -20 },
		})
		expect(result?.scroll).toEqual({ x: -10, y: -20 })
	})
})

/* ── createHistoryState ──────────────────────────────────────────── */

describe("createHistoryState", () => {
	it("generates unique keys across calls", () => {
		const a = createHistoryState("/a")
		const b = createHistoryState("/b")
		expect(a.key).not.toBe(b.key)
	})

	it("defaults historyIndex to 0", () => {
		const state = createHistoryState("/")
		expect(state.historyIndex).toBe(0)
	})

	it("preserves custom state", () => {
		const state = createHistoryState("/", {}, "", { state: { modal: true } })
		expect(state.state).toEqual({ modal: true })
	})

	it("preserves search string", () => {
		const state = createHistoryState("/", {}, "?page=2")
		expect(state.search).toBe("?page=2")
	})
})

/* ── historyIndex management ─────────────────────────────────────── */

describe("historyIndex management", () => {
	it("initHistoryIndex sets index", () => {
		initHistoryIndex(42)
		expect(getHistoryIndex()).toBe(42)
	})

	it("setHistoryIndex updates index", () => {
		setHistoryIndex(10)
		expect(getHistoryIndex()).toBe(10)
	})

	it("incrementHistoryIndex bumps by 1", () => {
		setHistoryIndex(5)
		incrementHistoryIndex()
		expect(getHistoryIndex()).toBe(6)
	})

	it("multiple increments", () => {
		setHistoryIndex(0)
		incrementHistoryIndex()
		incrementHistoryIndex()
		incrementHistoryIndex()
		expect(getHistoryIndex()).toBe(3)
	})
})

/* ── scroll utilities ────────────────────────────────────────────── */

describe("scroll utilities", () => {
	it("getCurrentScroll returns {x: 0, y: 0} in jsdom", () => {
		const scroll = getCurrentScroll()
		expect(scroll).toEqual({ x: 0, y: 0 })
	})

	it("restoreScroll calls scrollTo with correct args", () => {
		const scrollToSpy = vi.fn()
		vi.stubGlobal("scrollTo", scrollToSpy)

		restoreScroll({ x: 50, y: 100 })
		expect(scrollToSpy).toHaveBeenCalledWith({ behavior: "auto", left: 50, top: 100 })

		vi.unstubAllGlobals()
	})

	it("restoreScroll with smooth behavior", () => {
		const scrollToSpy = vi.fn()
		vi.stubGlobal("scrollTo", scrollToSpy)

		restoreScroll({ x: 0, y: 200 }, "smooth")
		expect(scrollToSpy).toHaveBeenCalledWith({ behavior: "smooth", left: 0, top: 200 })

		vi.unstubAllGlobals()
	})

	it("scrollToTop calls scrollTo(0, 0)", () => {
		const scrollToSpy = vi.fn()
		vi.stubGlobal("scrollTo", scrollToSpy)

		scrollToTop()
		expect(scrollToSpy).toHaveBeenCalledWith(0, 0)

		vi.unstubAllGlobals()
	})
})

/* ── scroll store edge cases ─────────────────────────────────────── */

describe("scroll store edge cases", () => {
	it("get nonexistent key → null", () => {
		const store = createScrollStore()
		expect(store.get("nonexistent")).toBeNull()
	})

	it("save then get → position returned", () => {
		const store = createScrollStore()
		store.save("k1", { x: 10, y: 20 })
		expect(store.get("k1")).toEqual({ x: 10, y: 20 })
	})

	it("save updates existing position", () => {
		const store = createScrollStore()
		store.save("k1", { x: 0, y: 100 })
		store.save("k1", { x: 0, y: 200 })
		expect(store.get("k1")).toEqual({ x: 0, y: 200 })
	})

	it("LRU eviction at maxSize=1", () => {
		const store = createScrollStore(1)
		store.save("k1", { x: 0, y: 1 })
		store.save("k2", { x: 0, y: 2 })
		expect(store.get("k1")).toBeNull()
		expect(store.get("k2")).toEqual({ x: 0, y: 2 })
	})

	it("re-save moves to end of LRU", () => {
		const store = createScrollStore(2)
		store.save("k1", { x: 0, y: 1 })
		store.save("k2", { x: 0, y: 2 })
		/* Touch k1 */
		store.save("k1", { x: 0, y: 10 })
		/* Add k3 → k2 evicted (oldest) */
		store.save("k3", { x: 0, y: 3 })
		expect(store.get("k2")).toBeNull()
		expect(store.get("k1")).toEqual({ x: 0, y: 10 })
		expect(store.get("k3")).toEqual({ x: 0, y: 3 })
	})

	it("save with zero position is valid", () => {
		const store = createScrollStore()
		store.save("k1", { x: 0, y: 0 })
		expect(store.get("k1")).toEqual({ x: 0, y: 0 })
	})

	it("entries evicted after TTL", () => {
		const store = createScrollStore(200, 100)
		store.save("k1", { x: 0, y: 1 })

		/* Advance time past TTL */
		vi.spyOn(Date, "now").mockReturnValue(Date.now() + 200)

		/* New save triggers TTL cleanup */
		store.save("k2", { x: 0, y: 2 })

		expect(store.get("k1")).toBeNull()
		expect(store.get("k2")).toEqual({ x: 0, y: 2 })

		vi.spyOn(Date, "now").mockRestore()
	})

	it("entries within TTL are preserved", () => {
		const store = createScrollStore(200, 500)
		store.save("k1", { x: 0, y: 1 })

		/* Advance time but stay within TTL */
		vi.spyOn(Date, "now").mockReturnValue(Date.now() + 100)

		store.save("k2", { x: 0, y: 2 })

		expect(store.get("k1")).toEqual({ x: 0, y: 1 })
		expect(store.get("k2")).toEqual({ x: 0, y: 2 })

		vi.spyOn(Date, "now").mockRestore()
	})
})

/* ── createHistoryListener ───────────────────────────────────────── */

describe("createHistoryListener", () => {
	it("returns cleanup function", () => {
		const cleanup = createHistoryListener(() => {})
		expect(typeof cleanup).toBe("function")
		cleanup()
	})

	it("ignores popstate with non-parseable state", () => {
		let called = false
		const cleanup = createHistoryListener(() => {
			called = true
		})

		/* Dispatch popstate with invalid state */
		window.dispatchEvent(new PopStateEvent("popstate", { state: "garbage" }))
		expect(called).toBe(false)

		cleanup()
	})

	it("fires callback with parsed state on valid popstate", () => {
		let received: unknown
		const cleanup = createHistoryListener((event) => {
			received = event
		})

		window.dispatchEvent(
			new PopStateEvent("popstate", {
				state: { key: "k1", pathname: "/about", search: "" },
			}),
		)

		expect(received).toBeDefined()
		expect((received as Record<string, unknown>).pathname).toBe("/about")
		expect((received as Record<string, unknown>).type).toBe("popstate")

		cleanup()
	})

	it("cleanup removes listener", () => {
		let callCount = 0
		const cleanup = createHistoryListener(() => {
			callCount++
		})

		cleanup()

		window.dispatchEvent(
			new PopStateEvent("popstate", {
				state: { key: "k1", pathname: "/" },
			}),
		)
		expect(callCount).toBe(0)
	})

	it("popstate with null state → callback NOT fired", () => {
		let called = false
		const cleanup = createHistoryListener(() => {
			called = true
		})

		window.dispatchEvent(new PopStateEvent("popstate", { state: null }))
		expect(called).toBe(false)

		cleanup()
	})
})
