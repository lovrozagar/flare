import { readFileSync } from "node:fs"
import { dirname, join, relative } from "node:path"
import { parseSync, Visitor } from "oxc-parser"
import { expect, it } from "vitest"

// `createServer` loads no submitter (dx/seo.md, B58): no module of `src/features/seo` is in the graph an app loads
// when it imports `@lovrozagar/flare/server`. The graph is every module a runtime import reaches, static or dynamic,
// so a re-export the bundle would shake out still counts: Node evaluates it. A type-only import or export is erased.
// A specifier is relative, or the package's own name, which its `exports` map resolves (BUGS.md 471).
const core = join(import.meta.dirname, "../..")
const ENTRY = "src/exports/server.ts"
const PACKAGE = "@lovrozagar/flare"
const EXPORTS: Record<string, string | Record<string, string>> = JSON.parse(
	readFileSync(join(core, "package.json"), "utf8"),
).exports

// A module's specifier as a file from the package root: relative to the module, or the package's own subpath, which
// a server loads by its default condition.
function resolved(file: string, specifier: string): string | undefined {
	if (specifier.startsWith(".")) return relative(core, join(core, dirname(file), specifier))
	if (specifier !== PACKAGE && !specifier.startsWith(`${PACKAGE}/`)) return undefined
	const target = EXPORTS[`.${specifier.slice(PACKAGE.length)}`]
	const path = typeof target === "string" ? target : target?.["default"]
	if (path === undefined) throw new Error(`${file}: ${specifier} is not an export of the package`)
	return relative(core, join(core, path))
}

// The specifiers a module loads at runtime: a string, or a template with no substitution.
function loads(file: string): string[] {
	const { program } = parseSync(file, readFileSync(join(core, file), "utf8"), { sourceType: "module" })
	const found: string[] = []
	const add = (
		source:
			| { type: string; value?: unknown; quasis?: { value: { cooked?: string | null } }[]; expressions?: unknown[] }
			| null
			| undefined,
	): void => {
		if (typeof source?.value === "string") found.push(source.value)
		const [quasi] = source?.type === "TemplateLiteral" && source.expressions?.length === 0 ? (source.quasis ?? []) : []
		if (typeof quasi?.value.cooked === "string") found.push(quasi.value.cooked)
	}
	new Visitor({
		ImportDeclaration: (node) => void (node.importKind === "type" || add(node.source)),
		ExportNamedDeclaration: (node) => void (node.exportKind === "type" || add(node.source)),
		ExportAllDeclaration: (node) => void (node.exportKind === "type" || add(node.source)),
		ImportExpression: (node) => add(node.source),
	}).visit(program)
	return found
}

function graph(entry: string): string[] {
	const seen = new Set([entry])
	for (const file of seen) {
		for (const specifier of loads(file)) {
			const next = resolved(file, specifier)
			if (next !== undefined) seen.add(next)
		}
	}
	return [...seen]
}

it("server loads no seo", () => {
	const modules = graph(ENTRY)
	expect(modules).toContain("src/server/lifecycle/create.ts")
	expect(modules.filter((file) => file.startsWith("src/features/seo/"))).toEqual([])
})
