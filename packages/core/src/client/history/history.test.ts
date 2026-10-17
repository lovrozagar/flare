import { beforeEach, expect, it, vi } from "vitest"
import { createHistory } from "./history.ts"

beforeEach(() => {
	history.replaceState(null, "", "/")
})

it("stamp", () => {
	const flare = createHistory(history)
	flare.adopt("/")
	flare.push("/a")
	expect(history.state).toEqual({ index: 1, usr: undefined })
	expect(location.pathname).toBe("/a")
})

it("adopt", () => {
	history.replaceState({ index: 4, usr: "kept" }, "")
	const length = history.length
	const flare = createHistory(history)
	flare.adopt("/")
	expect(history.length).toBe(length)
	expect(history.state).toEqual({ index: 4, usr: "kept" })
	flare.push("/next", { from: "test" })
	expect(history.state).toEqual({ index: 5, usr: { from: "test" } })
})

it("index", () => {
	const replace = vi.spyOn(history, "replaceState")
	const flare = createHistory(history)
	flare.adopt("/")
	expect(replace).toHaveBeenCalledExactlyOnceWith({ index: 0, usr: undefined }, "")
	flare.push("/one")
	flare.replace("/two", "swapped")
	expect(history.state).toEqual({ index: 1, usr: "swapped" })
	expect(flare.index()).toBe(1)
	const push = vi.spyOn(history, "pushState")
	replace.mockClear()
	expect(flare.pop({ index: 0 }, "/")).toEqual([0])
	expect(push).not.toHaveBeenCalled()
	expect(replace).not.toHaveBeenCalled()
	expect(flare.index()).toBe(0)
	vi.restoreAllMocks()
})

// State another script wrote is not Flare's and is left alone.
it("foreign", () => {
	const flare = createHistory(history)
	flare.adopt("/")
	expect(flare.pop({ other: true }, "/#y")).toBeNull()
	expect(flare.index()).toBe(0)
})

// An entry the browser wrote, a hash typed in the bar or a fragment link's, has no state: it is stamped as the entry
// after the one it was written from, with no step to replay, so a later Back onto Flare's entry is a step and restores
// its scroll (dx/navigate.md, BUGS.md 318).
it("browser entry", () => {
	const flare = createHistory(history)
	flare.adopt("/")
	flare.push("/about")
	flare.push("/about#one")
	history.pushState(null, "", "/about#typed")
	expect(flare.pop(null, "/about#typed")).toEqual([])
	expect([history.state, flare.index(), flare.urlAt(3)]).toEqual([{ index: 3, usr: undefined }, 3, "/about#typed"])
	expect(flare.pop({ index: 2 }, "/about#one")).toEqual([2])
})

it("delta", () => {
	history.replaceState({ index: 5 }, "")
	const flare = createHistory(history)
	flare.adopt("/")
	expect(flare.pop({ index: 2 }, "/two")).toEqual([4, 3, 2])
	expect(flare.pop({ index: 5 }, "/five")).toEqual([3, 4, 5])
	expect(flare.index()).toBe(5)
})

// A navigation inside an open overlay replaces its entry and keeps it the overlay's; a plain replace makes it a page
// entry again (plan 21 13.12, BUGS.md 214).
it("intercepted replace", () => {
	const flare = createHistory(history)
	flare.adopt("/")
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

// `here` is the URL the bar shows, whichever way the entry was reached: adopted on load, pushed, replaced, or stepped to
// by Back or Forward, an entry another document or a fragment link wrote included, so a navigation compares with the
// bar and never with a page still on screen (BUGS.md 296).
it("here", () => {
	const flare = createHistory(history)
	flare.adopt("/start")
	const seen = [flare.here()]
	flare.push("/a")
	seen.push(flare.here())
	flare.replace("/a?q=1")
	seen.push(flare.here())
	flare.pop({ index: 0 }, "/start")
	seen.push(flare.here())
	flare.pop(null, "/start#x")
	seen.push(flare.here())
	expect([seen, flare.index()]).toEqual([["/start", "/a", "/a?q=1", "/start", "/start#x"], 1])
})
