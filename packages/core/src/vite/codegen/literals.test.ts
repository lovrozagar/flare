import { parseSync, type Expression, type Program } from "oxc-parser"
import { expect, it } from "vitest"
import { constInits, keyName, unwrapped } from "./literals.ts"

function program(source: string): Program {
	return parseSync("a.ts", source).program
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
