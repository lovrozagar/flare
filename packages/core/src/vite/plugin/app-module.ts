import { existsSync, readFileSync } from "node:fs"
import { dirname, isAbsolute, join, relative, sep } from "node:path"

// The query keys Vite itself adds to an app module: a hot update's timestamp, a dependency hash, and an import
// marker; and on a Web Worker's entry in `vite dev`, `worker_file` and its `type`, the worker's own module, which is a
// client graph to rewrite like any other (BUGS.md 462). Any other query, such as `?raw`, `?url`, `?worker`, or
// `?inline`, asks for something that is not the module.
const VITE_QUERY = new Set(["t", "v", "import"])

// A module's text names an env helper or the package. A dependency without either is left alone by the rewrite, so a
// library costs one text test (BUGS.md 463); a call that reaches a helper through it by another name keeps the
// runtime, which the tripwire fails.
export const NAMES_A_HELPER: RegExp = /createServerOnlyFn|createClientOnlyFn|createIsomorphicFn|@lovrozagar\/flare/

// A module's text re-exports from another module: `export *` or `export { … } from`. The barrel walk reads such a
// dependency module too when its package can reach Flare, so a library's barrel chain is followed from what the app
// imports at any depth, as an app's barrels are (BUGS.md 463).
const REEXPORTS = /\bexport\s*(?:\*|\{[^}]*\}\s*from\b)/
const FLARE = "@lovrozagar/flare"
const WORKER_QUERY = new Set([...VITE_QUERY, "worker_file", "type"])

// A script module with no query but Vite's own, outside the dependencies and Flare's own source (`packageSrc`). Under
// one of `roots` its path is root-relative with forward slashes, the form the B41 id hashes, and the boundary rewrites
// it; outside them it is absolute and only checked for a server function (BUGS.md 201). A dependency is one under
// node_modules from the root, so an app whose root itself sits under a node_modules directory is still the app.
export function appModule(
	roots: readonly string[],
	id: string,
	packageSrc: string,
): { file: string; app: boolean } | undefined {
	const path = id.replace(/\?.*$/s, "")
	const query = id.slice(path.length + 1)
	const keys = [...new URLSearchParams(query).keys()]
	const allowed = keys.includes("worker_file") ? WORKER_QUERY : VITE_QUERY
	if (!keys.every((key) => allowed.has(key))) return undefined
	if (path.startsWith("\0") || !/\.[cm]?[jt]sx?$/.test(path) || path.startsWith(packageSrc)) return undefined
	const found = within(roots, path) ?? { file: path, app: false }
	return found.file.split(/[\\/]/).includes("node_modules") ? undefined : found
}

// A dependency's script module, by its absolute path: under node_modules, with no query but Vite's own. The env
// rewrite runs on it as on the app (BUGS.md 463); the route split and the server function ids are the app's alone.
export function dependencyModule(id: string, packageSrc: string): string | undefined {
	const path = id.replace(/\?.*$/s, "")
	const query = id.slice(path.length + 1)
	if (![...new URLSearchParams(query).keys()].every((key) => VITE_QUERY.has(key))) return undefined
	if (path.startsWith("\0") || !/\.[cm]?[jt]sx?$/.test(path) || path.startsWith(packageSrc)) return undefined
	return path.split(/[\\/]/).includes("node_modules") ? path : undefined
}

function within(roots: readonly string[], path: string): { file: string; app: true } | undefined {
	for (const root of roots) {
		const file = relative(root, path).split(sep).join("/")
		if (!file.startsWith("../") && !isAbsolute(file)) return { file, app: true }
	}
	return undefined
}

type Resolver = { resolve: (source: string, importer: string) => Promise<{ id: string; external?: unknown } | null> }

// How a module's helper sources are followed (boundary/helper-sources.ts): through Vite's resolver, to app and
// dependency modules, read from disk as written (BUGS.md 463). A dependency module is read when it names a helper or
// the package, or when it re-exports and its package depends on Flare, itself or through its own dependencies; any
// other is a leaf of no interest, so Solid's and other libraries' barrels cost one text test. A virtual module and
// Flare's own source are not followed.
export function appAccess(
	context: Resolver,
	at: { roots: readonly string[]; packageSrc: string },
): {
	resolve: (source: string, importer: string) => Promise<string | undefined>
	read: (id: string) => string | undefined
} {
	const reaches = reachesFlare()
	return {
		async resolve(source, importer) {
			const resolved = await context.resolve(source, importer)
			if (resolved === null || resolved.external) return undefined
			const followed =
				appModule(at.roots, resolved.id, at.packageSrc) !== undefined ||
				dependencyModule(resolved.id, at.packageSrc) !== undefined
			return followed ? resolved.id : undefined
		},
		read(id) {
			let code: string
			try {
				code = readFileSync(id.replace(/\?.*$/s, ""), "utf8")
			} catch {
				return undefined
			}
			const path = dependencyModule(id, at.packageSrc)
			if (path === undefined || NAMES_A_HELPER.test(code)) return code
			return REEXPORTS.test(code) && reaches(packageDir(path)) ? code : undefined
		},
	}
}

// The directory of the package a dependency module belongs to: the nearest one up with a package.json.
function packageDir(path: string): string {
	for (let dir = dirname(path); ; dir = dirname(dir)) {
		if (existsSync(join(dir, "package.json")) || dirname(dir) === dir) return dir
	}
}

// Whether a package depends on Flare: itself, or a package it depends on, found as Node resolves one, up the
// node_modules directories from it. A search from each package, its answer kept; a cycle is a package already seen.
function reachesFlare(): (dir: string) => boolean {
	const known = new Map<string, boolean>()
	return (from) => {
		const cached = known.get(from)
		if (cached !== undefined) return cached
		const seen = new Set([from])
		let found = false
		for (const dir of seen) {
			const names = dependencyNames(dir)
			found = names.includes(FLARE)
			if (found) break
			for (const name of names) {
				const at = installed(dir, name)
				if (at !== undefined) seen.add(at)
			}
		}
		known.set(from, found)
		return found
	}
}

function dependencyNames(dir: string): string[] {
	try {
		const manifest: Record<string, unknown> = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"))
		return ["dependencies", "peerDependencies", "optionalDependencies"].flatMap((field) =>
			Object.keys(Object(manifest[field])),
		)
	} catch {
		return []
	}
}

function installed(from: string, name: string): string | undefined {
	for (let dir = from; ; dir = dirname(dir)) {
		const at = join(dir, "node_modules", name)
		if (existsSync(join(at, "package.json"))) return at
		if (dirname(dir) === dir) return undefined
	}
}
