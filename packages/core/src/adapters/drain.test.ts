import { expect, it, vi } from "vitest"
import { pendingWork } from "./drain.ts"

// Nothing pending drains at once.
it("empty", async () => {
	const work = pendingWork()
	expect(work.draining()).toBe(false)
	expect(await work.drain({ timeout: "1s" })).toBe(true)
	expect(work.draining()).toBe(true)
})

// A drain waits for every tracked promise, one that rejects and one that joins while it waits included.
it("waits", async () => {
	const work = pendingWork()
	const first = Promise.withResolvers<void>()
	const late = Promise.withResolvers<void>()
	const failed = Promise.withResolvers<void>()
	work.track(first.promise)
	work.track(failed.promise)
	let done = false
	const drained = work.drain({ timeout: "5s" }).then((value) => {
		done = true
		return value
	})
	failed.reject(new Error("store down"))
	work.track(late.promise)
	first.resolve()
	await new Promise((resolve) => setTimeout(resolve, 10))
	expect(done).toBe(false)
	late.resolve()
	expect(await drained).toBe(true)
})

// Work still pending at the timeout gives `false`, and the timer is cleared either way.
it("timeout", async () => {
	vi.useFakeTimers()
	try {
		const work = pendingWork()
		work.track(new Promise(() => undefined))
		const drained = work.drain({ timeout: "2s" })
		await vi.advanceTimersByTimeAsync(2000)
		expect(await drained).toBe(false)
		expect(vi.getTimerCount()).toBe(0)
	} finally {
		vi.useRealTimers()
	}
})

// The timeout is a duration string; anything else throws before the drain starts.
it("bad timeout", async () => {
	const work = pendingWork()
	await expect(work.drain({ timeout: "soon" })).rejects.toThrow("duration")
	expect(work.draining()).toBe(false)
})
