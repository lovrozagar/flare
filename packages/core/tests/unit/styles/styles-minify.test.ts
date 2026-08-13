import { afterEach, describe, expect, it } from "vitest"
import { clearScopedStyles, getScopedStyles, registerCSSByName, styles } from "../../../src/styles/index.ts"

afterEach(() => {
	clearScopedStyles()
})

describe("CSS minification", () => {
	it("collapses whitespace in declarations", () => {
		styles("m1", "  padding:   1rem;   margin:  2rem  ")
		const css = getScopedStyles()
		expect(css).not.toMatch(/  /)
		expect(css).toContain("padding:1rem")
		expect(css).toContain("margin:2rem")
	})

	it("removes newlines from output", () => {
		styles(
			"m2",
			`
			color: red;
			font-size: 16px;
		`,
		)
		const css = getScopedStyles()
		expect(css).not.toContain("\n")
	})

	it("removes CSS comments", () => {
		styles("m3", "/* this is a comment */ color: red; /* another */")
		const css = getScopedStyles()
		expect(css).not.toContain("/*")
		expect(css).not.toContain("*/")
		expect(css).toContain("color:red")
	})

	it("strips trailing semicolons before closing brace", () => {
		styles("m4", "color: red; padding: 1rem;")
		const css = getScopedStyles()
		/* last declaration should not have trailing semicolon before } */
		expect(css).toMatch(/1rem\s*}/)
		expect(css).not.toMatch(/;\s*}/)
	})

	it("minifies @media rules", () => {
		styles("m5", "@media (min-width: 768px) { padding: 2rem; }")
		const css = getScopedStyles()
		expect(css).not.toMatch(/  /)
		expect(css).toContain("@media (min-width: 768px)")
		expect(css).toContain("padding:2rem")
	})

	it("minifies @keyframes pass-through", () => {
		styles(
			"m6",
			"@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }",
		)
		const css = getScopedStyles()
		expect(css).not.toMatch(/  /)
		expect(css).toContain("@keyframes spin")
		expect(css).toContain("rotate(0deg)")
		expect(css).toContain("rotate(360deg)")
	})

	it("minifies & selector rules", () => {
		styles("m7", "&:hover { color: blue; padding: 4px; }")
		const css = getScopedStyles()
		expect(css).not.toMatch(/  /)
		expect(css).toContain("color:blue")
	})

	it("minifies css function output", () => {
		styles("m8", {
			css: (s) => `
				background: gray;
				${s.active(true)} {
					background: blue;
				}
			`,
			state: { active: true },
		})
		const css = getScopedStyles()
		expect(css).not.toContain("\n")
		expect(css).toContain("background:gray")
		expect(css).toContain("background:blue")
	})

	it("preserves content inside url()", () => {
		styles("m9", 'background: url("https://example.com/image.png"); color: red;')
		const css = getScopedStyles()
		expect(css).toContain('url("https://example.com/image.png")')
		expect(css).toContain("color:red")
	})

	it("preserves content inside quoted strings", () => {
		styles("m10", 'content: "  hello  world  "; color: red;')
		const css = getScopedStyles()
		expect(css).toContain('"  hello  world  "')
		expect(css).toContain("color:red")
	})

	it("handles multiple rules efficiently", () => {
		registerCSSByName("a", "color: red;")
		registerCSSByName("b", "color: blue;")
		registerCSSByName("c", "color: green;")
		const css = getScopedStyles()
		/* no newlines between rules — single line or minimal separators */
		const lines = css.split("\n").filter(Boolean)
		expect(lines.length).toBeLessThanOrEqual(1)
	})

	it("collapses space around colons in declarations", () => {
		styles("m11", "color : red ; padding : 4px ;")
		const css = getScopedStyles()
		expect(css).toContain("color:red")
		expect(css).toContain("padding:4px")
	})
})
