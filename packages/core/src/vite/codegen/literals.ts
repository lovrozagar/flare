// What the scan reads from a route module's source text without running it: the top-level const initializers, the
// expression inside a TypeScript wrapper, and a property's key.
import type { Expression, Program, PropertyKey } from "oxc-parser"

const WRAPPERS = new Set(["ParenthesizedExpression", "TSAsExpression", "TSSatisfiesExpression", "TSNonNullExpression"])

// The module's top-level `const` bindings, exported or not, by name.
export function constInits(program: Program): Map<string, Expression> {
	const inits = new Map<string, Expression>()
	for (const statement of program.body) {
		const declaration = statement.type === "ExportNamedDeclaration" ? statement.declaration : statement
		if (declaration?.type !== "VariableDeclaration" || declaration.kind !== "const") continue
		for (const item of declaration.declarations) {
			if (item.id.type === "Identifier" && item.init !== null) inits.set(item.id.name, item.init)
		}
	}
	return inits
}

// The expression inside parentheses, `as`, `satisfies`, or `!`; undefined for any other node.
export function unwrapped(node: Expression): Expression | undefined {
	return WRAPPERS.has(node.type) ? Reflect.get(node, "expression") : undefined
}

// A non-computed key is a name or a string or number literal.
export function keyName(key: PropertyKey): string {
	return key.type === "Identifier" ? key.name : String(Reflect.get(key, "value"))
}
