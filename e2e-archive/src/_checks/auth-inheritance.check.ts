/**
 * Type-level assertions for auth inheritance.
 * Verified by `tsc --noEmit` — never executed at runtime.
 *
 * Proves: parent layout with .authenticate() → child pages
 * that DON'T call .authenticate() still get `auth: RegisteredAuth`
 */
import type {
	FlareRegister,
	ParentAuthResolution,
	ResolvedAuth,
	RouteAuthMode,
} from "flare/codegen"

/* ── Helpers ───────────────────────────────────────────────── */

type Exact<T, U> = [T] extends [U] ? ([U] extends [T] ? true : false) : false
type Assert<_ extends true> = never

/* ── 1. RegisteredAuth resolves to the env.d.ts auth type ── */

type Auth = FlareRegister extends { auth: infer A } ? A : never
type _auth = Assert<Exact<Auth, { callerData: unknown[]; userId: string }>>

/* ── 2. Layouts that call .authenticate() are in authModes ── */

type _am1 = Assert<Exact<RouteAuthMode<"_root_/(chain-auth-inherit)">, true>>
type _am2 = Assert<Exact<RouteAuthMode<"_root_/(dashboard)">, true>>

/* ── 3. Child pages WITHOUT .authenticate() inherit from parent ── */

/* chain-auth-inherit layout → child page */
type _par1 = Assert<
	Exact<ParentAuthResolution<"_root_/(chain-auth-inherit)/chain-auth-inherit/index">, true>
>

/* dashboard layout → dashboard/index */
type _par2 = Assert<Exact<ParentAuthResolution<"_root_/(dashboard)/dashboard/index">, true>>

/* dashboard layout → dashboard/settings */
type _par3 = Assert<Exact<ParentAuthResolution<"_root_/(dashboard)/dashboard/settings">, true>>

/* ── 4. ResolvedAuth<true> = actual auth type (not null) ── */

type _res1 = Assert<Exact<ResolvedAuth<true>, { callerData: unknown[]; userId: string }>>

/* ── 5. Full chain: parent auth → child ResolvedAuth = auth type ── */

type _full1 = Assert<
	Exact<
		ResolvedAuth<ParentAuthResolution<"_root_/(chain-auth-inherit)/chain-auth-inherit/index">>,
		{ callerData: unknown[]; userId: string }
	>
>

type _full2 = Assert<
	Exact<
		ResolvedAuth<ParentAuthResolution<"_root_/(dashboard)/dashboard/index">>,
		{ callerData: unknown[]; userId: string }
	>
>

type _full3 = Assert<
	Exact<
		ResolvedAuth<ParentAuthResolution<"_root_/(dashboard)/dashboard/settings">>,
		{ callerData: unknown[]; userId: string }
	>
>

/* ── 6. Pages without authenticated parents → auth is null ── */

type _noauth1 = Assert<Exact<ParentAuthResolution<"_root_/about">, false>>
type _noauth2 = Assert<Exact<ResolvedAuth<false>, null>>
type _noauth3 = Assert<Exact<ResolvedAuth<ParentAuthResolution<"_root_/about">>, null>>

/* ── 7. Root layout itself has no parent auth ── */

type _root = Assert<Exact<ParentAuthResolution<"_root_">, false>>
