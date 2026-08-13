/**
 * Headers Resolution
 *
 * Merges ResponseHeaders across route chain (root-layout → layouts → page).
 * Child values override parent for same keys.
 */

import type { FlareLocation, ResponseHeaders } from "../../router/_internal/types"

interface HeadersContext {
	cause: "enter" | "stay"
	env: unknown
	loaderData: unknown
	location: FlareLocation
	parentHeaders?: ResponseHeaders
	prefetch: boolean
	preloaderContext: unknown
	request: Request
}

interface RouteMatch {
	context: Omit<HeadersContext, "parentHeaders">
	route: {
		headers?: (ctx: HeadersContext) => ResponseHeaders
	}
}

function mergeResponseHeaders(
	parent: ResponseHeaders | undefined,
	child: ResponseHeaders | undefined,
): ResponseHeaders {
	if (!parent && !child) {
		return {}
	}
	if (!parent) {
		return child ?? {}
	}
	if (!child) {
		return parent
	}

	return { ...parent, ...child }
}

function resolveHeadersChain(matches: RouteMatch[]): ResponseHeaders {
	let accumulated: ResponseHeaders = {}

	for (const match of matches) {
		if (!match.route.headers) {
			continue
		}

		const ctx: HeadersContext = {
			...match.context,
			parentHeaders: accumulated,
		}

		const headersResult = match.route.headers(ctx)
		accumulated = mergeResponseHeaders(accumulated, headersResult)
	}

	return accumulated
}

export { mergeResponseHeaders, resolveHeadersChain }
export type { HeadersContext, RouteMatch }
