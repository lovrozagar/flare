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
import { appAccess, appModule, dependencyModule, NAMES_A_HELPER } from "./app-module.ts"
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
			if (found !== undefined && mode !== "test") assertRegistered(found.file, code)
			// A dependency, or a module outside the root, gets the env rewrite only, and only when its text names a
			// helper or the package: a call that reaches one by another name keeps the runtime, which the tripwire fails.
			const file = found?.app === true ? found.file : (found?.file ?? dependencyModule(id, PACKAGE_SRC))
			if (file === undefined || (found?.app !== true && !NAMES_A_HELPER.test(code))) return null
			const environment = this.environment.name
			const access = { ...appAccess(this, { roots: rootsOf(root), packageSrc: PACKAGE_SRC }), cache, environment }
			const brought = await moduleSources({ id, file, code }, access)
			sources.set(`${environment}\0${id}`, brought)
			const graph = fixed ?? graphOf(environment)
			return boundaryTransform(file, code, { graph, sources: brought, envOnly: found?.app !== true }) ?? null
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
