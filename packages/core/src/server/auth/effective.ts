import type { ChainAuth } from "../../shared/route-builder/chain.ts"

// The fields of a stored route record that decide auth. `hint` is the generated hint, and it never wins.
export type AuthSource = {
	auth?: ChainAuth
	authorize?: unknown
	hint?: "public"
}

export type EffectiveAuth = {
	requires: boolean
	reads: boolean
}

// An authorize function reads identity by itself, so the function is the only source of that fact.
export function effectiveAuth(routes: readonly AuthSource[]): EffectiveAuth {
	const requires = routes.some((route) => route.auth?.mode === true)
	const reads = routes.some((route) => route.auth !== undefined || route.authorize !== undefined)
	return { requires, reads }
}
