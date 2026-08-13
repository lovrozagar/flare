/** @vitest-environment node */
import { describe, expect, it } from "vitest"
import { replaceServerFnConfigs, stripHandlerBodies } from "../../../src/plugins/index.ts"

/**
 * Bug 60: stripHandlerBodies paren-depth ignores string literals
 *
 * The paren depth tracking doesn't skip parens inside string literals.
 * A handler body containing ")" in a string causes premature match,
 * producing malformed JS output with stray fragments.
 */

describe("Bug 60: stripHandlerBodies with strings containing parens", () => {
	it("should not produce stray fragments from string containing close paren", () => {
		const code =
			'const fn = createServerFn({ name: "x" }).handler((ctx) => { return "hello) world" })'
		const result = stripHandlerBodies(code)

		/* Bug: the ) inside "hello) world" breaks paren tracking, leaving stray ` world" })` */
		expect(result).not.toContain("world")
	})

	it("should not produce stray fragments from template literal with parens", () => {
		const code = 'const fn = createServerFn({ name: "x" }).handler((ctx) => { return `val)ue` })'
		const result = stripHandlerBodies(code)

		/* Bug: `)` inside template literal breaks tracking, leaving stray `ue\` })` */
		expect(result).not.toContain("ue`")
	})

	it("should not produce stray fragments from stream with string parens", () => {
		const code =
			'const fn = createServerFn({ name: "x" }).stream(async function*(ctx) { yield "before)after" })'
		const result = stripHandlerBodies(code)

		/* Bug: `)` inside string literal breaks tracking, leaving stray `after" })` */
		expect(result).not.toContain("after")
	})

	it("should not produce stray fragments from nested strings with parens", () => {
		const code =
			'const fn = createServerFn({ name: "x" }).handler((ctx) => { return foo("a)", "b)xyz") })'
		const result = stripHandlerBodies(code)

		/* Bug: `)` inside "b)xyz" breaks tracking, leaving stray `xyz") })` */
		expect(result).not.toContain("xyz")
	})

	it("should still work for simple handler bodies without strings", () => {
		const code = 'const fn = createServerFn({ name: "x" }).handler((ctx) => { return ctx.input })'
		const result = stripHandlerBodies(code)

		expect(result).not.toContain("ctx.input")
		expect(result).toContain("Server function called on client")
	})
})

/**
 * Bug 61: SERVER_FN_RE regex fails on nested braces
 *
 * The old regex /createServerFn\(\{([^}]*)\}\)/g used [^}]* which
 * stops at the first }. Nested config objects like { meta: { foo: 1 } }
 * would fail to match entirely.
 */
describe("Bug 61: replaceServerFnConfigs with nested braces", () => {
	it("should handle nested config objects", () => {
		const code = 'createServerFn({ name: "x", meta: { foo: 1 } })'
		const result = replaceServerFnConfigs(code, (content) => ` __id: "abc",${content}`)

		expect(result).toContain('__id: "abc"')
		expect(result).toContain("meta: { foo: 1 }")
	})

	it("should handle deeply nested config objects", () => {
		const code = 'createServerFn({ name: "x", deep: { a: { b: 2 } } })'
		const result = replaceServerFnConfigs(code, (content) => ` __id: "abc",${content}`)

		expect(result).toContain('__id: "abc"')
		expect(result).toContain("deep: { a: { b: 2 } }")
	})

	it("should handle config with string containing braces", () => {
		const code = 'createServerFn({ name: "x{y}z" })'
		const result = replaceServerFnConfigs(code, (content) => ` __id: "abc",${content}`)

		expect(result).toContain('__id: "abc"')
		expect(result).toContain('name: "x{y}z"')
	})

	it("should handle multiple createServerFn calls", () => {
		const code = 'createServerFn({ name: "a" }); createServerFn({ name: "b", nested: { x: 1 } })'
		const result = replaceServerFnConfigs(code, (content) => ` __id: "id",${content}`)

		expect(result.match(/__id: "id"/g)?.length).toBe(2)
	})
})
