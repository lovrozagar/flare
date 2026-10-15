// The oxc ESTree walk browser-floor.ts scans with: which identifiers are reads, which names a file declares, and
// which nodes hold runtime code.

export type Node = { type: string; start: number; end: number } & { [key: string]: unknown };
export type Step = { node: Node; parent?: Node; key: string };

// An identifier read as a value: not a property name, an object key, a label, a specifier, or a binding.
export function isReference(parent: Node | undefined, key: string): boolean {
	if (parent === undefined) return true;
	const computed = parent["computed"] === true;
	if (parent.type === "MemberExpression" && key === "property" && !computed) return false;
	if (["Property", "MethodDefinition", "PropertyDefinition", "AccessorProperty"].includes(parent.type)) {
		return key !== "key" || computed;
	}
	return !/^(Labeled|Break|Continue|Import|Export)/.test(parent.type);
}

// Every name the file declares anywhere. A global it shadows in any scope is treated as shadowed in all of them.
export function bindings(program: Node): Set<string> {
	const names = new Set<string>();
	const pattern = (node: unknown): void => {
		if (!isNode(node)) return;
		if (node.type === "Identifier") names.add(String(node["name"]));
		else if (node.type === "ObjectPattern") for (const property of node["properties"] as Node[]) pattern(property);
		else if (node.type === "Property") pattern(node["value"]);
		else if (node.type === "ArrayPattern") for (const element of node["elements"] as Node[]) pattern(element);
		else if (node.type === "RestElement") pattern(node["argument"]);
		else if (node.type === "AssignmentPattern") pattern(node["left"]);
		else if (node.type === "TSParameterProperty") pattern(node["parameter"]);
	};
	visit({ node: program, key: "" }, ({ node }) => {
		if (node.type === "VariableDeclarator") pattern(node["id"]);
		if (/^(Function|ArrowFunction)/.test(node.type)) {
			pattern(node["id"]);
			for (const param of node["params"] as Node[]) pattern(param);
		}
		if (node.type === "ClassDeclaration" || node.type === "ClassExpression") pattern(node["id"]);
		if (node.type === "CatchClause") pattern(node["param"]);
		if (/^Import(Default|Namespace)?Specifier$/.test(node.type)) pattern(node["local"]);
		if (node.type === "TSEnumDeclaration") pattern(node["id"]);
		return true;
	});
	return names;
}

// Types hold no runtime reads, and neither do a JSX tag's name or text. An expression wrapper keeps its expression.
const TYPE_KEYS = new Set(["typeAnnotation", "returnType", "typeParameters", "typeArguments", "superTypeArguments"]);
const TS_RUNTIME = new Set([
	"TSAsExpression",
	"TSSatisfiesExpression",
	"TSNonNullExpression",
	"TSInstantiationExpression",
	"TSTypeAssertion",
	"TSParameterProperty",
	"TSEnumDeclaration",
	"TSEnumMember",
	"TSExportAssignment",
]);

export function visit(step: Step, enter: (step: Step) => boolean): void {
	const { node } = step;
	if (node.type.startsWith("TS") && !TS_RUNTIME.has(node.type)) return;
	if (/^JSX(Identifier|MemberExpression|NamespacedName|Text|ClosingElement|ClosingFragment)$/.test(node.type)) return;
	if (!enter(step)) return;
	for (const [key, value] of Object.entries(node)) {
		if (TYPE_KEYS.has(key) || (node.type === "JSXAttribute" && key === "name")) continue;
		for (const item of [value].flat()) if (isNode(item)) visit({ node: item, parent: node, key }, enter);
	}
}

function isNode(value: unknown): value is Node {
	return typeof value === "object" && value !== null && typeof Reflect.get(value, "type") === "string";
}

export function lineStarts(text: string): number[] {
	const starts = [0];
	for (let index = text.indexOf("\n"); index !== -1; index = text.indexOf("\n", index + 1)) starts.push(index + 1);
	return starts;
}

export function lineOf(starts: readonly number[], offset: number): number {
	let line = 0;
	while (line + 1 < starts.length && (starts[line + 1] ?? Infinity) <= offset) line += 1;
	return line + 1;
}
