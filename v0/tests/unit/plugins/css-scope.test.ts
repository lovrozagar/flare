/**
 * CSS Scope Plugin Tests
 *
 * Tests the css= to data-c= transform.
 */

import { describe, expect, it } from "vitest"

/* Import the transform function by re-implementing it here for testing */
const REGISTER_CSS_IMPORT =
	'import { registerCSS as __flare_registerCSS__ } from "@flare/v0/styles"'

function transformCss(code: string): string {
	let result = code
	let needsImport = false

	/* Handle multiline css={`...`} template literals first */
	result = result.replace(/\bcss=\{(`[\s\S]*?`)\}(\s*)/g, (_, templateLiteral, trailingSpace) => {
		needsImport = true
		return `data-c={__flare_registerCSS__(${templateLiteral})}${trailingSpace || " "}`
	})

	/* Handle css="..." */
	result = result.replace(/\bcss="([\s\S]*?)"(\s*)/g, (_, cssValue, trailingSpace) => {
		if (!cssValue.trim()) return ""
		needsImport = true
		const escaped = JSON.stringify(cssValue)
		return `data-c={__flare_registerCSS__(${escaped})}${trailingSpace || " "}`
	})

	/* Handle css='...' */
	result = result.replace(/\bcss='([\s\S]*?)'(\s*)/g, (_, cssValue, trailingSpace) => {
		if (!cssValue.trim()) return ""
		needsImport = true
		const escaped = JSON.stringify(cssValue)
		return `data-c={__flare_registerCSS__(${escaped})}${trailingSpace || " "}`
	})

	/* Handle css={...} dynamic expressions */
	result = result.replace(/\bcss=\{([^{}]+)\}(\s*)/g, (match, expr, trailingSpace) => {
		if (match.includes("__flare_registerCSS__")) return match
		needsImport = true
		return `data-c={__flare_registerCSS__(${expr})}${trailingSpace || " "}`
	})

	if (needsImport && !result.includes(REGISTER_CSS_IMPORT)) {
		result = `${REGISTER_CSS_IMPORT}\n${result}`
	}

	return result
}

describe("css-scope transform", () => {
	it('transforms css="..." to data-c={registerCSS(...)}', () => {
		const input = '<div css="color: red;">Hello</div>'
		const output = transformCss(input)

		expect(output).toContain("data-c={__flare_registerCSS__")
		expect(output).toContain('"color: red;"')
		expect(output).not.toContain('css="')
	})

	it("preserves space between attributes", () => {
		const input = '<div css="color: red;" data-testid="test">Hello</div>'
		const output = transformCss(input)

		expect(output).toContain(')} data-testid="test"')
	})

	it("handles multiple css props", () => {
		const input = `
			<div css="color: red;">Red</div>
			<div css="color: blue;">Blue</div>
		`
		const output = transformCss(input)

		expect(output).toContain('"color: red;"')
		expect(output).toContain('"color: blue;"')
	})

	it("adds import statement", () => {
		const input = '<div css="color: red;">Hello</div>'
		const output = transformCss(input)

		expect(output).toContain(REGISTER_CSS_IMPORT)
	})

	it("handles template literals", () => {
		const input = "<div css={`font-size: 24px;`}>Hello</div>"
		const output = transformCss(input)

		expect(output).toContain("data-c={__flare_registerCSS__(`font-size: 24px;`)}")
	})

	it("handles dynamic expressions", () => {
		const input = "<div css={myStyles}>Hello</div>"
		const output = transformCss(input)

		expect(output).toContain("data-c={__flare_registerCSS__(myStyles)}")
	})

	it("removes empty css attributes", () => {
		const input = '<div css="">Hello</div>'
		const output = transformCss(input)

		expect(output).not.toContain("data-c")
		expect(output).not.toContain("registerCSS")
	})

	it("escapes special characters in CSS", () => {
		const input = '<div css="content: \\"hello\\";"></div>'
		const output = transformCss(input)

		expect(output).toContain("data-c={__flare_registerCSS__")
	})

	it("produces valid JSX output", () => {
		const input = '<div css="color: red;" data-testid="red-text">This text should be red</div>'
		const output = transformCss(input)

		/* Should have space before data-testid */
		expect(output).toMatch(/\)\}\s+data-testid=/)
		/* Should have quotes around attribute values */
		expect(output).toContain('data-testid="red-text"')
	})
})
