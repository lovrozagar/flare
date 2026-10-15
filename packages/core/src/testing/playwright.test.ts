// @vitest-environment jsdom
import type { Page } from "@playwright/test"
import { expect, expectTypeOf, it, vi } from "vitest"
import { flarePage, loadHydrated, waitHydrated, type FlarePageInput } from "./playwright.ts"

type Listener = (value: never) => void

// A slice of Playwright's Page that records what the helper asks of it.
function fakePage(flare: unknown = undefined) {
	const listeners = new Map<string, Listener[]>()
	const page = {
		goto: vi.fn<(url: string) => Promise<null>>(async () => null),
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
		async evaluate<T>(fn: () => T): Promise<T> {
			Reflect.set(globalThis, "flare", flare)
			try {
				return fn()
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
	expect(page.goto).toHaveBeenCalledWith("/")
	expect(page.waitFor).toHaveBeenCalledWith("html[data-flare-hydrated]", { state: "attached", timeout: 5000 })
	await flarePage(page).load("/about")
	expect(page.goto).toHaveBeenLastCalledWith("/about")
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
	const document = { build: "abc123", nonce: "n", matches: [match], queries: null, fill: true, call: () => 1 }
	const state = await flarePage(fakePage(document).page).state()
	expect(state).toEqual({ build: "abc123", nonce: "n", matches: [match], queries: null })
	// The v0 short keys, a match missing a field, and no state at all are not Flare's document state.
	const invalid = [
		{ p: [], r: {}, c: {} },
		{ ...document, matches: [{ ...match, error: undefined }].map(({ error: _error, ...rest }) => rest) },
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
	const wait = waitHydrated(page, new Promise(() => undefined), {
		deadline: 12_000,
		sleep: () => new Promise(() => undefined),
		now: () => clock,
	})
	await expect(wait).rejects.toThrow("The page never hydrated: no html[data-flare-hydrated] within 12000 ms")
	expect(timeouts).toEqual([5000, 5000, 2000])
})

// One binding under a random name and one init script per page, whatever the number of loads; the binding resolves the
// load that armed it.
it("binding once", async () => {
	const { page } = fakePage()
	page.waitFor.mockImplementation(lost)
	const first = loadHydrated(page, "/a", { sleep: () => new Promise(() => undefined) })
	await vi.waitFor(() => expect(page.goto).toHaveBeenCalledWith("/a"))
	const [name, callback] = page.exposeBinding.mock.calls[0] ?? []
	expect(name).toMatch(/^__flare_hydrated_[0-9a-f]{32}$/)
	expect(page.addInitScript.mock.calls[0]?.[1]).toBe(name)
	callback?.()
	await first
	const second = loadHydrated(page, "/b", { sleep: () => new Promise(() => undefined) })
	await vi.waitFor(() => expect(page.goto).toHaveBeenCalledWith("/b"))
	callback?.()
	await second
	expect(page.exposeBinding).toHaveBeenCalledOnce()
	expect(page.addInitScript).toHaveBeenCalledOnce()
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
		vi.stubGlobal("window", { top: {} })
		expect(script?.(name)).toBeUndefined()
	} finally {
		vi.unstubAllGlobals()
		Reflect.deleteProperty(window, name)
		root.removeAttribute("data-flare-hydrated")
	}
})
