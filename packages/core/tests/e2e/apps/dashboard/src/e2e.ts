// The e2e-only controls answer only under the e2e boot, which sets FLARE_E2E=1 in the env the server sees: the process
// env the Node and Bun adapters pass, and the worker's env on Workers (dx/adapters.md, BUGS.md 372).
export function e2eOnly(env: unknown): void {
	if (Reflect.get(Object(env), "FLARE_E2E") === "1") return
	throw new Error("e2e controls are off")
}

// A webhook secret: the env's, else, under the e2e boot only, a fixed test value. Unset anywhere else, it matches
// nothing.
export const E2E_SECRETS = { REVALIDATE_SECRET: "e2e-revalidate-secret", BILLING_SECRET: "e2e-billing-secret" }

export function secretFrom(env: unknown, name: keyof typeof E2E_SECRETS): string | undefined {
	const own: unknown = Reflect.get(Object(env), name)
	if (typeof own === "string" && own !== "") return own
	return Reflect.get(Object(env), "FLARE_E2E") === "1" ? E2E_SECRETS[name] : undefined
}
