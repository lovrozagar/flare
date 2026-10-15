import { expect, it } from "vitest"
import { graphOf, type Graph } from "./env.ts"
import { boundaryTransform } from "./transform.ts"

const IMPORT = 'import { createServerOnlyFn, createClientOnlyFn, createIsomorphicFn } from "@lovrozagar/flare";\n'

// The module as the boundary plugin rewrites it for one graph: the same call the plugin makes.
function rewrite(source: string, graph: Graph): string {
	return boundaryTransform("src/lib/a.ts", source, graph)?.code ?? source
}

it("server direct", () => {
	const source = `${IMPORT}export const read = createServerOnlyFn(async () => SECRET);\n`
	const client = rewrite(source, "client")
	expect(client).not.toContain("SECRET")
	expect(client).toContain("createServerOnlyFn()")
	expect(rewrite(source, "server")).toContain("SECRET")
	expect(boundaryTransform("a.ts", "export const a = 1;\n", "client")).toBeUndefined()
})

it("server alias", () => {
	const source =
		'import { createServerOnlyFn as mark } from "@lovrozagar/flare";\nexport const read = mark(() => SECRET);\n'
	expect(rewrite(source, "client")).not.toContain("SECRET")
	const quoted =
		'import { "createServerOnlyFn" as mark } from "@lovrozagar/flare";\nexport const read = mark(() => SECRET);\n'
	expect(rewrite(quoted, "client")).not.toContain("SECRET")
})

it("server namespace", () => {
	const source =
		'import * as flare from "@lovrozagar/flare";\nexport const read = flare.createServerOnlyFn(function () { return SECRET; });\n'
	expect(rewrite(source, "client")).not.toContain("SECRET")
	expect(rewrite(`${source}export const other = flare.other(() => SECRET);\n`, "client")).toContain("SECRET")
})

it("server shadow", () => {
	expect(() =>
		rewrite(`${IMPORT}function wrap(createServerOnlyFn) { return createServerOnlyFn; }\n`, "client"),
	).toThrow("src/lib/a.ts: a local binding shadows createServerOnlyFn")
})

it("server indirect", () => {
	expect(() =>
		rewrite(`${IMPORT}const mark = createServerOnlyFn;\nexport const read = mark(() => SECRET);\n`, "client"),
	).toThrow("src/lib/a.ts: createServerOnlyFn must be called directly")
	const namespaced = 'import * as flare from "@lovrozagar/flare";\nconst mark = flare.createServerOnlyFn;\n'
	expect(() => rewrite(namespaced, "client")).toThrow("src/lib/a.ts: createServerOnlyFn must be called directly")
	// A key or a member with the same name is not a use of the helper.
	expect(() =>
		rewrite(`${IMPORT}export const o = { createServerOnlyFn: 1 }.createServerOnlyFn;\n`, "client"),
	).not.toThrow()
})

it("server identifier", () => {
	expect(() => rewrite(`${IMPORT}export const read = createServerOnlyFn(readDb);\n`, "client")).toThrow(
		"src/lib/a.ts: createServerOnlyFn takes an inline function expression or arrow",
	)
	expect(() => rewrite(`${IMPORT}export const read = createServerOnlyFn();\n`, "server")).toThrow(/inline function/)
})

it("client body", () => {
	const source = `${IMPORT}export const focus = createClientOnlyFn(() => SECRET);\n`
	expect(rewrite(source, "server")).not.toContain("SECRET")
	expect(rewrite(source, "server")).toContain("createClientOnlyFn()")
})

it("client kept", () => {
	const source = `${IMPORT}export const focus = createClientOnlyFn(() => SECRET);\n`
	expect(rewrite(source, "client")).toContain("SECRET")
})

const ISO = `${IMPORT}export const format = createIsomorphicFn().server(() => SERVER).client(() => CLIENT);\n`

it("iso server", () => {
	const code = rewrite(ISO, "server")
	expect(code).toContain("SERVER")
	expect(code).not.toContain("CLIENT")
	expect(code).toContain(".client()")
})

it("iso client", () => {
	const code = rewrite(ISO, "client")
	expect(code).toContain("CLIENT")
	expect(code).not.toContain("SERVER")
	expect(code).toContain(".server()")
})

// The graphs are roles. Prerender's Node build is a server graph like ssr: it keeps the server function and drops the
// client one (B109). A Web Worker is a client graph (bits/12 `web worker`).
it("iso prerender", () => {
	const code = rewrite(ISO, graphOf("flare_prerender"))
	expect(code).toContain("SERVER")
	expect(code).not.toContain("CLIENT")
	expect(graphOf("ssr")).toBe("server")
	expect(graphOf("client")).toBe("client")
})

it("iso one side", () => {
	expect(() => rewrite(`${IMPORT}export const f = createIsomorphicFn().server(() => SERVER);\n`, "server")).toThrow(
		"src/lib/a.ts: createIsomorphicFn needs .server() and .client() in one expression",
	)
	expect(() =>
		rewrite(
			`${IMPORT}export const f = createIsomorphicFn().server(() => 1).server(() => 2).client(() => 3);\n`,
			"server",
		),
	).toThrow(/\.server\(\) and \.client\(\) in one expression/)
	expect(() =>
		rewrite(`${IMPORT}export const f = createIsomorphicFn().server(() => 1).other(() => 2);\n`, "server"),
	).toThrow(/in one expression/)
	expect(() =>
		rewrite(`${IMPORT}export const f = createIsomorphicFn().server(read).client(() => 2);\n`, "server"),
	).toThrow("src/lib/a.ts: createIsomorphicFn .server() takes an inline function expression or arrow")
})

it("iso split", () => {
	const source = `${IMPORT}const start = createIsomorphicFn();\nexport const f = start.server(() => SERVER).client(() => CLIENT);\n`
	expect(() => rewrite(source, "client")).toThrow(
		"src/lib/a.ts: createIsomorphicFn needs .server() and .client() in one expression",
	)
	expect(() =>
		rewrite(`${IMPORT}export const f = createIsomorphicFn()["server"](() => 1).client(() => 2);\n`, "client"),
	).toThrow(/in one expression/)
})

it("iso order", () => {
	const source = `${IMPORT}export const format = createIsomorphicFn().client(() => CLIENT).server(() => SERVER);\n`
	expect(rewrite(source, "server")).toContain("SERVER")
	expect(rewrite(source, "server")).not.toContain("CLIENT")
	expect(rewrite(source, "client")).toContain("CLIENT")
	expect(rewrite(source, "client")).not.toContain("SERVER")
})

it("quote in a regex", () => {
	const source = `const quote = /"'\`/;\n${IMPORT}export const read = createServerOnlyFn(() => SECRET);\n`
	expect(rewrite(source, "client")).not.toContain("SECRET")
	expect(() => boundaryTransform("bad.ts", "export const = ;", "client")).toThrow(/^bad\.ts: /)
})
