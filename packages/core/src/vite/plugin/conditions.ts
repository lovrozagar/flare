import { defaultClientConditions, defaultServerConditions, type Plugin } from "vite"

// Vite's export condition that its resolver settles by NODE_ENV: `development` unless NODE_ENV is `production`.
const PLACEHOLDER = "development|production"

// A build resolves every environment with `production`, whatever NODE_ENV says (BUGS.md 303). The packages a server
// build leaves external are resolved at run time by Node, Bun, or workerd, which never apply `development`; a bundle
// resolved with it paired solid-js's dev build, which imports `OBSERVE`, with @solidjs/signals' external prod build,
// which has none, and the built server did not load under NODE_ENV=test. Conditions an environment already has, the
// Cloudflare plugin's, keep their order. `vite dev` keeps Vite's placeholder.
export function productionConditions(): Plugin {
	return {
		name: "flare:conditions",
		configEnvironment(name, options, env) {
			if (env.command !== "build") return
			const client = name === "client" || options.consumer === "client"
			const given = options.resolve?.conditions ?? (client ? defaultClientConditions : defaultServerConditions)
			options.resolve = {
				...options.resolve,
				conditions: given.map((condition) => (condition === PLACEHOLDER ? "production" : condition)),
			}
		},
	}
}
