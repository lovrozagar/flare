import { expect, it } from "vitest"
import type { LoaderRun } from "../loaders/run.ts"
import { awaited, NO_TAGS, type Policy } from "./held.ts"

const PRIVATE: Policy = { decision: { policy: "private", cdn: {} }, tags: NO_TAGS }
const PUBLIC: Policy = { decision: { policy: "shared", class: "public", cdn: { maxAge: "1m" } }, tags: NO_TAGS }

// A three-match run whose page deferred `deferred`, with a layout defer kept above it.
function runOf(deferred: Promise<unknown>, headers: LoaderRun["headers"] = {}): LoaderRun {
	const layout = Promise.resolve("layout value")
	return {
		response: new Response(null, { status: 200 }),
		frames: [],
		data: ["root data", "layout data", "page data"],
		heads: [{ title: "root" }, undefined, { title: "page" }],
		contexts: [{}, {}, {}],
		inputs: [],
		bugs: [],
		deferred: [
			{ m: "_root_/(app)", k: "side", promise: layout },
			{ m: "_root_/(app)/p", k: "main", promise: deferred },
		],
		headers,
		security: {},
	}
}

// A private document that streams does not wait: its values follow the shell.
it("streamed private", async () => {
	const pending = new Promise<never>(() => undefined)
	expect(await awaited(runOf(pending), PRIVATE, false)).toEqual(PRIVATE)
})

// "buffer" and a public answer wait for every value. All resolved, the policy stands; one rejected marks the policy, so
// the answer is never stored, and the document renders on: the rejected value paints its <Errored> (BUGS.md 373).
it("held values", async () => {
	expect(await awaited(runOf(Promise.resolve("ok")), PRIVATE, true)).toEqual(PRIVATE)
	const rejected = Promise.reject(new Error("down"))
	expect(await awaited(runOf(rejected), PRIVATE, true)).toEqual({ ...PRIVATE, rejected: true })
	expect(await awaited(runOf(rejected), PUBLIC, false)).toEqual({ ...PUBLIC, rejected: true })
	// A cookie the route sets makes a public decision private, so that answer streams.
	const cookie = runOf(new Promise<never>(() => undefined), { "set-cookie": "a=1" })
	expect(await awaited(cookie, PUBLIC, false)).toEqual(PUBLIC)
})
