import { expect, it } from "vitest"
import { createTranslations, lookup, translator } from "./translate.ts"

const translations = createTranslations({ en: { hello: "Hi", greet: "Hi {name}" }, hr: { hello: "Bok" } })

it("hit", () => {
	expect(lookup(translations.en, "hello")).toBe("Hi")
	expect(translator(translations.hr, "hr")("hello")).toBe("Bok")
	expect(translator(translations.en, "en")("greet", { name: "Ana" })).toBe("Hi Ana")
	const t = translator(translations.en, "en")
	expect(t.rich("greet", {}, { name: "Ana" })).toEqual(["Hi Ana"])
	expect(t.rich("hello", {})).toEqual(["Hi"])
})

it("miss", () => {
	expect(lookup(translations.en, "nope")).toBe("nope")
	expect(translator(translations.en, "en")("nope")).toBe("nope")
	expect(lookup(undefined, "hello")).toBe("hello")
})

it("proto", () => {
	expect(lookup(translations.en, "__proto__")).toBe("__proto__")
	expect(lookup(translations.en, "toString")).toBe("toString")
	expect(createTranslations({ __proto__: { hello: "x" } }).en).toBeUndefined()
})

it("null proto", () => {
	expect(Object.getPrototypeOf(translations)).toBeNull()
	expect(Object.getPrototypeOf(translations.en)).toBeNull()
	// A plural, select, or selectordinal without an `other` branch is refused when the translations are created.
	expect(() => createTranslations({ en: { items: "{n, plural, one {# item}}" } })).toThrow("en.items: other")
	expect(() => createTranslations({ en: { who: "{g, select, a {A}}" } })).toThrow("en.who: other")
})
