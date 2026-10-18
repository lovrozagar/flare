// The e2e-only controls answer only under the e2e boot, which sets FLARE_E2E=1: in the process env of the Node and Bun
// servers, and in the worker's env on Workers.
export function e2eOnly(env: unknown): void {
	if (Reflect.get(Object(env), "FLARE_E2E") === "1") return
	if (typeof process !== "undefined" && process.env["FLARE_E2E"] === "1") return
	throw new Error("e2e controls are off")
}

// A webhook secret: the env's, else the process env's on Node and Bun, whose listener passes no env (dx/adapters.md),
// else, under the e2e boot only, a fixed test value. Unset anywhere else, it matches nothing.
export const E2E_SECRETS = { REVALIDATE_SECRET: "e2e-revalidate-secret", BILLING_SECRET: "e2e-billing-secret" }

export function secretFrom(env: unknown, name: keyof typeof E2E_SECRETS): string | undefined {
	const own: unknown = Reflect.get(Object(env), name)
	if (typeof own === "string" && own !== "") return own
	const processEnv = typeof process === "undefined" ? undefined : process.env[name]
	if (processEnv !== undefined && processEnv !== "") return processEnv
	const e2e =
		Reflect.get(Object(env), "FLARE_E2E") === "1" ||
		(typeof process !== "undefined" && process.env["FLARE_E2E"] === "1")
	return e2e ? E2E_SECRETS[name] : undefined
}
