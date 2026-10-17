import {
	CROSS_ORIGIN_RULE,
	crossOriginRefused,
	isMethodList,
	METHODS_RULE,
} from "../../shared/route-builder/methods.ts"
import { langOf } from "../route-meta/index.ts"
import { constInits, keyName, unwrapped } from "./literals.ts"
import {
	parseSync,
	Visitor,
	type Argument,
	type CallExpression,
	type ExportNamedDeclaration,
	type Expression,
	type ObjectPropertyKind,
	type Program,
} from "oxc-parser"

const QUERY = "@lovrozagar/flare/query"

// The literal fields of `cache.client` that reach the route record: a string, a boolean, or a `prefetch` object of
// string triggers. `false` turns the client cache off for the route.
export type ClientValue = string | boolean | Record<string, string>
export type ClientLiteral = false | Record<string, ClientValue>

const CLIENT_KEYS = ["prefetch", "staleTime", "gcTime", "prefetchStaleTime", "prefetchGcTime", "cacheDeferred"]

const BUILDERS = new Set(["createPage", "createLayout", "createRootLayout", "createPathSegment"])

export type Scan = {
	file: string
	client?: ClientLiteral
	auth?: true | "optional"
	intercept?: { from: string[]; render: string; spans: Array<{ start: number; end: number }> }
	query: boolean
	route: boolean
	response: boolean
	// `.response(fn, { methods })`'s literal list, which the route node carries (plan 21 13.5).
	methods?: string[]
	// `.response(fn, { crossOrigin: true })`, which codegen checks against the chain's auth (BUGS.md 273).
	crossOrigin?: true
	// `.authorize()` without `.authenticate()` reads identity (B26).
	authorize: boolean
	// The route's chain calls `.input()`, whatever its argument: the register reads that route's validated params and
	// search from its own type (dx/types.md, BUGS.md 349).
	input: boolean
	// The ids this file's builder calls name, each a string literal or a module-level const bound to one, with the span
	// of that literal, quotes included. Codegen checks them against the file's path, and dev rewrites them to it
	// (dx/routes.md).
	ids: BuilderId[]
}

export type BuilderId = { id: string; start: number; end: number }

export function scanRoute(file: string, source: string): Scan {
	const parsed = parseSync(file, source, { sourceType: "module", lang: langOf(file) })
	const [error] = parsed.errors
	if (error !== undefined) throw new Error(`${file}: ${error.message}`)
	const scan: Scan = {
		file,
		query: false,
		route: false,
		response: false,
		authorize: false,
		input: false,
		ids: [],
	}
	const consts = constStrings(parsed.program)
	const chain = routeCalls(parsed.program)
	new Visitor({
		ImportDeclaration: (node) => {
			if (node.source.value === QUERY) scan.query = true
		},
		ExportNamedDeclaration: (node) => {
			if (exportsRoute(node)) scan.route = true
		},
		CallExpression: (node) => {
			if (chain.has(node)) readCall(scan, node)
			const id = builderId(node, consts)
			if (id !== undefined) scan.ids.push(id)
		},
	}).visit(parsed.program)
	return scan
}

// The module's top-level `const NAME = "…"` bindings, which a builder call may name its id by (`createPage(ID)`), each
// with its literal's span.
function constStrings(program: Program): Map<string, BuilderId> {
	const consts = new Map<string, BuilderId>()
	for (const [name, init] of constInits(program)) {
		if (init.type === "Literal" && typeof init.value === "string")
			consts.set(name, { id: init.value, start: init.start, end: init.end })
	}
	return consts
}

// The calls of the route's own builder chain, `route = createPage(…).….render(…)`, through any module-level const it
// starts from: only they say what the page is. A `.response()` or `.authenticate()` elsewhere in the file, a helper's
// or another builder's, says nothing (plan 21 13.2). A `satisfies`, `as`, `!`, or parentheses are seen through.
function routeCalls(program: Program): Set<CallExpression> {
	const inits = constInits(program)
	const calls = new Set<CallExpression>()
	const named = new Set<string>()
	let node = inits.get("route")
	while (node !== undefined) {
		if (node.type !== "Identifier") node = under(node, calls)
		else if (named.has(node.name)) break
		else {
			named.add(node.name)
			node = inits.get(node.name)
		}
	}
	return calls
}

// One step down a chain: a call's receiver, or the expression a wrapper holds.
function under(node: Expression, calls: Set<CallExpression>): Expression | undefined {
	if (node.type === "CallExpression") {
		calls.add(node)
		return node.callee.type === "MemberExpression" ? node.callee.object : undefined
	}
	return unwrapped(node)
}

// The id a bare builder call names, when its first argument is a string literal or a const bound to one.
function builderId(node: CallExpression, consts: ReadonlyMap<string, BuilderId>): BuilderId | undefined {
	if (node.callee.type !== "Identifier" || !BUILDERS.has(node.callee.name)) return undefined
	const [first] = node.arguments
	if (first?.type === "Literal" && typeof first.value === "string")
		return { id: first.value, start: first.start, end: first.end }
	return first?.type === "Identifier" ? consts.get(first.name) : undefined
}

// `export const route = …` or `export { route }`: the builder record codegen imports (dx/routes.md).
function exportsRoute(node: ExportNamedDeclaration): boolean {
	const declared = node.declaration?.type === "VariableDeclaration" ? node.declaration.declarations : []
	return (
		declared.some((item) => item.id.type === "Identifier" && item.id.name === "route") ||
		node.specifiers.some((item) => item.exported.type !== "Literal" && item.exported.name === "route")
	)
}

function readCall(scan: Scan, node: CallExpression): void {
	// A bare call such as createPage("…") has no property. Only a method name can mark auth or intercept.
	const callee: Expression = node.callee
	const name = callee.type === "MemberExpression" && !callee.computed ? callee.property.name : undefined
	if (name === "authenticate") scan.auth = true
	if (name === "authenticateOptional") scan.auth = "optional"
	if (name === "intercept") scan.intercept = readIntercept(scan.file, node.arguments)
	// A .response() page answers every method itself, so routing must know it before its code loads.
	if (name === "response") readResponse(scan, node.arguments)
	if (name === "authorize") scan.authorize = true
	if (name === "input") scan.input = true
	if (name === "cache") readClient(scan, node.arguments)
}

// `.response(fn, { methods })`: the methods are a literal array the route node carries, so routing answers a method
// the page does not before its code loads. No options is GET (plan 21 13.5).
function readResponse(scan: Scan, args: readonly Argument[]): void {
	scan.response = true
	const [, options] = args
	if (options === undefined) return
	const literal = `${scan.file}: .response() ${METHODS_RULE}, written as a literal`
	const properties = options.type === "ObjectExpression" ? options.properties : []
	if (options.type !== "ObjectExpression" || !properties.every(readable)) throw new Error(literal)
	// JavaScript keeps the last of two equal keys; the scan reads the first, so a repeated key fails (BUGS.md 283).
	const names = properties.map((property) => keyName(property.key))
	if (new Set(names).size !== names.length) throw new Error(literal)
	const list = valueOf(options.properties, "methods")
	if (list !== undefined) {
		const values =
			list.type === "ArrayExpression" ? list.elements.map((item) => (item?.type === "Literal" ? item.value : 0)) : []
		if (!isMethodList(values)) throw new Error(literal)
		scan.methods = values
	}
	readCrossOrigin(scan, valueOf(options.properties, "crossOrigin"))
}

// A `.response()` option the scan reads. A spread, a computed key, or another key could carry methods it cannot
// (BUGS.md 276).
function readable(property: ObjectPropertyKind): property is Extract<ObjectPropertyKind, { type: "Property" }> {
	return (
		property.type === "Property" && !property.computed && ["methods", "crossOrigin"].includes(keyName(property.key))
	)
}

// `crossOrigin` is a literal boolean. A route that answers only GET or OPTIONS has no Origin check to drop; the chain's
// auth is codegen's to check, which sees the layouts (B44, BUGS.md 273).
function readCrossOrigin(scan: Scan, value: ReturnType<typeof valueOf>): void {
	if (value === undefined) return
	if (value.type !== "Literal" || typeof value.value !== "boolean") {
		throw new Error(`${scan.file}: .response() crossOrigin is a literal true or false`)
	}
	if (!value.value) return
	if (crossOriginRefused(scan.methods, false)) throw new Error(`${scan.file}: .response() ${CROSS_ORIGIN_RULE}`)
	scan.crossOrigin = true
}

// `.cache({ client })`: only the literal fields are copied, and a non-literal one is left out without an error (B89).
// Auth and the server modes are never read here.
function readClient(scan: Scan, args: readonly Argument[]): void {
	const [config] = args
	const client = config?.type === "ObjectExpression" ? valueOf(config.properties, "client") : undefined
	if (client?.type === "Literal" && client.value === false) {
		scan.client = false
		return
	}
	if (client?.type !== "ObjectExpression") return
	const fields = CLIENT_KEYS.flatMap((key) => {
		const value = literalOf(valueOf(client.properties, key))
		return value === undefined ? [] : [[key, value] as const]
	})
	if (fields.length > 0) scan.client = Object.fromEntries(fields)
}

function literalOf(node: Expression | undefined): ClientValue | undefined {
	if (node?.type === "Literal" && (typeof node.value === "string" || typeof node.value === "boolean")) return node.value
	if (node?.type !== "ObjectExpression") return undefined
	const triggers: Record<string, string> = {}
	for (const property of node.properties) {
		if (property.type !== "Property" || property.computed) return undefined
		const value = property.value
		if (value.type !== "Literal" || typeof value.value !== "string") return undefined
		triggers[keyName(property.key)] = value.value
	}
	return triggers
}

// `from` is an array of route id literals and `render` a literal label. Anything else names the file and the method
// (dx/plugin.md).
function readIntercept(file: string, args: readonly Argument[]): NonNullable<Scan["intercept"]> {
	const fail = (): never => {
		throw new Error(`${file}: intercept takes a literal from array and a literal render`)
	}
	const [config] = args
	if (config?.type !== "ObjectExpression") return fail()
	const from = valueOf(config.properties, "from")
	const render = valueOf(config.properties, "render")
	if (from?.type !== "ArrayExpression" || render?.type !== "Literal" || typeof render.value !== "string") return fail()
	const fromIds: string[] = []
	const spans: Array<{ start: number; end: number }> = []
	for (const element of from.elements) {
		if (element?.type !== "Literal" || typeof element.value !== "string") return fail()
		fromIds.push(element.value)
		spans.push({ start: element.start, end: element.end })
	}
	return { from: fromIds, render: render.value, spans }
}

function valueOf(properties: readonly ObjectPropertyKind[], key: string): Expression | undefined {
	for (const property of properties) {
		if (property.type === "Property" && !property.computed && keyName(property.key) === key) return property.value
	}
	return undefined
}
