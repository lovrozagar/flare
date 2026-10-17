import { beforeEach, expect, it, vi } from "vitest"
import { createHistory } from "./history.ts"

beforeEach(() => {
	history.replaceState(null, "", "/")
})

it("stamp", () => {
	const flare = createHistory(history)
	flare.adopt()
	flare.push("/a")
	expect(history.state).toEqual({ index: 1, usr: undefined })
	expect(location.pathname).toBe("/a")
})

it("adopt", () => {
	history.replaceState({ index: 4, usr: "kept" }, "")
	const length = history.length
	const flare = createHistory(history)
	flare.adopt()
	expect(history.length).toBe(length)
	expect(history.state).toEqual({ index: 4, usr: "kept" })
	flare.push("/next", { from: "test" })
	expect(history.state).toEqual({ index: 5, usr: { from: "test" } })
})

it("index", () => {
	const replace = vi.spyOn(history, "replaceState")
	const flare = createHistory(history)
	flare.adopt()
	expect(replace).toHaveBeenCalledExactlyOnceWith({ index: 0, usr: undefined }, "")
	flare.push("/one")
	flare.replace("/two", "swapped")
	expect(history.state).toEqual({ index: 1, usr: "swapped" })
	expect(flare.index()).toBe(1)
	const push = vi.spyOn(history, "pushState")
	replace.mockClear()
	expect(flare.pop({ index: 0 })).toEqual([0])
	expect(push).not.toHaveBeenCalled()
	expect(replace).not.toHaveBeenCalled()
	expect(flare.index()).toBe(0)
	vi.restoreAllMocks()
})

it("foreign", () => {
	const flare = createHistory(history)
	flare.adopt()
	expect(flare.pop(null)).toBeNull()
	expect(flare.pop({ other: true })).toBeNull()
	expect(flare.index()).toBe(0)
})

it("delta", () => {
	history.replaceState({ index: 5 }, "")
	const flare = createHistory(history)
	flare.adopt()
	expect(flare.pop({ index: 2 })).toEqual([4, 3, 2])
	expect(flare.pop({ index: 5 })).toEqual([3, 4, 5])
	expect(flare.index()).toBe(5)
})

// A navigation inside an open overlay replaces its entry and keeps it the overlay's; a plain replace makes it a page
// entry again (plan 21 13.12, BUGS.md 214).
it("intercepted replace", () => {
	const flare = createHistory(history)
	flare.adopt()
	flare.push("/photo", undefined, true)
	flare.replace("/photo?n=2", { q: 1 }, true)
	expect([history.state, location.search, flare.interceptedAt(1)]).toEqual([
		{ index: 1, usr: { q: 1 }, intercepted: true },
		"?n=2",
		true,
	])
	flare.replace("/plain")
	expect([history.state, flare.interceptedAt(1)]).toEqual([{ index: 1, usr: undefined }, false])
})
