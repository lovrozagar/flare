// `origin` is the one the adapter resolved. `sameSite` is createServer's host allow-list. `identity` is a function
// with `authenticate` or `authorize`, which turns off the fail-open (B44).
export type CsrfInput = {
	method: "get" | "post"
	headers: Headers
	origin: string
	sameSite: readonly string[]
	identity: boolean
}

// The first present header wins, in order Origin, Sec-Fetch-Site, Referer. A present header that fails is 403, and
// the later ones are not consulted (B44). A same-site request passes only for a listed host, read from Origin or,
// when Sec-Fetch-Site decides, from Referer.
export function checkCsrf(input: CsrfInput): 200 | 403 {
	const origin = input.headers.get("origin")
	if (origin !== null) return allowed(origin, input) ? 200 : 403
	const site = input.headers.get("sec-fetch-site")
	if (site !== null) return siteAllowed(site, input) ? 200 : 403
	const referer = input.headers.get("referer")
	if (referer !== null) return allowed(referer, input) ? 200 : 403
	return input.identity ? 403 : 200
}

// A `.response()` route's request with a method other than GET and HEAD gets the same check (plan 21 4.3), as a POST;
// `identity` is a chain that reads or requires auth, which turns off the fail-open as it does for a server function.
export function routeCsrf(request: Request, input: { sameSite: readonly string[]; identity: boolean }): 200 | 403 {
	if (request.method === "GET" || request.method === "HEAD") return 200
	const origin = new URL(request.url).origin
	return checkCsrf({ method: "post", headers: request.headers, origin, ...input })
}

function siteAllowed(site: string, input: CsrfInput): boolean {
	if (site === "same-origin") return true
	if (site === "none") return input.method === "get"
	if (site !== "same-site") return false
	const referer = input.headers.get("referer")
	return referer !== null && listed(referer, input)
}

// The sender's own origin, or a host on the same-site list.
function allowed(url: string, input: CsrfInput): boolean {
	return originOf(url) === input.origin || listed(url, input)
}

// A listed host passes only on the app's scheme, and on the default port or the app's own. An http page on a
// listed host could be injected by anyone on the network, so it does not pass for an https app.
function listed(url: string, input: CsrfInput): boolean {
	if (!URL.canParse(url)) return false
	const sender = new URL(url)
	const app = new URL(input.origin)
	if (sender.protocol !== app.protocol || !input.sameSite.includes(sender.hostname)) return false
	return sender.port === "" || sender.port === app.port
}

function originOf(url: string): string | undefined {
	return URL.canParse(url) ? new URL(url).origin : undefined
}
