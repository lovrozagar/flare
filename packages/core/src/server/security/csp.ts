import type {
	CspDirectiveName,
	CspDirectives,
	PermissionFeature,
	PermissionsPolicy,
	SecurityConfig,
} from "../../shared/route-builder/types.ts"
import { defaultHeaders } from "./defaults.ts"

// Every source-list directive in the order the header writes them. The last four have no default and appear only
// when the app names them (dx/server.md CSP directives).
const ORDER = [
	"default-src",
	"script-src",
	"style-src",
	"style-src-elem",
	"style-src-attr",
	"base-uri",
	"object-src",
	"img-src",
	"font-src",
	"connect-src",
	"worker-src",
	"frame-src",
	"frame-ancestors",
	"form-action",
	"media-src",
] as const satisfies readonly CspDirectiveName[]

const FEATURES = [
	"accelerometer",
	"browsing-topics",
	"camera",
	"geolocation",
	"gyroscope",
	"interest-cohort",
	"magnetometer",
	"microphone",
	"payment",
	"usb",
] as const satisfies readonly PermissionFeature[]

export type { CspDirectives, PermissionsPolicy }

// The policy headers for one request: the defaults, the CSP, and Permissions-Policy. `nonce` is the request's
// candidate: a directives policy, the default included, carries it, and a string or `false` CSP carries none, so the
// returned nonce is then "" (B68).
export function buildCsp(input: {
	url: string
	nonce: string
	dev?: boolean
	csp?: SecurityConfig["Content-Security-Policy"]
	permissions?: SecurityConfig["Permissions-Policy"]
}): { headers: Headers; nonce: string } {
	const headers = defaultHeaders(input.url)
	// Dev drops HSTS alone: on localhost it would pin https for every other local server. Cross-Origin-Opener-Policy is
	// the same as production, so an opener bug shows in dev (plan 21 14.2).
	if (input.dev === true) headers.delete("strict-transport-security")
	const csp = input.csp
	if (typeof csp === "string") headers.set("content-security-policy", csp)
	else if (csp !== false) {
		headers.set("content-security-policy", directivePolicy({ ...input, dev: input.dev === true, user: csp }))
	}
	if (input.permissions !== false) {
		const text = typeof input.permissions === "string" ? input.permissions : permissionHeader(input.permissions)
		headers.set("permissions-policy", text)
	}
	return { headers, nonce: csp === undefined || typeof csp === "object" ? input.nonce : "" }
}

// 16 random bytes, hex: one per request, made before the server's security callback runs, so its `ctx.nonce` is the
// one the header and every tag carry.
export function randomNonce(): string {
	const bytes = new Uint8Array(16)
	crypto.getRandomValues(bytes)
	let hex = ""
	for (const byte of bytes) hex += byte.toString(16).padStart(2, "0")
	return hex
}

function directivePolicy(input: { url: string; nonce: string; dev: boolean; user: CspDirectives | undefined }): string {
	const lists = baseLists()
	if (input.user !== undefined) applyUser(lists, input.user)
	if (input.dev) applyDev(lists)
	lists["script-src"] = [...lists["script-src"], `'nonce-${input.nonce}'`]
	lists["style-src-elem"] = [...lists["style-src-elem"], `'nonce-${input.nonce}'`]
	const parts = ORDER.flatMap((name) => {
		const list = lists[name]
		return list === undefined ? [] : [[name, ...list].join(" ")]
	})
	const upgrade = input.user?.["upgrade-insecure-requests"] ?? new URL(input.url).protocol === "https:"
	if (upgrade) parts.push("upgrade-insecure-requests")
	if (input.user?.["block-all-mixed-content"] === true) parts.push("block-all-mixed-content")
	return parts.join("; ")
}

// The directives with a default are always present; the named-only ones appear once the app names them.
type Lists = Record<
	Exclude<CspDirectiveName, "frame-src" | "frame-ancestors" | "form-action" | "media-src">,
	readonly string[]
> &
	Partial<Record<CspDirectiveName, readonly string[]>>

function baseLists(): Lists {
	return {
		"default-src": ["'self'"],
		"script-src": ["'self'"],
		"style-src": ["'self'"],
		"style-src-elem": ["'self'"],
		"style-src-attr": ["'unsafe-inline'"],
		"base-uri": ["'self'"],
		"object-src": ["'none'"],
		"img-src": ["'self'", "data:", "https:"],
		"font-src": ["'self'", "data:", "https:"],
		"connect-src": ["'self'", "https:"],
		"worker-src": ["'self'"],
	}
}

// A named directive replaces the default. `style-src` named without `style-src-elem` also sets the element list, so
// the nonce lands beside the app's own sources.
function applyUser(lists: Lists, user: CspDirectives): void {
	for (const name of ORDER) {
		const value = user[name]
		if (value !== undefined) lists[name] = [...value]
	}
	const styleSrc = user["style-src"]
	if (styleSrc !== undefined && user["style-src-elem"] === undefined) lists["style-src-elem"] = [...styleSrc]
}

function applyDev(lists: Lists): void {
	lists["connect-src"] = [
		...lists["connect-src"],
		"ws://localhost:*",
		"ws://127.0.0.1:*",
		"http://localhost:*",
		"http://127.0.0.1:*",
	]
	lists["script-src"] = [...lists["script-src"], "'unsafe-eval'"]
	lists["worker-src"] = [...lists["worker-src"], "blob:"]
}

function permissionHeader(permissions: PermissionsPolicy | undefined): string {
	return FEATURES.map((feature) => token(feature, permissions?.[feature])).join(",")
}

function token(feature: PermissionFeature, value: PermissionsPolicy[PermissionFeature]): string {
	if (value === true) return `${feature}=*`
	if (value === "self") return `${feature}=(self)`
	if (Array.isArray(value)) return allow(feature, value)
	return `${feature}=()`
}

// An origin is quoted into the header, so a quote, a space, or a `;` in it would end the value early.
function allow(feature: string, origins: readonly string[]): string {
	for (const origin of origins) {
		if (/["\s;]/.test(origin)) throw new Error(`Permissions-Policy ${feature}: ${JSON.stringify(origin)}`)
	}
	return `${feature}=(${origins.map((origin) => `"${origin}"`).join(" ")})`
}
