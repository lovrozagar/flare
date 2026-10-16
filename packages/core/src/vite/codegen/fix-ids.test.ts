import { expect, it } from "vitest"
import { fixIds } from "./fix-ids.ts"
import { scanRoute } from "./scan.ts"

// The source with every id the scan resolves written as `id`.
function fixed(source: string, id: string): string {
	return fixIds(source, id, scanRoute("a.page.tsx", source).ids)
}

// Each resolved id string becomes the file's id, in its own quotes; nothing else in the file changes.
it("rewrites", () => {
	expect(fixed('// é\nexport const route = createPage("_root_/old").render(r);\n', "_root_/new")).toBe(
		'// é\nexport const route = createPage("_root_/new").render(r);\n',
	)
	expect(fixed("export const route = createRootLayout('_admin_');\n", "_root_")).toBe(
		"export const route = createRootLayout('_root_');\n",
	)
	// The const is the id: its initializer changes, and the call keeps naming it.
	expect(fixed('const ID = "_root_/old";\nexport const route = createPage(ID);\n', "_root_/a")).toBe(
		'const ID = "_root_/a";\nexport const route = createPage(ID);\n',
	)
	// Two calls in one file both take the file's id.
	expect(fixed('export const route = createPage("x");\nconst again = createPage("y");\n', "_root_/a")).toBe(
		'export const route = createPage("_root_/a");\nconst again = createPage("_root_/a");\n',
	)
	// A quote or a backslash in an id is escaped for its quotes.
	expect(fixed("export const route = createPage('x');\n", "_root_/it's")).toBe(
		"export const route = createPage('_root_/it\\'s');\n",
	)
})

// A file already right comes back as the same string, and what the scan cannot resolve is left as written.
it("leaves alone", () => {
	const right = 'export const route = createPage("_root_/a");\n'
	expect(fixed(right, "_root_/a")).toBe(right)
	const template = "export const route = createPage(`_root_/${area}`);\n"
	expect(fixed(template, "_root_/a")).toBe(template)
	const imported = 'import { ID } from "./id.ts";\nexport const route = createPage(ID);\n'
	expect(fixed(imported, "_root_/a")).toBe(imported)
})

// An exported const read elsewhere in the file is the route's id there too, so every use takes the new id: this is
// deliberate, as a Link or a hook naming the route by that const must name the route the file is.
it("const read elsewhere", () => {
	const source = [
		'export const ID = "_root_/old";',
		"export const route = createPage(ID).render(() => <Link to={ID}>self</Link>);",
		"export const search = () => useSearch({ from: ID });",
		"",
	].join("\n")
	expect(fixed(source, "_root_/a")).toBe(source.replace('"_root_/old"', '"_root_/a"'))
})
