import MagicString, { type SourceMap } from "magic-string";
import { parseSync, Visitor, type Argument, type CallExpression, type Expression, type Program } from "oxc-parser";
import { boundNames, type Span } from "../route-meta/index.ts";
import { nonReferences } from "./reads.ts";

export type Graph = "client" | "ssr" | "worker";

type Helper = "createServerOnlyFn" | "createClientOnlyFn" | "createIsomorphicFn";

const HELPERS: ReadonlySet<string> = new Set<Helper>([
	"createServerOnlyFn",
	"createClientOnlyFn",
	"createIsomorphicFn",
]);

// How this file names the helpers: named imports, possibly aliased, and a namespace import.
type Names = { locals: Map<string, Helper>; namespace?: string };

type Step = { name: string; call: CallExpression };

// One module rewritten for one graph (B9, dx/env.md), or undefined when nothing changed.
export function rewriteEnv(file: string, source: string, graph: Graph): { code: string; map: SourceMap } | undefined {
	const parsed = parseSync(file, source, { sourceType: "module", lang: "tsx" });
	if (parsed.errors.length > 0) throw new Error(`${file}: ${parsed.errors[0].message}`);
	const out = new MagicString(source);
	envEdits({ file, program: parsed.program, graph, out });
	if (!out.hasChanged()) return undefined;
	return { code: out.toString(), map: out.generateMap({ hires: true, source: file, includeContent: true }) };
}

// Deletes the body a graph must not hold: a server-only body and an isomorphic `.server()` body in the client and
// worker graphs, and a client-only body and an isomorphic `.client()` body in the ssr graph. Every use must be a
// direct call with an inline function, and an isomorphic chain one expression with both sides, or the build fails.
// Returns the removed spans.
export function envEdits(edit: { file: string; program: Program; graph: Graph; out: MagicString }): Span[] {
	const { file, program, graph, out } = edit;
	const names = helperNames(program);
	if (names.locals.size === 0 && names.namespace === undefined) return [];
	for (const local of names.locals.keys()) {
		if (boundNames(program).has(local)) throw new Error(`${file}: a local binding shadows ${local}`);
	}
	const calls = directCalls(program, names);
	requireDirect({ file, program, names }, calls);
	const removed: Span[] = [];
	const drop = (span: Span): void => {
		out.remove(span.start, span.end);
		removed.push(span);
	};
	// Every createIsomorphicFn() call has an entry, empty when nothing is chained on it.
	for (const steps of isomorphicChains(program, names).values()) isomorphic({ file, graph, drop }, steps);
	for (const [call, helper] of calls) {
		if (helper === "createIsomorphicFn") continue;
		const body = inline(file, helper, call.arguments);
		if ((helper === "createServerOnlyFn") === (graph !== "ssr")) drop(body);
	}
	return removed;
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
	if (args.length !== 1 || (body.type !== "FunctionExpression" && body.type !== "ArrowFunctionExpression")) {
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

function isomorphic(at: { file: string; graph: Graph; drop: (span: Span) => void }, steps: readonly Step[]): void {
	const { file, graph, drop } = at;
	const sides = steps.map((step) => step.name).sort();
	if (sides.length !== 2 || sides[0] !== "client" || sides[1] !== "server") {
		throw new Error(`${file}: createIsomorphicFn needs .server() and .client() in one expression`);
	}
	for (const step of steps) {
		const body = inline(file, `createIsomorphicFn .${step.name}()`, step.call.arguments);
		if (step.name === (graph === "ssr" ? "client" : "server")) drop(body);
	}
}
