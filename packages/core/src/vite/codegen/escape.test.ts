import { expect, it } from "vitest"
import { codeLiteral, escapeSource } from "./escape.ts"

it("quote in a path", () => {
	const name = 'say-"hi".tsx'
	const source = `const path = "${escapeSource(name)}";`
	expect(Function(`${source} return path;`)()).toBe(name)
})

it("backslash", () => {
	const segment = "a\\b"
	const escaped = escapeSource(segment)
	expect(escaped.includes("\b")).toBe(false)
	expect(Function(`return "${escaped}"`)()).toBe(segment)
})

// A newline, U+2028, U+2029, and `</script` are written escaped and read back exactly (BUGS.md 165).
it("hostile text", () => {
	const value = "a\nb\u2028c\u2029d</script>e"
	const literal = codeLiteral(value)
	expect(literal).not.toMatch(/[\n\u2028\u2029]/u)
	expect(literal).not.toContain("</")
	expect(Function(`return ${literal}`)()).toBe(value)
	expect(Function(`return "${escapeSource(value)}"`)()).toBe(value)
	expect(Function(`return ${codeLiteral({ to: "</x\u2028" })}`)()).toEqual({ to: "</x\u2028" })
})
