import { expect, it } from "vitest"
import { replacing } from "../../shared/head/index.ts"
import type { LoaderRun } from "../loaders/run.ts"
import { definedParams, outletMatches, stateMatches, type Rendered } from "./matches.ts"

const root = { id: "_root_", kind: "layout" as const, module: {} }
const users = { id: "_root_/users/[id]/[[tab]]", kind: "page" as const, module: {} }

// The root kept the raw records. The page's `.input()` replaced both sides.
const inputs = [
	{ params: { id: "7" }, search: { q: "a" }, validated: false },
	{ params: { id: 7 }, search: { q: ["a"] }, validated: true },
]

function run(data: unknown[]): LoaderRun {
	const response = new Response(null)
	const heads = [{ title: "Root" }]
	return {
		response,
		frames: [],
		data,
		heads,
		contexts: [{}],
		inputs,
		bugs: [],
		deferred: [],
		headers: {},
		security: {},
	}
}

it("outlet", () => {
	const rendered: Rendered = { chain: [root, users], run: run(["root", "user"]) }
	expect(outletMatches(rendered)).toEqual([
		{ ...root, params: { id: "7" }, search: { q: "a" }, data: "root", preloader: {} },
		{ ...users, params: { id: 7 }, search: { q: ["a"] }, data: "user", preloader: {} },
	])
	expect(outletMatches({ ...rendered, run: run([]) })).toEqual([])
	expect(definedParams({ a: "1", b: undefined, c: ["x"] })).toEqual({ a: "1", c: ["x"] })
})

it("state", () => {
	const failed = { status: 500, error: new Error("x"), wire: { name: "Error", message: "x", digest: "0123456789ab" } }
	const rendered: Rendered = { chain: [root, users], run: run(["root"]), failed }
	const state = stateMatches(outletMatches(rendered), rendered)
	expect(state).toEqual([
		{
			id: "_root_",
			params: { id: "7" },
			search: { q: "a" },
			data: "root",
			preloader: {},
			head: { title: "Root" },
			error: null,
		},
		{
			id: users.id,
			params: { id: 7 },
			search: { q: ["a"] },
			data: null,
			preloader: null,
			head: null,
			error: failed.wire,
		},
	])
})

// A replacing head's state match says `replace`, so the client merge replaces from hydration on (dx/head.md).
it("state replace", () => {
	const replaced: Rendered = {
		chain: [root, users],
		run: { ...run(["root", "user"]), heads: [{}, replacing({ title: "U" })] },
	}
	expect(stateMatches(outletMatches(replaced), replaced).map((match) => match.replace)).toEqual([undefined, true])
})
