import { parseSync } from "oxc-parser"
import { wrongSideBodies, type Graph } from "./env.ts"
import { serverCode } from "./split.ts"

// The package's folders whose modules never belong in a client chunk (B45).
const SERVER_DIRS = ["server", "adapters", "vite"]

export type ChunkModule = { id: string; code: string | null }

// B45. A client chunk, of the browser or a Web Worker, fails the build when one of its modules holds a server
// function body, a B8-removed route method, a server-only body, or a `.server()` body, or is a module of the
// package's server, adapters, or vite folder. A server chunk, of the ssr environment or the Workers bundle, fails
// when a module holds a client-only body or a `.client()` body. Each module's final
// code, after every plugin, is read with the same walk the transform uses. Every module is read, inside the app root
// or not, so a workspace package's server function is caught too. The shared walk is enough because B85 and
// dx/env.md make every shape it does not know a build error, so it covers all legal code, and the tripwire's job is a
// body a later plugin put back. A module the walk cannot parse fails closed.
export function checkChunk(input: {
	graph: Graph
	chunk: string
	modules: readonly ChunkModule[]
	packageSrc: string
}): void {
	const fail = (path: string, reason: string): never => {
		throw new Error(`${input.chunk}: ${path} ${reason} (B45)`)
	}
	for (const module of input.modules) {
		const path = module.id.replace(/\?.*$/s, "")
		if (input.graph === "client" && SERVER_DIRS.some((dir) => path.startsWith(`${input.packageSrc}/${dir}/`))) {
			fail(path, `is server code and cannot be in the ${input.graph} graph`)
		}
		if (module.code === null) continue
		const parsed = parseSync(path, module.code, { sourceType: "module", lang: "js" })
		const [error] = parsed.errors
		if (error !== undefined) fail(path, `could not be read by the tripwire: ${error.message}`)
		const leaks =
			input.graph === "server"
				? wrongSideBodies(parsed.program, "server")
				: [...serverCode(path, module.code, parsed.program), ...wrongSideBodies(parsed.program, input.graph)]
		if (leaks.length > 0) fail(path, `holds code the ${input.graph} graph must not contain`)
	}
}
