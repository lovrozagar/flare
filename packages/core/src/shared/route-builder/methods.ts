// The methods a `.response()` page may declare. HEAD follows GET and is not declared (plan 21 13.5). Only codegen and
// the server check a list, so no client bundle carries this.
const RESPONSE_METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"])

export const METHODS_RULE = "methods is a non-empty array of GET, POST, PUT, PATCH, DELETE, or OPTIONS, each once"

export function isMethodList(value: unknown): value is string[] {
	if (!Array.isArray(value) || value.length === 0 || new Set(value).size !== value.length) return false
	return value.every((item) => typeof item === "string" && RESPONSE_METHODS.has(item))
}

// `crossOrigin: true` drops the Origin check of a `.response()` route's non-GET request, for a sender on another site
// whose request the handler proves itself: a signed webhook, an OIDC form_post, a SAML endpoint. It adds no CORS
// header. A route that answers only GET and OPTIONS has no check to drop, and one whose chain authenticates or
// authorizes would let a forged cross-site request act as the visitor, so both are refused (B44, BUGS.md 273).
export const CROSS_ORIGIN_RULE: string =
	"crossOrigin: true needs a method besides GET and OPTIONS and a chain with no .authenticate(), " +
	".authenticateOptional(), or .authorize(), and its handler proves the request authentic"

export function crossOriginRefused(methods: readonly string[] | undefined, identity: boolean): boolean {
	return identity || !(methods ?? ["GET"]).some((method) => method !== "GET" && method !== "OPTIONS")
}
