import { expect, it } from "vitest"
import { leftBehind, type StepEvent } from "./unload.ts"

const X = "http://127.0.0.1:1/assets/x.js"
const Y = "http://127.0.0.1:1/assets/y.js"

// Firefox's console line for a module whose load failed.
function warned(url: string): string {
	return `warning: [JavaScript Warning: "Loading failed for the module with source “${url}”." {file: "http://127.0.0.1:1/assets/client.js" line: 0}]`
}

// The page being left asked for x.js, a document navigation started at 10, Firefox warned for x.js at 12, and the new
// document committed at 15: a step's events around one warning.
function step(at: { asked: number; warned: number; navigated?: boolean }, url = X): StepEvent[] {
	const navigation: StepEvent[] =
		at.navigated === false
			? []
			: [
					{ at: 10, kind: "document" },
					{ at: 15, kind: "commit" },
				]
	return [{ at: at.asked, kind: "request", url }, ...navigation, { at: at.warned, kind: "warning", url }]
}

// The old page's teardown: its import of a module it asked for before the navigation, warned between the document's
// start and its commit, is the browser's report of the page being left (BUGS.md 518). The commit itself counts.
it("left behind", () => {
	expect(leftBehind([warned(X), "error: something else"], step({ asked: 5, warned: 12 }))).toEqual([
		"error: something else",
	])
	expect(leftBehind([warned(X)], step({ asked: 5, warned: 15 }))).toEqual([])
})

// Every other module failure is kept: warned before the navigation started, after its commit, in a step with no
// navigation, for a module first asked for after the navigation started (the new document's, a real 404 among them,
// even at the commit), and for another module than the one the old page asked for.
it("kept", () => {
	const cases = [
		step({ asked: 5, warned: 8 }),
		step({ asked: 5, warned: 16 }),
		step({ asked: 5, warned: 12, navigated: false }),
		step({ asked: 11, warned: 15 }),
		[...step({ asked: 5, warned: 12 }, Y), { at: 12, kind: "warning", url: X } as const],
	]
	for (const events of cases) expect(leftBehind([warned(X)], events)).toEqual([warned(X)])
})
