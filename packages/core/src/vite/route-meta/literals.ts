import type { Argument, ArrayExpressionElement, Expression, ObjectPropertyKind, PropertyKey } from "oxc-parser";

export type Literal = { ok: true; value: unknown } | { ok: false };

const NOT: Literal = { ok: false };

// A config the build reads before the module runs: a string, a number, a boolean, null, a negative number, a
// template with no substitution, and objects and arrays of those. A spread, an identifier, a call, a computed or
// shorthand key, a method, a regex, and a bigint are not (dx/plugin.md).
export function literalValue(node: Argument | null): Literal {
	if (node === null || node.type === "SpreadElement") return NOT;
	if (node.type === "ObjectExpression") return objectValue(node.properties);
	if (node.type === "ArrayExpression") return arrayValue(node.elements);
	return scalarValue(node);
}

// The value, or a build error that names the file and the method.
export function requireLiteral(file: string, label: string, node: Argument | undefined): unknown {
	const literal = node === undefined ? NOT : literalValue(node);
	if (!literal.ok) {
		throw new Error(
			`${file}: ${label} takes a literal object. Spreads, identifiers, and calls are not read at build time`,
		);
	}
	return literal.value;
}

function scalarValue(node: Expression): Literal {
	if (node.type === "Literal") return "regex" in node || "bigint" in node ? NOT : { ok: true, value: node.value };
	if (node.type === "TemplateLiteral") {
		return node.expressions.length === 0 ? { ok: true, value: node.quasis[0].value.cooked } : NOT;
	}
	if (node.type === "UnaryExpression" && node.operator === "-" && node.argument.type === "Literal") {
		const value: unknown = node.argument.value;
		return typeof value === "number" ? { ok: true, value: -value } : NOT;
	}
	return NOT;
}

function objectValue(properties: readonly ObjectPropertyKind[]): Literal {
	const value: Record<string, unknown> = {};
	for (const property of properties) {
		if (property.type === "SpreadElement" || property.computed || property.shorthand || property.method) return NOT;
		const key = keyOf(property.key);
		const entry = literalValue(property.value);
		if (key === undefined || !entry.ok) return NOT;
		value[key] = entry.value;
	}
	return { ok: true, value };
}

function arrayValue(elements: readonly ArrayExpressionElement[]): Literal {
	const value: unknown[] = [];
	for (const element of elements) {
		const entry = literalValue(element);
		if (!entry.ok) return NOT;
		value.push(entry.value);
	}
	return { ok: true, value };
}

function keyOf(key: PropertyKey): string | undefined {
	if (key.type === "Identifier") return key.name;
	if (key.type === "Literal" && (typeof key.value === "string" || typeof key.value === "number"))
		return String(key.value);
	return undefined;
}
