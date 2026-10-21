import { parseSync, Visitor, type Declaration, type Program } from "oxc-parser"
import { langOf } from "../route-meta/index.ts"
import {
	FLARE,
	FLARE_EXPORTS,
	literalSource,
	type HelperExport,
	type HelperExports,
	type HelperSources,
} from "./env-names.ts"

// The env helpers a module's import sources bring through the app's own barrels (BUGS.md 461): `export { x } from`,
// renamed, `export *`, and `export * as`, at any depth, nested namespaces included, with ES's rules: a module's own
// export name shadows a star export, and a name two star exports give different bindings for is ambiguous and not
// exported. Cycles resolve as a fixpoint. The rewrite reads a helper through any of them as the helper; a route the
// walk does not follow (a dependency, an alias to the package, a glob, a virtual module, require) keeps the helper's
// runtime, which the tripwire fails.

// Where a source resolves from an importer, or undefined for one Flare does not follow (a dependency, a virtual
// module, a file that is not a script). `read` gives a resolved module's source text.
export type SourceAccess = {
	resolve: (source: string, importer: string) => Promise<string | undefined>
	read: (id: string) => string | undefined
}

// A completed walk from one module, per environment (resolution can differ by environment): its exports, and the text
// of every module it read, so any change among them makes it stale.
export type ExportCache = Map<string, { exports: HelperExports; members: ReadonlyMap<string, string> }>

// `rounds` caps the fixpoint; the default is one more than the modules the walk read.
export type Access = SourceAccess & { cache: ExportCache; environment: string; rounds?: number }

export async function helperSources(module: { id: string; program: Program }, access: Access): Promise<HelperSources> {
	const sources = new Map<string, HelperExports>()
	for (const source of sourcesOf(module.program)) {
		if (source === FLARE || sources.has(source)) continue
		const id = await access.resolve(source, module.id)
		const exports = id === undefined ? new Map() : await exportsOfModule(id, access)
		if (exports.size > 0) sources.set(source, exports)
	}
	return sources
}

// Every module a program names as written: static imports, re-exports, and dynamic imports.
function sourcesOf(program: Program): Set<string> {
	const sources = new Set<string>()
	for (const statement of program.body) {
		if (statement.type === "ImportDeclaration" || statement.type === "ExportAllDeclaration") {
			sources.add(statement.source.value)
		}
		if (statement.type === "ExportNamedDeclaration" && statement.source !== null) sources.add(statement.source.value)
	}
	new Visitor({
		ImportExpression: (node) => {
			const source = literalSource(node.source)
			if (source !== undefined) sources.add(source)
		},
	}).visit(program)
	return sources
}

type Parsed = { id: string; code: string; program: Program; resolved: Map<string, string | undefined> }

type Walk = {
	access: Access
	modules: Map<string, Parsed>
	previous: Map<string, HelperExports>
	current: Map<string, HelperExports>
	visiting: Set<string>
}

// One walk from a module: each module read and parsed once, and a cycle solved by repeating the walk, a back edge
// reading the previous round's exports, until a round changes nothing. Only a completed walk is cached.
async function exportsOfModule(root: string, access: Access): Promise<HelperExports> {
	const key = `${access.environment}\0${root}`
	const cached = access.cache.get(key)
	if (cached !== undefined && [...cached.members].every(([id, code]) => access.read(id) === code)) return cached.exports
	const walk: Walk = { access, modules: new Map(), previous: new Map(), current: new Map(), visiting: new Set() }
	for (let round = 0; ; round += 1) {
		// A round that keeps changing past the cap is barrels whose exports never agree, an ambiguity that flips.
		if (round > (access.rounds ?? walk.modules.size + 1)) throw new Error(`${root}: its barrels' exports do not settle`)
		walk.current = new Map()
		const exports = await exportsOf(root, walk)
		if (sameRound(walk.previous, walk.current)) {
			access.cache.set(key, { exports, members: new Map([...walk.modules].map(([id, module]) => [id, module.code])) })
			return exports
		}
		walk.previous = walk.current
	}
}

async function exportsOf(id: string, walk: Walk): Promise<HelperExports> {
	const done = walk.current.get(id)
	if (done !== undefined) return done
	if (walk.visiting.has(id)) return walk.previous.get(id) ?? new Map()
	const module = parsedOf(id, walk)
	if (module === undefined) return new Map()
	walk.visiting.add(id)
	const exports = await moduleExports(module, (source) => sourceExports(module, source, walk))
	walk.visiting.delete(id)
	walk.current.set(id, exports)
	return exports
}

function parsedOf(id: string, walk: Walk): Parsed | undefined {
	const known = walk.modules.get(id)
	if (known !== undefined) return known
	const code = walk.access.read(id)
	if (code === undefined) return undefined
	const program = parseSync(id, code, { sourceType: "module", lang: langOf(id.replace(/\?.*$/s, "")) }).program
	const parsed: Parsed = { id, code, program, resolved: new Map() }
	walk.modules.set(id, parsed)
	return parsed
}

async function sourceExports(module: Parsed, source: string, walk: Walk): Promise<HelperExports> {
	if (source === FLARE) return FLARE_EXPORTS
	if (!module.resolved.has(source)) module.resolved.set(source, await walk.access.resolve(source, module.id))
	const id = module.resolved.get(source)
	return id === undefined ? new Map() : exportsOf(id, walk)
}

// One module's helper exports under ES's rules: its own names first, then each star export's names that no own name
// shadows and no other star export gives a different binding.
async function moduleExports(module: Parsed, from: (source: string) => Promise<HelperExports>): Promise<HelperExports> {
	const own = new Map<string, HelperExport>()
	const ownNames = new Set<string>()
	const stars: HelperExports[] = []
	for (const statement of module.program.body) {
		if (statement.type === "ExportDefaultDeclaration") ownNames.add("default")
		if (statement.type === "ExportNamedDeclaration") {
			for (const name of declaredNames(statement.declaration)) ownNames.add(name)
			const reached = statement.source === null ? undefined : await from(statement.source.value)
			for (const specifier of statement.specifiers) {
				ownNames.add(nameOf(specifier.exported))
				const entry = reached?.get(nameOf(specifier.local))
				if (entry !== undefined) own.set(nameOf(specifier.exported), entry)
			}
		}
		if (statement.type !== "ExportAllDeclaration") continue
		const reached = await from(statement.source.value)
		if (statement.exported === null) {
			stars.push(reached)
			continue
		}
		ownNames.add(nameOf(statement.exported))
		if (reached.size > 0) own.set(nameOf(statement.exported), reached)
	}
	return withStars(own, { ownNames, stars })
}

function withStars(
	own: Map<string, HelperExport>,
	at: { ownNames: Set<string>; stars: HelperExports[] },
): HelperExports {
	const ambiguous = new Set<string>()
	const starred = new Map<string, HelperExport>()
	for (const exports of at.stars) {
		for (const [name, entry] of exports) {
			if (name === "default" || at.ownNames.has(name)) continue
			const seen = starred.get(name)
			if (seen !== undefined && !same(seen, entry)) ambiguous.add(name)
			starred.set(name, entry)
		}
	}
	for (const [name, entry] of starred) if (!ambiguous.has(name)) own.set(name, entry)
	return own
}

// The names a declaration export binds: `export const a = 1, b = 2` (a destructuring binds none a helper could be),
// and `export function f`, `export class C`, or a type, each by its id.
function declaredNames(declaration: Declaration | null): string[] {
	if (declaration === null) return []
	if (declaration.type === "VariableDeclaration") {
		return declaration.declarations.flatMap((item) => (item.id.type === "Identifier" ? [item.id.name] : []))
	}
	return [String(Reflect.get(Object(Reflect.get(declaration, "id")), "name"))]
}

function nameOf(node: { type: string; name?: string; value?: unknown }): string {
	return node.type === "Literal" ? String(node.value) : String(node.name)
}

// Whether two rounds gave every module the same exports, by content: the fixpoint test.
function sameRound(a: Map<string, HelperExports>, b: Map<string, HelperExports>): boolean {
	return a.size === b.size && [...b].every(([id, exports]) => same(a.get(id), exports))
}

function same(a: HelperExport | undefined, b: HelperExport | undefined): boolean {
	if (typeof a === "string" || typeof b === "string" || a === undefined || b === undefined) return a === b
	return a.size === b.size && [...a].every(([name, entry]) => same(entry, b.get(name)))
}

// A module's helper sources from its text. A module that does not parse has none here; the transform reports it.
export function moduleSources(
	module: { id: string; file: string; code: string },
	access: Access,
): Promise<HelperSources> {
	const parsed = parseSync(module.file, module.code, { sourceType: "module", lang: langOf(module.file) })
	if (parsed.errors.length > 0) return Promise.resolve(new Map())
	return helperSources({ id: module.id, program: parsed.program }, access)
}
