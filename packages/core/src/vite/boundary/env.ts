import type MagicString from "magic-string"
import { Visitor, type Argument, type CallExpression, type Expression, type Program } from "oxc-parser"
import { boundNames, type Span } from "../route-meta/index.ts"
import {
	directCalls,
	dynamicImports,
	helperNames,
	helperOf,
	namespaceOf,
	NO_SOURCES,
	type Helper,
	type HelperSources,
	type Names,
} from "./env-names.ts"
import { nonReferences } from "./reads.ts"

// The graphs are roles (B9, B45). `client` is the browser, and a Web Worker bundled from it. `server` is the ssr
// environment and the Workers bundle.
export type Graph = "client" | "server"

// The graph of a Vite environment: the ssr environment serves requests, and prerender's Node build of the server
// renders pages, so both are server graphs (B109).
export function graphOf(environment: string): Graph {
	return environment === "ssr" || environment === "flare_prerender" ? "server" : "client"
}

type Step = { name: string; call: CallExpression }

// What a rewritten use leaves in the other graph: a function that throws when called. Its words are not the runtime's,
// so the tripwire tells a rewritten call from the helper's runtime (tripwire.ts).
const STUB: Record<Graph, string> = {
	client: '(() => { throw new Error("This server-only function was called outside the server") })',
	server: '(() => { throw new Error("This client-only function was called outside the client") })',
}

// Each use becomes what its graph runs, with no reference to the helper left (BUGS.md 461): a body the graph keeps,
// in parentheses, a stub that throws for a body it must not hold, and an isomorphic chain its own side's body. So the
// helpers' runtime is dead code in every chunk, and the tripwire fails a chunk that still holds it: a call by any route
// the walk does not follow kept it. Every use must be a direct call with an inline function, and an isomorphic chain
// one expression with both sides, or the build fails. Returns the removed spans.
// `skip` holds spans an earlier step already deleted: a call inside one is still checked but not edited again.
export function envEdits(edit: {
	file: string
	program: Program
	graph: Graph
	out: MagicString
	skip?: readonly Span[]
	sources?: HelperSources
}): Span[] {
	const { file, program, graph, out, skip = [], sources = NO_SOURCES } = edit
	dynamicImports(file, program, sources)
	const names = helperNames(program, sources)
	if (names.locals.size === 0 && names.namespaces.size === 0) return []
	for (const local of names.locals.keys()) {
		if (boundNames(program).has(local)) throw new Error(`${file}: a local binding shadows ${local}`)
	}
	const calls = directCalls(program, names)
	requireDirect({ file, program, names, source: out.original }, calls)
	const chains = isomorphicChains(program, names)
	// Every createIsomorphicFn() call has an entry, empty when nothing is chained on it.
	for (const steps of chains.values()) isomorphic(file, steps)
	for (const [call, helper] of calls) {
		if (helper !== "createIsomorphicFn") inline(file, helper, call.arguments)
	}
	const removed: Span[] = []
	const gone = (span: Span): boolean =>
		[...skip, ...removed].some((done) => span.start >= done.start && span.end <= done.end)
	for (const use of uses({ calls, chains, graph })) {
		if (gone(use.span)) continue
		if (use.keep === undefined) {
			out.overwrite(use.span.start, use.span.end, STUB[graph])
			removed.push(use.span)
			continue
		}
		out.overwrite(use.span.start, use.keep.start, "(")
		out.overwrite(use.keep.end, use.span.end, ")")
		removed.push({ start: use.span.start, end: use.keep.start }, { start: use.keep.end, end: use.span.end })
	}
	return removed
}

type Use = { span: Span; keep?: Span }

// Every use in source order, an outer one before the uses inside it: the whole expression, and the body it keeps.
function uses(at: { calls: Map<CallExpression, Helper>; chains: Map<number, Step[]>; graph: Graph }): Use[] {
	const kept: Helper = at.graph === "server" ? "createServerOnlyFn" : "createClientOnlyFn"
	const list: Use[] = []
	for (const [call, helper] of at.calls) {
		if (helper === "createIsomorphicFn") continue
		const [body] = call.arguments as Expression[]
		list.push(helper === kept && body !== undefined ? { span: call, keep: body } : { span: call })
	}
	// isomorphic() accepted each chain: two steps, `.server()` and `.client()`, each with its inline body.
	for (const [start, steps] of at.chains) {
		const [first, second] = steps as [Step, Step]
		const own = (first.name === at.graph ? first : second).call.arguments[0] as Expression
		list.push({ span: { start, end: second.call.end }, keep: own })
	}
	return list.toSorted((a, b) => a.span.start - b.span.start)
}

// The bodies a graph must not hold, found by the same walk the rewrite uses: a server-only body and a `.server()`
// body outside ssr, a client-only body and a `.client()` body in ssr. The tripwire reads a chunk's modules with it.
export function wrongSideBodies(program: Program, graph: Graph, sources: HelperSources = NO_SOURCES): Span[] {
	const names = helperNames(program, sources)
	const helper: Helper = graph === "server" ? "createClientOnlyFn" : "createServerOnlyFn"
	const side = graph === "server" ? "client" : "server"
	const bodies: Span[] = []
	for (const [call, called] of directCalls(program, names)) {
		const [body] = call.arguments
		if (called === helper && body !== undefined) bodies.push(body)
	}
	for (const steps of isomorphicChains(program, names).values()) {
		for (const step of steps) {
			const [body] = step.call.arguments
			if (step.name === side && body !== undefined) bodies.push(body)
		}
	}
	return bodies
}

// A helper read anywhere but as the callee of a direct call is a copy the rewrite cannot follow, and so is a namespace,
// or a namespace nested in one, read other than as a member (plan 21 13.15). A type position is no read.
function requireDirect(
	at: { file: string; program: Program; names: Names; source: string },
	calls: Map<CallExpression, Helper>,
): void {
	const { file, program, names } = at
	const callees = new Set([...calls.keys()].map((call) => call.callee.start))
	const named = nonReferences(program)
	const members = new Set<number>()
	// `typeof helper` and `typeof ns.helper` are type positions, no reads (BUGS.md 464).
	const typed = new Set<number>()
	const fail = (name: string): never => {
		throw new Error(`${file}: ${name} must be called directly`)
	}
	new Visitor({
		MemberExpression: (node) => {
			const helper = helperOf(node, names)
			if (helper !== undefined && !callees.has(node.start)) fail(helper)
			if (helper === undefined && namespaceOf(node, names) !== undefined && !members.has(node.start)) {
				throw namespaceValue(file, at.source.slice(node.start, node.end))
			}
			if (!node.computed) members.add(node.object.start)
		},
		TSQualifiedName: (node) => void members.add(node.left.start),
		TSTypeQuery: (node) => {
			members.add(node.exprName.start)
			typed.add(leftmost(node.exprName))
		},
		Identifier: (node) => {
			if (named.has(node.start) || typed.has(node.start)) return
			if (names.locals.has(node.name) && !callees.has(node.start)) fail(node.name)
			if (names.namespaces.has(node.name) && !members.has(node.start)) throw namespaceValue(file, node.name)
		},
	}).visit(program)
}

// The start of a type query's leftmost identifier: `typeof a` is `a`, `typeof a.b.c` is `a`.
function leftmost(node: { type: string; start: number; left?: unknown }): number {
	return node.type === "TSQualifiedName" ? leftmost(node.left as typeof node) : node.start
}

// The namespace read as a value hands its exports to code the rewrite cannot follow. The route split says the same.
export function namespaceValue(file: string, namespace: string): Error {
	return new Error(`${file}: the namespace ${namespace} is read as a value; use it only as ${namespace}.name`)
}

// The argument of a body helper or a side: one inline function expression or arrow.
function inline(file: string, label: string, args: readonly Argument[]): Span {
	const [body] = args
	if (
		args.length !== 1 ||
		body === undefined ||
		(body.type !== "FunctionExpression" && body.type !== "ArrowFunctionExpression")
	) {
		throw new Error(`${file}: ${label} takes an inline function expression or arrow`)
	}
	return body
}

// The longest member chain on each createIsomorphicFn() call, by the call's start. Pre-order visits the outermost
// call of a chain first.
function isomorphicChains(program: Program, names: Names): Map<number, Step[]> {
	const chains = new Map<number, Step[]>()
	new Visitor({
		CallExpression: (node) => {
			const steps: Step[] = []
			let current: Expression = node
			// A namespace's `flare.createIsomorphicFn()` is a member call too, so the walk stops at the helper's own call.
			while (current.type === "CallExpression" && helperOf(current.callee, names) === undefined) {
				const callee: Expression = current.callee
				if (callee.type !== "MemberExpression") break
				steps.unshift({ name: callee.computed ? "" : callee.property.name, call: current })
				current = callee.object
			}
			if (current.type !== "CallExpression" || helperOf(current.callee, names) !== "createIsomorphicFn") return
			if (!chains.has(current.start)) chains.set(current.start, steps)
		},
	}).visit(program)
	return chains
}

function isomorphic(file: string, steps: readonly Step[]): void {
	const sides = steps.map((step) => step.name).sort()
	if (sides.length !== 2 || sides[0] !== "client" || sides[1] !== "server") {
		throw new Error(`${file}: createIsomorphicFn needs .server() and .client() in one expression`)
	}
	for (const step of steps) inline(file, `createIsomorphicFn .${step.name}()`, step.call.arguments)
}
