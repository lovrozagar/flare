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

// A timeout longer than a timer can hold, 2^31 - 1 ms (about 24.8 days), is waited out in full, not cut to a
// millisecond (BUGS.md 421).
it("long timeout", async () => {
	vi.useFakeTimers()
	try {
		const work = pendingWork()
		const held = Promise.withResolvers<void>()
		work.track(held.promise)
		let result: boolean | undefined
		void work.drain({ timeout: "30d" }).then((value) => (result = value))
		await vi.advanceTimersByTimeAsync(25 * 86_400_000)
		expect(result).toBeUndefined()
		await vi.advanceTimersByTimeAsync(5 * 86_400_000)
		expect(result).toBe(false)
		const other = pendingWork()
		other.track(new Promise((resolve) => setTimeout(resolve, 26 * 86_400_000)))
		let drained: boolean | undefined
		void other.drain({ timeout: "30d" }).then((value) => (drained = value))
		await vi.advanceTimersByTimeAsync(26 * 86_400_000)
		expect(drained).toBe(true)
	} finally {
		vi.useRealTimers()
	}
})
