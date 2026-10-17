import type { RedirectError } from "../../shared/errors/redirect.ts"
import { canonicalPath, type CanonicalOptions } from "../../shared/url/canonical.ts"
import { buildUrl, routeHref } from "../../shared/url/index.ts"

// What a redirect's URL is written under: the router's base and its trailing-slash rule.
export type Routing = { basePath: string; trailingSlash: "preserve" | "always" | "never" }

// A thrown redirect(). `href` is used as written. A route id is the route's URL as the router writes it: under the
// base, the index the base itself, then the trailing-slash rule, so it never meets a second redirect (B73, BUGS.md 188).
export function redirectLocation(error: RedirectError, routing: Routing): string {
	const to = error.to
	// redirect() throws with exactly one of `to` and `href`.
	if (to === undefined) return `${error.href}`
	return routeHref(routing, buildUrl({ to, params: error.params, search: error.search, hash: error.hash }))
}

export type CanonicalRedirect = {
	status: number
	path?: string
	location?: string
	method?: string
}

export function canonicalRedirect(input: {
	method: string
	path: string
	trailingSlash?: CanonicalOptions["trailingSlash"]
}): CanonicalRedirect {
	const canonical = canonicalPath(input.path, { trailingSlash: input.trailingSlash ?? "preserve" })
	if ("hostile" in canonical) return { status: 400 }
	if (canonical.path === input.path) return { status: 200, path: canonical.path }
	const status = input.method === "GET" || input.method === "HEAD" ? 301 : 308
	return { status, location: canonical.path, method: input.method }
}
