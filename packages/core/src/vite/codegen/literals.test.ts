import { parseSync, type Expression, type Program } from "oxc-parser"
import { expect, it } from "vitest"
import { constInits, inputSides, keyName, unwrapped } from "./literals.ts"

function program(source: string): Program {
	return parseSync("a.ts", source).program
}

// The argument list of the first `.input(…)` in the source, with the module's consts.
function sides(source: string) {
	const parsed = program(source)
	const inits = constInits(parsed)
	const route = inits.get("route")
	if (route?.type !== "CallExpression") throw new Error("the source needs `const route = x.input(…)`")
	return inputSides(route.arguments, inits)
}

it("const inits", () => {
	const inits = constInits(program("export const a = 1\nconst b = a\nlet c = 2\nconst { d } = e\nconst f = 3, g = f"))
	expect([...inits.keys()]).toEqual(["a", "b", "f", "g"])
})

// The initializer of `const x = SOURCE`.
function init(source: string): Expression {
	const found = constInits(program(`const x = ${source}`)).get("x")
	if (found === undefined) throw new Error("no const x")
	return found
}

it("unwrapped", () => {
	for (const wrapped of ["(y)", "y as T", "y satisfies T", "y!"]) {
		expect(unwrapped(init(wrapped))).toMatchObject({ type: "Identifier", name: "y" })
	}
	expect(unwrapped(init("y()"))).toBeUndefined()
})

it("key name", () => {
	const init = constInits(program('const x = { a: 1, "b": 2, 3: 3 }')).get("x")
	const keys = init?.type === "ObjectExpression" ? init.properties : []
	expect(keys.map((property) => (property.type === "Property" ? keyName(property.key) : ""))).toEqual(["a", "b", "3"])
})

it("input through consts", () => {
	expect(sides("const route = x.input({ params: p })")).toEqual({ params: true, search: false })
	expect(sides("const v = { searchParams: s }\nconst route = x.input(v)")).toEqual({ params: false, search: true })
	expect(sides("const v = ({ params: p }) satisfies T\nconst route = x.input(v as U)")).toEqual({
		params: true,
		search: false,
	})
	expect(sides("const b = { params: p }\nconst route = x.input({ ...b, searchParams: s })")).toEqual({
		params: true,
		search: true,
	})
	expect(sides("const route = x.input({ [k]: p, ...missing })")).toEqual({ params: false, search: false })
	expect(sides("const v = { searchParams: s }\nconst route = x.input(v.pick())")).toEqual({
		params: false,
		search: false,
	})
	expect(sides("const a = b\nconst b = a\nconst route = x.input(a)")).toEqual({ params: false, search: false })
	expect(sides("const route = x.input(...all)")).toEqual({ params: false, search: false })
	expect(sides("const route = x.input()")).toEqual({ params: false, search: false })
})
