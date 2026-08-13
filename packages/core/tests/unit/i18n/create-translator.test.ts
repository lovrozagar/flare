import { describe, expect, it } from "vitest"
import { createTranslator } from "../../../src/i18n/index.ts"

describe("createTranslator", () => {
	const loaded = {
		common: {
			"app.name": "My App",
			greeting: "Hello {name}",
		},
		products: {
			count: "{count, plural, one{# product} other{# products}}",
			title: "Products",
		},
	}

	describe("t() — string translation", () => {
		it("resolves namespaced key", () => {
			const t = createTranslator(loaded)
			expect(t("common.app.name")).toBe("My App")
		})

		it("resolves key with interpolation", () => {
			const t = createTranslator(loaded)
			expect(t("common.greeting", { name: "World" })).toBe("Hello World")
		})

		it("resolves plural", () => {
			const t = createTranslator(loaded)
			expect(t("products.count", { count: 1 })).toBe("1 product")
			expect(t("products.count", { count: 5 })).toBe("5 products")
		})

		it("returns key as fallback for missing translation", () => {
			const t = createTranslator(loaded)
			/* @ts-expect-error — testing runtime fallback for invalid key */
			expect(t("common.missing.key")).toBe("common.missing.key")
		})

		it("returns key as fallback for missing namespace", () => {
			const t = createTranslator(loaded)
			/* @ts-expect-error — testing runtime fallback for invalid namespace */
			expect(t("auth.login")).toBe("auth.login")
		})
	})

	describe("t.rich() — JSX interpolation", () => {
		it("returns JSX with component interpolation", () => {
			const richLoaded = {
				common: {
					terms: "Accept our [[link:terms and conditions]]",
				},
			}
			const t = createTranslator(richLoaded)
			const result = t.rich("common.terms", {
				link: (children) => `<a>${children}</a>`,
			})
			expect(result).toBeDefined()
		})

		it("returns key as fallback for missing rich translation", () => {
			const t = createTranslator(loaded)
			/* @ts-expect-error — testing runtime fallback for invalid key */
			const result = t.rich("common.nonexistent", {
				link: (c) => c,
			})
			expect(result).toBe("common.nonexistent")
		})
	})

	describe("namespace flattening", () => {
		it("flattens nested namespace into dot-separated keys", () => {
			const t = createTranslator({
				ns: {
					"deep.key": "value",
				},
			})
			expect(t("ns.deep.key")).toBe("value")
		})

		it("handles single namespace", () => {
			const t = createTranslator({
				only: {
					key: "val",
				},
			})
			expect(t("only.key")).toBe("val")
		})

		it("handles empty loaded object", () => {
			const t = createTranslator({})
			/* @ts-expect-error — testing runtime fallback with empty translations */
			expect(t("any.key")).toBe("any.key")
		})
	})
})
