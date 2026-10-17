import { expect, it } from "vitest"
import { scanRoute } from "./scan.ts"

// The start of the route's own chain, which alone says what the page is (plan 21 13.2).
const ROUTE = 'export const route = createPage("_root_/a").'

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
	expect(scanRoute("auth.tsx", ROUTE + "authenticate();").auth).toBe(true)
	expect(scanRoute("optional.tsx", ROUTE + "authenticateOptional();").auth).toBe("optional")
})

it("intercept literals", () => {
	const source = `${ROUTE}intercept({ from: ["_root_/gallery"], render: "preview" });`
	const scan = scanRoute("gallery.tsx", source)
	expect(scan.intercept?.from).toEqual(["_root_/gallery"])
	expect(scan.intercept?.render).toBe("preview")
	expect(scan.intercept?.spans).toEqual([
		{ start: source.indexOf('"_root_/gallery"'), end: source.indexOf('"_root_/gallery"') + '"_root_/gallery"'.length },
	])
})

it("computed from", () => {
	const source = `const id = "_root_/gallery"; ${ROUTE}intercept({ from: id, render: "preview" });`
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
		expect(() => scanRoute("shape.tsx", `${ROUTE}intercept(${config});`)).toThrow(
			"shape.tsx: intercept takes a literal from array and a literal render",
		)
	}
	const spread = scanRoute("spread.tsx", `${ROUTE}intercept({ ...base, from: ["_root_/a"], render: "preview" });`)
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
	expect(scanRoute("auth.page.ts", `const id = <T>(value: T): T => value;\n${ROUTE}authenticate();`).auth).toBe(true)
})

// Only the exported route's own builder chain says what the page is: a `.response()`, `.authenticate()`, `.cache()`,
// or `.input()` anywhere else in the file, a fetch helper's or another builder's, marks nothing. The chain may start
// from a module-level const, and a `satisfies`, `as`, or parentheses around it are seen through (plan 21 13.2,
// BUGS.md 205).
it("route chain only", () => {
	const helper = `const answer = (res) => res.response();\nconst other = createPage("_root_/b").authenticate().cache({ client: false });\n`
	const plain = scanRoute("a.page.tsx", `${helper}export const route = createPage("_root_/a").render(r);`)
	expect([plain.response, plain.auth, plain.client]).toEqual([false, undefined, undefined])
	const base = 'const base = createPage("_root_/a").authenticate();\n'
	for (const route of [
		"base.response(h)",
		"(base.response(h))",
		"base.response(h) satisfies Route",
		"base.response(h) as Route",
	]) {
		const scan = scanRoute("a.page.ts", `${base}export const route = ${route};`)
		expect([route, scan.response, scan.auth]).toEqual([route, true, true])
	}
	const exported = scanRoute("a.page.ts", `const route = createPage("_root_/a").response(h);\nexport { route };`)
	expect(exported.response).toBe(true)
	const looped = scanRoute(
		"a.page.ts",
		"const a = b.response(h);\nconst b = a.authenticate();\nexport const route = a;",
	)
	expect([looped.response, looped.auth]).toEqual([true, true])
})

function methods(options: string): string[] | undefined {
	return scanRoute("a.page.ts", `${ROUTE}response(h${options});`).methods
}

// `.response(fn, { methods })` is a literal list the route node carries; none is GET. Any other shape fails the build,
// naming the file, a spread, a computed key, or an unknown key included, since the scan could not read it (plan 21
// 13.5, BUGS.md 208, 276).
it("response methods", () => {
	expect(methods("")).toBeUndefined()
	expect(methods(", {}")).toBeUndefined()
	expect(methods(', { methods: ["GET", "POST"] }')).toEqual(["GET", "POST"])
	for (const options of [
		', { methods: ["get"] }',
		", { methods: [] }",
		', { methods: ["GET", "GET"] }',
		", { methods: list }",
		", options",
		", { methods: [...list] }",
		", { ...options }",
		', { ["methods"]: ["POST"] }',
		', { methods: ["POST"], other: 1 }',
	]) {
		expect(() => methods(options)).toThrow("a.page.ts: .response() methods is a non-empty array")
	}
})

const scanned = (options: string) => scanRoute("a.page.ts", `${ROUTE}response(h${options});`).crossOrigin

// `crossOrigin` is a literal boolean beside `methods`, and a route that answers only GET or OPTIONS has no Origin check
// to drop, so it fails the build, naming the file (B44, BUGS.md 273).
it("response cross origin", () => {
	expect(scanned(', { methods: ["POST"], crossOrigin: true }')).toBe(true)
	expect(scanned(', { methods: ["POST"], crossOrigin: false }')).toBeUndefined()
	expect(scanned(', { methods: ["POST"] }')).toBeUndefined()
	expect(() => scanned(', { methods: ["POST"], crossOrigin: open }')).toThrow(
		"a.page.ts: .response() crossOrigin is a literal",
	)
	for (const options of [", { crossOrigin: true }", ', { methods: ["GET", "OPTIONS"], crossOrigin: true }']) {
		expect(() => scanned(options)).toThrow("a.page.ts: .response() crossOrigin: true needs")
	}
})
