import { expect, it } from "vitest"
import { SERVER_ONLY_RUNTIME } from "../../shared/env/server-only.ts"
import { boundary } from "./boundary.ts"

// The rewrite and the tripwire run before Solid compiles JSX. A Web Worker bundle passes `client`, so a worker module
// is rewritten as the client graph in any environment (B9): its server-only body goes in the ssr environment too.
it("worker graph", async () => {
	const plugin = boundary("client")
	expect(plugin.enforce).toBe("pre")
	const hook = plugin.transform
	if (typeof hook !== "function") throw new Error("transform")
	const source =
		'import { createServerOnlyFn } from "@lovrozagar/flare";\nexport const read = createServerOnlyFn(() => SECRET);\n'
	const context = { environment: { name: "ssr", config: { root: "/app", mode: "test" } }, resolve: async () => null }
	const result: unknown = await Reflect.apply(hook, context, [source, "/app/src/worker.ts"])
	expect(Reflect.get(Object(result), "code")).not.toContain("SECRET")
})

// A chunk whose rendered code still holds the server-only runtime fails, naming the helper when no module info says
// which module held it (BUGS.md 461).
it("runtime kept", () => {
	const hook = boundary().renderChunk
	if (typeof hook !== "function") throw new Error("renderChunk")
	const context = { environment: { name: "client" }, getModuleInfo: () => null }
	const chunk = { fileName: "assets/app.js", moduleIds: ["/app/src/mod.ts"] }
	expect(() => Reflect.apply(hook, context, [`throw new Error("${SERVER_ONLY_RUNTIME}")`, chunk])).toThrow(
		"assets/app.js: createServerOnlyFn keeps the createServerOnlyFn runtime",
	)
})
