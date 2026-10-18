import { expect, expectTypeOf, it } from "vitest"
import { createPathSegment } from "./segment.ts"

const cdn = { cdn: { maxAge: "1m" } }

it("identity render", () => {
	expect(createPathSegment("_root_/seg").render({ children: "child" })).toBe("child")
})

it("cache only", () => {
	expect(createPathSegment("_root_/seg").cache(cdn).cache).toEqual(cdn)
})

it("no loader", () => {
	expect(Object.keys(createPathSegment("_root_/seg"))).not.toContain("loader")
})

// A segment is a route module too: its record names its kind and its id is a literal (dx/types.md `segment no data`).
it("typed record", () => {
	const record = createPathSegment("_root_/seg").cache(cdn)
	expect(record._type).toBe("segment")
	expectTypeOf(record._type).toEqualTypeOf<"segment">()
	expectTypeOf(record.id).toEqualTypeOf<"_root_/seg">()
	expectTypeOf(createPathSegment("_root_/seg")).not.toHaveProperty("loader")
})

// A segment with no `cdn` default is exported bare, and it names its kind as the cached record does: every builder's
// export carries `_type` (dx/types.md, BUGS.md 353).
it("bare kind", () => {
	const bare = createPathSegment("_root_/seg")
	expect(bare._type).toBe("segment")
	expectTypeOf(bare._type).toEqualTypeOf<"segment">()
})
