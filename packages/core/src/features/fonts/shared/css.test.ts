import { expect, it } from "vitest"
import { fontFace } from "./css.ts"

it("face", () => {
	expect(fontFace({ family: "Inter", src: "/fonts/inter.woff2", weight: "400", style: "normal" })).toBe(
		'@font-face{font-family:"Inter";src:url("/fonts/inter.woff2") format("woff2");font-weight:400;font-style:normal;font-display:swap}',
	)
})

it("escape family", () => {
	const css = fontFace({ family: '"</style><script>', src: "/f.woff2", weight: "400", style: "normal" })
	expect(css).not.toMatch(/<\/style>/i)
	expect(css).not.toMatch(/<script>/i)
	expect(css).toContain('font-family:"\\22 \\3C /style\\3E \\3C script\\3E "')
})

it("escape url", () => {
	const css = fontFace({ family: "A", src: '/fonts/a)b"c\\d.woff2', weight: "400", style: "normal" })
	expect(css).toContain('src:url("/fonts/a\\29 b\\22 c\\5C d.woff2")')
	expect(() => fontFace({ family: "A", src: "/fonts/../secret.woff2", weight: "400", style: "normal" })).toThrow(
		"a font src may not contain ..",
	)
	// A browser resolves an encoded dot segment as `..` too.
	expect(() => fontFace({ family: "A", src: "/fonts/%2E%2e/secret.woff2", weight: "400", style: "normal" })).toThrow(
		"a font src may not contain ..",
	)
})

it("unicode range", () => {
	const css = fontFace({
		family: "Inter",
		src: "/fonts/inter/latin-100-900.woff2",
		weight: "100 900",
		style: "normal",
		unicodeRange: "U+0000-00FF, U+0131",
	})
	expect(css).toContain("font-weight:100 900;")
	expect(css).toContain("unicode-range:U+0000-00FF, U+0131}")
	expect(() =>
		fontFace({ family: "I", src: "/i.woff2", weight: "400", style: "normal", unicodeRange: "U+00;}body{color:red" }),
	).toThrow('font unicode-range "U+00;}body{color:red" is not valid')
})

it("variable weight", () => {
	const css = fontFace({ family: "Inter", src: "/i.woff2", weight: "100 900", style: "italic" })
	expect(css).toContain("font-style:italic;")
	expect(() => fontFace({ family: "I", src: "/i.woff2", weight: "bold;x", style: "normal" })).toThrow(
		'font weight "bold;x" is not valid',
	)
	expect(() => fontFace({ family: "I", src: "/i.woff2", weight: "400", style: "slanted" })).toThrow(
		'font style "slanted" is not valid',
	)
})
