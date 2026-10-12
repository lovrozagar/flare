import {
	Visitor,
	type BindingPattern,
	type BindingProperty,
	type BindingRestElement,
	type ParamPattern,
	type Program,
} from "oxc-parser";
import type { Span } from "../route-meta/index.ts";

// `fn` is a function or the module: where `var` and a parameter land. Any other scope is a block.
type Scope = Span & { fn: boolean; names: Set<string> };

type Pattern = ParamPattern | BindingPattern | BindingRestElement | BindingProperty | null;

// The module-scope names that identifiers in reference position read, among the nodes `counted` keeps. A name a
// nearer scope declares is that scope's, so a parameter, a block `const`, or a hoisted `var` named like an import
// does not read the import (02-system B8).
export function moduleReads(program: Program, counted: (node: Span) => boolean): Set<string> {
	const named = nonReferences(program);
	const scopes = scopesOf(program);
	const reads = new Set<string>();
	const note = (node: Span & { name: string }): void => {
		if (named.has(node.start) || !counted(node)) return;
		if (declaring(scopes, node, node.name) === scopes[0]) reads.add(node.name);
	};
	new Visitor({ Identifier: note, JSXIdentifier: note }).visit(program);
	return reads;
}

// The nearest scope around `node` that declares `name`. Scopes are opened outer-first, so the last match is the
// nearest.
function declaring(scopes: readonly Scope[], node: Span, name: string): Scope | undefined {
	let found: Scope | undefined;
	for (const scope of scopes) if (contains(scope, node) && scope.names.has(name)) found = scope;
	return found;
}

// Every scope with what it declares, in one pre-order walk, so every scope around a node exists before the node is
// visited. `var` hoists to the nearest function. `let`, `const`, a class, an enum, and a function declaration stay
// in their block. A named function expression's name and a class expression's name are their own.
function scopesOf(program: Program): Scope[] {
	const module: Scope = { start: program.start, end: program.end, fn: true, names: new Set() };
	const scopes = [module];
	const around = (node: Span, fnOnly: boolean): Scope => {
		let found = module;
		for (const scope of scopes) if (contains(scope, node) && (!fnOnly || scope.fn)) found = scope;
		return found;
	};
	const open = (node: Span, fn: boolean): Scope => {
		const scope = { start: node.start, end: node.end, fn, names: new Set<string>() };
		scopes.push(scope);
		return scope;
	};
	const declare = (scope: Scope, pattern: Pattern): void => {
		for (const node of patternNodes(pattern)) scope.names.add(node.name);
	};
	const fn = (node: Span & { id: { name: string } | null; params: ParamPattern[] }, named: boolean): void => {
		// A declaration's name lands where it is declared. An expression's name is only its own.
		if (node.id !== null && !named) around(node, false).names.add(node.id.name);
		const scope = open(node, true);
		if (node.id !== null && named) scope.names.add(node.id.name);
		for (const param of node.params) declare(scope, param);
	};
	const block = (node: Span): void => void open(node, false);
	new Visitor({
		ImportDeclaration: (node) => node.specifiers.forEach((specifier) => module.names.add(specifier.local.name)),
		VariableDeclaration: (node) =>
			node.declarations.forEach((item) => declare(around(node, node.kind === "var"), item.id)),
		FunctionDeclaration: (node) => fn(node, false),
		FunctionExpression: (node) => fn(node, true),
		ArrowFunctionExpression: (node) => fn(node, true),
		ClassDeclaration: (node) => node.id !== null && around(node, false).names.add(node.id.name),
		ClassExpression: (node) => {
			const scope = open(node, false);
			if (node.id !== null) scope.names.add(node.id.name);
		},
		TSEnumDeclaration: (node) => around(node, false).names.add(node.id.name),
		CatchClause: (node) => declare(open(node, false), node.param),
		BlockStatement: block,
		StaticBlock: block,
		ForStatement: block,
		ForInStatement: block,
		ForOfStatement: block,
		SwitchStatement: block,
	}).visit(program);
	return scopes;
}

// The start of every identifier that names something rather than reading a binding.
export function nonReferences(program: Program): Set<number> {
	const starts = new Set<number>();
	const add = (node: Span | null | undefined): void => void (node && starts.add(node.start));
	const key = (node: { key: Span; computed: boolean }): void => {
		if (!node.computed) add(node.key);
	};
	const bind = (pattern: Pattern): void => {
		for (const node of patternNodes(pattern)) add(node);
	};
	const fn = (node: { id: Span | null; params: ParamPattern[] }): void => {
		add(node.id);
		for (const param of node.params) bind(param);
	};
	new Visitor({
		MemberExpression: (node) => !node.computed && add(node.property),
		JSXMemberExpression: (node) => add(node.property),
		JSXAttribute: (node) => add(node.name),
		JSXNamespacedName: (node) => [node.namespace, node.name].forEach(add),
		MetaProperty: (node) => [node.meta, node.property].forEach(add),
		Property: (node) => !node.shorthand && key(node),
		MethodDefinition: key,
		PropertyDefinition: key,
		TSPropertySignature: key,
		TSMethodSignature: key,
		TSQualifiedName: (node) => add(node.right),
		LabeledStatement: (node) => add(node.label),
		BreakStatement: (node) => add(node.label),
		ContinueStatement: (node) => add(node.label),
		ExportSpecifier: (node) => node.exported.start !== node.local.start && add(node.exported),
		ImportDeclaration: (node) => node.specifiers.forEach((specifier) => add(specifier.local)),
		ImportSpecifier: (node) => add(node.imported),
		VariableDeclarator: (node) => bind(node.id),
		FunctionDeclaration: fn,
		FunctionExpression: fn,
		ArrowFunctionExpression: fn,
		ClassDeclaration: (node) => add(node.id),
		ClassExpression: (node) => add(node.id),
		CatchClause: (node) => bind(node.param),
		TSEnumDeclaration: (node) => add(node.id),
	}).visit(program);
	return starts;
}

// The identifiers a pattern declares. A default value is a read, so it is not one of them.
function patternNodes(pattern: Pattern): Array<Span & { name: string }> {
	if (pattern === null) return [];
	if (pattern.type === "Identifier") return [pattern];
	if (pattern.type === "TSParameterProperty") return patternNodes(pattern.parameter);
	if (pattern.type === "RestElement") return patternNodes(pattern.argument);
	if (pattern.type === "AssignmentPattern") return patternNodes(pattern.left);
	if (pattern.type === "Property") return patternNodes(pattern.value);
	if (pattern.type === "ArrayPattern") return pattern.elements.flatMap(patternNodes);
	return pattern.properties.flatMap(patternNodes);
}

function contains(span: Span, node: Span): boolean {
	return node.start >= span.start && node.end <= span.end;
}
