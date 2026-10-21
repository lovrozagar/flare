import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { createServer } from "vite"
import { afterEach, expect, it } from "vitest"
import { CLIENT_ONLY_RUNTIME } from "../../shared/env/client-only.ts"
import { ISOMORPHIC_RUNTIME } from "../../shared/env/isomorphic.ts"
import { SERVER_ONLY_RUNTIME } from "../../shared/env/server-only.ts"
import { flare } from "../plugin/flare.ts"
import { app, boundary, bundledBuild, fixtures, PACKAGE_ENTRY } from "./build.fixture.ts"

// Real builds with the package bundled, as an app's are: a createServerOnlyFn body reached by every route the walk
// follows is rewritten away, and one reached by a route it does not follow keeps the helper's runtime, which fails
// the build (BUGS.md 461).
const roots = fixtures()
const fixture = roots.make

afterEach(() => {
	roots.removeAll()
})

const ESCAPED = /keeps the createServerOnlyFn runtime/

// A legal app: every use rewritten, so no helper runtime is in any chunk.
it("legal app holds no runtime", async () => {
	const root = fixture(
		app(
			'import { createServerOnlyFn, createClientOnlyFn, createIsomorphicFn } from "@lovrozagar/flare";\nexport const s = createServerOnlyFn(() => "SERVER_BODY");\nexport const c = createClientOnlyFn(() => "CLIENT_BODY");\nexport const i = createIsomorphicFn().server(() => "ISO_S").client(() => "ISO_C");\n',
		),
	)
	const client = await bundledBuild(root, "client")
	for (const text of ["SERVER_BODY", "ISO_S", SERVER_ONLY_RUNTIME, ISOMORPHIC_RUNTIME]) {
		expect([text, client.includes(text)]).toEqual([text, false])
	}
	expect(client).toContain("CLIENT_BODY")
	const server = await bundledBuild(root, "ssr")
	for (const text of ["CLIENT_BODY", "ISO_C", CLIENT_ONLY_RUNTIME, ISOMORPHIC_RUNTIME]) {
		expect([text, server.includes(text)]).toEqual([text, false])
	}
	expect(server).toContain("SERVER_BODY")
})

// The client chunk of an app whose src/mod.ts is `module`, beside `files`.
function client(module: string, files: Record<string, string> = {}, at: Parameters<typeof bundledBuild>[2] = {}) {
	return bundledBuild(fixture({ ...app(module), ...files }), "client", at)
}

// 1. Circular barrels, reached through both sides from one module: the walk through `a` reaches `b` while `a` is
// still open, so a walk that cached `b` then would give it no helper. Both routes are the helper.
it("circular barrels", async () => {
	const files = {
		"src/a.ts": 'export * from "./b.ts";\nexport { createServerOnlyFn } from "@lovrozagar/flare";\n',
		"src/b.ts": 'export * from "./a.ts";\n',
	}
	const module =
		'import { createServerOnlyFn as fromA } from "./a.ts";\nimport { createServerOnlyFn } from "./b.ts";\nexport const a = fromA(() => "SECRET_A");\nexport const s = createServerOnlyFn(() => "SECRET_CYCLE");\n'
	expect(await client(module, files)).not.toMatch(/SECRET_CYCLE|SECRET_A/)
})

// 2. A namespace re-exported inside a namespace: `outer.flare.createServerOnlyFn` is the helper.
it("nested namespaces", async () => {
	const files = {
		"src/h1.ts": 'export * as flare from "@lovrozagar/flare";\n',
		"src/h2.ts": 'export * as outer from "./h1.ts";\n',
	}
	const module =
		'import { outer } from "./h2.ts";\nexport const s = outer.flare.createServerOnlyFn(() => "SECRET_NESTED");\n'
	expect(await client(module, files)).not.toContain("SECRET_NESTED")
})

// 3. A dependency is rewritten as the app is (BUGS.md 463): a library's own createServerOnlyFn call loses its body in
// the client, and a library barrel re-exporting a helper is followed, so neither fails the build.
function dependency(root: string, index: string, dependencies: Record<string, string> = {}): void {
	mkdirSync(join(root, "node_modules/dep"), { recursive: true })
	const manifest = { name: "dep", type: "module", main: "index.js", dependencies }
	writeFileSync(join(root, "node_modules/dep/package.json"), `${JSON.stringify(manifest)}\n`)
	writeFileSync(join(root, "node_modules/dep/index.js"), index)
}

it("dependency barrel", async () => {
	const root = fixture(app('import { serverOnly } from "dep";\nexport const s = serverOnly(() => "SECRET_DEP");\n'))
	dependency(root, 'export { createServerOnlyFn as serverOnly } from "@lovrozagar/flare";\n')
	expect(await bundledBuild(root, "client", { bundle: ["dep"] })).not.toContain("SECRET_DEP")
})

// A library's barrel chain is followed at any depth from what the app imports, as an app's is, across packages: `dep`
// re-exports `./outer.js`, which re-exports the package `dep-env`, whose entry re-exports the helper; only that last
// file names it. `dep` reaches Flare through `dep-env`'s own dependency on it (BUGS.md 463).
it("dependency barrel chain", async () => {
	const root = fixture(app('import { serverOnly } from "dep";\nexport const s = serverOnly(() => "SECRET_DEEP");\n'))
	dependency(root, 'export * from "./outer.js";\n', { "dep-env": "1.0.0" })
	writeFileSync(join(root, "node_modules/dep/outer.js"), 'export * from "dep-env";\nexport const other = 1;\n')
	mkdirSync(join(root, "node_modules/dep-env"), { recursive: true })
	writeFileSync(
		join(root, "node_modules/dep-env/package.json"),
		'{ "name": "dep-env", "type": "module", "main": "index.js", "peerDependencies": { "@lovrozagar/flare": "*" } }\n',
	)
	writeFileSync(
		join(root, "node_modules/dep-env/index.js"),
		'export { createServerOnlyFn as serverOnly } from "@lovrozagar/flare";\n',
	)
	expect(await bundledBuild(root, "client", { bundle: ["dep", "dep-env"] })).not.toContain("SECRET_DEEP")
})

it("dependency call", async () => {
	const root = fixture(app('import { readSecret } from "dep";\nexport const s = readSecret;\n'))
	dependency(
		root,
		'import { createServerOnlyFn } from "@lovrozagar/flare";\nexport const readSecret = createServerOnlyFn(() => "SECRET_LIB");\n',
	)
	const client = await bundledBuild(root, "client", { bundle: ["dep"] })
	expect(client).not.toContain("SECRET_LIB")
	const server = await bundledBuild(root, "ssr", { bundle: ["dep"], config: { ssr: { noExternal: ["dep"] } } })
	expect(server).toContain("SECRET_LIB")
})

// In `vite dev`, Vite 8 pre-bundles a dependency through the environment's plugins, so the boundary rewrites it there
// as in a build: the library's server-only body is gone from the optimized chunk the dev client loads. Without flare()
// the same chunk keeps it, so the case is not vacuous (BUGS.md 463).
it("dependency dev", async () => {
	const root = fixture({
		...app('import { readSecret } from "dep";\nexport const s = readSecret;\n'),
		"src/client.ts": 'import { s } from "./mod.ts";\nReflect.set(globalThis, "kept", s);\n',
	})
	dependency(
		root,
		'import { createServerOnlyFn } from "@lovrozagar/flare";\nexport const readSecret = createServerOnlyFn(() => "SECRET_DEV_DEP");\n',
	)
	const optimized = async (withFlare: boolean): Promise<string> => {
		const server = await createServer({
			root,
			configFile: false,
			logLevel: "silent",
			cacheDir: join(root, withFlare ? ".vite-flare" : ".vite-bare"),
			plugins: withFlare ? flare({ entry: { client: "src/client.ts", server: "src/server.ts" } }) : [],
			resolve: { alias: { "@lovrozagar/flare": PACKAGE_ENTRY } },
			optimizeDeps: { include: ["dep"], noDiscovery: true },
			server: { middlewareMode: true, ws: false },
		})
		try {
			const client = server.environments.client
			const mod = (await client.transformRequest("/src/mod.ts"))?.code ?? ""
			const url = /from\s+"([^"]*\/deps\/dep\.js[^"]*)"/.exec(mod)?.[1]
			expect(url).toBeDefined()
			return (await client.transformRequest(String(url)))?.code ?? ""
		} finally {
			await server.close()
		}
	}
	const kept = await optimized(true)
	expect(kept).toContain("readSecret")
	expect(kept).not.toContain("SECRET_DEV_DEP")
	expect(await optimized(false)).toContain("SECRET_DEV_DEP")
})

// 4. An alias to the package, and a path to its entry, are not the package's name: the runtime stays and fails.
it("alias to the package", async () => {
	const aliased =
		'import { createServerOnlyFn } from "~flare";\nexport const s = createServerOnlyFn(() => "SECRET_ALIAS");\n'
	await expect(client(aliased, {}, { config: { resolve: { alias: { "~flare": PACKAGE_ENTRY } } } })).rejects.toThrow(
		ESCAPED,
	)
	const path = `import { createServerOnlyFn } from ${JSON.stringify(PACKAGE_ENTRY)};\nexport const s = createServerOnlyFn(() => "SECRET_PATH");\n`
	await expect(client(path)).rejects.toThrow(ESCAPED)
})

// 5. A dynamic import's source written as a template, in parentheses, or with `as string` is still the package.
it("dynamic import sources", async () => {
	for (const source of ["`@lovrozagar/flare`", '("@lovrozagar/flare")', '("@lovrozagar/flare" as string)']) {
		const module = `const { createServerOnlyFn } = await import(${source});\nexport const s = createServerOnlyFn(() => "SECRET_DYNAMIC");\n`
		await expect(client(module)).rejects.toThrow("reaches createServerOnlyFn")
	}
})

// 6. import.meta.glob hands the helper over as a module object: the runtime stays and fails.
it("glob", async () => {
	const files = { "src/h/flare.ts": 'export * from "@lovrozagar/flare";\n' }
	const module =
		'const mods = import.meta.glob("./h/*.ts", { eager: true }) as Record<string, any>;\nexport const s = mods["./h/flare.ts"].createServerOnlyFn(() => "SECRET_GLOB");\n'
	await expect(client(module, files)).rejects.toThrow(ESCAPED)
})

// 7. A virtual module's barrel, and CommonJS `require`, are not followed: the runtime stays and fails.
it("virtual module and require", async () => {
	const virtual = {
		name: "virtual-barrel",
		resolveId: (id: string) => (id === "virtual:barrel" ? "\0virtual:barrel" : null),
		load: (id: string) =>
			id === "\0virtual:barrel" ? 'export { createServerOnlyFn } from "@lovrozagar/flare";\n' : null,
	}
	const fromVirtual =
		'import { createServerOnlyFn } from "virtual:barrel";\nexport const s = createServerOnlyFn(() => "SECRET_VIRTUAL");\n'
	await expect(client(fromVirtual, {}, { plugins: [virtual], bundle: ["virtual:barrel"] })).rejects.toThrow(ESCAPED)
	const files = {
		"src/legacy.cjs":
			'const { createServerOnlyFn } = require("@lovrozagar/flare");\nmodule.exports = createServerOnlyFn(() => "SECRET_CJS");\n',
	}
	await expect(client('import legacy from "./legacy.cjs";\nexport const s = legacy;\n', files)).rejects.toThrow(ESCAPED)
})

// The failure names the chunk and the importer chain from the runtime's module to the app module that called it.
it("names the chain", async () => {
	const module =
		'import { createServerOnlyFn } from "~flare";\nexport const s = createServerOnlyFn(() => "SECRET_ALIAS");\n'
	const failure = client(module, {}, { config: { resolve: { alias: { "~flare": PACKAGE_ENTRY } } } })
	await expect(failure).rejects.toThrow(/server-only\.ts <- .*exports\/index\.ts <- .*src\/mod\.ts/)
})

// A Web Worker is a client graph (B9). Its server-only body and `.server()` body are gone from the worker bundle a
// build emits, and from the worker entry `vite dev` serves (`?worker_file&type=module`), which the dev rewrite skipped
// (BUGS.md 462). The worker uses both results, so without flare() the bodies stay: the case is not vacuous.
const WORKER = {
	"src/worker.ts":
		'import { createServerOnlyFn, createIsomorphicFn } from "@lovrozagar/flare";\nconst read = createServerOnlyFn(() => "SECRET_WORKER");\nconst pick = createIsomorphicFn().server(() => "SECRET_ISO").client(() => "WORKER_CLIENT");\npostMessage([String(read), String(pick)]);\n',
	"src/client.ts": 'new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });\n',
	"src/server.ts": "export const server = {};\n",
}

it("web worker build", async () => {
	const root = fixture(WORKER)
	const built = await bundledBuild(root, "client")
	expect(built).toContain("WORKER_CLIENT")
	expect(built).not.toMatch(/SECRET_WORKER|SECRET_ISO/)
	expect(await bundledBuild(root, "client", { flare: false })).toContain("SECRET_WORKER")
})

it("web worker dev", async () => {
	const root = fixture(WORKER)
	const served = async (plugins: ReturnType<typeof boundary>[]): Promise<string> => {
		const server = await createServer({
			root,
			configFile: false,
			logLevel: "silent",
			plugins,
			resolve: { alias: { "@lovrozagar/flare": PACKAGE_ENTRY } },
			server: { middlewareMode: true, ws: false },
		})
		try {
			const result = await server.environments.client.transformRequest("/src/worker.ts?worker_file&type=module")
			return result?.code ?? ""
		} finally {
			await server.close()
		}
	}
	const rewritten = await served([boundary()])
	expect(rewritten).toContain("WORKER_CLIENT")
	expect(rewritten).not.toMatch(/SECRET_WORKER|SECRET_ISO/)
	expect(await served([])).toContain("SECRET_WORKER")
})
