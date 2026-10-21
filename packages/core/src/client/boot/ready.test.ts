import { afterEach, expect, it, vi } from "vitest"
import { afterLoad, loadedIdle, createReady, type IdleEnv } from "./ready.ts"

afterEach(() => {
	vi.useRealTimers()
})

const location = { pathname: "/", search: "", hash: "" }

function idleNever(): IdleEnv {
	return { requestIdle: undefined, setTimeout: (run, ms) => setTimeout(run, ms) }
}

it("order", async () => {
	vi.useFakeTimers()
	const log: string[] = []
	const ready = createReady()
	ready.api
		.onInteraction(() => log.push("interaction"))
		.onIdle(() => log.push("idle"))
		.onHydrated(() => log.push("hydrated"))
		.onReady(() => log.push("ready"))
		.onReady(() => log.push("ready 2"))
	ready.close()
	ready.ready({ navigate: async () => undefined, location })
	ready.hydrated()
	ready.idle(idleNever(), () => log.push("prefetch all"))
	ready.interaction(document)
	expect(log).toEqual(["ready", "ready 2", "hydrated"])
	document.dispatchEvent(new Event("keydown"))
	document.dispatchEvent(new Event("pointerdown"))
	await vi.advanceTimersByTimeAsync(1000)
	expect(log).toEqual(["ready", "ready 2", "hydrated", "interaction", "idle", "prefetch all"])
})

it("all after idle", async () => {
	const log: string[] = []
	const ready = createReady()
	ready.api.onIdle(() => log.push("idle"))
	ready.close()
	const idle: IdleRequestCallback[] = []
	ready.idle({ requestIdle: (run) => void idle.push(run), setTimeout: () => undefined }, () => log.push("prefetch all"))
	expect(log).toEqual([])
	idle[0]({ didTimeout: false, timeRemaining: () => 10 })
	expect(log).toEqual(["idle", "prefetch all"])
})

it("late", async () => {
	const ready = createReady()
	ready.close()
	expect(() => ready.api.onReady(() => undefined)).toThrow(/same turn/)
	expect(() => ready.api.onIdle(() => undefined)).toThrow(/same turn/)
})

async function navigate(): Promise<void> {}

it("ready context", () => {
	const seen: unknown[] = []
	const ready = createReady()
	ready.api.onReady((ctx) => seen.push(ctx))
	ready.close()
	ready.ready({ navigate, location })
	expect(seen).toEqual([{ navigate, location }])
	expect(Object.keys(seen[0] as object)).toEqual(["navigate", "location"])
})

it("idle timeout", async () => {
	vi.useFakeTimers()
	const log: string[] = []
	const ready = createReady()
	ready.api.onIdle(() => log.push("idle"))
	ready.close()
	ready.idle(idleNever(), () => undefined)
	await vi.advanceTimersByTimeAsync(999)
	expect(log).toEqual([])
	await vi.advanceTimersByTimeAsync(1)
	expect(log).toEqual(["idle"])
	const timeouts: number[] = []
	const withIdle = createReady()
	withIdle.close()
	withIdle.idle(
		{ requestIdle: (_run, options) => void timeouts.push(options?.timeout ?? 0), setTimeout: () => undefined },
		() => undefined,
	)
	expect(timeouts).toEqual([1000])
})

it("after load", () => {
	const log: string[] = []
	const idle: (() => void)[] = []
	const env = { requestIdle: undefined, setTimeout: (run: () => void) => void idle.push(run) }
	afterLoad(env, () => log.push("now"))
	expect(log).toEqual(["now"])
	Object.defineProperty(document, "readyState", { configurable: true, get: () => "loading" })
	afterLoad(env, () => log.push("all"))
	loadedIdle(env)(() => log.push("render"))
	idle.shift()?.()
	expect(log).toEqual(["now"])
	window.dispatchEvent(new Event("load"))
	for (const run of idle.splice(0)) run()
	expect(log).toEqual(["now", "all", "render"])
	Reflect.deleteProperty(document, "readyState")
	expect(document.readyState).toBe("complete")
})

function boom(): never {
	throw new Error("boom")
}

// A callback that throws is the app's bug: it is reported, and the rest of its phase still runs, so the page still
// hydrates, fills, and prefetches. Before the boot names its reporter, a throw is logged (plan 21 9.3, BUGS.md 203).
it("throwing callback", async () => {
	vi.useFakeTimers()
	const log: string[] = []
	const reported: unknown[] = []
	const ready = createReady()
	ready.api
		.onReady(boom)
		.onReady(() => log.push("ready"))
		.onHydrated(boom)
		.onHydrated(() => log.push("hydrated"))
		.onIdle(boom)
		.onIdle(() => log.push("idle"))
		.onInteraction(boom)
		.onInteraction(() => log.push("interaction"))
	ready.close()
	ready.reportTo((error) => reported.push(error))
	ready.ready({ navigate: async () => undefined, location })
	ready.hydrated()
	ready.idle(idleNever(), () => log.push("after"))
	ready.interaction(document)
	document.dispatchEvent(new Event("keydown"))
	await vi.advanceTimersByTimeAsync(1000)
	expect(log).toEqual(["ready", "hydrated", "interaction", "idle", "after"])
	expect(reported).toHaveLength(4)
	const errors = vi.spyOn(console, "error").mockImplementation(() => undefined)
	const quiet = createReady()
	quiet.api.onHydrated(boom)
	quiet.close()
	quiet.hydrated()
	expect(errors).toHaveBeenCalledExactlyOnceWith("[flare] a createClient callback threw", expect.any(Error))
	errors.mockRestore()
})

// An element that stops its event's propagation does not hide the first interaction: the listener sees it on the way
// down (dx/client.md, BUGS.md 435).
it("interaction under a stopped event", () => {
	const log: string[] = []
	const ready = createReady()
	ready.api.onInteraction(() => log.push("interaction"))
	ready.close()
	const widget = document.createElement("div")
	document.body.append(widget)
	widget.addEventListener("pointerdown", (event) => event.stopPropagation())
	ready.interaction(document)
	widget.dispatchEvent(new Event("pointerdown", { bubbles: true }))
	widget.dispatchEvent(new Event("pointerdown", { bubbles: true }))
	widget.remove()
	expect(log).toEqual(["interaction"])
})

// An `async` callback that rejects is reported as a throwing one is, never an unhandled rejection (dx/client.md,
// BUGS.md 436).
it("async callback rejects", async () => {
	const reported: unknown[] = []
	const ready = createReady()
	ready.api.onHydrated(async () => {
		throw new Error("async boom")
	})
	ready.close()
	ready.reportTo((error) => reported.push(error))
	ready.hydrated()
	await Promise.resolve()
	await Promise.resolve()
	expect(reported).toEqual([new Error("async boom")])
})
