import { describe, expect, it } from "vitest"
import { createTranslations } from "../../../src/i18n/index.ts"

describe("createTranslations", () => {
	it("creates a translations config object", () => {
		const translations = createTranslations({
			common: {
				en: () => Promise.resolve({ default: { hello: "Hello" } }),
				hr: () => Promise.resolve({ default: { hello: "Bok" } }),
			},
		})
		expect(translations).toBeDefined()
		expect(typeof translations.load).toBe("function")
	})

	it("load() resolves namespaced translations", async () => {
		const translations = createTranslations({
			common: {
				en: () => Promise.resolve({ default: { hello: "Hello" } }),
				hr: () => Promise.resolve({ default: { hello: "Bok" } }),
			},
			products: {
				en: () => Promise.resolve({ default: { title: "Products" } }),
				hr: () => Promise.resolve({ default: { title: "Proizvodi" } }),
			},
		})

		const result = await translations.load("en", ["common", "products"])
		expect(result.common.hello).toBe("Hello")
		expect(result.products.title).toBe("Products")
	})

	it("load() resolves single namespace", async () => {
		const translations = createTranslations({
			common: {
				en: () => Promise.resolve({ default: { hello: "Hello" } }),
			},
		})

		const result = await translations.load("en", ["common"])
		expect(result.common.hello).toBe("Hello")
	})

	it("load() throws for missing locale", async () => {
		const translations = createTranslations({
			common: {
				en: () => Promise.resolve({ default: { hello: "Hello" } }),
			},
		})

		await expect(translations.load("fr", ["common"])).rejects.toThrow()
	})

	it("load() handles JSON modules with default export", async () => {
		const translations = createTranslations({
			common: {
				en: () => Promise.resolve({ default: { key: "value" } }),
			},
		})
		const result = await translations.load("en", ["common"])
		expect(result.common.key).toBe("value")
	})

	it("load() handles dynamic fetch loaders (no default wrapper)", async () => {
		const translations = createTranslations({
			common: {
				en: () => Promise.resolve({ greeting: "Hello", title: "App" }),
				hr: () => Promise.resolve({ greeting: "Bok", title: "Aplikacija" }),
			},
		})
		const result = await translations.load("hr", ["common"])
		expect(result.common.greeting).toBe("Bok")
		expect(result.common.title).toBe("Aplikacija")
	})

	it("load() mixes static imports and dynamic fetches", async () => {
		const translations = createTranslations({
			local: {
				en: () => Promise.resolve({ default: { key: "static" } }),
			},
			remote: {
				en: () => Promise.resolve({ key: "dynamic" }),
			},
		})
		const result = await translations.load("en", ["local", "remote"])
		expect(result.local.key).toBe("static")
		expect(result.remote.key).toBe("dynamic")
	})

	it("load() loads multiple namespaces in parallel", async () => {
		const order: string[] = []
		const translations = createTranslations({
			a: {
				en: async () => {
					order.push("a")
					return { default: { x: "1" } }
				},
			},
			b: {
				en: async () => {
					order.push("b")
					return { default: { y: "2" } }
				},
			},
		})

		const result = await translations.load("en", ["a", "b"])
		expect(result.a.x).toBe("1")
		expect(result.b.y).toBe("2")
		expect(order).toContain("a")
		expect(order).toContain("b")
	})
})
