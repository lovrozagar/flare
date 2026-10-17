import { expect, it } from "vitest"
import { appModule } from "./app-module.ts"

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
