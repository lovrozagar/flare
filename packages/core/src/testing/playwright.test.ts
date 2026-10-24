// @vitest-environment jsdom
import type { Page } from "@playwright/test"
import { expect, expectTypeOf, it, vi } from "vitest"
import { flarePage, loadHydrated, waitHydrated, type FlarePageInput } from "./playwright.ts"
import { matchToWire } from "../shared/protocol/value.ts"

type Listener = (value: never) => void

// A slice of Playwright's Page that records what the helper asks of it.
function fakePage(flare: unknown = undefined) {
	const listeners = new Map<string, Listener[]>()
	const page = {
		goto: vi.fn<(url: string, options: { waitUntil: "commit"; timeout: number }) => Promise<null>>(async () => null),
		// The locator's `waitFor`, with the selector it was made for.
		waitFor: vi.fn<(selector: string, options: { state: "attached"; timeout: number }) => Promise<null>>(
			async () => null,
		),
		locator: (selector: string) => ({
			waitFor: (options: { state: "attached"; timeout: number }) => page.waitFor(selector, options),
		}),
		exposeBinding: vi.fn<(name: string, callback: () => void) => Promise<void>>(async () => undefined),
		addInitScript: vi.fn<(script: (name: string) => void, arg: string) => Promise<void>>(async () => undefined),
		on(event: string, listener: Listener) {
			listeners.set(event, [...(listeners.get(event) ?? []), listener])
			return page
		},
		// The function runs here as it would in the document, with `self.flare` set for the call.
		async evaluate<T, A>(fn: (arg: A) => T, arg: A): Promise<T> {
			Reflect.set(globalThis, "flare", flare)
			try {
				return fn(arg)
			} finally {
				Reflect.deleteProperty(globalThis, "flare")
			}
		},
	}
	const emit = (event: string, value: unknown): void => {
		for (const listener of listeners.get(event) ?? []) listener(value as never)
	}
	return { page, emit }
}

function message(type: string, text: string) {
	return { type: () => type, text: () => text }
}

it("hydrated", async () => {
	const { page } = fakePage()
	await flarePage(page).load()
	// The goto returns at the response, not the load event, which a slow resource holds (BUGS.md 472).
	// The goto gets what the 25 s deadline leaves, on the real clock here (BUGS.md 473).
	const left = expect.toSatisfy((ms: number) => ms > 24_000 && ms <= 25_000)
	expect(page.goto).toHaveBeenCalledWith("/", { waitUntil: "commit", timeout: left })
	expect(page.waitFor).toHaveBeenCalledWith("html[data-flare-hydrated]", { state: "attached", timeout: 5000 })
	await flarePage(page).load("/about")
	expect(page.goto).toHaveBeenLastCalledWith("/about", { waitUntil: "commit", timeout: left })
	// The goto finishes before the wait starts.
	expect(page.goto.mock.invocationCallOrder[0]).toBeLessThan(page.waitFor.mock.invocationCallOrder[0] ?? 0)
	// A real Playwright Page is a FlarePageInput, so an app passes its own page.
	expectTypeOf<Page>().toMatchTypeOf<FlarePageInput>()
})

// Nothing is hidden: a hydration mismatch is the bug class an app's e2e is there to catch.
it("console all", () => {
	const { page, emit } = fakePage()
	const helper = flarePage(page)
	emit("console", message("error", "Hydration Mismatch. Unable to find DOM nodes for hydration key: 0-1"))
	emit("console", message("log", "hello"))
	emit("pageerror", new Error("boom"))
	expect(helper.consoleErrors()).toEqual([
		"Hydration Mismatch. Unable to find DOM nodes for hydration key: 0-1",
		"boom",
	])
	// The list is a copy, collected from the moment the helper was made.
	helper.consoleErrors().push("x")
	expect(helper.consoleErrors()).toHaveLength(2)
})

const match = { id: "_root_/", params: {}, search: {}, data: { a: 1 }, preloader: null, head: null, error: null }

it("state", async () => {
	// The page holds each match's app values as wire values (B145).
	const wired = matchToWire(match)
	const document = { build: "abc123", nonce: "n", matches: [wired], queries: null, fill: true, call: () => 1 }
	const state = await flarePage(fakePage(document).page).state()
	expect(state).toEqual({ build: "abc123", nonce: "n", matches: [match], queries: null })
	// The v0 short keys, a match missing a field, and no state at all are not Flare's document state.
	const invalid = [
		{ p: [], r: {}, c: {} },
		{ ...document, matches: [{ ...wired, error: undefined }].map(({ error: _error, ...rest }) => rest) },
		{ ...document, matches: "x" },
		{ ...document, build: 1 },
		{ ...document, nonce: undefined },
		{ ...document, matches: [null] },
		undefined,
	]
	for (const value of invalid) {
		await expect(flarePage(fakePage(value).page).state()).rejects.toThrow(
			"self.flare is not Flare's document state: { build, nonce, matches, queries }",
		)
	}
})

// A promise that never settles: a reply Playwright's driver lost.
function lost(): Promise<null> {
	return new Promise(() => undefined)
}

// The query's reply is lost and the page's binding reports the hydration: the wait resolves on the binding, with no
// re-issue (BUGS.md 107).
it("lost reply", async () => {
	const { page } = fakePage()
	page.waitFor.mockImplementation(lost)
	const reissues: number[] = []
	const wait = waitHydrated(page, Promise.resolve(), { onReissue: (attempt) => reissues.push(attempt) })
	await expect(wait).resolves.toBeUndefined()
	expect(reissues).toEqual([])
})

// No binding call, and the first query's reply and its driver timeout are both lost: the wait's own timer ends the
// slice, a fresh query goes out, counted, and its answer resolves the wait.
it("reissue", async () => {
	const { page } = fakePage()
	page.waitFor.mockImplementationOnce(lost)
	const reissues: number[] = []
	const slept: number[] = []
	const sleep = async (ms: number): Promise<void> => void slept.push(ms)
	await waitHydrated(page, new Promise(() => undefined), { sleep, onReissue: (attempt) => reissues.push(attempt) })
	expect(reissues).toEqual([1])
	expect(page.waitFor).toHaveBeenCalledTimes(2)
	expect(slept[0]).toBe(6000)
})

// A page that never hydrates still fails: every slice times out, and at the deadline the wait throws. The last slice
// is cut to what the deadline leaves.
it("never hydrated", async () => {
	const { page } = fakePage()
	let clock = 0
	const timeouts: number[] = []
	page.waitFor.mockImplementation(async (_selector, options) => {
		timeouts.push(options?.timeout ?? 0)
		clock += options?.timeout ?? 0
		throw new Error("Timeout exceeded")
	})
	const reissues: number[] = []
	const wait = waitHydrated(page, new Promise(() => undefined), {
		deadline: 12_000,
		sleep: () => new Promise(() => undefined),
		now: () => clock,
		onReissue: (attempt) => reissues.push(attempt),
	})
	await expect(wait).rejects.toThrow("The page never hydrated: no html[data-flare-hydrated] within 12000 ms")
	expect(timeouts).toEqual([5000, 5000, 2000])
	// One report per query sent again: the deadline after the third sends no fourth (BUGS.md 474).
	expect(reissues).toEqual([1, 2])
})

// The deadline counts from the load's call, so the time its `goto` took is inside it (BUGS.md 473).
it("deadline from the call", async () => {
	const { page } = fakePage()
	let clock = 0
	const timeouts: number[] = []
	page.goto.mockImplementation(async () => {
		clock += 10_000
		return null
	})
	page.waitFor.mockImplementation(async (_selector, options) => {
		timeouts.push(options?.timeout ?? 0)
		clock += options?.timeout ?? 0
		throw new Error("Timeout exceeded")
	})
	const load = loadHydrated(page, "/", {
		deadline: 12_000,
		sleep: () => new Promise(() => undefined),
		now: () => clock,
	})
	await expect(load).rejects.toThrow("The page never hydrated: no html[data-flare-hydrated] within 12000 ms")
	expect(timeouts).toEqual([2000])
	// A document that never answers: the goto gets what the deadline leaves, and its timeout is the never-hydrated
	// error at the deadline, not Playwright's navigation timeout later. Another goto failure keeps its own error.
	clock = 0
	page.goto.mockImplementationOnce(async (_url, options) => {
		clock += options.timeout
		throw new Error(`page.goto: Timeout ${options.timeout}ms exceeded.`)
	})
	const never = loadHydrated(page, "/", { deadline: 12_000, now: () => clock })
	await expect(never).rejects.toThrow("The page never hydrated: no html[data-flare-hydrated] within 12000 ms")
	expect(page.goto).toHaveBeenLastCalledWith("/", { waitUntil: "commit", timeout: 12_000 })
	const refused = new Error("net::ERR_CONNECTION_REFUSED")
	page.goto.mockRejectedValueOnce(refused)
	await expect(loadHydrated(page, "/", { deadline: 12_000, now: () => clock })).rejects.toBe(refused)
})

// A load that never hydrated says what the page logged, since the test awaiting it never reads consoleErrors(); any
// other failure, and a page that logged nothing, keep their own error (BUGS.md 476).
it("never hydrated logs", async () => {
	vi.useFakeTimers()
	const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined)
	try {
		const { page, emit } = fakePage()
		// Each query takes its timeout, as the driver's does.
		page.waitFor.mockImplementation(
			(_selector, options) =>
				new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), options.timeout)),
		)
		const helper = flarePage(page)
		// A line logged before this load is not this load's cause.
		emit("console", message("error", "an earlier page's error"))
		const quiet = helper.load().catch((error: unknown) => error)
		await vi.advanceTimersByTimeAsync(30_000)
		expect(await quiet).toMatchObject({
			message: "The page never hydrated: no html[data-flare-hydrated] within 25000 ms",
		})
		const logged = helper.load().catch((error: unknown) => error)
		emit("console", message("error", "Hydration Mismatch. Unable to find DOM nodes"))
		await vi.advanceTimersByTimeAsync(30_000)
		expect(await logged).toMatchObject({
			message:
				"The page never hydrated: no html[data-flare-hydrated] within 25000 ms. The page logged: Hydration Mismatch. Unable to find DOM nodes",
		})
		const failed = new Error("net::ERR_CONNECTION_REFUSED")
		page.goto.mockRejectedValueOnce(failed)
		await expect(helper.load()).rejects.toBe(failed)
		page.goto.mockRejectedValueOnce("aborted")
		await expect(helper.load()).rejects.toBe("aborted")
	} finally {
		warn.mockRestore()
		vi.useRealTimers()
	}
})

// One binding under a random name and one init script per page, whatever the number of loads; the binding resolves the
// load that armed it.
it("binding once", async () => {
	const { page } = fakePage()
	page.waitFor.mockImplementation(lost)
	const first = loadHydrated(page, "/a", { sleep: () => new Promise(() => undefined) })
	await vi.waitFor(() => expect(page.goto).toHaveBeenCalledWith("/a", expect.objectContaining({ waitUntil: "commit" })))
	const [name, callback] = page.exposeBinding.mock.calls[0] ?? []
	expect(name).toMatch(/^__flare_hydrated_[0-9a-f]{32}$/)
	expect(page.addInitScript.mock.calls[0]?.[1]).toBe(name)
	callback?.()
	await first
	const second = loadHydrated(page, "/b", { sleep: () => new Promise(() => undefined) })
	await vi.waitFor(() => expect(page.goto).toHaveBeenCalledWith("/b", expect.objectContaining({ waitUntil: "commit" })))
	callback?.()
	await second
	expect(page.exposeBinding).toHaveBeenCalledOnce()
	expect(page.addInitScript).toHaveBeenCalledOnce()
})

// A binding call before the goto commits comes from the page being left, still hydrating when the load began (docs-resilience
// on macOS WebKit, CI 40055656884): it does not resolve the load, and the new document's call does.
it("previous document hydrated", async () => {
	const { page } = fakePage()
	page.waitFor.mockImplementation(lost)
	const report = (): void => page.exposeBinding.mock.calls[0]?.[1]()
	page.goto.mockImplementationOnce(async () => {
		report()
		return null
	})
	let done = false
	const load = loadHydrated(page, "/", { sleep: () => new Promise(() => undefined) }).then(() => {
		done = true
	})
	// The wait has begun once its query went out; one macrotask turn then drains every microtask it could settle on.
	await vi.waitFor(() => expect(page.waitFor).toHaveBeenCalledOnce())
	await new Promise((drained) => setTimeout(drained))
	expect(done).toBe(false)
	report()
	await load
	expect(done).toBe(true)
})

// The helper says when it had to send a query again, naming the path.
it("reissue warns", async () => {
	const { page } = fakePage()
	page.waitFor.mockRejectedValueOnce(new Error("Timeout 5000ms exceeded"))
	const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined)
	await flarePage(page).load("/slow")
	expect(warn).toHaveBeenCalledExactlyOnceWith('[flare] flarePage.load("/slow"): no hydration answer yet, query 2 sent')
	warn.mockRestore()
})

// After a revalidation the client leaves only `call` on `self.flare`: `state()` says so rather than blaming the
// page's shape, and after a load it reads the state the page kept when it hydrated (BUGS.md 475).
it("state kept", async () => {
	const { page } = fakePage({ call: vi.fn<() => void>() })
	await expect(flarePage(page).state()).rejects.toThrow(
		"self.flare was dropped by a revalidation, invalidate() or a server function that set a cookie",
	)
	const helper = flarePage(page)
	await helper.load()
	const [name = ""] = page.exposeBinding.mock.calls[0] ?? []
	const kept = { build: "b", nonce: "n", matches: [], queries: null }
	Reflect.set(globalThis, `${name}_state`, kept)
	try {
		expect(await helper.state()).toEqual(kept)
	} finally {
		Reflect.deleteProperty(globalThis, `${name}_state`)
	}
})

// A macrotask, after which a mutation observer has run.
function settle(): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve))
}

// The init script, run in the document: it calls the binding once `data-flare-hydrated` is set, not when the
// attribute goes away first, and never from a subframe.
it("page script", async () => {
	const { page } = fakePage()
	await flarePage(page).load()
	const [script, name = ""] = page.addInitScript.mock.calls[0] ?? []
	const root = document.documentElement
	root.setAttribute("data-flare-hydrated", "")
	const called = vi.fn<() => void>()
	Reflect.set(window, name, called)
	const flare = { build: "b", call: called }
	Reflect.set(window, "flare", flare)
	try {
		script?.(name)
		root.removeAttribute("data-flare-hydrated")
		await settle()
		expect(called).not.toHaveBeenCalled()
		root.setAttribute("data-flare-hydrated", "")
		await settle()
		root.removeAttribute("data-flare-hydrated")
		root.setAttribute("data-flare-hydrated", "")
		await settle()
		expect(called).toHaveBeenCalledOnce()
		// A copy, so the client's later deletes on `self.flare` leave it whole.
		expect(Reflect.get(window, `${name}_state`)).toEqual(flare)
		expect(Reflect.get(window, `${name}_state`)).not.toBe(flare)
		vi.stubGlobal("window", { top: {} })
		expect(script?.(name)).toBeUndefined()
	} finally {
		vi.unstubAllGlobals()
		Reflect.deleteProperty(window, name)
		Reflect.deleteProperty(window, `${name}_state`)
		Reflect.deleteProperty(window, "flare")
		root.removeAttribute("data-flare-hydrated")
	}
})
