import type { FlareRegister, RegisteredServerContext } from "../../shared/route-builder/register.ts"
import type { CspDirectives, SecurityConfig } from "../../shared/route-builder/types.ts"
import { buildCsp, randomNonce } from "./csp.ts"

// Every key of a security config (dx/server.md SecurityConfig).
export const SECURITY_KEYS: readonly (keyof SecurityConfig)[] = [
	"Content-Security-Policy",
	"Strict-Transport-Security",
	"X-Content-Type-Options",
	"Referrer-Policy",
	"X-Frame-Options",
	"Cross-Origin-Opener-Policy",
	"Cross-Origin-Resource-Policy",
	"Permissions-Policy",
	"X-Powered-By",
]

// The keys whose value is the header's own: a string sets it, and `false` removes it. CSP and Permissions-Policy also
// take an object, which buildCsp writes.
const PLAIN = [
	"Strict-Transport-Security",
	"X-Content-Type-Options",
	"Referrer-Policy",
	"X-Frame-Options",
	"Cross-Origin-Opener-Policy",
	"Cross-Origin-Resource-Policy",
	"X-Powered-By",
] as const satisfies readonly (keyof SecurityConfig)[]

// One shape for the server's and a route's `.security()` (shared/route-builder/types.ts).
export type { SecurityConfig }

// What the server's callback reads besides the nonce (dx/server.md SecurityConfig).
export type SecurityContext = {
	request: Request
	env: unknown
	serverContext: RegisteredServerContext<FlareRegister>
}

export type ServerSecurity = SecurityConfig | ((ctx: SecurityContext & { nonce: string }) => SecurityConfig)

// A request's set: its headers, the nonce they carry ("" without a directives CSP), the server's resolved config, which
// a route's `.security()` merges onto, and the request's nonce candidate, which every rebuild keeps.
export type Secured = { headers: Headers; nonce: string; config: SecurityConfig; candidate: string }

// `dev` is the server's dev mode: the policy then allows what Vite's client needs (csp.ts `applyDev`). A callback runs
// only with the request's context, so a set built before serverContext, for a 400 or a canonical redirect, carries
// the defaults.
export function applySecurity(input: {
	url: string
	headers: Headers
	dev?: boolean
	routeHeaders?: Record<string, string>
	security?: ServerSecurity | undefined
	context?: SecurityContext
	route?: SecurityConfig
	candidate?: string
}): Secured {
	const candidate = input.candidate ?? randomNonce()
	const config = serverConfig(input.security, input.context, candidate)
	const csp = mergedCsp(config["Content-Security-Policy"], input.route?.["Content-Security-Policy"])
	const merged: SecurityConfig = {
		...config,
		...input.route,
		...(csp !== undefined && { "Content-Security-Policy": csp }),
	}
	const headers = new Headers(input.headers)
	writeRoute(headers, input.routeHeaders)
	const built = buildCsp({
		url: input.url,
		nonce: candidate,
		dev: input.dev === true,
		csp: merged["Content-Security-Policy"],
		permissions: merged["Permissions-Policy"],
	})
	for (const [name, value] of built.headers) headers.set(name, value)
	if (merged["Content-Security-Policy"] === false) headers.delete("content-security-policy")
	if (merged["Permissions-Policy"] === false) headers.delete("permissions-policy")
	for (const key of PLAIN) {
		const value = merged[key]
		if (value === false) headers.delete(key)
		else if (value !== undefined) headers.set(key, value)
	}
	return { headers, nonce: built.nonce, config, candidate }
}

function serverConfig(
	security: ServerSecurity | undefined,
	context: SecurityContext | undefined,
	nonce: string,
): SecurityConfig {
	if (typeof security !== "function") return security ?? {}
	return context === undefined ? {} : security({ ...context, nonce })
}

function writeRoute(headers: Headers, routeHeaders: Record<string, string> | undefined): void {
	if (routeHeaders === undefined) return
	for (const [key, value] of Object.entries(routeHeaders)) headers.set(key, value)
}

// Parent to child (dx/builder.md `headers(fn)`): names are case-insensitive, a child key wins, `set-cookie` appends
// the child's values after the parent's, and an undefined child value keeps the parent's.
export function mergeHeaders(
	parent: Readonly<Record<string, string | readonly string[]>>,
	child: Readonly<Record<string, string | readonly string[] | undefined>>,
): Record<string, string | string[]> {
	const result: Record<string, string | string[]> = {}
	for (const [key, value] of Object.entries(parent)) result[key.toLowerCase()] = copy(value)
	for (const [name, value] of Object.entries(child)) {
		if (value === undefined) continue
		const key = name.toLowerCase()
		const prior = result[key]
		result[key] = key === "set-cookie" && prior !== undefined ? [...[prior].flat(), ...[value].flat()] : copy(value)
	}
	return result
}

function copy(value: string | readonly string[]): string | string[] {
	return typeof value === "string" ? value : [...value]
}

// A route's directives add their sources to the server's, each once, so a page that allows one more origin keeps the
// server's own policy; a flag directive takes the route's value. A route string or `false` replaces the whole policy,
// as does any route CSP over a server string (plan 21 14.1, v0's directive merge).
function mergedCsp(
	server: SecurityConfig["Content-Security-Policy"],
	route: SecurityConfig["Content-Security-Policy"],
) {
	if (typeof server !== "object" || typeof route !== "object") return undefined
	const lists: Record<string, unknown> = { ...server }
	for (const [name, value] of Object.entries(route)) {
		const kept = lists[name]
		lists[name] = Array.isArray(value) && Array.isArray(kept) ? [...new Set([...kept, ...value])] : value
	}
	return lists as CspDirectives
}
