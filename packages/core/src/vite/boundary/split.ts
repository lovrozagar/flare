import MagicString, { type SourceMap } from "magic-string";
import {
	parseSync,
	Visitor,
	type CallExpression,
	type Expression,
	type ImportDeclaration,
	type ObjectProperty,
	type Program,
} from "oxc-parser";
import { requireLiteral, serverFnsOf, type Span } from "../route-meta/index.ts";
import { cacheKeyKept, routeMethod } from "./allow.ts";

const BUILDERS = new Set(["createPage", "createLayout", "createRootLayout", "createPathSegment"]);

export type Split = { code: string; map: SourceMap };

type Step = { name: string; call: CallExpression; object: Expression };

// The client and worker graphs of one module (B8, B45). A route chain loses every server method: a middle call is
// cut, and a removed call that ends the chain keeps the call with `undefined`, so the export is still a record. A
// server function's input, authorize, handler, and stream arguments become `undefined`. An import no kept code
// reads is then dropped. A bare `import "x"` stays. Undefined when nothing changed.
export function splitClient(file: string, source: string): Split | undefined {
	const parsed = parseSync(file, source, { sourceType: "module", lang: "tsx" });
	if (parsed.errors.length > 0) throw new Error(`${file}: ${parsed.errors[0].message}`);
	const edit: Edit = { file, source, out: new MagicString(source), removed: [] };
	for (const [name, steps] of routeChains(parsed.program)) stripRoute(edit, name, steps);
	for (const record of serverFnsOf(file, parsed.program)) {
		for (const method of record.methods) {
			if (["input", "authorize", "handler", "stream"].includes(method.name)) blank(edit, method.args);
		}
	}
	if (!edit.out.hasChanged()) return undefined;
	pruneImports(edit, parsed.program);
	return { code: edit.out.toString(), map: edit.out.generateMap({ hires: true, source: file, includeContent: true }) };
}

type Edit = { file: string; source: string; out: MagicString; removed: Span[] };

// `export const name = builder(...)...` chains whose root is a route builder imported from the package.
function routeChains(program: Program): Array<[string, Step[]]> {
	const builders = builderNames(program);
	const chains: Array<[string, Step[]]> = [];
	for (const statement of program.body) {
		if (statement.type !== "ExportNamedDeclaration" || statement.declaration?.type !== "VariableDeclaration") continue;
		for (const declarator of statement.declaration.declarations) {
			const steps = declarator.init === null ? undefined : stepsOf(declarator.init, builders);
			if (steps !== undefined && declarator.id.type === "Identifier") chains.push([declarator.id.name, steps]);
		}
	}
	return chains;
}

function builderNames(program: Program): Set<string> {
	const names = new Set<string>();
	for (const statement of program.body) {
		if (statement.type === "ImportDeclaration" && statement.source.value === "@lovrozagar/flare") {
			for (const specifier of statement.specifiers) {
				if (specifier.type !== "ImportSpecifier") continue;
				const imported = specifier.imported.type === "Literal" ? specifier.imported.value : specifier.imported.name;
				if (BUILDERS.has(imported)) names.add(specifier.local.name);
			}
		}
	}
	return names;
}

// Root-first steps, or undefined when the chain does not start at a builder. A computed call is kept as an
// empty name, which stripRoute reports.
function stepsOf(expression: Expression, builders: ReadonlySet<string>): Step[] | undefined {
	const steps: Step[] = [];
	let node: Expression = expression;
	while (node.type === "CallExpression") {
		const callee: Expression = node.callee;
		if (callee.type === "Identifier") return builders.has(callee.name) ? steps : undefined;
		if (callee.type !== "MemberExpression") return undefined;
		steps.unshift({ name: callee.computed ? "" : callee.property.name, call: node, object: callee.object });
		node = callee.object;
	}
	return undefined;
}

function stripRoute(edit: Edit, name: string, steps: readonly Step[]): void {
	steps.forEach((step, index) => {
		if (step.name === "") {
			throw new Error(`${edit.file}: ${name} calls a chain method by element access. Call each method by name`);
		}
		const verdict = routeMethod(step.name);
		if (verdict === "unknown") throw new Error(`${edit.file}: .${step.name}() is not a route chain method`);
		if (verdict === "cache") cache(edit, name, step);
		if (verdict === "remove" && index === steps.length - 1) blank(edit, step.call.arguments);
		else if (verdict === "remove") cut(edit, step);
	});
}

// `.cache()` keeps its `client` field alone, or goes when it has none.
function cache(edit: Edit, name: string, step: Step): void {
	const [argument] = step.call.arguments;
	// Anything but a literal object fails with the literal message.
	const label = `${name} .cache()`;
	if (argument?.type !== "ObjectExpression") return void requireLiteral(edit.file, label, undefined);
	requireLiteral(edit.file, label, argument);
	const client = argument.properties.find(
		(property): property is ObjectProperty =>
			property.type === "Property" && property.key.type === "Identifier" && cacheKeyKept(property.key.name),
	);
	if (client === undefined) return cut(edit, step);
	edit.out.overwrite(argument.start, argument.end, `{ ${edit.source.slice(client.start, client.end)} }`);
	edit.removed.push({ start: argument.start, end: argument.end });
}

// `.method(args)` goes from the end of the object it was called on.
function cut(edit: Edit, step: Step): void {
	edit.out.remove(step.object.end, step.call.end);
	edit.removed.push({ start: step.object.end, end: step.call.end });
}

function blank(edit: Edit, args: readonly Span[]): void {
	const first = args.at(0);
	const last = args.at(-1);
	if (first === undefined || last === undefined) return;
	edit.out.overwrite(first.start, last.end, "undefined");
	edit.removed.push({ start: first.start, end: last.end });
}

// A name counts as read when an identifier with it sits outside every import and every removed span. That is
// conservative: a shadowing local keeps the import, which the tripwire still checks.
function pruneImports(edit: Edit, program: Program): void {
	const imports = program.body.filter((node): node is ImportDeclaration => node.type === "ImportDeclaration");
	const read = new Set<string>();
	const outside = (node: Span): boolean =>
		!imports.some((entry) => inside(node, entry)) && !edit.removed.some((span) => inside(node, span));
	const note = (node: Span & { name: string }): void => {
		if (outside(node)) read.add(node.name);
	};
	new Visitor({ Identifier: note, JSXIdentifier: note }).visit(program);
	for (const declaration of imports) {
		if (declaration.importKind !== "type" && declaration.specifiers.length > 0) prune(edit, declaration, read);
	}
}

function prune(edit: Edit, declaration: ImportDeclaration, read: ReadonlySet<string>): void {
	const kept = declaration.specifiers.filter((specifier) => read.has(specifier.local.name));
	if (kept.length === declaration.specifiers.length) return;
	if (kept.length === 0) return void edit.out.remove(declaration.start, declaration.end);
	const text = (node: Span): string => edit.source.slice(node.start, node.end);
	const named = kept.filter((specifier) => specifier.type === "ImportSpecifier").map(text);
	const parts = kept.filter((specifier) => specifier.type !== "ImportSpecifier").map(text);
	if (named.length > 0) parts.push(`{ ${named.join(", ")} }`);
	edit.out.overwrite(
		declaration.start,
		declaration.end,
		`import ${parts.join(", ")} from ${text(declaration.source)};`,
	);
}

function inside(node: Span, span: Span): boolean {
	return node.start >= span.start && node.end <= span.end;
}
