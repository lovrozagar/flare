import { parseSync } from "oxc-parser"
import { CLIENT_ONLY_RUNTIME } from "../../shared/env/client-only.ts"
import { ISOMORPHIC_RUNTIME } from "../../shared/env/isomorphic.ts"
import { SERVER_ONLY_RUNTIME } from "../../shared/env/server-only.ts"
import { wrongSideBodies, type Graph } from "./env.ts"
import type { HelperSources } from "./env-names.ts"
import { serverCode } from "./split.ts"

// The package's folders whose modules never belong in a client chunk (B45).
const SERVER_DIRS = ["server", "adapters", "vite"]

// `sources` is what the boundary transform read of the module's barrels (BUGS.md 461).
export type ChunkModule = { id: string; code: string | null; sources?: HelperSources | undefined }

// The env helpers' runtimes a graph must not hold. The rewrite leaves no reference to a helper in any graph, so a chunk
// that still holds one kept it for a call that escaped the rewrite by a route it does not follow: an alias to the
// package, a dependency, a glob, a virtual module, or require. The runtime keeps that call's body working, so this
// does not depend on the call's shape (BUGS.md 461).
const RUNTIMES: Record<Graph, ReadonlyArray<readonly [string, string]>> = {
	client: [
		["createServerOnlyFn", SERVER_ONLY_RUNTIME],
		["createIsomorphicFn", ISOMORPHIC_RUNTIME],
	],
	server: [
		["createClientOnlyFn", CLIENT_ONLY_RUNTIME],
		["createIsomorphicFn", ISOMORPHIC_RUNTIME],
	],
}

const ESCAPED =
	"a call reached it by a route the env rewrite does not follow (an alias to the package, a dependency, a glob, a virtual module, or require)"

// B45. A client chunk, of the browser or a Web Worker, fails the build when one of its modules holds a server
// function body, a B8-removed route method, a server-only body, or a `.server()` body, or is a module of the
// package's server, adapters, or vite folder. A server chunk, of the ssr environment or the Workers bundle, fails
// when a module holds a client-only body or a `.client()` body. Each module's final code, after every plugin, is read
// with the same walk the transform uses, so a body a later plugin put back is caught; a module the walk cannot parse
// fails closed. Independently of any shape, the rendered chunk must not hold a helper runtime its graph cannot have,
// which an escaped call keeps (BUGS.md 461).
export function checkChunk(input: {
	graph: Graph
	chunk: string
	modules: readonly ChunkModule[]
	packageSrc: string
	rendered?: string
	importers?: (id: string) => readonly string[]
}): void {
	const fail = (path: string, reason: string): never => {
		throw new Error(`${input.chunk}: ${path} ${reason} (B45)`)
	}
	for (const [helper, runtime] of RUNTIMES[input.graph]) {
		if (input.rendered?.includes(runtime) !== true) continue
		const holder = input.modules.find((module) => module.code?.includes(runtime) === true)?.id ?? helper
		fail(chainOf(holder, input.importers), `keeps the ${helper} runtime: ${ESCAPED}`)
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
				? wrongSideBodies(parsed.program, "server", module.sources)
				: [
						...serverCode(path, module.code, parsed.program),
						...wrongSideBodies(parsed.program, input.graph, module.sources),
					]
		if (leaks.length > 0) fail(path, `holds code the ${input.graph} graph must not contain`)
	}
}

// The module and the importers that brought it in, the first of each, up to the app module that called it.
function chainOf(id: string, importers?: (id: string) => readonly string[]): string {
	const chain = [id]
	for (let at = id; chain.length < 8;) {
		const next = importers?.(at)[0]
		if (next === undefined || chain.includes(next)) break
		chain.push(next)
		at = next
	}
	return chain.join(" <- ")
}
