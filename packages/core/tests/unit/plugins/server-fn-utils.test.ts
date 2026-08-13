import { describe, expect, it, vi } from "vitest"

vi.mock("vite-plugin-solid", () => ({
	default: () => ({ name: "solid" }),
}))

import { generateServerFnMapSource, stripHandlerBodies } from "../../../src/plugins/index.ts"

describe("stripHandlerBodies", () => {
	it("strips simple arrow handler", () => {
		const code = ".handler(({ input }) => input.message)"
		const result = stripHandlerBodies(code)
		expect(result).toContain("Server function called on client")
		expect(result).not.toContain("input.message")
	})

	it("strips async arrow handler", () => {
		const code = ".handler(async ({ input }) => { return await db.query(input) })"
		const result = stripHandlerBodies(code)
		expect(result).toContain("Server function called on client")
		expect(result).not.toContain("db.query")
	})

	it("strips block body handler", () => {
		const code = ".handler(({ input }) => { const x = process(input); return x })"
		const result = stripHandlerBodies(code)
		expect(result).toContain("Server function called on client")
		expect(result).not.toContain("process(input)")
	})

	it("handles nested parens inside handler", () => {
		const code = ".handler(({ input }) => fn(inner(deep(input))))"
		const result = stripHandlerBodies(code)
		expect(result).toContain("Server function called on client")
		expect(result).not.toContain("fn(inner")
	})

	it("preserves code before and after handler", () => {
		const code = 'const x = createServerFn({ name: "a" }).handler(() => secret).input(z.object({}))'
		const result = stripHandlerBodies(code)
		expect(result).toContain("createServerFn")
		expect(result).toContain(".input(z.object({}))")
		expect(result).not.toContain("secret")
	})

	it("handles multiple handlers in same file", () => {
		const code = [
			".handler(({ input }) => dbQuery(input))",
			'.handler(() => { throw new Error("boom") })',
		].join("\n")
		const result = stripHandlerBodies(code)
		expect(result).not.toContain("dbQuery")
		expect(result).not.toContain("boom")
		expect((result.match(/Server function called on client/g) ?? []).length).toBe(2)
	})

	it("code without handler unchanged", () => {
		const code = 'const x = createServerFn({ name: "test" })'
		const result = stripHandlerBodies(code)
		expect(result).toBe(code)
	})
})

describe("generateServerFnMapSource", () => {
	it("empty files → empty map", () => {
		const result = generateServerFnMapSource([])
		expect(result).toBe("export default new Map()")
	})

	it("generates imports and collector for N files", () => {
		const files = ["/abs/src/fns-a.ts", "/abs/src/fns-b.ts"]
		const result = generateServerFnMapSource(files)

		expect(result).toContain('import * as _m0 from "/abs/src/fns-a.ts"')
		expect(result).toContain('import * as _m1 from "/abs/src/fns-b.ts"')
		expect(result).toContain("const map = new Map()")
		expect(result).toContain("function _c(mod)")
		expect(result).toContain("v._registration")
		expect(result).toContain("_c(_m0)")
		expect(result).toContain("_c(_m1)")
		expect(result).toContain("export default map")
	})

	it("single file generates correct code", () => {
		const result = generateServerFnMapSource(["/src/server-fns.ts"])
		expect(result).toContain('import * as _m0 from "/src/server-fns.ts"')
		expect(result).toContain("_c(_m0)")
		expect(result).not.toContain("_m1")
	})
})

describe("stripHandlerBodies - stream", () => {
	it("strips .stream(async function* ...) body", () => {
		const code = ".stream(async function* (ctx) { yield ctx.input })"
		const result = stripHandlerBodies(code)
		expect(result).toContain("Server function called on client")
		expect(result).not.toContain("yield ctx.input")
	})

	it("mixed file with .handler() and .stream() — both stripped", () => {
		const code = [
			'createServerFn({ name: "echo" }).handler(({ input }) => input.message)',
			'createServerFn({ name: "chat" }).stream(async function* (ctx) { yield ctx.input.prompt })',
		].join("\n")
		const result = stripHandlerBodies(code)
		expect(result).not.toContain("input.message")
		expect(result).not.toContain("yield ctx.input.prompt")
		expect((result.match(/Server function called on client/g) ?? []).length).toBe(2)
	})

	it(".stream() with nested parens stripped correctly", () => {
		const code = ".stream(async function* () { yield fn(inner(deep(1))) })"
		const result = stripHandlerBodies(code)
		expect(result).toContain("Server function called on client")
		expect(result).not.toContain("fn(inner")
	})

	it("preserves code before and after .stream()", () => {
		const code =
			'const x = createServerFn({ name: "a" }).stream(async function* () { yield secret }).someChain()'
		const result = stripHandlerBodies(code)
		expect(result).toContain("createServerFn")
		expect(result).toContain(".someChain()")
		expect(result).not.toContain("secret")
	})
})
