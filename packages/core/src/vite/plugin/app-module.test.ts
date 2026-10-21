import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { expect, it } from "vitest"
import { appAccess, appModule, dependencyModule } from "./app-module.ts"

const ROOTS = ["/app", "/real/app"]
const FLARE = "/flare/src"

// Under a root, a module is the app's, root-relative, in either form of the root; outside every root it is only
// checked, absolute. A dependency counts from the root, so a root under a node_modules directory is still the app; a
// virtual id, a non-script, Flare's own source, and a query Vite did not add are not modules here (BUGS.md 201).
it("app module", () => {
	expect(appModule(ROOTS, "/app/src/a.ts?v=1", FLARE)).toEqual({ file: "src/a.ts", app: true })
	expect(appModule(ROOTS, "/real/app/lib/b.tsx", FLARE)).toEqual({ file: "lib/b.tsx", app: true })
	expect(appModule(["/x/node_modules/.fixtures/app"], "/x/node_modules/.fixtures/app/src/a.ts", FLARE)).toEqual({
		file: "src/a.ts",
		app: true,
	})
	expect(appModule(ROOTS, "/repo/shared/c.ts", FLARE)).toEqual({ file: "/repo/shared/c.ts", app: false })
	for (const id of [
		"/app/node_modules/x/a.ts",
		"/repo/node_modules/x/a.ts",
		"/app/src/a.ts?raw",
		"\0virtual:a.ts",
		"/app/src/a.css",
		"/flare/src/exports/server-fn.ts",
	]) {
		expect(appModule(ROOTS, id, FLARE)).toBeUndefined()
	}
})

// A Web Worker's entry in `vite dev` carries `worker_file` and its `type`: it is the module, so the client rewrite
// runs on it; `type` alone is someone else's query (BUGS.md 462).
it("worker entry", () => {
	expect(appModule(ROOTS, "/app/src/w.ts?worker_file&type=module", FLARE)).toEqual({ file: "src/w.ts", app: true })
	expect(appModule(ROOTS, "/app/src/w.ts?type=module", FLARE)).toBeUndefined()
})

// A barrel is followed through Vite's resolver to app and dependency modules, and read from disk as written; a source
// the resolver does not find, an external one, and Flare's own source are not followed (BUGS.md 461, 463).
it("app access", async () => {
	const dir = mkdtempSync(join(tmpdir(), "flare-access-"))
	writeFileSync(join(dir, "barrel.ts"), "export {}\n")
	const found: Record<string, { id: string; external?: boolean } | null> = {
		"./barrel.ts": { id: join(dir, "barrel.ts") },
		"./gone.ts": null,
		cdn: { id: "https://cdn.example/x.js", external: true },
		dep: { id: join(dir, "node_modules/dep/index.js") },
		own: { id: "/flare/src/exports/index.ts" },
	}
	const access = appAccess(
		{ resolve: async (source: string) => found[source] ?? null },
		{ roots: [dir], packageSrc: FLARE },
	)
	const importer = join(dir, "mod.ts")
	expect(await access.resolve("./barrel.ts", importer)).toBe(join(dir, "barrel.ts"))
	expect(await access.resolve("dep", importer)).toBe(join(dir, "node_modules/dep/index.js"))
	for (const source of ["./gone.ts", "cdn", "own"]) expect(await access.resolve(source, importer)).toBeUndefined()
	expect(access.read(`${join(dir, "barrel.ts")}?v=1`)).toBe("export {}\n")
	expect(access.read(join(dir, "missing.ts"))).toBeUndefined()
	// A dependency that names no helper or the package is not read into the walk.
	mkdirSync(join(dir, "node_modules/dep"), { recursive: true })
	writeFileSync(join(dir, "node_modules/dep/plain.js"), "export const a = 1\n")
	writeFileSync(join(dir, "node_modules/dep/env.js"), 'export * from "@lovrozagar/flare"\n')
	expect(access.read(join(dir, "node_modules/dep/plain.js"))).toBeUndefined()
	expect(access.read(join(dir, "node_modules/dep/env.js"))).toBe('export * from "@lovrozagar/flare"\n')
	// A re-exporting module is read when its package reaches Flare, through its own dependencies at any depth (a
	// cycle among them included); otherwise, and when a dependency is not installed or the manifest is unreadable, it
	// is a leaf. With no package.json up the tree, the module is a leaf too.
	const pkg = (name: string, manifest: object): void => {
		mkdirSync(join(dir, "node_modules", name), { recursive: true })
		writeFileSync(join(dir, "node_modules", name, "package.json"), JSON.stringify({ name, ...manifest }))
		writeFileSync(join(dir, "node_modules", name, "index.js"), 'export * from "./x.js"\n')
	}
	pkg("bridge", { dependencies: { cycle: "1", env: "1" } })
	pkg("cycle", { dependencies: { bridge: "1" } })
	pkg("env", { peerDependencies: { "@lovrozagar/flare": "*" } })
	pkg("solid", { dependencies: { gone: "1" }, optionalDependencies: { cycle2: "1" } })
	pkg("cycle2", { dependencies: { solid: "1" } })
	pkg("broken", {})
	writeFileSync(join(dir, "node_modules/broken/package.json"), "{ not json")
	for (const name of ["bridge", "cycle", "env"]) {
		expect(access.read(join(dir, "node_modules", name, "index.js"))).toBe('export * from "./x.js"\n')
	}
	for (const name of ["solid", "cycle2", "broken"])
		expect(access.read(join(dir, "node_modules", name, "index.js"))).toBeUndefined()
	const orphan = mkdtempSync(join(tmpdir(), "flare-orphan-"))
	mkdirSync(join(orphan, "node_modules/lone"), { recursive: true })
	writeFileSync(join(orphan, "node_modules/lone/index.js"), 'export * from "./x.js"\n')
	expect(access.read(join(orphan, "node_modules/lone/index.js"))).toBeUndefined()
	rmSync(orphan, { recursive: true, force: true })
	rmSync(dir, { recursive: true, force: true })
})

// A dependency's script by its absolute path, with Vite's own query only; not a virtual module, a non-script, Flare's
// own source, or a module outside node_modules (BUGS.md 463).
it("dependency module", () => {
	expect(dependencyModule("/app/node_modules/x/a.js?v=1", FLARE)).toBe("/app/node_modules/x/a.js")
	for (const id of [
		"/app/node_modules/x/a.js?raw",
		"\0virtual:node_modules/a.js",
		"/app/node_modules/x/a.css",
		"/flare/src/node_modules/a.ts",
		"/app/src/a.ts",
	]) {
		expect(dependencyModule(id, FLARE)).toBeUndefined()
	}
})
