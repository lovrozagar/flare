import {
	parseSync,
	Visitor,
	type Argument,
	type CallExpression,
	type ExportNamedDeclaration,
	type Expression,
	type ObjectPropertyKind,
	type PropertyKey,
} from "oxc-parser";

const QUERY = "@lovrozagar/flare/query";

export type Scan = {
	file: string;
	auth?: true | "optional";
	intercept?: { from: string[]; render: string; spans: Array<{ start: number; end: number }> };
	query: boolean;
	route: boolean;
	response: boolean;
	// `.authorize()` without `.authenticate()` reads identity (B26).
	authorize: boolean;
	// The sides this file's `.input()` validates (dx/types.md).
	input: { params: boolean; search: boolean };
};

export function scanRoute(file: string, source: string): Scan {
	const parsed = parseSync(file, source, { sourceType: "module", lang: "tsx" });
	const [error] = parsed.errors;
	if (error !== undefined) throw new Error(`${file}: ${error.message}`);
	const scan: Scan = {
		file,
		query: false,
		route: false,
		response: false,
		authorize: false,
		input: { params: false, search: false },
	};
	new Visitor({
		ImportDeclaration: (node) => {
			if (node.source.value === QUERY) scan.query = true;
		},
		ExportNamedDeclaration: (node) => {
			if (exportsRoute(node)) scan.route = true;
		},
		CallExpression: (node) => readCall(scan, node),
	}).visit(parsed.program);
	return scan;
}

// `export const route = …` or `export { route }`: the builder record codegen imports (dx/routes.md).
function exportsRoute(node: ExportNamedDeclaration): boolean {
	const declared = node.declaration?.type === "VariableDeclaration" ? node.declaration.declarations : [];
	return (
		declared.some((item) => item.id.type === "Identifier" && item.id.name === "route") ||
		node.specifiers.some((item) => item.exported.type !== "Literal" && item.exported.name === "route")
	);
}

function readCall(scan: Scan, node: CallExpression): void {
	// A bare call such as createPage("…") has no property. Only a method name can mark auth or intercept.
	const callee: Expression = node.callee;
	const name = callee.type === "MemberExpression" && !callee.computed ? callee.property.name : undefined;
	if (name === "authenticate") scan.auth = true;
	if (name === "authenticateOptional") scan.auth = "optional";
	if (name === "intercept") scan.intercept = readIntercept(scan.file, node.arguments);
	// A .response() page answers every method itself, so routing must know it before its code loads.
	if (name === "response") scan.response = true;
	if (name === "authorize") scan.authorize = true;
	if (name === "input") scan.input = inputSides(node.arguments);
}

// `from` is an array of route id literals and `render` a literal label. Anything else names the file and the method
// (dx/plugin.md).
function readIntercept(file: string, args: readonly Argument[]): NonNullable<Scan["intercept"]> {
	const fail = (): never => {
		throw new Error(`${file}: intercept takes a literal from array and a literal render`);
	};
	const [config] = args;
	if (config?.type !== "ObjectExpression") return fail();
	const from = valueOf(config.properties, "from");
	const render = valueOf(config.properties, "render");
	if (from?.type !== "ArrayExpression" || render?.type !== "Literal" || typeof render.value !== "string") return fail();
	const fromIds: string[] = [];
	const spans: Array<{ start: number; end: number }> = [];
	for (const element of from.elements) {
		if (element?.type !== "Literal" || typeof element.value !== "string") return fail();
		fromIds.push(element.value);
		spans.push({ start: element.start, end: element.end });
	}
	return { from: fromIds, render: render.value, spans };
}

function valueOf(properties: readonly ObjectPropertyKind[], key: string): Expression | undefined {
	for (const property of properties) {
		if (property.type === "Property" && !property.computed && keyName(property.key) === key) return property.value;
	}
	return undefined;
}

// The keys of `.input({ params?, searchParams? })`, named or quoted. A non-literal argument validates neither as far
// as types go.
function inputSides(args: readonly Argument[]): Scan["input"] {
	const [config] = args;
	const keys =
		config?.type === "ObjectExpression"
			? config.properties.map((property) =>
					property.type === "Property" && !property.computed ? keyName(property.key) : "",
				)
			: [];
	return { params: keys.includes("params"), search: keys.includes("searchParams") };
}

// A non-computed key is a name or a string or number literal.
function keyName(key: PropertyKey): string {
	return key.type === "Identifier" ? key.name : String(Reflect.get(key, "value"));
}
