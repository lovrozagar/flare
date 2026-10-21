import { expect, it } from "vitest"
import { graphOf, type Graph } from "./env.ts"
import type { HelperSources } from "./env-names.ts"
import { boundaryTransform } from "./transform.ts"

const IMPORT = 'import { createServerOnlyFn, createClientOnlyFn, createIsomorphicFn } from "@lovrozagar/flare";\n'

// The module as the boundary plugin rewrites it for one graph: the same call the plugin makes.
function rewrite(source: string, graph: Graph): string {
	return boundaryTransform("src/lib/a.ts", source, { graph })?.code ?? source
}

it("server direct", () => {
	const source = `${IMPORT}export const read = createServerOnlyFn(async () => SECRET);\n`
	const client = rewrite(source, "client")
	expect(client).not.toContain("SECRET")
	// No reference to the helper is left, so its runtime is dead code in the chunk (BUGS.md 461).
	expect(client).toContain("This server-only function was called outside the server")
	expect(client).not.toMatch(/createServerOnlyFn|@lovrozagar\/flare/)
	expect(rewrite(source, "server")).toContain("SECRET")
	expect(boundaryTransform("a.ts", "export const a = 1;\n", { graph: "client" })).toBeUndefined()
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
	expect(rewrite(source, "server")).toContain("This client-only function was called outside the client")
	expect(rewrite(source, "server")).not.toContain("createClientOnlyFn")
})

it("client kept", () => {
	const source = `${IMPORT}export const focus = createClientOnlyFn(() => SECRET);\n`
	expect(rewrite(source, "client")).toContain("SECRET")
})

const ISO = `${IMPORT}export const format = createIsomorphicFn().server(() => SERVER).client(() => CLIENT);\n`

it("iso server", () => {
	const code = rewrite(ISO, "server")
	expect(code).toContain("(() => SERVER)")
	expect(code).not.toMatch(/CLIENT|createIsomorphicFn/)
})

it("iso client", () => {
	const code = rewrite(ISO, "client")
	expect(code).toContain("(() => CLIENT)")
	expect(code).not.toMatch(/SERVER|createIsomorphicFn/)
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

// A namespace import's isomorphic chain is split like a named import's: the client graph loses `.server()`'s body and
// the server graph `.client()`'s. The namespace read as a value is a build error in both graphs, since a helper taken
// from it is a copy the rewrite cannot follow (plan 21 13.15).
it("iso namespace", () => {
	const source = `import * as flare from "@lovrozagar/flare";
export const format = flare.createIsomorphicFn().server(() => SERVER).client(() => CLIENT);
`
	const client = rewrite(source, "client")
	expect([client.includes("SERVER"), client.includes("CLIENT")]).toEqual([false, true])
	const server = rewrite(source, "server")
	expect([server.includes("SERVER"), server.includes("CLIENT")]).toEqual([true, false])
	const copied = `import * as flare from "@lovrozagar/flare";
const { createIsomorphicFn: make } = flare;
export const format = make().server(() => SERVER).client(() => CLIENT);
`
	const value = "src/lib/a.ts: the namespace flare is read as a value; use it only as flare.name"
	for (const graph of ["client", "server"] as const) expect(() => rewrite(copied, graph)).toThrow(value)
	// A type position reads no value.
	const typed = `import * as flare from "@lovrozagar/flare";
type All = typeof flare;
type Props = flare.LinkProps;
export const read = flare.createServerOnlyFn((all: All, props: Props) => SECRET);
`
	for (const graph of ["client", "server"] as const) expect(() => rewrite(typed, graph)).not.toThrow()
})

it("quote in a regex", () => {
	const source = `const quote = /"'\`/;\n${IMPORT}export const read = createServerOnlyFn(() => SECRET);\n`
	expect(rewrite(source, "client")).not.toContain("SECRET")
	expect(() => boundaryTransform("bad.ts", "export const = ;", { graph: "client" })).toThrow(/^bad\.ts: /)
})

// What the plugin reads of `./barrel.ts`: a renamed helper, a default one, and a namespace of helpers (BUGS.md 461).
const BARREL: HelperSources = new Map([
	[
		"./barrel.ts",
		new Map<string, "createServerOnlyFn" | ReadonlyMap<string, "createServerOnlyFn">>([
			["serverOnly", "createServerOnlyFn"],
			["default", "createServerOnlyFn"],
			["inner", new Map([["createServerOnlyFn", "createServerOnlyFn"]])],
		]),
	],
])

const viaBarrel = (source: string): string =>
	boundaryTransform("src/lib/a.ts", source, { graph: "client", sources: BARREL })?.code ?? source

// A barrel's helper by its exported name, a string-named import, and a default import are the helper; a namespace
// import of a barrel holding a helper namespace fails, since `ns.inner.helper` is a chain the rewrite does not follow.
it("barrel names", () => {
	expect(
		viaBarrel('import { serverOnly } from "./barrel.ts";\nexport const a = serverOnly(() => SECRET);\n'),
	).not.toContain("SECRET")
	expect(
		viaBarrel('import { "serverOnly" as s } from "./barrel.ts";\nexport const a = s(() => SECRET);\n'),
	).not.toContain("SECRET")
	expect(viaBarrel('import read from "./barrel.ts";\nexport const a = read(() => SECRET);\n')).not.toContain("SECRET")
	expect(
		viaBarrel('import { inner } from "./barrel.ts";\nexport const a = inner.createServerOnlyFn(() => SECRET);\n'),
	).not.toContain("SECRET")
	expect(
		viaBarrel('import * as b from "./barrel.ts";\nexport const a = b.inner.createServerOnlyFn(() => SECRET);\n'),
	).not.toContain("SECRET")
	// A nested namespace read as a value hands its helpers to code the rewrite cannot follow.
	expect(() => viaBarrel('import * as b from "./barrel.ts";\nexport const a = b.inner;\n')).toThrow(
		"src/lib/a.ts: the namespace b.inner is read as a value",
	)
})

const dynamic = (pattern: string): string => `const ${pattern} = await import("@lovrozagar/flare");\nexport { x };\n`

// A dynamic import is followed only as a destructuring await of plain keys: a rest element, a computed key, or a
// helper's name fails; a quoted key that is not a helper builds; a computed specifier is not the package (BUGS.md 461).
it("dynamic import shapes", () => {
	expect(() => viaBarrel(dynamic("{ ...x }"))).toThrow("is not one the env rewrite can follow")
	expect(() => viaBarrel(dynamic('{ ["Link"]: x }'))).toThrow("is not one the env rewrite can follow")
	expect(() => viaBarrel(dynamic('{ "createIsomorphicFn": x }'))).toThrow("reaches createIsomorphicFn")
	expect(viaBarrel(dynamic('{ "Link": x }'))).toContain('"Link": x')
	expect(viaBarrel("const x = await import(name);\nexport { x };\n")).toContain("import(name)")
	expect(viaBarrel('const x = await import("./other.ts");\nexport { x };\n')).toContain("./other.ts")
})

// A helper read through a namespace as the object of another member, `flare.createServerOnlyFn.call(...)`, is a read
// the rewrite cannot follow.
it("helper as an object", () => {
	const source =
		'import * as flare from "@lovrozagar/flare";\nexport const a = flare.createServerOnlyFn.call(null, () => SECRET);\n'
	expect(() => rewrite(source, "client")).toThrow("src/lib/a.ts: createServerOnlyFn must be called directly")
})
