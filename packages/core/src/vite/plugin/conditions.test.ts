import type { EnvironmentOptions, Plugin } from "vite"
import { expect, it } from "vitest"
import { productionConditions } from "./conditions.ts"

// The plugin's configEnvironment hook, run as Vite runs it, and the conditions the environment's options end with.
function conditionsAfter(
	name: string,
	options: EnvironmentOptions,
	command: "build" | "serve",
): readonly string[] | undefined {
	const plugin: Plugin = productionConditions()
	const hook = plugin.configEnvironment
	if (typeof hook !== "function") throw new Error("productionConditions has no configEnvironment function")
	Reflect.apply(hook, {}, [name, options, { command, mode: "production", isPreview: false, isSsrBuild: false }])
	return options.resolve?.conditions
}

// A build resolves every environment as the runtime resolves the packages it leaves external: with `production`,
// whatever NODE_ENV says, so a bundled dev build never meets an external prod build (BUGS.md 303).
it("build resolves production", () => {
	expect(conditionsAfter("client", {}, "build")).toEqual(["module", "browser", "production"])
	expect(conditionsAfter("ssr", {}, "build")).toEqual(["module", "node", "production"])
	expect(conditionsAfter("flare_prerender", { consumer: "server" }, "build")).toEqual(["module", "node", "production"])
})

// Conditions an environment already has, the Cloudflare plugin's for the worker, keep their order; only Vite's
// development-or-production placeholder becomes `production`.
it("keeps given conditions", () => {
	const worker = { resolve: { conditions: ["workerd", "worker", "module", "browser", "development|production"] } }
	expect(conditionsAfter("ssr", worker, "build")).toEqual(["workerd", "worker", "module", "browser", "production"])
})

// An app's own conditions without the placeholder are its choice, and stay as written.
it("app conditions untouched", () => {
	expect(conditionsAfter("ssr", { resolve: { conditions: ["custom", "node"] } }, "build")).toEqual(["custom", "node"])
})

// Dev keeps Vite's placeholder, which NODE_ENV settles as Vite documents.
it("dev untouched", () => {
	expect(conditionsAfter("ssr", {}, "serve")).toBeUndefined()
})
