import { isAbsolute, relative, sep } from "node:path"

// The query keys Vite itself adds to an app module: a hot update's timestamp, a dependency hash, and an import
// marker. Any other query, such as `?raw`, `?url`, `?worker`, or `?inline`, asks for something that is not the module.
const VITE_QUERY = new Set(["t", "v", "import"])

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
	if (![...new URLSearchParams(query).keys()].every((key) => VITE_QUERY.has(key))) return undefined
	if (path.startsWith("\0") || !/\.[cm]?[jt]sx?$/.test(path) || path.startsWith(packageSrc)) return undefined
	const found = within(roots, path) ?? { file: path, app: false }
	return found.file.split(/[\\/]/).includes("node_modules") ? undefined : found
}

function within(roots: readonly string[], path: string): { file: string; app: true } | undefined {
	for (const root of roots) {
		const file = relative(root, path).split(sep).join("/")
		if (!file.startsWith("../") && !isAbsolute(file)) return { file, app: true }
	}
	return undefined
}
