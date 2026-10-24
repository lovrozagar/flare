import { expect, it, vi } from "vitest"
import { countedFetch, userWork } from "./user-work.ts"

// The user's own requests in flight: busy from each begin to its end, and an entry older than the bound no longer
// counts, so a call that never settles cannot hold the idle warm-up forever (BUGS.md 520).
it("user work", () => {
	let now = 0
	const work = userWork(() => now, 1000)
	expect(work.busy()).toBe(false)
	const first = work.begin()
	const second = work.begin()
	expect(work.busy()).toBe(true)
	first()
	first()
	expect(work.busy()).toBe(true)
	second()
	expect(work.busy()).toBe(false)
	work.begin()
	now = 999
	expect(work.busy()).toBe(true)
	now = 1001
	expect(work.busy()).toBe(false)
})

// A fetch counts from its call until its answer's head arrives or it fails: the request has its connection by then.
it("counted fetch", async () => {
	const work = userWork(() => 0, 1000)
	const answer = Promise.withResolvers<Response>()
	const fetch = countedFetch(async () => answer.promise, work)
	const pending = fetch("/a", {})
	expect(work.busy()).toBe(true)
	answer.resolve(new Response("x"))
	await pending
	expect(work.busy()).toBe(false)
	const failing = countedFetch(async () => Promise.reject(new Error("offline")), work)
	await expect(failing("/b", {})).rejects.toThrow("offline")
	expect(work.busy()).toBe(false)
})

// `whenIdle` runs at once when nothing is in flight, else when the last piece of work ends, and when the oldest open
// entry passes the bound, by one timer, since a call that never settles sends no end: no polling while the user is busy.
it("when idle", async () => {
	vi.useFakeTimers()
	try {
		let now = 0
		const work = userWork(() => now, 1000)
		const ran: string[] = []
		work.whenIdle(() => ran.push("at once"))
		const done = work.begin()
		work.whenIdle(() => ran.push("after end"))
		work.whenIdle(() => ran.push("second waiter"))
		expect(ran).toEqual(["at once"])
		expect(vi.getTimerCount()).toBe(1)
		done()
		expect(ran).toEqual(["at once", "after end", "second waiter"])
		expect(vi.getTimerCount()).toBe(0)
		work.begin()
		work.whenIdle(() => ran.push("past the bound"))
		now = 1001
		await vi.advanceTimersByTimeAsync(1001)
		expect(ran).toEqual(["at once", "after end", "second waiter", "past the bound"])
	} finally {
		vi.useRealTimers()
	}
})
