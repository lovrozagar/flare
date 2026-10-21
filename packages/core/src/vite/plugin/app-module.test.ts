import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { expect, it } from "vitest"
import { appAccess, appModule } from "./app-module.ts"

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

// A barrel is followed through Vite's resolver to app modules only, and read from disk as written; a source the
// resolver does not find, an external one, a dependency, and Flare's own source are not followed (BUGS.md 461).
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
	for (const source of ["./gone.ts", "cdn", "dep", "own"])
		expect(await access.resolve(source, importer)).toBeUndefined()
	expect(access.read(`${join(dir, "barrel.ts")}?v=1`)).toBe("export {}\n")
	expect(access.read(join(dir, "missing.ts"))).toBeUndefined()
	rmSync(dir, { recursive: true, force: true })
})
