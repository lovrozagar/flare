import { parseSync } from "oxc-parser"
import { expect, it } from "vitest"
import { dynamicImports, literalSource, NO_SOURCES } from "./env-names.ts"

const sourceOf = (text: string): string | undefined => {
	const [statement] = parseSync("a.ts", `import(${text})`).program.body
	if (statement?.type !== "ExpressionStatement" || statement.expression.type !== "ImportExpression") return "?"
	return literalSource(statement.expression.source)
}

// A module source as written, through parentheses, `as`, `satisfies`, `!`, a type assertion, and a template with no
// expression; one computed at run time is not a source (BUGS.md 461).
it("literal sources", () => {
	for (const text of ['"m"', "`m`", '("m")', '("m" as string)', '("m" satisfies string)', '("m"!)', '(<string>"m")']) {
		expect([text, sourceOf(text)]).toEqual([text, "m"])
	}
	for (const text of ["name", "`${a}`", "1"]) expect([text, sourceOf(text)]).toEqual([text, undefined])
})

// A module parsed as the transform parses it.
const check = (code: string): void =>
	dynamicImports("a.ts", parseSync("a.ts", code, { sourceType: "module" }).program, NO_SOURCES)

// A parenthesized await, or a parenthesized import inside it, destructuring other names builds; a helper's name in it
// fails as the plain form does.
it("parenthesized await", () => {
	expect(() => check('let pending;\nconst { Link } = (await import("@lovrozagar/flare"));\n')).not.toThrow()
	expect(() => check('const { Link } = await (import("@lovrozagar/flare"));\n')).not.toThrow()
	expect(() => check('const { createServerOnlyFn } = (await import("@lovrozagar/flare"));\n')).toThrow(
		"reaches createServerOnlyFn",
	)
})
