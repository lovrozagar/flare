import { resolve } from "node:path"
import { fileURLToPath } from "node:url"
import type { Plugin } from "vite"
import {
	assertRegistered,
	boundaryTransform,
	checkChunk,
	graphOf,
	moduleSources,
	type Graph,
} from "../boundary/index.ts"
import type { ExportCache, HelperSources } from "../boundary/index.ts"
import { appAccess, appModule } from "./app-module.ts"
import { realPath } from "./real-path.ts"

// The package's `src`, whose server folders a client or worker chunk may not hold (B45).
const PACKAGE_SRC = resolve(fileURLToPath(new URL("../..", import.meta.url)))

// Before Solid compiles JSX, each app module is rewritten for the graph that loads it: split, the env helpers, and
// the server function ids (B8, B9, B41).
// A Web Worker bundle passes `client`: a `?worker` module is a client graph whatever environment imports it (B9).
export function boundary(fixed?: Graph): Plugin {
	// The root as configured and as a real path, so an id in either form is an app module (BUGS.md B51).
	let roots = { from: "", paths: [] as string[] }
	// What each module's barrels bring (BUGS.md 461), per environment: walks cached while their modules are unchanged,
	// and each module's sources kept for the tripwire.
	const cache: ExportCache = new Map()
	const sources = new Map<string, HelperSources>()
	const rootsOf = (root: string): string[] => {
		if (roots.from !== root) roots = { from: root, paths: [...new Set([realPath(root), root])] }
		return roots.paths
	}
	return {
		name: "flare:boundary",
		enforce: "pre",
		async transform(code, id) {
			const { root, mode } = this.environment.config
			const found = appModule(rootsOf(root), id, PACKAGE_SRC)
			if (found === undefined) return null
			if (mode !== "test") assertRegistered(found.file, code)
			if (!found.app) return null
			const environment = this.environment.name
			const access = { ...appAccess(this, { roots: rootsOf(root), packageSrc: PACKAGE_SRC }), cache, environment }
			const brought = await moduleSources({ id, file: found.file, code }, access)
			sources.set(`${environment}\0${id}`, brought)
			return (
				boundaryTransform(found.file, code, { graph: fixed ?? graphOf(this.environment.name), sources: brought }) ??
				null
			)
		},
		// Every module of every chunk, with its final code, before the chunk is written.
		renderChunk(rendered, chunk) {
			const environment = this.environment.name
			const modules = chunk.moduleIds.map((id) => ({
				id,
				code: this.getModuleInfo(id)?.code ?? null,
				sources: sources.get(`${environment}\0${id}`),
			}))
			const graph = fixed ?? graphOf(environment)
			const importers = (id: string): readonly string[] => this.getModuleInfo(id)?.importers ?? []
			checkChunk({ graph, chunk: chunk.fileName, modules, packageSrc: PACKAGE_SRC, rendered, importers })
			return null
		},
	}
}
