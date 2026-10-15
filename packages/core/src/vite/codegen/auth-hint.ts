import type { Scan } from "./scan.ts"

// What prerender checks against the effective auth it computes from the loaded modules (B25). The runtime never
// reads it.
export type AuthHint = "requires" | "reads" | "public"

// B26 over a route's chain, root down: `.authenticate()` anywhere requires. Otherwise `.authenticateOptional()` or an
// `.authorize()` without `.authenticate()` reads, because its answer is per caller. Otherwise the route is public.
export function authHint(chain: ReadonlyArray<Pick<Scan, "auth" | "authorize">>): AuthHint {
	if (chain.some((scan) => scan.auth === true)) return "requires"
	if (chain.some((scan) => scan.auth === "optional" || scan.authorize)) return "reads"
	return "public"
}
