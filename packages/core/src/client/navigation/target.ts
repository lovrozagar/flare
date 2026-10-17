import { KIND_PARAM, withoutInternalKeys } from "../../shared/protocol/index.ts"
import { rewriteLocation, type Match, type Router } from "../../shared/router/create-router.ts"
import { buildUrl, routeHref, type Location } from "../../shared/url/index.ts"
import { isHashMove } from "./scroll.ts"

export type NavigateInput = {
	to: string
	// The validator output, written by the URL values rule (dx/link.md).
	params?: object | undefined
	search?: object | undefined
	hash?: string | undefined
	shallow?: boolean | undefined
}

// `revalidate`: the call refetches, so a move of the hash alone is a data navigation too (BUGS.md 321).
export type TargetContext = { router: Router; origin: string; current: Location; revalidate?: boolean | undefined }

// A document load, a hash-only move, or a data navigation. `url` is what the address bar shows. `dataUrl` is
// what the client fetches: no hash, and `_flare=data` (02-system step 2).
export type Target =
	| { kind: "document"; url: string }
	| { kind: "hash"; url: string; location: Location }
	| { kind: "shallow"; url: string; location: Location; search: object | undefined }
	| { kind: "data"; url: string; dataUrl: string; location: Location; route?: string | undefined; match: Match }

const SCHEME = /^[a-z][a-z0-9+.-]*:/i

export function resolveTarget(input: NavigateInput, context: TargetContext): Target {
	if (SCHEME.test(input.to) || input.to.startsWith("//"))
		throw new Error(`navigate: to is a route id, not a URL: ${input.to}`)
	// A route id is the URL the router writes: under its base, with its trailing-slash rule (plan 21 3.7, 3.9). Reserved
	// keys leave the search for the URL and for a shallow move's page alike (BUGS.md 322).
	const search = withoutInternalKeys(input.search)
	const built = routeHref(context.router, buildUrl({ to: input.to, params: input.params, search, hash: input.hash }))
	const location = rewriteLocation(context.router, locationOf(new URL(built, context.origin)), context.origin)
	if (input.shallow === true && location.pathname !== context.current.pathname) {
		throw new Error("navigate: a shallow navigation keeps the pathname")
	}
	// A shallow move on the page runs no loader. A hash-only one is a hash move (BUGS.md B18).
	const target = fromLocation(location, context)
	if (input.shallow !== true || target.kind !== "data") return target
	return { kind: "shallow", url: target.url, location, search }
}

// navigate()'s target. `state` goes into history, which structured-clones it: cloned here first, one that cannot be, a
// function say, throws before the request, the commit, and the history write, not after the page changed (BUGS.md
// 314). The page on screen at a hash goes to its target again (BUGS.md 148).
export function callTarget(
	input: NavigateInput & { state?: unknown; revalidate?: boolean | undefined },
	context: TargetContext,
): Target {
	if (input.state !== undefined) structuredClone(input.state)
	return hashAgain(
		resolveTarget(input, { ...context, revalidate: input.revalidate }),
		context.current,
		input.revalidate,
	)
}

// A Link's or an anchor's target, a URL.
export function urlTarget(url: string, revalidate: boolean, context: TargetContext): Target {
	return hashAgain(resolveUrl(url, { ...context, revalidate }), context.current, revalidate)
}

// A navigation, a Link or an anchor, to the URL already current with a hash goes to its target again, as the browser
// does, unless it asks to revalidate. A fill, a refresh, a pop, and a redirect never come here (BUGS.md 148).
export function hashAgain(target: Target, current: Location, revalidate: boolean | undefined): Target {
	if (target.kind !== "data" || revalidate === true || target.location.hash === "") return target
	if (target.url !== `${current.pathname}${current.search}${current.hash}`) return target
	return { kind: "hash", url: target.url, location: target.location }
}

// A URL the server built, such as an `x` frame's `u`. It is not rewritten again. Another origin throws.
export function resolveUrl(href: string, context: TargetContext): Target {
	const url = new URL(href, context.origin)
	if (url.origin !== context.origin) throw new Error("navigate: the URL is not on this origin")
	return fromLocation(locationOf(url), context)
}

function fromLocation(location: Location, context: TargetContext): Target {
	const url = `${location.pathname}${location.search}${location.hash}`
	const match = context.router.match(location.pathname)
	// No page matches: the server's not-found document is the answer, its root rendering the not-found page as the
	// server does, which a bare data 404 cannot paint inside a root that renders the document (plan 21 13.10).
	if (match.id === undefined || match.response === true) return { kind: "document", url }
	if (rootOf(match) !== rootOf(context.router.match(context.current.pathname))) return { kind: "document", url }
	if (context.revalidate !== true && isHashMove(context.current, location)) return { kind: "hash", url, location }
	const query = location.search === "" ? "?" : `${location.search}&`
	const dataUrl = `${location.pathname}${query}${KIND_PARAM}=data`
	return { kind: "data", url, dataUrl, location, route: match.id, match }
}

function locationOf(url: URL): Location {
	return { pathname: url.pathname, search: url.search, hash: url.hash }
}

// A target in another root layout is a document load: the root is the document (02-system).
function rootOf(match: Match): string | undefined {
	return match.chain[0]?.id
}
