import { expect, it } from "vitest"
import { replacing } from "../../shared/head/index.ts"
import { dataFrames, skippedRoutes, type DataMatch } from "./data.ts"

const matches: DataMatch[] = [
	{ route: "_root_", id: "id=7&", layout: true },
	{ route: "_root_/users/[id]", id: "id=7&", layout: false },
]

const run = {
	frames: [
		{ t: "l", m: "_root_", d: "root data" },
		{ t: "l", m: "_root_/users/[id]", d: "user" },
	] as const,
	heads: [{ title: "Root" }, { title: "User" }],
	contexts: [{}, {}],
	inputs: [
		{ params: { id: "7" }, search: {}, validated: false },
		{ params: { id: "7" }, search: {}, validated: false },
	],
}

it("all matches", () => {
	const skipped = skippedRoutes(matches, null)
	expect(skipped).toEqual(new Set())
	expect(dataFrames(run, skipped).loaded).toEqual(run.frames)
})

it("page stale", () => {
	const skipped = skippedRoutes(matches, "id=7&")
	expect(skipped).toEqual(new Set(["_root_/users/[id]"]))
	expect(dataFrames(run, skipped).loaded).toEqual([{ t: "l", m: "_root_", d: "root data" }])
})

it("skipped head", () => {
	expect(dataFrames(run, skippedRoutes(matches, "id=7&")).heads).toEqual([
		{ t: "h", m: "_root_", d: { title: "Root" } },
	])
	const failed = {
		frames: [run.frames[0], { t: "e", m: "_root_/users/[id]", e: new Error("x") }] as const,
		heads: [undefined],
		contexts: [{}],
		inputs: run.inputs,
	}
	expect(dataFrames(failed, new Set())).toEqual({ loaded: failed.frames, heads: [] })
})

it("preloader", () => {
	const carried = { ...run, contexts: [{}, { role: "admin" }] }
	expect(dataFrames(carried, new Set()).loaded).toEqual([run.frames[0], { ...run.frames[1], p: { role: "admin" } }])
})

it("input output", () => {
	const inputs = [run.inputs[0], { params: { id: 7 }, search: { page: 2 }, validated: true }]
	expect(dataFrames({ ...run, inputs }, new Set()).loaded).toEqual([
		run.frames[0],
		{ ...run.frames[1], v: { params: { id: 7 }, search: { page: 2 } } },
	])
})

// A replacing head's `h` frame carries `r` (dx/head.md).
it("replacing head", () => {
	const replaced = { ...run, heads: [{ title: "Root" }, replacing({ title: "User" })] }
	expect(dataFrames(replaced, new Set()).heads).toEqual([
		{ t: "h", m: "_root_", d: { title: "Root" } },
		{ t: "h", m: "_root_/users/[id]", d: { title: "User" }, r: true },
	])
})
