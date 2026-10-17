import { assetUrl, type Urls } from "./environments.ts"

type Chunk = { file: string; src?: string; imports?: readonly string[] }

export type Preloads = { entry: readonly string[]; routes: Readonly<Record<string, readonly string[]>> }

// The module URLs a production document preloads, so the browser fetches the client entry, what it imports, and the
// matched routes' chunks while it parses the head, not one wave after another once the entry runs (plan 21 15.3): the
// entry's chunk and its static imports, then per other source module with a chunk of its own, a route module among
// them, keyed by its source path as the routes' `chunks` map names it in a server build (`/src/...`), its chunk and the
// static imports the entry does not load. A shared chunk has no source, and an asset no JS file.
export function preloadsOf(manifest: Readonly<Record<string, Chunk>>, entry: string, urls: Urls): Preloads {
	if (manifest[entry] === undefined) throw new Error(`The client entry ${entry} is not in the Vite manifest`)
	const loaded = closure(manifest, entry, new Map())
	const url = (file: string): string => assetUrl(file, urls)
	const routes = Object.entries(manifest)
		.filter(([key, chunk]) => key !== entry && chunk.src !== undefined && /\.m?js$/.test(chunk.file))
		.map(([key]) => [`/${key}`, [...closure(manifest, key, loaded).values()].map(url)] as const)
	return { entry: [...loaded.values()].map(url), routes: Object.fromEntries(routes) }
}

// A chunk and everything it imports statically, transitively, in import order, each key with its file, leaving out
// `skip` and any import the manifest does not list.
function closure(
	manifest: Readonly<Record<string, Chunk>>,
	start: string,
	skip: ReadonlyMap<string, string>,
): Map<string, string> {
	const found = new Map<string, string>()
	const visit = (key: string): void => {
		const chunk = manifest[key]
		if (chunk === undefined || found.has(key) || skip.has(key)) return
		found.set(key, chunk.file)
		for (const next of chunk.imports ?? []) visit(next)
	}
	visit(start)
	return found
}
