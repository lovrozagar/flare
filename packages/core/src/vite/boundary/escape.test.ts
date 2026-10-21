import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { afterEach, expect, it } from "vitest"
import { CLIENT_ONLY_RUNTIME } from "../../shared/env/client-only.ts"
import { ISOMORPHIC_RUNTIME } from "../../shared/env/isomorphic.ts"
import { SERVER_ONLY_RUNTIME } from "../../shared/env/server-only.ts"
import { app, bundledBuild, fixtures, PACKAGE_ENTRY } from "./build.fixture.ts"

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

// 3. A dependency's barrel is not followed: the call keeps the runtime, and the build fails naming the chain.
it("dependency barrel", async () => {
	const root = fixture(app('import { serverOnly } from "dep";\nexport const s = serverOnly(() => "SECRET_DEP");\n'))
	mkdirSync(join(root, "node_modules/dep"), { recursive: true })
	writeFileSync(
		join(root, "node_modules/dep/package.json"),
		'{ "name": "dep", "type": "module", "main": "index.js" }\n',
	)
	writeFileSync(
		join(root, "node_modules/dep/index.js"),
		'export { createServerOnlyFn as serverOnly } from "@lovrozagar/flare";\n',
	)
	await expect(bundledBuild(root, "client", { bundle: ["dep"] })).rejects.toThrow(ESCAPED)
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
