import { afterEach, expect, it, vi } from "vitest"
import { runTransition, transitionDirection, transitionOption, type TransitionInfo } from "./direction.ts"

it("forward", () => {
	expect(transitionDirection({ from: 2, to: 3, enabled: true })).toBe("forward")
	expect(transitionDirection({ from: 2, to: 2, enabled: true })).toBe("same")
})

it("back", () => {
	expect(transitionDirection({ from: 3, to: 1, enabled: true })).toBe("back")
})

it("off", () => {
	expect(transitionDirection({ from: 2, to: 3, enabled: false })).toBeUndefined()
})

type Started = {
	updateCallbackDone: Promise<void>
	ready: Promise<void>
	finished: Promise<void>
	skipTransition: () => void
}

// A start that records how it was called: the plain callback (B119), or the object form with its types.
function stub() {
	const calls: ({ types?: string[] } | "callback")[] = []
	const start = vi.fn<(arg: (() => void) | { update: () => void; types?: string[] }) => Started>((arg) => {
		if (typeof arg === "function") {
			calls.push("callback")
			arg()
		} else {
			calls.push({ types: arg.types })
			arg.update()
		}
		return {
			updateCallbackDone: Promise.resolve(),
			ready: Promise.resolve(),
			finished: Promise.resolve(),
			skipTransition() {},
		}
	})
	return { start, calls }
}

const info: TransitionInfo = {
	direction: "back",
	fromLocation: { pathname: "/b", search: "", hash: "" },
	toLocation: { pathname: "/a", search: "", hash: "" },
	pathChanged: true,
}

function auto(): Document {
	return document
}

function update(): void {}

afterEach(() => {
	Reflect.deleteProperty(document, "startViewTransition")
	Reflect.deleteProperty(globalThis, "ViewTransitionTypeSet")
})

// A browser that supports view-transition types exposes their set's class.
function supportTypes(): void {
	Object.defineProperty(globalThis, "ViewTransitionTypeSet", { configurable: true, value: class {} })
}

// The plain callback unless the app configured types and the browser supports them; no direction type by default
// (B119).
it("types", async () => {
	const { start, calls } = stub()
	Object.defineProperty(document, "startViewTransition", { configurable: true, value: start })
	const update = vi.fn<() => void>()
	await runTransition({ option: {}, info, auto, update })
	await runTransition({ option: { types: ["slide"] }, info, auto, update })
	supportTypes()
	await runTransition({ option: {}, info, auto, update })
	await runTransition({ option: { types: ["slide"] }, info, auto, update })
	await runTransition({ option: { types: (seen) => [`to-${seen.toLocation.pathname}`] }, info, auto, update })
	await runTransition({ option: { types: () => [] }, info, auto, update })
	await runTransition({ option: { types: () => false }, info, auto, update })
	await runTransition({ option: false, info, auto, update })
	expect(calls).toEqual(["callback", "callback", "callback", { types: ["slide"] }, { types: ["to-/a"] }, "callback"])
	expect(update).toHaveBeenCalledTimes(8)
})

// A transition still running is skipped before the next starts: two at once both freeze content being swapped (B119).
it("skips running", async () => {
	const skipped: string[] = []
	const finishers: (() => void)[] = []
	const running = (name: string): Started => ({
		updateCallbackDone: Promise.resolve(),
		ready: Promise.resolve(),
		finished: new Promise<void>((resolve) => void finishers.push(resolve)),
		skipTransition: () => void skipped.push(name),
	})
	let started = 0
	const start = vi.fn<(arg: () => void) => Started>((arg) => {
		started += 1
		arg()
		return running(`t${started}`)
	})
	Object.defineProperty(document, "startViewTransition", { configurable: true, value: start })
	await runTransition({ option: {}, info, auto, update })
	await runTransition({ option: {}, info, auto, update })
	expect(skipped).toEqual(["t1"])
	finishers.at(-1)?.()
	await Promise.resolve()
	await runTransition({ option: {}, info, auto, update })
	expect(skipped).toEqual(["t1"])
})

// An element-scoped start that throws falls back to the document transition (B119).
it("scoped throw", async () => {
	const fromDocument = stub()
	Object.defineProperty(document, "startViewTransition", { configurable: true, value: fromDocument.start })
	const element = document.createElement("main")
	Object.defineProperty(element, "startViewTransition", {
		configurable: true,
		value: () => {
			throw new DOMException("not supported here", "InvalidStateError")
		},
	})
	const update = vi.fn<() => void>()
	await runTransition({ option: { scope: "auto" }, info, auto: () => element, update })
	expect(fromDocument.calls).toEqual(["callback"])
	expect(update).toHaveBeenCalledOnce()
})

// The default scope starts the document's transition, though a boundary could start one (B119 (5), B129); "auto" and a
// function returning it opt into the boundary's element, and an element that cannot start one falls back to the
// document.
it("scope", async () => {
	const fromDocument = stub()
	Object.defineProperty(document, "startViewTransition", { configurable: true, value: fromDocument.start })
	const element = document.createElement("main")
	const fromElement = stub()
	Object.defineProperty(element, "startViewTransition", { configurable: true, value: fromElement.start })
	await runTransition({ option: {}, info, auto: () => element, update })
	await runTransition({ option: { scope: "auto" }, info, auto: () => element, update })
	await runTransition({ option: { scope: "document" }, info, auto: () => element, update })
	await runTransition({ option: { scope: () => "auto" }, info, auto: () => element, update })
	await runTransition({ option: { scope: "auto" }, info, auto: () => document.createElement("section"), update })
	expect(fromElement.start).toHaveBeenCalledTimes(2)
	expect(fromDocument.start).toHaveBeenCalledTimes(3)
	Reflect.deleteProperty(document, "startViewTransition")
	const plain = vi.fn<() => void>()
	await runTransition({ option: {}, info, auto: () => document, update: plain })
	expect(plain).toHaveBeenCalledOnce()
})

// The names the content scope sets: the root's and each element's `view-transition-name`, as CSSOM holds them.
function names(...elements: HTMLElement[]): string[] {
	return [document.documentElement, ...elements].map((element) =>
		element.style.getPropertyValue("view-transition-name"),
	)
}

// A start that reads the names at the old capture (before the update) and at the new one (after it), then finishes
// when the test says.
function capturing(elements: () => HTMLElement[]) {
	const seen: { before: string[]; after: string[] }[] = []
	const finishers: (() => void)[] = []
	const skipped: number[] = []
	const start = vi.fn<(arg: () => void) => Started>((arg) => {
		const before = names(...elements())
		arg()
		seen.push({ before, after: names(...elements()) })
		const index = seen.length
		return {
			updateCallbackDone: Promise.resolve(),
			ready: Promise.resolve(),
			finished: new Promise<void>((resolve) => void finishers.push(resolve)),
			skipTransition: () => void skipped.push(index),
		}
	})
	return { start, seen, finishers, skipped }
}

afterEach(() => {
	document.documentElement.style.removeProperty("view-transition-name")
	document.body.replaceChildren()
})

// With a boundary, the default scope ("content") captures only it: the root is named none and the boundary
// flare-content before the document's transition starts, so what is outside stays live (B129).
it("content scope names", async () => {
	const boundary = document.body.appendChild(document.createElement("article"))
	const own = stub()
	Object.defineProperty(boundary, "startViewTransition", { configurable: true, value: own.start })
	const { start, seen } = capturing(() => [boundary])
	Object.defineProperty(document, "startViewTransition", { configurable: true, value: start })
	await runTransition({ option: {}, info, auto: () => boundary, update })
	await runTransition({ option: { scope: "content" }, info, auto: () => boundary, update })
	expect(seen.map((one) => one.before)).toEqual([
		["none", "flare-content"],
		["none", "flare-content"],
	])
	expect(own.start).not.toHaveBeenCalled()
})

// The update can replace the boundary's element (a layout remount): the one there after the commit is named for the
// new capture, and the one it replaced is not, so no name is ever on two elements (B129).
it("content names the new boundary", async () => {
	const old = document.body.appendChild(document.createElement("article"))
	const next = document.createElement("article")
	let current = old
	const { start, seen } = capturing(() => [old, next])
	Object.defineProperty(document, "startViewTransition", { configurable: true, value: start })
	const replace = (): void => {
		old.replaceWith(next)
		current = next
	}
	await runTransition({ option: {}, info, auto: () => current, update: replace })
	expect(seen).toEqual([{ before: ["none", "flare-content", ""], after: ["none", "", "flare-content"] }])
})

// Every name goes when the transition finishes, when the next navigation skips it, and when the start throws, so a
// root left at none never kills a later document transition. A skipped transition finishing late leaves the newer
// one's names alone (B129, B119 (1)).
it("content names cleared", async () => {
	const boundary = document.body.appendChild(document.createElement("article"))
	const { start, seen, finishers, skipped } = capturing(() => [boundary])
	Object.defineProperty(document, "startViewTransition", { configurable: true, value: start })
	await runTransition({ option: {}, info, auto: () => boundary, update })
	finishers[0]?.()
	await new Promise((resolve) => setTimeout(resolve, 0))
	expect(names(boundary)).toEqual(["", ""])
	await runTransition({ option: {}, info, auto: () => boundary, update })
	await runTransition({ option: {}, info, auto: () => boundary, update })
	expect(skipped).toEqual([2])
	expect(seen[2]?.before).toEqual(["none", "flare-content"])
	finishers[1]?.()
	await new Promise((resolve) => setTimeout(resolve, 0))
	expect(names(boundary)).toEqual(["none", "flare-content"])
	finishers[2]?.()
	await new Promise((resolve) => setTimeout(resolve, 0))
	expect(names(boundary)).toEqual(["", ""])
	const thrown = new DOMException("no transition now", "InvalidStateError")
	Object.defineProperty(document, "startViewTransition", {
		configurable: true,
		value: () => {
			throw thrown
		},
	})
	await expect(runTransition({ option: {}, info, auto: () => boundary, update })).rejects.toBe(thrown)
	expect(names(boundary)).toEqual(["", ""])
})

// With no boundary the content scope is the document crossfade, and nothing is named (B129).
it("content without boundary", async () => {
	const { start, seen } = capturing(() => [])
	Object.defineProperty(document, "startViewTransition", { configurable: true, value: start })
	const plain = vi.fn<() => void>()
	await runTransition({ option: {}, info, auto, update: plain })
	expect(seen).toEqual([{ before: [""], after: [""] }])
	expect(plain).toHaveBeenCalledOnce()
})

// A skipped transition rejects `ready` with an AbortError. The update still completes, and the skip is expected,
// so the rejection is handled (BUGS.md B17).
it("skipped transition", async () => {
	const unhandled: unknown[] = []
	const onUnhandled = (reason: unknown): void => void unhandled.push(reason)
	process.on("unhandledRejection", onUnhandled)
	const skipped = new DOMException("Transition was skipped", "AbortError")
	const start = vi.fn<(update: () => void) => Started>((update) => {
		update()
		return {
			updateCallbackDone: Promise.resolve(),
			ready: Promise.reject(skipped),
			finished: Promise.resolve(),
			skipTransition() {},
		}
	})
	Object.defineProperty(document, "startViewTransition", { configurable: true, value: start })
	const update = vi.fn<() => void>()
	await runTransition({ option: {}, info, auto, update })
	await new Promise((resolve) => setTimeout(resolve, 0))
	process.off("unhandledRejection", onUnhandled)
	expect(update).toHaveBeenCalledOnce()
	expect(unhandled).toEqual([])
})

it("options", () => {
	const router = { types: ["fade"] }
	expect(transitionOption(undefined, router)).toBe(router)
	expect(transitionOption(undefined, false)).toBe(false)
	expect(transitionOption(true, false)).toEqual({})
	expect(transitionOption(false, router)).toBe(false)
	expect(transitionOption({ scope: "document" }, router)).toEqual({ scope: "document" })
	expect(transitionOption({ scope: "content" }, router)).toEqual({ scope: "content" })
})
