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
