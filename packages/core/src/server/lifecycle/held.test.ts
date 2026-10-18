import { expect, it } from "vitest"
import type { LoaderRun } from "../loaders/run.ts"
import { awaited, rejectedRun, type Policy } from "./held.ts"

const PRIVATE: Policy = { decision: { policy: "private", cdn: {} }, params: {} }
const PUBLIC: Policy = { decision: { policy: "shared", class: "public", cdn: { maxAge: "1m" } }, params: {} }

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

const CHAIN = [{ id: "_root_" }, { id: "_root_/(app)" }, { id: "_root_/(app)/p" }]

// A private document that streams does not wait: its values follow the shell.
it("streamed private", async () => {
	const pending = new Promise<never>(() => undefined)
	expect(await awaited(runOf(pending), PRIVATE, false)).toEqual({ policy: PRIVATE })
})

// "buffer" and a public answer wait for every value. All resolved, the policy stands; one rejected marks the policy
// and names the match that deferred it and its error (BUGS.md 370).
it("held values", async () => {
	expect(await awaited(runOf(Promise.resolve("ok")), PRIVATE, true)).toEqual({ policy: PRIVATE })
	const error = new Error("down")
	const rejected = Promise.reject(error)
	expect(await awaited(runOf(rejected), PRIVATE, true)).toEqual({
		policy: { ...PRIVATE, rejected: true },
		rejected: { m: "_root_/(app)/p", error },
	})
	expect(await awaited(runOf(rejected), PUBLIC, false)).toMatchObject({ rejected: { m: "_root_/(app)/p" } })
	// A cookie the route sets makes a public decision private, so that answer streams.
	const cookie = runOf(new Promise<never>(() => undefined), { "set-cookie": "a=1" })
	expect(await awaited(cookie, PUBLIC, false)).toEqual({ policy: PUBLIC })
})

// The rejecting match fails as a throwing loader does: a 500, its own data and those below it gone, and only the
// defers above it kept.
it("rejected run", async () => {
	const error = new Error("down")
	const run = runOf(Promise.resolve("ok"))
	const failed = rejectedRun(run, CHAIN, { m: "_root_/(app)/p", error })
	expect(failed.response.status).toBe(500)
	expect(failed.data).toEqual(["root data", "layout data"])
	expect(failed.heads).toEqual([{ title: "root" }, undefined])
	expect(failed.contexts).toHaveLength(2)
	expect(failed.failed).toEqual({ m: "_root_/(app)/p", status: 500, boundary: "errorRender", error })
	expect(failed.deferred.map((entry) => entry.k)).toEqual(["side"])
	const atLayout = rejectedRun(run, CHAIN, { m: "_root_/(app)", error })
	expect(atLayout.data).toEqual(["root data"])
	expect(atLayout.deferred).toEqual([])
})
