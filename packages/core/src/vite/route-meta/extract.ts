import {
	parseSync,
	Visitor,
	type BindingPattern,
	type BindingProperty,
	type BindingRestElement,
	type CallExpression,
	type Expression,
	type ImportDeclaration,
	type ParamPattern,
	type Program,
} from "oxc-parser"
import { requireLiteral } from "./literals.ts"

const MODULE = "@lovrozagar/flare/server-fn"

export type Span = { start: number; end: number }

export type FnMethod = Span & { name: string; args: Span[] }

// One `export const name = createServerFn(config)…handler(fn)` site. `config` is the argument's span, or an empty
// span inside the parentheses when there is none, so the transform can write `__id` and `__name` there.
export type FnRecord = Span & {
	name: string
	config: Span & { literal: unknown }
	methods: FnMethod[]
}

// How this file names createServerFn: a named import, possibly aliased, or a namespace import.
type Names = { local?: string; namespace?: string }

type Step = { name: string; call: CallExpression }

type Chain = { root: CallExpression; steps: Step[]; problem?: string | undefined }

// One oxc parse per file. A chain counts only as call nodes, so a comment, a string, or a regex never does
// (dx/plugin.md). Every createServerFn call must be a direct export ending in .handler() or .stream() (B85).
export function extractServerFns(file: string, source: string): FnRecord[] {
	const parsed = parseSync(file, source, { sourceType: "module", lang: "tsx" })
	const [error] = parsed.errors
	if (error !== undefined) throw new Error(`${file}: ${error.message}`)
	return serverFnsOf(file, parsed.program)
}

// The same walk over a program the caller already parsed, so a transform parses each file once.
export function serverFnsOf(file: string, program: Program): FnRecord[] {
	const names = importedNames(program)
	if (names.local === undefined && names.namespace === undefined) return []
	if (names.local !== undefined && boundNames(program).has(names.local)) {
		throw new Error(`${file}: a local binding shadows ${names.local}`)
	}
	const roots = rootCalls(program, names)
	const records = exported(program, names).map(([name, chain]) => record(file, name, chain))
	if (records.length < roots.size) {
		throw new Error(`${file}: createServerFn must be a direct export: export const name = createServerFn()…`)
	}
	return records
}

function importedNames(program: Program): Names {
	const names: Names = {}
	for (const statement of program.body) {
		if (statement.type === "ImportDeclaration" && statement.source.value === MODULE) readImport(statement, names)
	}
	return names
}

function readImport(node: ImportDeclaration, names: Names): void {
	for (const specifier of node.specifiers) {
		if (specifier.type === "ImportNamespaceSpecifier") names.namespace = specifier.local.name
		if (specifier.type !== "ImportSpecifier") continue
		const imported = specifier.imported.type === "Literal" ? specifier.imported.value : specifier.imported.name
		if (imported === "createServerFn") names.local = specifier.local.name
	}
}

// Every name a declaration, a parameter, a class, or a catch clause binds.
export function boundNames(program: Program): Set<string> {
	const bound = new Set<string>()
	const add = (pattern: Pattern): void => {
		for (const name of patternNames(pattern)) bound.add(name)
	}
	const fn = (node: { id: { name: string } | null; params: ParamPattern[] }): void => {
		if (node.id !== null) bound.add(node.id.name)
		for (const param of node.params) add(param)
	}
	new Visitor({
		VariableDeclarator: (node) => add(node.id),
		FunctionDeclaration: fn,
		FunctionExpression: fn,
		ArrowFunctionExpression: fn,
		ClassDeclaration: (node) => node.id !== null && bound.add(node.id.name),
		CatchClause: (node) => add(node.param),
	}).visit(program)
	return bound
}

type Pattern = ParamPattern | BindingPattern | BindingRestElement | BindingProperty | null

function patternNames(pattern: Pattern): string[] {
	if (pattern === null) return []
	if (pattern.type === "Identifier") return [pattern.name]
	if (pattern.type === "TSParameterProperty") return patternNames(pattern.parameter)
	if (pattern.type === "RestElement") return patternNames(pattern.argument)
	if (pattern.type === "AssignmentPattern") return patternNames(pattern.left)
	if (pattern.type === "Property") return patternNames(pattern.value)
	if (pattern.type === "ArrayPattern") return pattern.elements.flatMap(patternNames)
	return pattern.properties.flatMap(patternNames)
}

function rootCalls(program: Program, names: Names): Set<number> {
	const roots = new Set<number>()
	new Visitor({ CallExpression: (node) => isRoot(node, names) && roots.add(node.start) }).visit(program)
	return roots
}

function isRoot(node: CallExpression, names: Names): boolean {
	const callee = node.callee
	if (callee.type === "Identifier") return callee.name === names.local
	return (
		callee.type === "MemberExpression" &&
		!callee.computed &&
		callee.object.type === "Identifier" &&
		callee.object.name === names.namespace &&
		callee.property.name === "createServerFn"
	)
}

// `export const name = chain` declarators whose chain starts at createServerFn. A `let` or `var` export could be
// reassigned, so the id would no longer name the body the build split. It counts as no export.
function exported(program: Program, names: Names): Array<[string, Chain]> {
	const found: Array<[string, Chain]> = []
	for (const statement of program.body) {
		if (statement.type !== "ExportNamedDeclaration" || statement.declaration?.type !== "VariableDeclaration") continue
		if (statement.declaration.kind !== "const") continue
		for (const declarator of statement.declaration.declarations) {
			const chain = declarator.init === null ? undefined : chainOf(declarator.init, names)
			if (chain !== undefined && declarator.id.type === "Identifier") found.push([declarator.id.name, chain])
		}
	}
	return found
}

// Unwinds `root.a(…).b(…)` from the outside in. An optional or element call is kept as the problem, so it is
// reported only when the chain does start at createServerFn.
function chainOf(expression: Expression, names: Names): Chain | undefined {
	const steps: Step[] = []
	let problem =
		expression.type === "ChainExpression" ? "calls a chain method optionally. Call .handler() directly" : undefined
	let node: Expression = expression.type === "ChainExpression" ? expression.expression : expression
	while (node.type === "CallExpression") {
		if (isRoot(node, names)) return { root: node, steps, problem }
		const callee: Expression = node.callee
		if (callee.type !== "MemberExpression") return undefined
		if (callee.computed) problem ??= "calls a chain method by element access. Call each method by name"
		steps.unshift({ name: callee.computed ? "" : callee.property.name, call: node })
		node = callee.object
	}
	return undefined
}

// The chain ends at .handler() or .stream(), and its `.cache()` and createServerFn config are literals the build
// reads (B43). With no config, the insertion point sits inside the empty parentheses.
function record(file: string, name: string, chain: Chain): FnRecord {
	if (chain.problem !== undefined) throw new Error(`${file}: ${name} ${chain.problem}`)
	const last = chain.steps.at(-1)
	if (last === undefined || (last.name !== "handler" && last.name !== "stream")) {
		throw new Error(`${file}: ${name} must end its createServerFn chain with .handler() or .stream()`)
	}
	for (const step of chain.steps) {
		if (step.name === "cache") requireLiteral(file, `${name} .cache()`, step.call.arguments[0])
	}
	const [config] = chain.root.arguments
	const literal = config === undefined ? {} : requireLiteral(file, `${name} createServerFn()`, config)
	const inside = { start: chain.root.end - 1, end: chain.root.end - 1 }
	const methods = chain.steps.map((step) => ({
		name: step.name,
		...span(step.call),
		args: step.call.arguments.map(span),
	}))
	return {
		name,
		start: chain.root.start,
		end: last.call.end,
		config: { ...(config === undefined ? inside : span(config)), literal },
		methods,
	}
}

function span(node: Span): Span {
	return { start: node.start, end: node.end }
}
