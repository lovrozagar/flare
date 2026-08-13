import { afterEach, describe, expect, it } from "vitest"
import { clearScopedStyles, cn } from "../../../src/styles/index.ts"

afterEach(() => {
	clearScopedStyles()
})

describe("cn — plain strings", () => {
	it("single string → returned as-is", () => {
		expect(cn("foo")).toBe("foo")
	})

	it("multiple strings → space-joined", () => {
		expect(cn("foo", "bar", "baz")).toBe("foo bar baz")
	})

	it("trims individual strings", () => {
		expect(cn("  foo  ", "bar")).toBe("foo bar")
	})
})

describe("cn — falsy values", () => {
	it("false filtered out", () => {
		expect(cn("foo", false, "bar")).toBe("foo bar")
	})

	it("null filtered out", () => {
		expect(cn("foo", null, "bar")).toBe("foo bar")
	})

	it("undefined filtered out", () => {
		expect(cn("foo", undefined, "bar")).toBe("foo bar")
	})

	it("empty string filtered out", () => {
		expect(cn("foo", "", "bar")).toBe("foo bar")
	})

	it("all falsy → empty string", () => {
		expect(cn(false, null, undefined)).toBe("")
	})
})

describe("cn — object map", () => {
	it("truthy values → key included", () => {
		expect(cn({ active: true, disabled: false })).toBe("active")
	})

	it("all false → empty string", () => {
		expect(cn({ a: false, b: false })).toBe("")
	})

	it("mixed truthy → only truthy keys", () => {
		expect(cn({ bar: false, baz: true, foo: true })).toBe("baz foo")
	})
})

describe("cn — nested arrays", () => {
	it("flat array → flattened", () => {
		expect(cn(["foo", "bar"])).toBe("foo bar")
	})

	it("nested arrays → recursively flattened", () => {
		expect(cn(["foo", ["bar", ["baz"]]])).toBe("foo bar baz")
	})

	it("array with falsy → filtered", () => {
		expect(cn(["foo", false, null, "bar"])).toBe("foo bar")
	})
})

describe("cn — deduplication", () => {
	it("duplicate class names → deduplicated", () => {
		expect(cn("a", "a")).toBe("a")
	})

	it("same class in nested array → dedup", () => {
		expect(cn("a", ["a", "b"])).toBe("a b")
	})

	it("order: first occurrence wins in output", () => {
		const result = cn("a", "b", "a")
		expect(result).toBe("a b")
	})
})

describe("cn — mixed inputs", () => {
	it("strings + objects + arrays all combine correctly", () => {
		const result = cn("base", { active: true, hidden: false }, ["extra", false])
		expect(result).toBe("base active extra")
	})

	it("empty inputs → empty string (no leading/trailing whitespace)", () => {
		expect(cn()).toBe("")
		expect(cn("")).toBe("")
	})
})
