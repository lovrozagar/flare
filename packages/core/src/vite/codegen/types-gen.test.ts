import { expect, it } from "vitest"
import { generateTypes } from "./types-gen.ts"

const B = 'import { createPage, createLayout, createRootLayout, createPathSegment } from "@lovrozagar/flare";\n'

const files: Record<string, string> = {
	"src/routes/_root_/root.root-layout.tsx": `${B}export const route = createRootLayout("_root_").render(r);\n`,
	"src/routes/_root_/about/about.page.tsx": `${B}export const route = createPage("_root_/about").authenticateOptional().input({ searchParams: s }).loader(async () => ({ n: 1 })).render(r);\n`,
	"src/routes/_root_/users/[id]/user.page.tsx": `${B}export const route = createPage("_root_/users/[id]").input({ params: p }).render(r);\n`,
	"src/routes/_root_/files/[...path]/files.page.tsx": `${B}export const route = createPage("_root_/files/[...path]").render(r);\n`,
	"src/routes/_root_/opt/[[locale]]/opt.page.tsx": `${B}export const route = createPage("_root_/opt/[[locale]]").render(r);\n`,
	"src/routes/_root_/rest/[[...rest]]/rest.page.tsx": `${B}export const route = createPage("_root_/rest/[[...rest]]").render(r);\n`,
	"src/routes/_root_/(blog)/blog.layout.tsx": `${B}export const route = createLayout("_root_/(blog)").authenticate().input({ searchParams: s }).render(r);\n`,
	"src/routes/_root_/(blog)/post/post.page.tsx": `${B}export const route = createPage("_root_/(blog)/post").input({ searchParams: t }).render(r);\n`,
	"src/routes/_root_/api/api.page.tsx": `${B}export const route = createPage("_root_/api").response(answer);\n`,
	"src/routes/_root_/docs/docs.segment.ts": `${B}export const route = createPathSegment("_root_/docs").cache({ cdn: { maxAge: "1m" } });\n`,
	"src/routes/_root_/docs/intro/intro.page.tsx": `${B}export const route = createPage("_root_/docs/intro").render(r);\n`,
	"src/lib/query.ts": 'import { queryClient } from "@lovrozagar/flare/query";\nexport const q = queryClient;\n',
	"src/lib/mention.ts":
		"// @lovrozagar/flare/query is not imported here, and neither is queryClientGetter.\nexport const m = 1;\n",
}

const routeFiles = Object.keys(files)
	.filter((file) => file.startsWith("src/routes/"))
	.map((file) => file.slice("src/routes/".length))

function generate(app: readonly string[] = Object.keys(files)) {
	return generateTypes({ routeFiles, appFiles: app, read: (file) => files[file] })
}

function module(id: string, file: string): string {
	return `"${id}": typeof import("../routes/${file}").route;`
}

it("loader type", () => {
	expect(generate().source).toContain(module("_root_/about", "_root_/about/about.page.tsx"))
})

it("param types", () => {
	const source = generate().source
	expect(source).toContain('"/users/[id]": { params: { id: string } };')
	expect(source).toContain('"/files/[...path]": { params: { path: string[] } };')
	expect(source).toContain('"/opt/[[locale]]": { params: { locale: string | undefined } };')
	expect(source).toContain('"/rest/[[...rest]]": { params: { rest: string[] | undefined } };')
})

it("no params", () => {
	expect(generate().source).toContain('"/about": { params: {} };')
})

it("parents", () => {
	const generated = generate()
	expect(generated.parents["_root_/(blog)/post"]).toEqual(["_root_", "_root_/(blog)"])
	expect(generated.parents["_root_/(blog)"]).toEqual(["_root_"])
	expect(generated.parents._root_).toEqual([])
	expect(generated.source).toContain('"_root_/(blog)/post": ["_root_", "_root_/(blog)"];')
})

it("auth mode", () => {
	const source = generate().source
	expect(source).toContain('authModes: {\n\t\t\t"_root_/(blog)": true;\n\t\t\t"_root_/about": "optional";\n\t\t};')
	expect(source).not.toContain('.authenticate("optional")')
	const quiet = generateTypes({
		routeFiles: ["_root_/root.root-layout.tsx"],
		appFiles: [],
		read: (file) => files[file],
	})
	expect(quiet.source).not.toContain("authModes")
	expect(quiet.source).not.toContain("routeSearchParams")
	expect(quiet.source).not.toContain("routeParams")
})

it("search", () => {
	expect(generate().source).toContain(
		'"_root_/about": import("@lovrozagar/flare").SearchOutput<typeof import("../routes/_root_/about/about.page.tsx").route>;',
	)
})

it("input params", () => {
	expect(generate().source).toContain(
		'"_root_/users/[id]": import("@lovrozagar/flare").ParamsOutput<typeof import("../routes/_root_/users/[id]/user.page.tsx").route>;',
	)
})

// One register entry that names a route's own type.
function entry(helper: string, id: string, file: string): string {
	return `"${id}": import("@lovrozagar/flare").${helper}<typeof import("../routes/${file}").route>;`
}

// Every route whose chain calls `.input()` gets both entries, whatever the argument, and the register reads which sides
// it has from the route's type; one without `.input()` gets none, so its type is never read (BUGS.md 349).
it("input call", () => {
	const source = generate().source
	expect(source).toContain(entry("ParamsOutput", "_root_/about", "_root_/about/about.page.tsx"))
	expect(source).toContain(entry("SearchOutput", "_root_/users/[id]", "_root_/users/[id]/user.page.tsx"))
	expect(source).not.toContain('"_root_/files/[...path]": import("@lovrozagar/flare").ParamsOutput')
	expect(source).not.toContain('"_root_/files/[...path]": import("@lovrozagar/flare").SearchOutput')
	const imported = generateTypes({
		routeFiles: ["_root_/root.root-layout.tsx", "_root_/made/made.page.tsx"],
		appFiles: [],
		read: (file) =>
			file.endsWith("made.page.tsx")
				? `${B}import { paged } from "../../../v.ts";\nexport const route = createPage("_root_/made").input(paged()).render(r);\n`
				: (files[file] ?? ""),
	})
	expect(imported.source).toContain(entry("SearchOutput", "_root_/made", "_root_/made/made.page.tsx"))
	expect(imported.source).toContain(entry("ParamsOutput", "_root_/made", "_root_/made/made.page.tsx"))
})

it("keyed by route id", () => {
	const source = generate().source
	expect(source).toContain(
		'"_root_/(blog)": import("@lovrozagar/flare").SearchOutput<typeof import("../routes/_root_/(blog)/blog.layout.tsx").route>;',
	)
	expect(source).toContain(
		'"_root_/(blog)/post": import("@lovrozagar/flare").SearchOutput<typeof import("../routes/_root_/(blog)/post/post.page.tsx").route>;',
	)
})

it("response route", () => {
	const generated = generate()
	expect(generated.modules).toContain("_root_/api")
	expect(generated.source).toContain(module("_root_/api", "_root_/api/api.page.tsx"))
	expect(generated.source).not.toContain('"/api"')
})

it("segment parent", () => {
	const generated = generate()
	expect(generated.modules).toContain("_root_/docs")
	expect(generated.parents["_root_/docs/intro"]).toEqual(["_root_"])
	expect(generated.source).toContain(module("_root_/docs", "_root_/docs/docs.segment.ts"))
})

it("parents closed", () => {
	const generated = generate()
	for (const parents of Object.values(generated.parents)) {
		for (const parent of parents) expect(generated.modules).toContain(parent)
	}
})

it("query client", () => {
	expect(generate().source).toContain("hasQueryClient: true;")
	expect(generate(["src/lib/mention.ts"]).source).not.toContain("hasQueryClient")
})

it("no virtual", () => {
	expect(generate().source).not.toContain("virtual:")
})

it("no phantom", () => {
	const source = generate().source
	expect(source).not.toContain("~flare")
	expect(source).not.toMatch(/^\t\t(auth|env|serverContext)\??:/m)
	expect(
		source.startsWith('// Generated by flare. Do not edit.\nexport {};\n\ndeclare module "@lovrozagar/flare" {\n'),
	).toBe(true)
	expect(() =>
		generateTypes({
			routeFiles,
			appFiles: ["src/bad.ts"],
			read: (file) => (file === "src/bad.ts" ? "export const = ;" : files[file]),
		}),
	).toThrow(/^src\/bad\.ts: /)
})

// The page ids, a `.response()` page among them, as a plain union, so a page target needs no module's type. An app with
// no page has none (BUGS.md 105).
it("page ids", () => {
	expect(generate().source).toContain(
		'pageIds: "_root_/(blog)/post" | "_root_/about" | "_root_/api" | "_root_/docs/intro" | "_root_/files/[...path]" | "_root_/opt/[[locale]]" | "_root_/rest/[[...rest]]" | "_root_/users/[id]";',
	)
	const layoutOnly = generateTypes({
		routeFiles: ["_root_/root.root-layout.tsx"],
		appFiles: [],
		read: (file) => files[file] ?? "",
	})
	expect(layoutOnly.source).toContain("pageIds: never;")
})

// An app module that is `.ts` parses as TypeScript, so a generic arrow in it is no tag (plan 21 8.1).
it("ts generic", () => {
	const source = 'import { queryClient } from "@lovrozagar/flare/query";\nconst id = <T>(value: T): T => value;\n'
	const types = generateTypes({ routeFiles: [], appFiles: ["src/lib/generic.ts"], read: () => source })
	expect(types.source).toContain("hasQueryClient: true;")
})
