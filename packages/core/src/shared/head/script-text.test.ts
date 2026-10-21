import { expect, it } from "vitest"
import { headTags } from "./tags.ts"
import { keepOpen } from "./script-text.ts"

// A custom script's text as headTags writes it, by its `type`.
const written = (type: string | undefined): string => {
	const [tag] = headTags({
		custom: { scripts: [{ children: '{"a":"<!--x"}', ...(type === undefined ? {} : { type }) }] },
	})
	return String(tag?.props["children"])
}

// JavaScript, by its type as HTML reads it: `<!--` becomes `<\x21--`, which still reads as `<!--` (BUGS.md 427).
it("js types", () => {
	for (const type of [undefined, "", "module", "text/javascript", "Application/JavaScript", " text/ecmascript "])
		expect(written(type)).toBe('{"a":"<\\x21--x"}')
})

// JSON, as a JSON parser reads it: `\u003c!--`, which JSON.parse reads back exactly (BUGS.md 427).
it("json types", () => {
	for (const type of [
		"application/json",
		"application/ld+json",
		"application/manifest+json; charset=utf-8",
		"importmap",
		"speculationrules",
	]) {
		expect(written(type)).toBe('{"a":"\\u003c!--x"}')
		expect(JSON.parse(written(type))).toEqual({ a: "<!--x" })
	}
})

// Any other type is a data block whose syntax Flare cannot escape: `<!--` in it throws, naming the type, and text
// without it is written as given. A style keeps `<!--`: CSS reads it as a comment token, and no style state follows.
it("data types", () => {
	expect(() => written("text/html")).toThrow('head script type "text/html" holds "<!--"')
	expect(() => written("text/javascript; charset=utf-8")).toThrow("holds")
	expect(keepOpen("<p>x</p>", "script", "text/html")).toBe("<p>x</p>")
	expect(keepOpen("a{}<!--", "style")).toBe("a{}<!--")
})
