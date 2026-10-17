// What the scan reads from a route module's source text without running it: the top-level const initializers, the
// expression inside a TypeScript wrapper, a property's key, and the sides `.input()` validates.
import type { Argument, Expression, ObjectExpression, Program, PropertyKey } from "oxc-parser"

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

// The keys of `.input({ params?, searchParams? })`, named or quoted. A module-level const holding the object, and a
// spread of one, are read as the literal is (BUGS.md 346). Any other argument, an import or a call's result, validates
// neither as far as types go.
export function inputSides(
	args: readonly Argument[],
	inits: ReadonlyMap<string, Expression>,
): { params: boolean; search: boolean } {
	const keys = objectKeys(args[0], inits, new Set())
	return { params: keys.includes("params"), search: keys.includes("searchParams") }
}

function objectKeys(node: Argument | undefined, inits: ReadonlyMap<string, Expression>, seen: Set<string>): string[] {
	const object = literalObject(node, inits, seen)
	if (object === undefined) return []
	return object.properties.flatMap((property) => {
		if (property.type === "SpreadElement") return objectKeys(property.argument, inits, seen)
		return property.computed ? [] : [keyName(property.key)]
	})
}

// The object literal an argument is, or the one a module-level const it names holds, through the wrappers. A name seen
// twice is a cycle and reads as nothing.
function literalObject(
	node: Argument | undefined,
	inits: ReadonlyMap<string, Expression>,
	seen: Set<string>,
): ObjectExpression | undefined {
	let current: Expression | undefined = node?.type === "SpreadElement" ? undefined : node
	while (current !== undefined && current.type !== "ObjectExpression") {
		if (current.type !== "Identifier") current = unwrapped(current)
		else if (seen.has(current.name)) return undefined
		else {
			seen.add(current.name)
			current = inits.get(current.name)
		}
	}
	return current
}
