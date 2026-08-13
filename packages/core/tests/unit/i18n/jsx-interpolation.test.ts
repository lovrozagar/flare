import { describe, expect, it } from "vitest"
import { parseRichText } from "../../../src/i18n/jsx.tsx"

describe("parseRichText", () => {
	it("returns plain string when no components", () => {
		const result = parseRichText("Hello World", {})
		expect(result).toEqual(["Hello World"])
	})

	it("parses [[component:content]] syntax", () => {
		const result = parseRichText("Accept [[link:terms]]", {
			link: (children: string) => `<a>${children}</a>`,
		})
		expect(result).toHaveLength(2)
		expect(result[0]).toBe("Accept ")
		expect(result[1]).toBe("<a>terms</a>")
	})

	it("handles multiple components", () => {
		const result = parseRichText("Click [[bold:here]] or [[link:there]]", {
			bold: (children: string) => `<b>${children}</b>`,
			link: (children: string) => `<a>${children}</a>`,
		})
		expect(result).toHaveLength(4)
		expect(result[0]).toBe("Click ")
		expect(result[1]).toBe("<b>here</b>")
		expect(result[2]).toBe(" or ")
		expect(result[3]).toBe("<a>there</a>")
	})

	it("unknown component name returns raw content", () => {
		const result = parseRichText("See [[unknown:stuff]]", {})
		expect(result).toHaveLength(2)
		expect(result[0]).toBe("See ")
		expect(result[1]).toBe("stuff")
	})

	it("empty content works", () => {
		const result = parseRichText("", {})
		expect(result).toEqual([""])
	})

	it("no component markers returns single-element array", () => {
		const result = parseRichText("Just plain text", {})
		expect(result).toEqual(["Just plain text"])
	})

	it("adjacent components with no gap", () => {
		const result = parseRichText("[[a:X]][[b:Y]]", {
			a: (c: string) => `(${c})`,
			b: (c: string) => `[${c}]`,
		})
		expect(result).toHaveLength(4)
		expect(result[0]).toBe("")
		expect(result[1]).toBe("(X)")
		expect(result[2]).toBe("")
		expect(result[3]).toBe("[Y]")
	})
})
