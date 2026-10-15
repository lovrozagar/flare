import { parseSync, type Expression } from "oxc-parser"
import { expect, it } from "vitest"
import { literalValue, requireLiteral } from "./literals.ts"

// The expression a `const value = …` declaration holds.
function expression(source: string): Expression {
	const statement = parseSync("t.ts", `const value = ${source};`).program.body[0]
	if (statement.type !== "VariableDeclaration") throw new Error("not a declaration")
	const init = statement.declarations[0].init
	if (init === null) throw new Error("no init")
	return init
}

it("literal cache", () => {
	expect(requireLiteral("a.ts", "cache", expression('{ ssr: { staleTime: "1s" } }'))).toEqual({
		ssr: { staleTime: "1s" },
	})
	const kinds = '{ a: "s", "b": 1, c: true, d: null, e: -2, f: `t`, g: [1, "x"], 3: { h: {} } }'
	expect(literalValue(expression(kinds))).toEqual({
		ok: true,
		value: { a: "s", b: 1, c: true, d: null, e: -2, f: "t", g: [1, "x"], 3: { h: {} } },
	})
})

it("spread", () => {
	expect(() => requireLiteral("a.ts", "cache", expression("{ ...base }"))).toThrow(
		"a.ts: cache takes a literal object. Spreads, identifiers, and calls are not read at build time",
	)
	for (const source of [
		"sharedConfig",
		"{ ssr }",
		"{ [key]: 1 }",
		"{ ttl() {} }",
		"{ ttl: `${a}` }",
		"{ ttl: /x/ }",
		"{ ttl: 1n }",
		"{ 1n: 1 }",
		'{ ttl: -"x" }',
		"{ ttl: -x }",
		"{ ttl: !1 }",
		"[...list]",
		"[1, , 2]",
		"make()",
	]) {
		expect(literalValue(expression(source))).toEqual({ ok: false })
	}
	expect(() => requireLiteral("a.ts", "cache", undefined)).toThrow(/cache takes a literal/)
})
