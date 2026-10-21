import { parseSync } from "oxc-parser"
import { expect, it } from "vitest"
import { helperSources, moduleSources, type ExportCache } from "./helper-sources.ts"

// Modules by path; a relative source resolves beside its importer, and anything else is not followed.
// A file listed as `null` resolves but cannot be read.
function access(files: Record<string, string | null>, cache: ExportCache = new Map()) {
	return {
		cache,
		environment: "client",
		resolve: async (source: string, importer: string) => {
			if (!source.startsWith("./")) return undefined
			const id = `${importer.slice(0, importer.lastIndexOf("/") + 1)}${source.slice(2)}`
			return id in files ? id : undefined
		},
		read: (id: string) => files[id] ?? undefined,
	}
}

const sources = (code: string, files: Record<string, string | null>, cache?: ExportCache) =>
	helperSources({ id: "/app/src/mod.ts", program: parseSync("mod.ts", code).program }, access(files, cache))

// Re-exports at any depth, renamed, `export *`, and `export * as`: each source names what it brings by export name.
it("barrels", async () => {
	const files = {
		"/app/src/h1.ts": 'export { createServerOnlyFn as serverOnly, Link } from "@lovrozagar/flare";\n',
		"/app/src/h2.ts": 'export * from "./h1.ts";\nexport * as flare from "@lovrozagar/flare";\n',
		"/app/src/plain.ts": "export const a = 1;\n",
		"/app/src/h3.ts": 'export * as plain from "./plain.ts";\nexport * as deep from "./h2.ts";\n',
	}
	const found = await sources(
		'import { serverOnly } from "./h2.ts";\nimport { a } from "./plain.ts";\nconst m = import("./h1.ts");\n',
		files,
	)
	expect([...found.keys()]).toEqual(["./h2.ts", "./h1.ts"])
	expect(found.get("./h2.ts")?.get("serverOnly")).toBe("createServerOnlyFn")
	expect(found.get("./h2.ts")?.has("Link")).toBe(false)
	const namespace = found.get("./h2.ts")?.get("flare")
	expect(namespace instanceof Map ? namespace.get("createIsomorphicFn") : undefined).toBe("createIsomorphicFn")
	// A namespace of a module with no helpers is nothing, and one of a barrel keeps its helpers, not its namespaces.
	const deep = (await sources('import "./h3.ts";\n', files)).get("./h3.ts")
	expect([...(deep?.keys() ?? [])]).toEqual(["deep"])
	const held = deep?.get("deep")
	expect(held instanceof Map ? [...held.keys()].toSorted() : []).toEqual(["flare", "serverOnly"])
})

// A cycle stops where it closes, a source that does not resolve or read brings nothing, a module is read again but not
// parsed again while its text is the same, and a module that does not parse has no sources.
it("edges", async () => {
	const files = {
		"/app/src/a.ts": 'export * from "./b.ts";\nexport { createClientOnlyFn } from "@lovrozagar/flare";\n',
		"/app/src/b.ts": 'export * from "./a.ts";\n',
	}
	const cache: ExportCache = new Map()
	const found = await sources('import "./a.ts";\nimport "missing";\nimport "./gone.ts";\n', files, cache)
	expect(found.get("./a.ts")?.get("createClientOnlyFn")).toBe("createClientOnlyFn")
	expect([...found.keys()]).toEqual(["./a.ts"])
	const parsed = cache.get("/app/src/a.ts")
	await sources('import "./a.ts";\n', files, cache)
	expect(cache.get("/app/src/a.ts")).toBe(parsed)
	const broken = { id: "/app/src/x.ts", file: "src/x.ts", code: "export const = ;" }
	expect(await moduleSources(broken, access(files))).toEqual(new Map())
})

// String export names, `export *` passing everything but `default`, a declaration export (no source), a source the
// module names twice or the package itself, and a module that resolves but cannot be read.
it("export forms", async () => {
	const files = {
		"/app/src/d.ts":
			'export { createServerOnlyFn as default, "createClientOnlyFn" as "clientOnly" } from "@lovrozagar/flare";\nexport const n = 1;\n',
		"/app/src/s.ts": 'export * from "./d.ts";\n',
		"/app/src/ghost.ts": null,
	}
	const found = await sources(
		'import { clientOnly } from "./s.ts";\nimport "./s.ts";\nimport "@lovrozagar/flare";\nimport "./ghost.ts";\nexport * from "./s.ts";\nexport { n } from "./d.ts";\nexport const m = 1;\nimport(name);\n',
		files,
	)
	expect([...found.keys()]).toEqual(["./s.ts", "./d.ts"])
	expect([...(found.get("./s.ts")?.keys() ?? [])]).toEqual(["clientOnly"])
	const parsed = { id: "/app/src/mod.ts", file: "src/mod.ts", code: 'import { clientOnly } from "./s.ts";\n' }
	expect([...(await moduleSources(parsed, access(files))).keys()]).toEqual(["./s.ts"])
})

// ES's star rules: a module's own export shadows a star export of the same name, and two star exports that give a
// name different bindings make it ambiguous, so neither is exported; the same binding twice is no ambiguity.
it("star rules", async () => {
	const files = {
		"/app/src/own.ts":
			'export * from "@lovrozagar/flare";\nexport const createServerOnlyFn = (f: () => unknown) => f;\n',
		"/app/src/x.ts": 'export { createServerOnlyFn as pick } from "@lovrozagar/flare";\n',
		"/app/src/y.ts": 'export { createClientOnlyFn as pick } from "@lovrozagar/flare";\n',
		"/app/src/z.ts": 'export { createServerOnlyFn as pick } from "@lovrozagar/flare";\n',
		"/app/src/both.ts": 'export * from "./x.ts";\nexport * from "./y.ts";\n',
		"/app/src/same.ts": 'export * from "./x.ts";\nexport * from "./z.ts";\n',
	}
	const found = await sources('import "./own.ts";\nimport "./both.ts";\nimport "./same.ts";\n', files)
	expect(found.get("./own.ts")?.has("createServerOnlyFn")).toBe(false)
	expect(found.get("./own.ts")?.get("createClientOnlyFn")).toBe("createClientOnlyFn")
	expect(found.has("./both.ts")).toBe(false)
	expect(found.get("./same.ts")?.get("pick")).toBe("createServerOnlyFn")
})

// A completed walk is cached per environment and kept while every module it read is unchanged; a change to a module
// deep in it walks again. A cycle that needs more rounds than the cap fails, naming the module.
it("cache and cap", async () => {
	const files: Record<string, string | null> = {
		"/app/src/top.ts": 'export * from "./deep.ts";\n',
		"/app/src/deep.ts": 'export { createServerOnlyFn } from "@lovrozagar/flare";\n',
	}
	const cache: ExportCache = new Map()
	const first = await sources('import "./top.ts";\n', files, cache)
	expect(first.get("./top.ts")?.get("createServerOnlyFn")).toBe("createServerOnlyFn")
	files["/app/src/deep.ts"] = "export const nothing = 1;\n"
	expect((await sources('import "./top.ts";\n', files, cache)).has("./top.ts")).toBe(false)
	expect([...cache.keys()].every((key) => key.startsWith("client\0"))).toBe(true)
	const cyclic = {
		"/app/src/a.ts": 'export * from "./b.ts";\nexport { createServerOnlyFn } from "@lovrozagar/flare";\n',
		"/app/src/b.ts": 'export * from "./a.ts";\n',
	}
	const capped = helperSources(
		{ id: "/app/src/mod.ts", program: parseSync("mod.ts", 'import "./b.ts";\n').program },
		{ ...access(cyclic), rounds: 0 },
	)
	await expect(capped).rejects.toThrow("/app/src/b.ts: its barrels' exports do not settle")
})

// A module two barrels both reach is walked once a round; a re-export that does not resolve, a default export, and a
// destructured export bring no helper and shadow nothing a star gives.
it("barrel shapes", async () => {
	const files = {
		"/app/src/top.ts": 'export * from "./left.ts";\nexport * from "./right.ts";\nexport * from "./gone.ts";\n',
		"/app/src/left.ts": 'export * from "./base.ts";\nexport default 1;\n',
		"/app/src/right.ts":
			'export * from "./base.ts";\nexport const { unrelated } = { unrelated: 1 };\nexport function f() {}\n',
		"/app/src/base.ts": 'export { createServerOnlyFn } from "@lovrozagar/flare";\n',
	}
	const found = await sources('import "./top.ts";\n', files)
	expect(found.get("./top.ts")?.get("createServerOnlyFn")).toBe("createServerOnlyFn")
	expect(found.get("./top.ts")?.has("default")).toBe(false)
})
