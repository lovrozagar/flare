import { expect, it } from "vitest"
import { scanRoute } from "./scan.ts"

it("parse error", () => {
	expect(() => scanRoute("bad.tsx", "const =")).toThrow(/bad\.tsx/)
})

it("comment", () => {
	expect(scanRoute("comment.tsx", 'import "solid-js"; /* page.authenticate( */ const x = 1;').auth).toBeUndefined()
})

it("string", () => {
	expect(scanRoute("string.tsx", 'const text = ".authenticate(";').auth).toBeUndefined()
})

it("regex", () => {
	expect(scanRoute("regex.tsx", "const pattern = /\\.authenticate\\(/;").auth).toBeUndefined()
})

it("call", () => {
	expect(scanRoute("auth.tsx", "page.authenticate();").auth).toBe(true)
	expect(scanRoute("optional.tsx", "page.authenticateOptional();").auth).toBe("optional")
})

it("intercept literals", () => {
	const source = 'page.intercept({ from: ["_root_/gallery"], render: "preview" });'
	const scan = scanRoute("gallery.tsx", source)
	expect(scan.intercept?.from).toEqual(["_root_/gallery"])
	expect(scan.intercept?.render).toBe("preview")
	expect(scan.intercept?.spans).toEqual([
		{ start: source.indexOf('"_root_/gallery"'), end: source.indexOf('"_root_/gallery"') + '"_root_/gallery"'.length },
	])
})

it("computed from", () => {
	const source = 'const id = "_root_/gallery"; page.intercept({ from: id, render: "preview" });'
	expect(() => scanRoute("computed.tsx", source)).toThrow(/computed\.tsx/)
	expect(() => scanRoute("computed.tsx", source)).toThrow(/intercept/)
	// Every other non-literal shape names the file and the method too. A spread beside the literals is skipped.
	for (const config of [
		"config",
		'{ render: "preview" }',
		'{ from: ["_root_/a"] }',
		'{ from: ["_root_/a"], render: label }',
		'{ from: [id], render: "preview" }',
		'{ ["from"]: ["_root_/a"], render: "preview" }',
	]) {
		expect(() => scanRoute("shape.tsx", `page.intercept(${config});`)).toThrow(
			"shape.tsx: intercept takes a literal from array and a literal render",
		)
	}
	const spread = scanRoute("spread.tsx", 'page.intercept({ ...base, from: ["_root_/a"], render: "preview" });')
	expect(spread.intercept?.render).toBe("preview")
})

it("query import", () => {
	expect(scanRoute("query.tsx", 'import "@lovrozagar/flare/query";').query).toBe(true)
	expect(scanRoute("note.tsx", "/* @lovrozagar/flare/query */ const x = 1;").query).toBe(false)
})

function sides(chain: string) {
	return scanRoute("a.page.tsx", `export const route = createPage("_root_/a")${chain};`).input
}

it("input sides", () => {
	expect(sides(".input({ params: p, searchParams: s }).render(r)")).toEqual({ params: true, search: true })
	expect(sides('.input({ searchParams: s, ...rest, "params": p }).render(r)')).toEqual({ params: true, search: true })
	expect(sides(".input(config).render(r)")).toEqual({ params: false, search: false })
	expect(sides(".input({ [params]: p }).render(r)")).toEqual({ params: false, search: false })
	expect(sides(".render(r)")).toEqual({ params: false, search: false })
	expect(scanRoute("a.page.tsx", 'export const route = createPage("x").authorize(a).render(r);').authorize).toBe(true)
})

function ids(source: string): string[] {
	return scanRoute("a.page.tsx", source).ids.map((found) => found.id)
}

// Each resolved id with the text its span covers in the source.
function spans(source: string): Array<[string, string]> {
	return scanRoute("a.page.tsx", source).ids.map((found) => [found.id, source.slice(found.start, found.end)])
}

// The id a builder call names: a string literal, or a module-level const bound to one. Any other argument is not read.
it("builder ids", () => {
	expect(ids('export const route = createPage("_root_/a").render(r);')).toEqual(["_root_/a"])
	expect(ids('const ID = "_root_/a";\nexport const route = createPage(ID);')).toEqual(["_root_/a"])
	expect(ids('export const route = createRootLayout("_root_");\nconst seg = createPathSegment("_root_/s");')).toEqual([
		"_root_",
		"_root_/s",
	])
	expect(ids("let ID = '_root_/a';\nconst N = 1;\nexport const route = createLayout(ID, N);")).toEqual([])
	expect(ids('export const route = createPage(`_root_/${x}`);\nexport const other = make("x");')).toEqual([])
	expect(ids("export const route = createPage();\nconst [a] = b;\nexport const c = createPage(other);")).toEqual([])
})

// The span to rewrite for each resolved id: the call's own literal, quotes included, or the module-level const's
// initializer. Spans count string positions, so a non-ASCII comment before them does not shift them.
it("builder id spans", () => {
	expect(spans('// é ü 字\nexport const route = createPage("_root_/a");')).toEqual([["_root_/a", '"_root_/a"']])
	expect(spans("export const route = createLayout('_root_/(b)');")).toEqual([["_root_/(b)", "'_root_/(b)'"]])
	expect(spans('// 字\nconst ID = "_root_/a";\nexport const route = createPage(ID);')).toEqual([
		["_root_/a", '"_root_/a"'],
	])
	expect(spans('export const ID = "_root_/a";\nexport const route = createPage(ID);')).toEqual([
		["_root_/a", '"_root_/a"'],
	])
	const source = 'export const route = createPage("_root_/a");\nconst bad = createPage(`_root_/b`);'
	expect(spans(source)).toEqual([["_root_/a", '"_root_/a"']])
})

// A `.ts` route file parses as TypeScript, so a generic arrow in it is no tag (plan 21 8.1).
it("ts generic", () => {
	expect(scanRoute("auth.page.ts", "const id = <T>(value: T): T => value;\npage.authenticate();").auth).toBe(true)
})
