import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { createBuilder, type Plugin } from "vite"
import { flare } from "../plugin/flare.ts"

// A real Vite build of a fixture app through flare()'s boundary transform, for the tripwire and the env helpers' cases.

export type Environment = "client" | "ssr" | "flare_prerender"

// Fixture apps under fresh temp roots: `make(files, parent?)` writes one under `parent` (the OS temp dir by default)
// and returns its root, `track(path)` adds another path to clean, and `removeAll()` deletes them all.
export function fixtures(): {
	make: (files: Record<string, string>, parent?: string) => string
	track: (path: string) => void
	removeAll: () => void
} {
	const roots: string[] = []
	return {
		make(files, parent = tmpdir()) {
			mkdirSync(parent, { recursive: true })
			const root = mkdtempSync(join(parent, "flare-tripwire-"))
			roots.push(root)
			for (const [path, source] of Object.entries(files)) {
				mkdirSync(dirname(join(root, path)), { recursive: true })
				writeFileSync(join(root, path), source)
			}
			return root
		},
		track(path) {
			roots.push(path)
		},
		removeAll() {
			for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
		},
	}
}

// A bare import stays out of the chunk, so a chunk holds only the fixture's own modules.
export function external(id: string): boolean {
	return !id.startsWith(".") && !id.startsWith("/") && !id.startsWith("\0")
}

export function boundary(): Plugin {
	const plugin = flare().find((item) => item.name === "flare:boundary")
	if (plugin === undefined) throw new Error("flare:boundary")
	return plugin
}

// The emitted code of one graph's build, or the build's rejection. The client entry is src/client.ts; the ssr and
// prerender environments' server entry is src/server.ts.
export async function build(root: string, graph: Environment, extra: Plugin[] = []): Promise<string> {
	const input = join(root, graph === "client" ? "src/client.ts" : "src/server.ts")
	const environment = { build: { write: false, minify: false, rollupOptions: { input, external } } }
	const builder = await createBuilder({
		root,
		configFile: false,
		logLevel: "silent",
		plugins: [boundary(), ...extra],
		environments: {
			client: environment,
			ssr: { ...environment, build: { ...environment.build, ssr: true } },
			flare_prerender: { ...environment, consumer: "server", build: { ...environment.build, ssr: true } },
		},
	})
	const target = builder.environments[graph]
	if (target === undefined) throw new Error(`the builder has no ${graph} environment`)
	const output = await builder.build(target)
	const results = Array.isArray(output) ? output : [output]
	return results
		.flatMap((result) => ("output" in result ? result.output : []))
		.map((item) => ("code" in item ? item.code : ""))
		.join("\n")
}

// A plugin after the boundary transform that writes a body back into a module, as a broken plugin would.
export function forcing(file: string, from: string, to: string): Plugin {
	return {
		name: "force",
		enforce: "post",
		transform(code, id) {
			return id.endsWith(file) ? code.replace(from, to) : null
		},
	}
}

export const FN = 'import { createServerFn } from "@lovrozagar/flare/server-fn";\n'
export const ENV = 'import { createServerOnlyFn, createClientOnlyFn, createIsomorphicFn } from "@lovrozagar/flare";\n'

// An entry that uses everything a module exports, so the build does not shake the module out.
export function KEEP(path: string): string {
	return `import * as mod from "${path}";\nReflect.set(globalThis, "kept", mod);\n`
}

// An app whose client and server entries both keep src/mod.ts.
export function app(module: string): Record<string, string> {
	return {
		"src/mod.ts": module,
		"src/client.ts": KEEP("./mod.ts"),
		"src/server.ts": KEEP("./mod.ts"),
	}
}
