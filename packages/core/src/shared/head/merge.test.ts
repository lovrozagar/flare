import { expect, it } from "vitest"
import { isReplacing, mergeHead, replacing } from "./merge.ts"
import { headTags } from "./tags.ts"

it("replace", () => {
	const parent = { title: "P", images: [{ url: "/p.png" }], meta: { author: "P" } }
	expect(mergeHead(parent, { title: "C" }, true)).toEqual({ title: "C" })
	const merged = mergeHead(parent, { images: [{ url: "/c.png" }], meta: { author: "C" } })
	expect(merged.title).toBe("P")
	expect(merged.images).toEqual([{ url: "/p.png" }, { url: "/c.png" }])
	expect(merged.meta).toEqual({ author: "C" })
})

it("empty records", () => {
	const merged = mergeHead({ title: "Root" }, { description: "D" })
	expect(merged.openGraph).toBeUndefined()
	expect(mergeHead({ robots: {} }, {}).robots).toEqual({})
	expect(headTags(merged).map((tag) => tag.key)).toEqual(["title", "meta:description:0"])
})

// A replacing head is marked on a copy, the mark survives the object, and JSON does not carry it.
it("replacing mark", () => {
	const head = { title: "R" }
	const marked = replacing(head)
	expect(isReplacing(marked)).toBe(true)
	expect(isReplacing(head)).toBe(false)
	expect(marked).toEqual(head)
	expect(JSON.stringify(marked)).toBe('{"title":"R"}')
})

// A child title of `null`, `undefined`, or `""` keeps the parent's: none of them is a title (dx/head.md, BUGS.md 447).
it("empty child title", () => {
	for (const title of [null, undefined, ""]) {
		expect(mergeHead({ title: "Parent" }, { title: title as unknown as string }).title).toBe("Parent")
	}
})

// An own `undefined` in a shallow-merged record keeps the parent's key, as a top-level `undefined` does (BUGS.md 448).
it("undefined record key", () => {
	expect(mergeHead({ meta: { viewport: "width=500" } }, { meta: { viewport: undefined } }).meta).toEqual({
		viewport: "width=500",
	})
	expect(mergeHead({ robots: { index: false } }, { robots: { index: undefined } }).robots).toEqual({ index: false })
	expect(mergeHead({ openGraph: { title: "P" } }, { openGraph: { title: undefined } }).openGraph).toEqual({
		title: "P",
	})
})
