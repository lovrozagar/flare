import { describe, expect, it } from "vitest"
import { formatMessage } from "../../../src/i18n/index.ts"

describe("formatMessage", () => {
	describe("simple interpolation", () => {
		it("replaces {name} with value", () => {
			expect(formatMessage("Hello {name}", { name: "World" })).toBe("Hello World")
		})

		it("replaces multiple variables", () => {
			expect(formatMessage("{greeting} {name}", { greeting: "Hi", name: "User" })).toBe("Hi User")
		})

		it("missing variable returns key placeholder", () => {
			expect(formatMessage("Hello {name}")).toBe("Hello {name}")
		})

		it("no variables returns string as-is", () => {
			expect(formatMessage("Hello World")).toBe("Hello World")
		})

		it("empty string returns empty string", () => {
			expect(formatMessage("")).toBe("")
		})
	})

	describe("plural", () => {
		it("=0 exact match", () => {
			const msg = "{count, plural, =0{no items} one{# item} other{# items}}"
			expect(formatMessage(msg, { count: 0 })).toBe("no items")
		})

		it("one category", () => {
			const msg = "{count, plural, =0{no items} one{# item} other{# items}}"
			expect(formatMessage(msg, { count: 1 })).toBe("1 item")
		})

		it("other category", () => {
			const msg = "{count, plural, =0{no items} one{# item} other{# items}}"
			expect(formatMessage(msg, { count: 5 })).toBe("5 items")
		})

		it("# replaced with number value", () => {
			const msg = "{n, plural, one{# thing} other{# things}}"
			expect(formatMessage(msg, { n: 42 })).toBe("42 things")
		})

		it("falls back to other when category missing", () => {
			const msg = "{count, plural, other{# items}}"
			expect(formatMessage(msg, { count: 1 })).toBe("1 items")
		})
	})

	describe("select", () => {
		it("matches exact category", () => {
			const msg = "{gender, select, male{He} female{She} other{They}}"
			expect(formatMessage(msg, { gender: "male" })).toBe("He")
			expect(formatMessage(msg, { gender: "female" })).toBe("She")
		})

		it("falls back to other", () => {
			const msg = "{gender, select, male{He} female{She} other{They}}"
			expect(formatMessage(msg, { gender: "nonbinary" })).toBe("They")
		})

		it("missing value falls back to other", () => {
			const msg = "{role, select, admin{Admin} other{User}}"
			expect(formatMessage(msg)).toBe("User")
		})
	})

	describe("number formatting", () => {
		it("{price, number} formats number", () => {
			const result = formatMessage("{price, number}", { price: 1234.5 }, "en")
			expect(result).toContain("1")
			expect(result).toContain("234")
		})
	})

	describe("nested/combined", () => {
		it("interpolation inside plural", () => {
			const msg = "{count, plural, one{{name} has # item} other{{name} has # items}}"
			expect(formatMessage(msg, { count: 3, name: "Alice" })).toBe("Alice has 3 items")
		})
	})

	describe("edge cases", () => {
		it("unmatched braces returned as-is", () => {
			expect(formatMessage("open { brace")).toBe("open { brace")
		})

		it("escaped content handled gracefully", () => {
			expect(formatMessage("no vars here")).toBe("no vars here")
		})
	})
})
