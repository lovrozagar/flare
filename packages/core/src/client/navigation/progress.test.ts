import { createComponent, createEffect, createRoot, flush } from "solid-js"
import { render } from "@solidjs/web"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import * as progressModule from "./progress.ts"
import { createNavigationState, NavigationContext, type NavigationState } from "./pending.ts"
import { useNavigationProgress, type ProgressOptions } from "./progress.ts"

type Seen = { readonly pending: boolean; readonly value: number | null }

beforeEach(() => {
	vi.useFakeTimers()
})

afterEach(() => {
	vi.useRealTimers()
})

function mount(options?: ProgressOptions): { state: NavigationState; progress: Seen; start: () => () => void } {
	const state = createNavigationState()
	const box: { progress?: Seen } = {}
	render(
		() =>
			createComponent(NavigationContext, {
				value: state,
				get children() {
					box.progress = useNavigationProgress(options)
					return ""
				},
			}),
		document.createElement("div"),
	)
	const progress: Seen = {
		get pending() {
			return box.progress?.pending ?? false
		},
		get value() {
			return box.progress?.value ?? null
		},
	}
	// Starts one navigation. The returned function ends it, as its commit does.
	const start = (): (() => void) => {
		const end = state.begin()
		flush()
		return end
	}
	return { state, progress, start }
}

async function settle(finish: () => void): Promise<void> {
	finish()
	await vi.advanceTimersByTimeAsync(0)
	flush()
}

it("start", () => {
	const { progress, start } = mount()
	expect(progress.value).toBeNull()
	start()
	expect(progress.value).toBe(0.08)
	expect(progress.pending).toBe(true)
})

// A painter reads both fields, and each change reaches it in one flush: a navigation's first frame is already the
// start value, and the first frame after it is already 1. No pair mixes a new flag with an old value (BUGS.md B39).
it("no tear", async () => {
	const state = createNavigationState()
	const seen: string[] = []
	render(
		() =>
			createComponent(NavigationContext, {
				value: state,
				get children() {
					const progress = useNavigationProgress()
					createEffect(
						() => `${String(progress.pending)}:${String(progress.value)}`,
						(pair) => void seen.push(pair),
					)
					return ""
				},
			}),
		document.createElement("div"),
	)
	flush()
	const end = state.begin()
	flush()
	vi.advanceTimersByTime(200)
	flush()
	end()
	await vi.advanceTimersByTimeAsync(0)
	flush()
	await vi.advanceTimersByTimeAsync(0)
	flush()
	expect(seen).toEqual(["false:null", "true:0.08", "true:0.18", "false:1", "false:null"])
})

it("first trickle", () => {
	const { progress, start } = mount()
	start()
	vi.advanceTimersByTime(199)
	flush()
	expect(progress.value).toBe(0.08)
	vi.advanceTimersByTime(1)
	flush()
	expect(progress.value).toBeCloseTo(0.18)
})

it("cap", () => {
	const { progress, start } = mount()
	start()
	vi.advanceTimersByTime(200 * 400)
	flush()
	expect(progress.value).toBe(0.994)
	vi.advanceTimersByTime(200)
	flush()
	expect(progress.value).toBe(0.994)
})

it("complete", async () => {
	const { progress, start } = mount()
	const finish = start()
	finish()
	await Promise.resolve()
	await Promise.resolve()
	flush()
	expect(progress.value).toBe(1)
	expect(progress.pending).toBe(false)
	await vi.advanceTimersByTimeAsync(0)
	flush()
	expect(progress.value).toBeNull()
})

it("min display", async () => {
	const { progress, start } = mount({ minDisplay: 300 })
	const finish = start()
	await vi.advanceTimersByTimeAsync(50)
	await settle(finish)
	expect(progress.value).toBe(1)
	await vi.advanceTimersByTimeAsync(249)
	flush()
	expect(progress.value).toBe(1)
	await vi.advanceTimersByTimeAsync(1)
	flush()
	expect(progress.value).toBeNull()
})

it("restart", async () => {
	const { progress, start } = mount({ minDisplay: 300 })
	await settle(start())
	expect(progress.value).toBe(1)
	start()
	expect(progress.value).toBe(0.08)
	await vi.advanceTimersByTimeAsync(300)
	flush()
	expect(progress.value).not.toBeNull()
})

it("prefetch", async () => {
	const { progress } = mount()
	await Promise.resolve("a prefetch is never tracked")
	flush()
	expect(progress.value).toBeNull()
	expect(progress.pending).toBe(false)
})

it("failure", async () => {
	const { state, progress } = mount()
	const end = state.begin()
	flush()
	// A failed navigation ends the way a commit does.
	end()
	flush()
	expect(progress.value).toBe(1)
	await vi.advanceTimersByTimeAsync(0)
	flush()
	expect(progress.value).toBeNull()
})

// A server render runs the hook under its owner with navigation idle: the same owners as the client (B2), and no
// timer. tests/integration/hydrate.test.tsx renders it with Solid's server build and hydrates it.
it("ssr", () => {
	const timers = vi.getTimerCount()
	const seen = createRoot((dispose) => {
		const progress = { ...useNavigationProgress() }
		dispose()
		return progress
	})
	expect(seen).toEqual({ pending: false, value: null })
	expect(vi.getTimerCount()).toBe(timers)
})

it("trickle 0", () => {
	expect(() => useNavigationProgress({ trickle: 0 })).toThrow(/trickle/)
})

it("trickle 15", () => {
	expect(() => useNavigationProgress({ trickle: 15 })).toThrow(/trickle/)
})

it("trickle 16", () => {
	const { progress, start } = mount({ trickle: 16 })
	start()
	vi.advanceTimersByTime(16)
	flush()
	expect(progress.value).toBeCloseTo(0.18)
})

it("min display negative", () => {
	expect(() => useNavigationProgress({ minDisplay: -1 })).toThrow(/minDisplay/)
	expect(() => useNavigationProgress({ minDisplay: 1.5 })).toThrow(/minDisplay/)
})

it("exports", () => {
	expect(Object.keys(progressModule)).toEqual(["useNavigationProgress"])
	expect(progressModule).not.toHaveProperty("NavigationProgress")
})
