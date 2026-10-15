import type MagicString from "magic-string";
import { Visitor, type Argument, type CallExpression, type Expression, type Program } from "oxc-parser";
import { boundNames, type Span } from "../route-meta/index.ts";
import { nonReferences } from "./reads.ts";

// The graphs are roles (B9, B45). `client` is the browser, and a Web Worker bundled from it. `server` is the ssr
// environment and the Workers bundle.
export type Graph = "client" | "server";

// The graph of a Vite environment: the ssr environment serves requests, and prerender's Node build of the server
// renders pages, so both are server graphs (B109).
export function graphOf(environment: string): Graph {
	return environment === "ssr" || environment === "flare_prerender" ? "server" : "client";
}

type Helper = "createServerOnlyFn" | "createClientOnlyFn" | "createIsomorphicFn";

const HELPERS: ReadonlySet<string> = new Set<Helper>([
	"createServerOnlyFn",
	"createClientOnlyFn",
	"createIsomorphicFn",
]);

// How this file names the helpers: named imports, possibly aliased, and a namespace import.
type Names = { locals: Map<string, Helper>; namespace?: string };

type Step = { name: string; call: CallExpression };

// Deletes the body a graph must not hold: a server-only body and an isomorphic `.server()` body in the client graph,
// and a client-only body and an isomorphic `.client()` body in the server graph. Every use must be a
// direct call with an inline function, and an isomorphic chain one expression with both sides, or the build fails.
// Returns the removed spans.
// `skip` holds spans an earlier step already deleted: a call inside one is still checked but not edited again.
export function envEdits(edit: {
	file: string;
	program: Program;
	graph: Graph;
	out: MagicString;
	skip?: readonly Span[];
}): Span[] {
	const { file, program, graph, out, skip = [] } = edit;
	const names = helperNames(program);
	if (names.locals.size === 0 && names.namespace === undefined) return [];
	for (const local of names.locals.keys()) {
		if (boundNames(program).has(local)) throw new Error(`${file}: a local binding shadows ${local}`);
	}
	const calls = directCalls(program, names);
	requireDirect({ file, program, names }, calls);
	const removed: Span[] = [];
	const drop = (span: Span): void => {
		if (skip.some((gone) => span.start >= gone.start && span.end <= gone.end)) return;
		out.remove(span.start, span.end);
		removed.push(span);
	};
	// Every createIsomorphicFn() call has an entry, empty when nothing is chained on it.
	for (const steps of isomorphicChains(program, names).values()) isomorphic(file, steps);
	for (const [call, helper] of calls) {
		if (helper !== "createIsomorphicFn") inline(file, helper, call.arguments);
	}
	for (const body of wrongSideBodies(program, graph)) drop(body);
	return removed;
}

// The bodies a graph must not hold, found by the same walk the rewrite uses: a server-only body and a `.server()`
// body outside ssr, a client-only body and a `.client()` body in ssr. The tripwire reads a chunk's modules with it.
export function wrongSideBodies(program: Program, graph: Graph): Span[] {
	const names = helperNames(program);
	const helper: Helper = graph === "server" ? "createClientOnlyFn" : "createServerOnlyFn";
	const side = graph === "server" ? "client" : "server";
	const bodies: Span[] = [];
	for (const [call, called] of directCalls(program, names)) {
		const [body] = call.arguments;
		if (called === helper && body !== undefined) bodies.push(body);
	}
	for (const steps of isomorphicChains(program, names).values()) {
		for (const step of steps) {
			const [body] = step.call.arguments;
			if (step.name === side && body !== undefined) bodies.push(body);
		}
	}
	return bodies;
}

function helperNames(program: Program): Names {
	const names: Names = { locals: new Map() };
	for (const statement of program.body) {
		if (statement.type !== "ImportDeclaration" || statement.source.value !== "@lovrozagar/flare") continue;
		for (const specifier of statement.specifiers) {
			if (specifier.type === "ImportNamespaceSpecifier") names.namespace = specifier.local.name;
			if (specifier.type !== "ImportSpecifier") continue;
			const imported = specifier.imported.type === "Literal" ? specifier.imported.value : specifier.imported.name;
			if (isHelper(imported)) names.locals.set(specifier.local.name, imported);
		}
	}
	return names;
}

function isHelper(name: string): name is Helper {
	return HELPERS.has(name);
}

function helperOf(callee: Expression, names: Names): Helper | undefined {
	if (callee.type === "Identifier") return names.locals.get(callee.name);
	if (callee.type !== "MemberExpression" || callee.computed || callee.object.type !== "Identifier") return undefined;
	const name = callee.property.name;
	return callee.object.name === names.namespace && isHelper(name) ? name : undefined;
}

function directCalls(program: Program, names: Names): Map<CallExpression, Helper> {
	const calls = new Map<CallExpression, Helper>();
	new Visitor({
		CallExpression: (node) => {
			const helper = helperOf(node.callee, names);
			if (helper !== undefined) calls.set(node, helper);
		},
	}).visit(program);
	return calls;
}

// A helper read anywhere but as the callee of a direct call is a copy the rewrite cannot follow.
function requireDirect(at: { file: string; program: Program; names: Names }, calls: Map<CallExpression, Helper>): void {
	const { file, program, names } = at;
	const callees = new Set([...calls.keys()].map((call) => call.callee.start));
	const named = nonReferences(program);
	const fail = (name: string): never => {
		throw new Error(`${file}: ${name} must be called directly`);
	};
	new Visitor({
		Identifier: (node) => {
			if (names.locals.has(node.name) && !named.has(node.start) && !callees.has(node.start)) fail(node.name);
		},
		MemberExpression: (node) => {
			const helper = helperOf(node, names);
			if (helper !== undefined && !callees.has(node.start)) fail(helper);
		},
	}).visit(program);
}

// The argument of a body helper or a side: one inline function expression or arrow.
function inline(file: string, label: string, args: readonly Argument[]): Span {
	const [body] = args;
	if (
		args.length !== 1 ||
		body === undefined ||
		(body.type !== "FunctionExpression" && body.type !== "ArrowFunctionExpression")
	) {
		throw new Error(`${file}: ${label} takes an inline function expression or arrow`);
	}
	return body;
}

// The longest member chain on each createIsomorphicFn() call, by the call's start. Pre-order visits the outermost
// call of a chain first.
function isomorphicChains(program: Program, names: Names): Map<number, Step[]> {
	const chains = new Map<number, Step[]>();
	new Visitor({
		CallExpression: (node) => {
			const steps: Step[] = [];
			let current: Expression = node;
			while (current.type === "CallExpression") {
				const callee: Expression = current.callee;
				if (callee.type !== "MemberExpression") break;
				steps.unshift({ name: callee.computed ? "" : callee.property.name, call: current });
				current = callee.object;
			}
			if (current.type !== "CallExpression" || helperOf(current.callee, names) !== "createIsomorphicFn") return;
			if (!chains.has(current.start)) chains.set(current.start, steps);
		},
	}).visit(program);
	return chains;
}

function isomorphic(file: string, steps: readonly Step[]): void {
	const sides = steps.map((step) => step.name).sort();
	if (sides.length !== 2 || sides[0] !== "client" || sides[1] !== "server") {
		throw new Error(`${file}: createIsomorphicFn needs .server() and .client() in one expression`);
	}
	for (const step of steps) inline(file, `createIsomorphicFn .${step.name}()`, step.call.arguments);
}
