import { readFileSync } from "node:fs"
import { expect, it, vi } from "vitest"
import { inflight, type Landing } from "./inflight.ts"

const settled = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0))

// Two misses of one key share one render. The slot holds until the render's write settles, then frees, a failed
// render or write included (BUGS.md B31).
it("coalesce", async () => {
	const held = Promise.withResolvers<Landing>()
	const write = Promise.withResolvers<void>()
	const render = vi.fn<() => Promise<Landing>>(() => held.promise)
	const first = inflight("k", render)
	const second = inflight("k", render)
	// A joiner shares the flight through the slot; the starter holds the render itself.
	expect(inflight("k", render)).toBe(second)
	held.resolve({ flight: undefined, written: write.promise })
	await Promise.all([first, second])
	expect(inflight("k", render)).toBe(second)
	expect(await second).toBe(await first)
	write.resolve()
	await settled()
	expect(render).toHaveBeenCalledOnce()
	const quick = vi.fn<() => Promise<Landing>>(async () => ({ flight: undefined, written: Promise.resolve() }))
	await inflight("k", quick)
	await settled()
	await expect(inflight("k", () => Promise.reject(new Error("broke")))).rejects.toThrow("broke")
	await settled()
	await inflight("k", async () => ({ flight: undefined, written: Promise.reject(new Error("disk")) }))
	await settled()
	await inflight("k", quick)
	expect(quick).toHaveBeenCalledTimes(2)
})

// A flight that never lands holds its slot for 30 s at most: then a request that joined it gets nothing to serve and
// renders on its own, and the next miss starts a new render. The request that started the hung render keeps waiting
// on it (plan 21 7.5).
it("deadline", async () => {
	vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] })
	try {
		const hung = vi.fn<() => Promise<Landing>>(() => new Promise(() => undefined))
		const first = inflight("hung", hung)
		const second = inflight("hung", hung)
		const joined = vi.fn<(flight: unknown) => void>()
		void second.then(joined)
		await vi.advanceTimersByTimeAsync(29_999)
		expect(joined).not.toHaveBeenCalled()
		await vi.advanceTimersByTimeAsync(1)
		expect(joined).toHaveBeenCalledWith(undefined)
		const quick = vi.fn<() => Promise<Landing>>(async () => ({ flight: undefined, written: Promise.resolve() }))
		await inflight("hung", quick)
		expect(quick).toHaveBeenCalledOnce()
		expect(hung).toHaveBeenCalledOnce()
		const started = vi.fn<(flight: unknown) => void>()
		void first.then(started)
		await vi.advanceTimersByTimeAsync(60_000)
		expect(started).not.toHaveBeenCalled()
	} finally {
		vi.useRealTimers()
	}
})

it("different keys", async () => {
	const render = vi.fn<() => Promise<Landing>>(async () => ({ flight: undefined, written: Promise.resolve() }))
	await Promise.all([inflight("a", render), inflight("b", render)])
	expect(render).toHaveBeenCalledTimes(2)
})

// The one permitted process-scoped map says why it is one (00-rules.md `no-module-state`).
it("annotation", () => {
	const source = readFileSync(new URL("./inflight.ts", import.meta.url), "utf8")
	expect(source).toContain("// per-process-constant: in-flight renders")
})
