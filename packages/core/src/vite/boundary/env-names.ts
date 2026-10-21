import { Visitor, type CallExpression, type Expression, type Program } from "oxc-parser"

// How a module names the env helpers (B9, BUGS.md 461): its own imports of the package, and the helpers its other
// import sources bring through the app's barrels (helper-sources.ts). Split from env.ts at its 300-line limit.

export type Helper = "createServerOnlyFn" | "createClientOnlyFn" | "createIsomorphicFn"

export const FLARE = "@lovrozagar/flare"

// What a module exports of the helpers, by export name: a helper, or a namespace that holds helpers and namespaces.
export type HelperExport = Helper | HelperExports
export type HelperExports = ReadonlyMap<string, HelperExport>

const HELPERS: readonly Helper[] = ["createServerOnlyFn", "createClientOnlyFn", "createIsomorphicFn"]

// The package's own: every helper under its name.
export const FLARE_EXPORTS: HelperExports = new Map(HELPERS.map((name) => [name, name]))

// For each import source of a module other than the package, the helpers it brings. A source that brings none is
// absent.
export type HelperSources = ReadonlyMap<string, HelperExports>

export const NO_SOURCES: HelperSources = new Map()

// Named imports, possibly aliased, and namespace imports, with what each holds.
export type Names = { locals: Map<string, Helper>; namespaces: Map<string, HelperExports> }

// A type-only import, `import type` or `import { type x }`, is erased: it names no helper (BUGS.md 464).
export function helperNames(program: Program, sources: HelperSources): Names {
	const names: Names = { locals: new Map(), namespaces: new Map() }
	for (const statement of program.body) {
		if (statement.type !== "ImportDeclaration" || statement.importKind === "type") continue
		const exports = exportsFrom(statement.source.value, sources)
		if (exports === undefined) continue
		for (const specifier of statement.specifiers) {
			if (specifier.type === "ImportNamespaceSpecifier") {
				names.namespaces.set(specifier.local.name, exports)
				continue
			}
			if (specifier.type === "ImportSpecifier" && specifier.importKind === "type") continue
			const imported =
				specifier.type === "ImportDefaultSpecifier"
					? "default"
					: specifier.imported.type === "Literal"
						? specifier.imported.value
						: specifier.imported.name
			const entry = exports.get(imported)
			if (typeof entry === "string") names.locals.set(specifier.local.name, entry)
			else if (entry !== undefined) names.namespaces.set(specifier.local.name, entry)
		}
	}
	return names
}

export function exportsFrom(source: string, sources: HelperSources): HelperExports | undefined {
	return source === FLARE ? FLARE_EXPORTS : sources.get(source)
}

// The helper a callee names: an import, or a member chain off a namespace, `ns.helper` or `ns.inner.helper`.
export function helperOf(callee: Expression, names: Names): Helper | undefined {
	if (callee.type === "Identifier") return names.locals.get(callee.name)
	if (callee.type !== "MemberExpression" || callee.computed) return undefined
	const entry = namespaceOf(callee.object, names)?.get(callee.property.name)
	return typeof entry === "string" ? entry : undefined
}

// The namespace an expression names: a namespace import, or a member chain to a nested one.
export function namespaceOf(node: Expression, names: Names): HelperExports | undefined {
	if (node.type === "Identifier") return names.namespaces.get(node.name)
	if (node.type !== "MemberExpression" || node.computed) return undefined
	const entry = namespaceOf(node.object, names)?.get(node.property.name)
	return typeof entry === "string" ? undefined : entry
}

export function directCalls(program: Program, names: Names): Map<CallExpression, Helper> {
	const calls = new Map<CallExpression, Helper>()
	new Visitor({
		CallExpression: (node) => {
			const helper = helperOf(node.callee, names)
			if (helper !== undefined) calls.set(node, helper)
		},
	}).visit(program)
	return calls
}

// A module source as written, through parentheses, `as`, `satisfies`, a non-null `!`, and a template literal with no
// expression; undefined for one computed at run time.
export function literalSource(node: Expression): string | undefined {
	const inner = unwrapped(node)
	if (inner.type === "Literal") return typeof inner.value === "string" ? inner.value : undefined
	if (inner.type !== "TemplateLiteral" || inner.expressions.length > 0) return undefined
	return inner.quasis.map((quasi) => quasi.value.cooked).join("")
}

function unwrapped(node: Expression): Expression {
	let current = node
	for (;;) {
		if (
			current.type === "ParenthesizedExpression" ||
			current.type === "TSAsExpression" ||
			current.type === "TSSatisfiesExpression" ||
			current.type === "TSNonNullExpression" ||
			current.type === "TSTypeAssertion"
		) {
			current = current.expression
			continue
		}
		return current
	}
}

// A dynamic import of the package, or of a module that brings a helper, is followed only as a destructuring await,
// parenthesized or not, that takes other names: one that names a helper, or any other shape, fails the build, since
// the helpers are build-time markers the rewrite must see. A source computed at run time is not followed here; a
// helper it reaches keeps the helper's runtime in the chunk, which the tripwire fails (BUGS.md 461).
export function dynamicImports(file: string, program: Program, sources: HelperSources): void {
	const followed = new Set<number>()
	new Visitor({
		VariableDeclarator: (node) => {
			const init = node.init === null ? undefined : unwrapped(node.init)
			const call = init?.type === "AwaitExpression" ? unwrapped(init.argument) : undefined
			if (call?.type !== "ImportExpression") return
			const reached = importedExports(call, sources)
			if (reached === undefined || node.id.type !== "ObjectPattern") return
			for (const property of node.id.properties) {
				if (property.type === "RestElement" || property.computed) return
				const key = property.key.type === "Identifier" ? property.key.name : String(Reflect.get(property.key, "value"))
				if (reached.exports.has(key)) {
					throw new Error(`${file}: a dynamic import of ${reached.source} reaches ${key}; import it statically`)
				}
			}
			followed.add(call.start)
		},
		ImportExpression: (node) => {
			const reached = importedExports(node, sources)
			if (followed.has(node.start) || reached === undefined) return
			throw new Error(
				`${file}: a dynamic import of ${reached.source} is not one the env rewrite can follow; take only other names with a destructuring await, or import the helpers statically`,
			)
		},
	}).visit(program)
}

function importedExports(
	node: { source: Expression },
	sources: HelperSources,
): { source: string; exports: HelperExports } | undefined {
	const source = literalSource(node.source)
	const exports = source === undefined ? undefined : exportsFrom(source, sources)
	return source === undefined || exports === undefined ? undefined : { source, exports }
}
