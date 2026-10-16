import MagicString, { type SourceMap } from "magic-string"
import {
	parseSync,
	type CallExpression,
	type Expression,
	type ImportDeclaration,
	type ObjectProperty,
	type Program,
	Visitor,
} from "oxc-parser"
import { boundNames, requireLiteral, serverFnsOf, type Span } from "../route-meta/index.ts"
import { cacheKeyKept, routeMethod } from "./allow.ts"
import { deadDeclarations, moduleReads, nonReferences } from "./reads.ts"

const BUILDERS = new Set(["createPage", "createLayout", "createRootLayout", "createPathSegment"])

export type Split = { code: string; map: SourceMap }

type Step = { name: string; call: CallExpression; object: Expression }

// The client graph of one module (B8, B45). A route chain loses every server method: a middle call is
// cut, and a removed call that ends the chain keeps the call with `undefined`, so the export is still a record. A
// server function's input, authorize, handler, and stream arguments become `undefined`. An import no kept code
// reads is then dropped. A bare `import "x"` stays. Undefined when nothing changed.
export function splitClient(file: string, source: string): Split | undefined {
	const parsed = parseSync(file, source, { sourceType: "module", lang: "tsx" })
	const [error] = parsed.errors
	if (error !== undefined) throw new Error(`${file}: ${error.message}`)
	const edit: Edit = { file, source, out: new MagicString(source), removed: [] }
	splitEdits(edit, parsed.program)
	if (!edit.out.hasChanged()) return undefined
	pruneImports(edit, parsed.program)
	return { code: edit.out.toString(), map: edit.out.generateMap({ hires: true, source: file, includeContent: true }) }
}

// One module's edits, shared by every step of the boundary transform. `removed` is every span a step deleted.
export type Edit = { file: string; source: string; out: MagicString; removed: Span[] }

// The route chains and the server function bodies of the client graph, into a shared edit.
export function splitEdits(edit: Edit, program: Program): void {
	for (const [name, steps] of routeChains(edit.file, program)) stripRoute(edit, name, steps)
	for (const record of serverFnsOf(edit.file, program)) {
		for (const method of record.methods) {
			if (["input", "authorize", "handler", "stream"].includes(method.name)) blank(edit, method.args)
		}
	}
}

const BODIES = new Set(["input", "authorize", "handler", "stream"])

// The server code a client module still holds, found by the same walk split uses: a B8-removed route
// method that is not the chain's end or still has an argument other than `undefined`, and a server function body
// that is not `undefined`. The tripwire reads a chunk's modules with it.
export function serverCode(file: string, source: string, program: Program): Span[] {
	const leaks: Span[] = []
	const blank = (args: readonly Span[]): boolean =>
		args.every((arg) => source.slice(arg.start, arg.end) === "undefined")
	for (const [, steps] of routeChains(file, program)) {
		steps.forEach((step, index) => {
			const removed = routeMethod(step.name) === "remove"
			if (removed && (index < steps.length - 1 || !blank(step.call.arguments))) leaks.push(step.call)
		})
	}
	for (const record of serverFnsOf(file, program)) {
		for (const method of record.methods) if (BODIES.has(method.name) && !blank(method.args)) leaks.push(method)
	}
	return leaks
}

// How the module names the route builders: named imports, possibly aliased, by local name, and namespace imports of
// the package.
type Builders = { locals: Map<string, string>; namespaces: Set<string> }

// `export const name = builder(...)...` chains whose root is a route builder imported from the package, by name or
// through a namespace. A builder called or read any other way is a build error, so every route chain is one the
// split sees (B8, plan 21 2.4).
function routeChains(file: string, program: Program): Array<[string, Step[]]> {
	const builders = builderNames(program)
	if (builders.locals.size === 0 && builders.namespaces.size === 0) return []
	const roots = builderRoots(file, program, builders)
	const chains: Array<[string, Step[]]> = []
	for (const statement of program.body) {
		if (statement.type !== "ExportNamedDeclaration" || statement.declaration?.type !== "VariableDeclaration") continue
		for (const declarator of statement.declaration.declarations) {
			const steps = declarator.init === null ? undefined : stepsOf(declarator.init, builders)
			if (steps !== undefined && declarator.id.type === "Identifier") chains.push([declarator.id.name, steps])
		}
	}
	const [first] = roots
	if (first !== undefined && chains.length < roots.length) throw direct(file, first)
	return chains
}

function builderNames(program: Program): Builders {
	const builders: Builders = { locals: new Map(), namespaces: new Set() }
	for (const statement of program.body) {
		if (statement.type !== "ImportDeclaration" || statement.source.value !== "@lovrozagar/flare") continue
		for (const specifier of statement.specifiers) {
			if (specifier.type === "ImportNamespaceSpecifier") builders.namespaces.add(specifier.local.name)
			if (specifier.type !== "ImportSpecifier") continue
			const imported = specifier.imported.type === "Literal" ? specifier.imported.value : specifier.imported.name
			if (BUILDERS.has(imported)) builders.locals.set(specifier.local.name, imported)
		}
	}
	return builders
}

// The builder each root call names, in source order. A local binding named like a builder or a namespace is an
// error, as for createServerFn (B85). So is a builder read other than as a call's callee, and a namespace read other
// than as `ns.name`: the value could reach a chain the split does not see. A type position is no read.
function builderRoots(file: string, program: Program, builders: Builders): string[] {
	const bound = boundNames(program)
	for (const name of [...builders.locals.keys(), ...builders.namespaces]) {
		if (bound.has(name)) throw new Error(`${file}: a local binding shadows ${name}`)
	}
	const named = nonReferences(program)
	const allowed = new Set<number>()
	const roots: string[] = []
	new Visitor({
		CallExpression: (node) => {
			const builder = rootBuilder(node, builders)
			if (builder === undefined) return
			roots.push(builder)
			allowed.add(node.callee.start)
		},
		MemberExpression: (node) => {
			if (node.computed || node.object.type !== "Identifier" || !builders.namespaces.has(node.object.name)) return
			// A root call's callee starts where its namespace does, so it is checked before the namespace is allowed.
			if (BUILDERS.has(node.property.name) && !allowed.has(node.start)) throw direct(file, node.property.name)
			allowed.add(node.object.start)
		},
		TSQualifiedName: (node) => void allowed.add(node.left.start),
		TSTypeQuery: (node) => void allowed.add(node.exprName.start),
		Identifier: (node) => {
			if (named.has(node.start) || allowed.has(node.start)) return
			const builder = builders.locals.get(node.name)
			if (builder !== undefined) throw direct(file, builder)
			if (builders.namespaces.has(node.name)) throw direct(file, "createPage")
		},
	}).visit(program)
	return roots
}

function direct(file: string, builder: string): Error {
	return new Error(`${file}: ${builder} must be a direct export: export const route = ${builder}()…`)
}

// The builder a call starts a chain with: `createPage(…)` through a named import, or `ns.createPage(…)`.
function rootBuilder(call: CallExpression, builders: Builders): string | undefined {
	const callee = call.callee
	if (callee.type === "Identifier") return builders.locals.get(callee.name)
	if (callee.type !== "MemberExpression" || callee.computed || callee.object.type !== "Identifier") return undefined
	if (!builders.namespaces.has(callee.object.name) || !BUILDERS.has(callee.property.name)) return undefined
	return callee.property.name
}

// Root-first steps, or undefined when the chain does not start at a builder. A computed call is kept as an
// empty name, which stripRoute reports.
function stepsOf(expression: Expression, builders: Builders): Step[] | undefined {
	const steps: Step[] = []
	let node: Expression = expression
	while (node.type === "CallExpression") {
		if (rootBuilder(node, builders) !== undefined) return steps
		const callee: Expression = node.callee
		if (callee.type !== "MemberExpression") return undefined
		steps.unshift({ name: callee.computed ? "" : callee.property.name, call: node, object: callee.object })
		node = callee.object
	}
	return undefined
}

function stripRoute(edit: Edit, name: string, steps: readonly Step[]): void {
	steps.forEach((step, index) => {
		if (step.name === "") {
			throw new Error(`${edit.file}: ${name} calls a chain method by element access. Call each method by name`)
		}
		const verdict = routeMethod(step.name)
		if (verdict === "unknown") throw new Error(`${edit.file}: .${step.name}() is not a route chain method`)
		if (verdict === "cache") cache(edit, name, step)
		if (verdict === "remove" && index === steps.length - 1) blank(edit, step.call.arguments)
		else if (verdict === "remove") cut(edit, step)
	})
}

// `.cache()` keeps its `client` field alone, or goes when it has none. The argument is an object literal with named
// fields, so the fields are found without running the module. A field's value may be anything: a server field's
// `params` or `tags` function goes with that field (dx/cache.md).
function cache(edit: Edit, name: string, step: Step): void {
	const [argument] = step.call.arguments
	const named =
		argument?.type === "ObjectExpression" &&
		argument.properties.every((property) => property.type === "Property" && !property.computed)
	// Anything else, a spread or a computed key included, fails with the literal message.
	if (argument?.type !== "ObjectExpression" || !named)
		return void requireLiteral(edit.file, `${name} .cache()`, undefined)
	const client = argument.properties.find(
		(property): property is ObjectProperty =>
			property.type === "Property" && property.key.type === "Identifier" && cacheKeyKept(property.key.name),
	)
	if (client === undefined) return cut(edit, step)
	edit.out.overwrite(argument.start, argument.end, `{ ${edit.source.slice(client.start, client.end)} }`)
	edit.removed.push({ start: argument.start, end: argument.end })
}

// `.method(args)` goes from the end of the object it was called on.
function cut(edit: Edit, step: Step): void {
	edit.out.remove(step.object.end, step.call.end)
	edit.removed.push({ start: step.object.end, end: step.call.end })
}

function blank(edit: Edit, args: readonly Span[]): void {
	const first = args.at(0)
	const last = args.at(-1)
	if (first === undefined || last === undefined) return
	edit.out.overwrite(first.start, last.end, "undefined")
	edit.removed.push({ start: first.start, end: last.end })
}

// A module-scope declaration only removed code reached goes first (reads.ts). Then an import stays only when kept
// code reads it: a reference outside every import and every removed span that resolves to the module scope. So a
// module only removed code reads, directly or through a helper, leaves the client graph.
export function pruneImports(edit: Edit, program: Program): void {
	for (const declaration of deadDeclarations(program, edit.removed)) {
		edit.out.remove(declaration.start, declaration.end)
		edit.removed.push(declaration)
	}
	const imports = program.body.filter((node): node is ImportDeclaration => node.type === "ImportDeclaration")
	const outside = (node: Span): boolean =>
		!imports.some((entry) => inside(node, entry)) && !edit.removed.some((span) => inside(node, span))
	const read = moduleReads(program, outside)
	for (const declaration of imports) {
		if (declaration.importKind !== "type" && declaration.specifiers.length > 0) prune(edit, declaration, read)
	}
}

function prune(edit: Edit, declaration: ImportDeclaration, read: ReadonlySet<string>): void {
	const kept = declaration.specifiers.filter((specifier) => read.has(specifier.local.name))
	if (kept.length === declaration.specifiers.length) return
	if (kept.length === 0) return void edit.out.remove(declaration.start, declaration.end)
	const text = (node: Span): string => edit.source.slice(node.start, node.end)
	const named = kept.filter((specifier) => specifier.type === "ImportSpecifier").map(text)
	const parts = kept.filter((specifier) => specifier.type !== "ImportSpecifier").map(text)
	if (named.length > 0) parts.push(`{ ${named.join(", ")} }`)
	edit.out.overwrite(declaration.start, declaration.end, `import ${parts.join(", ")} from ${text(declaration.source)};`)
}

function inside(node: Span, span: Span): boolean {
	return node.start >= span.start && node.end <= span.end
}
