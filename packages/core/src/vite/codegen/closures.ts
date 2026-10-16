import { posix } from "node:path"
import { codeLiteral } from "./escape.ts"

// A chunk of the client bundle, as the closure fill reads it.
export type BundleChunk = { fileName: string; isEntry: boolean; imports: readonly string[]; code: string }

const MARKER = /(["'`])__flare_closure_([\w$]+)__\1/g

// The marker chunkReferences writes after a route's chunk URL in the built `chunks` map; fillClosures replaces it.
export function closureMarker(ref: string): string {
	return `"__flare_closure_${ref}__"`
}

// Each marker becomes the URLs of the files its route chunk imports, directly or through others, each once and in
// import order: what a navigation to that route downloads besides the chunk itself (BUGS.md 124.6). A file the app's
// entry loads at boot is in the module map already and is left out, so `"all"` never fetches it again (BUGS.md 80).
// The URLs are relative to the chunk that holds the map, as Rolldown renders the chunk references. Returns each
// chunk's new code, for the chunks that held a marker.
export function fillClosures(chunks: readonly BundleChunk[], fileOf: (ref: string) => string): Map<string, string> {
	const byName = new Map(chunks.map((chunk) => [chunk.fileName, chunk]))
	const closure = (start: readonly string[]): string[] => {
		const seen = new Set<string>()
		const queue = [...start]
		for (let file = queue.shift(); file !== undefined; file = queue.shift()) {
			// An import that is not a chunk of this bundle (an external URL) is not the app's to warm.
			const chunk = byName.get(file)
			if (chunk === undefined || seen.has(file)) continue
			seen.add(file)
			queue.push(...chunk.imports)
		}
		return [...seen]
	}
	// A route chunk is emitted, so the bundle counts it an entry too: only the other entries load at boot.
	const routes = new Set(
		chunks.flatMap((chunk) => [...chunk.code.matchAll(MARKER)].map(([, , ref]) => fileOf(String(ref)))),
	)
	const boot = chunks.filter((chunk) => chunk.isEntry && !routes.has(chunk.fileName)).map((chunk) => chunk.fileName)
	const booted = new Set(closure(boot))
	const filled = new Map<string, string>()
	for (const chunk of chunks) {
		if (!chunk.code.includes("__flare_closure_")) continue
		const code = chunk.code.replace(MARKER, (_marker, _quote: string, ref: string) => {
			const route = fileOf(ref)
			const files = closure([route]).filter((file) => file !== route && !booted.has(file))
			const from = posix.dirname(chunk.fileName)
			return files.map((file) => `new URL(${codeLiteral(posix.relative(from, file))}, import.meta.url).href`).join(", ")
		})
		filled.set(chunk.fileName, code)
	}
	return filled
}
