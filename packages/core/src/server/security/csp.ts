import type {
	CspDirectiveName,
	CspDirectives,
	PermissionFeature,
	PermissionsPolicy,
	SecurityConfig,
} from "../../shared/route-builder/types.ts"
import { defaultHeaders } from "./defaults.ts"

// Every source-list directive in the order the header writes them. `frame-src` and `media-src` have no default and
// appear only when the app names them (dx/server.md CSP directives).
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
	// A route's directives, added to the server's policy (BUGS.md 330).
	add?: CspDirectives
	permissions?: SecurityConfig["Permissions-Policy"]
	// The X-Frame-Options the answer sends, which the default `frame-ancestors` restates.
	frame?: SecurityConfig["X-Frame-Options"]
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

function directivePolicy(input: {
	url: string
	nonce: string
	dev: boolean
	user: CspDirectives | undefined
	add?: CspDirectives
	frame?: SecurityConfig["X-Frame-Options"]
}): string {
	const lists = baseLists(input.frame)
	if (input.user !== undefined) applyUser(lists, input.user)
	if (input.add !== undefined) addUser(lists, input.add)
	if (input.dev) applyDev(lists)
	lists["script-src"] = [...lists["script-src"], `'nonce-${input.nonce}'`]
	lists["style-src-elem"] = [...lists["style-src-elem"], `'nonce-${input.nonce}'`]
	const parts = ORDER.flatMap((name) => {
		const list = lists[name]
		return list === undefined ? [] : [[name, ...list.map((source) => checked(name, source))].join(" ")]
	})
	const flag = (name: "upgrade-insecure-requests" | "block-all-mixed-content") =>
		input.add?.[name] ?? input.user?.[name]
	if (flag("upgrade-insecure-requests") ?? new URL(input.url).protocol === "https:")
		parts.push("upgrade-insecure-requests")
	if (flag("block-all-mixed-content") === true) parts.push("block-all-mixed-content")
	return parts.join("; ")
}

// The directives with a default are always present; the named-only ones appear once the app names them.
type Lists = Record<Exclude<CspDirectiveName, "frame-src" | "media-src" | "frame-ancestors">, readonly string[]> &
	Partial<Record<CspDirectiveName, readonly string[]>>

function baseLists(frame: SecurityConfig["X-Frame-Options"]): Lists {
	const ancestors = framedBy(frame)
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
		// A form posts only to the page's own origin (plan 21 14.1).
		"form-action": ["'self'"],
		...(ancestors !== undefined && { "frame-ancestors": ancestors }),
	}
}

// `frame-ancestors` restates the X-Frame-Options the answer sends, since a browser that reads both obeys the CSP: DENY,
// the default, is 'none', SAMEORIGIN is 'self', and an app that removes the header gets no directive, so its embeds
// still load (BUGS.md 221, 268).
function framedBy(frame: SecurityConfig["X-Frame-Options"]): readonly string[] | undefined {
	if (frame === false) return undefined
	return frame?.toUpperCase() === "SAMEORIGIN" ? ["'self'"] : ["'none'"]
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

// A route's sources join each list once; a list that is only `'none'` takes the route's instead, since `'none'` beside
// a source means nothing. `style-src` named without `style-src-elem` adds to the element list too (BUGS.md 330).
function addUser(lists: Lists, added: CspDirectives): void {
	for (const name of ORDER) {
		const value = added[name]
		if (value !== undefined) lists[name] = join(lists[name], value)
	}
	const styleSrc = added["style-src"]
	if (styleSrc !== undefined && added["style-src-elem"] === undefined) {
		lists["style-src-elem"] = join(lists["style-src-elem"], styleSrc)
	}
}

function join(kept: readonly string[] | undefined, more: readonly string[]): string[] {
	const base = kept?.length === 1 && kept[0] === "'none'" ? [] : (kept ?? [])
	return [...new Set([...base, ...more])]
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

// A `;` ends a directive and a line break ends the header, so a source holding either would inject policy of its own:
// it throws, naming the directive, before it reaches the header (plan 21 14.1).
function checked(name: string, source: string): string {
	if (/[;\r\n]/.test(source)) throw new Error(`CSP ${name} source ${JSON.stringify(source)} holds a ; or a line break`)
	return source
}
