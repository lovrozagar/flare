import { expect, it } from "vitest"
import { navigationRequests } from "./requests.ts"

// A new request aborts the newest one that has not committed, never the one whose page is on screen; a commit aborts
// the page it replaces (plan 21 13.11, BUGS.md 213).
it("requests", () => {
	const requests = navigationRequests()
	const first = requests.start()
	requests.committed(first)
	const second = requests.start()
	expect([first.signal.aborted, requests.latest(second), requests.latest(first)]).toEqual([false, true, false])
	const third = requests.start()
	expect([first.signal.aborted, second.signal.aborted]).toEqual([false, true])
	requests.committed(third)
	requests.committed(third)
	expect([first.signal.aborted, third.signal.aborted]).toEqual([true, false])
})

// A move that stays on the page aborts the newest pending request, never the page's own or a fill, which lands onto
// the page as the move left it (BUGS.md 311).
it("cancel", () => {
	const requests = navigationRequests()
	requests.cancel()
	const shown = requests.start()
	requests.committed(shown)
	requests.cancel()
	expect([shown.signal.aborted, requests.latest(shown)]).toEqual([false, true])
	const fill = requests.start(true)
	requests.cancel()
	expect([fill.signal.aborted, requests.latest(fill)]).toEqual([false, true])
	const next = requests.start()
	requests.cancel()
	expect([next.signal.aborted, requests.latest(next), requests.latest(shown), shown.signal.aborted]).toEqual([
		true,
		false,
		true,
		false,
	])
})
