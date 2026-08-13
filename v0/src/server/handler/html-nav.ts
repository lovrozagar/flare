/**
 * HTML Navigation Handler
 *
 * Handles CSR navigation in HTML mode.
 * Returns full rendered HTML for client-side content swap.
 * No signature validation - responses are CDN cacheable.
 */

import { isRedirectResponse, type RedirectResponse } from "../../errors"
import { setServerQueryClient } from "../../query-client/create-query-client-getter"
import {
	createTrackedQueryClient,
	type TrackedQuery,
	type TrackedQueryClient,
} from "../../query-client/tracked-client"
import { createLocation } from "../../router/_internal/types"
import { deriveLayouts, type MatchResult } from "../../router/tree-types"
import type { GeneratedBoundary, LayoutModule } from "../index"
import type { Deferred } from "./defer"
import { createDeferContext, type DeferContext } from "./defer"
import { buildFlareStateScript, type FlareState, type PerRouteHead } from "./flare-state"
import {
	type HeadContext,
	type RouteMatch as HeadRouteMatch,
	resolveHeadChain,
} from "./head-resolution"
import { type RouteMatch as HeadersRouteMatch, resolveHeadersChain } from "./headers-resolution"
import { validateInput } from "./input-validation"
import type {
	LoadedComponent,
	LoaderContext,
	MatchedComponent,
	PreloaderContext,
	RouterDefaults,
} from "./shared-types"
import { renderToHTML, type SSRContext } from "./ssr"

/**
 * Check if value is a Deferred object
 */
function isDeferred(value: unknown): value is Deferred<unknown> {
	return (
		value !== null &&
		typeof value === "object" &&
		"__deferred" in value &&
		(value as Record<string, unknown>).__deferred === true
	)
}

/**
 * Serialize loader data by unwrapping Deferred objects to their resolved values.
 * For HTML nav, all deferred data has been awaited, so we return __resolved.
 */
function serializeLoaderData(data: unknown): unknown {
	if (data === null || data === undefined) {
		return data
	}

	if (typeof data !== "object") {
		return data
	}

	/* Unwrap Deferred to resolved value */
	if (isDeferred(data)) {
		if ("__error" in data && data.__error) {
			/* Return error marker for client to handle */
			return { __error: data.__error }
		}
		return data.__resolved
	}

	/* Recurse into arrays */
	if (Array.isArray(data)) {
		return data.map(serializeLoaderData)
	}

	/* Recurse into objects */
	const result: Record<string, unknown> = {}
	for (const [key, value] of Object.entries(data)) {
		result[key] = serializeLoaderData(value)
	}
	return result
}

interface HtmlNavConfig<TEnv = unknown> {
	abortController: AbortController
	boundaries?: GeneratedBoundary[]
	entryScript?: string
	env: TEnv
	layouts?: Record<string, () => Promise<LayoutModule>>
	matchResult: MatchResult
	nonce: string
	queryClientGetter?: () => unknown
	request: Request
	routerDefaults?: RouterDefaults
	url: URL
}

/**
 * Create HTTP redirect response from RedirectResponse error
 */
function createRedirectHttpResponse(redirect: RedirectResponse): Response {
	return new Response(null, {
		headers: { Location: redirect.url },
		status: redirect.status,
	})
}

/**
 * Handle HTML navigation request.
 * Returns full HTML suitable for client-side content swap and re-hydration.
 *
 * Key differences from SSR:
 * - No signature required (CDN cacheable)
 * - Includes x-flare-nav-format: html header
 * - Client swaps #app content and re-hydrates
 */
async function handleHtmlNavRequest<TEnv>(config: HtmlNavConfig<TEnv>): Promise<Response> {
	const { layouts, matchResult, nonce, url } = config
	const { params, route } = matchResult

	/* Load page component */
	const pageModule = await route.p()
	const pageComponent = pageModule.default as LoadedComponent

	/* Load layout components */
	const loadedLayouts: LoadedComponent[] = []
	if (layouts) {
		const layoutKeys = deriveLayouts(route.x)
		for (const layoutKey of layoutKeys) {
			const layoutLoader = layouts[layoutKey]
			if (layoutLoader) {
				const layoutModule = await layoutLoader()
				loadedLayouts.push(layoutModule.default as LoadedComponent)
			}
		}
	}

	/* Build component hierarchy: layouts first, then page */
	const components: LoadedComponent[] = [...loadedLayouts, pageComponent]

	/* Create tracked query client if getter provided */
	let queryClient: TrackedQueryClient<unknown> | undefined
	if (config.queryClientGetter) {
		const baseQC = config.queryClientGetter()
		if (baseQC) {
			queryClient = createTrackedQueryClient(baseQC as object)
			/* Set for SSR fallback in useQueryClient */
			setServerQueryClient(baseQC as Parameters<typeof setServerQueryClient>[0])
		}
	}

	/* Run preloaders and loaders */
	const matched: MatchedComponent[] = []
	let accumulatedPreloaderContext: Record<string, unknown> = {}
	const deferContexts: DeferContext[] = []

	/* Create base FlareLocation for this request */
	const baseLocation = createLocation(url, params, route.x, route.v)

	/* Get raw query client for preloader context */
	const rawQueryClient = config.queryClientGetter?.()

	for (const component of components) {
		/* Run preloader if exists */
		let preloaderResult: unknown = {}
		if (component.preloader) {
			const preloaderCtx: PreloaderContext = {
				abortController: config.abortController,
				auth: undefined,
				env: config.env,
				location: baseLocation,
				preloaderContext: { ...accumulatedPreloaderContext },
				queryClient: rawQueryClient,
				request: config.request,
			}
			try {
				preloaderResult = await component.preloader(preloaderCtx)
				if (preloaderResult && typeof preloaderResult === "object") {
					accumulatedPreloaderContext = { ...accumulatedPreloaderContext, ...preloaderResult }
				}
			} catch (error) {
				if (isRedirectResponse(error)) {
					return createRedirectHttpResponse(error)
				}
				throw error
			}
		}

		/* Run loader if exists */
		let loaderData: unknown = {}
		if (component.loader) {
			/* HTML nav is like initial load - defer becomes no-op (awaited) */
			const deferCtx = createDeferContext({
				defaultAwaitOnInitialLoad: true,
				initialLoad: true,
				matchId: component.virtualPath,
			})
			deferContexts.push(deferCtx)

			/* Validate input using component's inputConfig */
			const validated = validateInput(component.inputConfig, params, url.searchParams)

			/* Create location with validated params/search */
			const loaderLocation = createLocation(
				url,
				validated.params,
				route.x,
				route.v,
				validated.search,
			)

			const loaderCtx: LoaderContext = {
				abortController: config.abortController,
				auth: undefined,
				cause: "enter",
				defer: deferCtx.defer,
				deps: [],
				env: config.env,
				location: loaderLocation,
				prefetch: false,
				preloaderContext: accumulatedPreloaderContext,
				queryClient,
				request: config.request,
			}

			try {
				loaderData = await component.loader(loaderCtx)
			} catch (error) {
				if (isRedirectResponse(error)) {
					return createRedirectHttpResponse(error)
				}
				throw error
			}
		}

		matched.push({
			component,
			loaderData,
			preloaderContext: { ...accumulatedPreloaderContext },
			virtualPath: component.virtualPath,
		})
	}

	/* Await all deferred (HTML nav is SSR, no streaming) */
	await Promise.all(deferContexts.map((ctx) => ctx.awaitDeferred({ awaitAll: true })))

	/* Resolve head and headers */
	const headMatches: HeadRouteMatch[] = matched.map((m) => ({
		context: {
			cause: "enter" as const,
			loaderData: m.loaderData,
			location: baseLocation,
			prefetch: false,
			preloaderContext: m.preloaderContext,
		},
		route: { head: m.component.head },
	}))
	const resolvedHead = resolveHeadChain(headMatches)

	/* Collect per-route heads for route-based cleanup */
	const perRouteHeads: PerRouteHead[] = []
	let accumulatedHead = {}
	for (const m of matched) {
		if (!m.component.head) continue

		const headCtx: HeadContext = {
			cause: "enter" as const,
			loaderData: m.loaderData,
			location: baseLocation,
			parentHead: accumulatedHead,
			prefetch: false,
			preloaderContext: m.preloaderContext,
		}
		const routeHead = m.component.head(headCtx)

		if (routeHead && Object.keys(routeHead).length > 0) {
			perRouteHeads.push({ head: routeHead, matchId: m.virtualPath })
			accumulatedHead = { ...accumulatedHead, ...routeHead }
		}
	}

	const headersMatches: HeadersRouteMatch[] = matched.map((m) => ({
		context: {
			cause: "enter" as const,
			env: config.env,
			loaderData: m.loaderData,
			location: baseLocation,
			prefetch: false,
			preloaderContext: m.preloaderContext,
			request: config.request,
		},
		route: { headers: m.component.headers },
	}))
	const resolvedHeaders = resolveHeadersChain(headersMatches)

	/* Build tracked queries for hydration */
	const trackedQueries = queryClient?.getTrackedQueries() ?? []

	/* Build flare state - client needs this to update caches */
	/* Serialize loader data to unwrap Deferred objects to resolved values */
	const flareState: FlareState = {
		c: config.routerDefaults ? { routerDefaults: config.routerDefaults } : {},
		h: Object.keys(resolvedHead).length > 0 ? resolvedHead : undefined,
		ph: perRouteHeads.length > 0 ? perRouteHeads : undefined,
		q: trackedQueries.map((q: TrackedQuery) => ({
			data: q.data,
			key: q.key as unknown[],
			staleTime: q.staleTime,
		})),
		r: {
			matches: matched.map((m) => ({
				id: m.virtualPath,
				loaderData: serializeLoaderData(m.loaderData),
			})),
			params,
			pathname: url.pathname,
		},
	}

	/* Build SSR context */
	const flareStateScript = buildFlareStateScript(flareState)
	const ssrContext: SSRContext = {
		cause: "enter",
		entryScript: config.entryScript,
		flareStateScript,
		location: {
			params: baseLocation.params,
			pathname: baseLocation.pathname,
			search: baseLocation.search,
		},
		nonce,
		prefetch: false,
		preloaderContext: accumulatedPreloaderContext,
		queryClient,
		resolvedHead,
	}

	/* Render to HTML */
	const matches = matched.map((m) => ({
		_type: m.component._type === "page" ? ("render" as const) : m.component._type,
		loaderData: m.loaderData,
		render: m.component.render,
		virtualPath: m.virtualPath,
	}))

	const html = await renderToHTML(matches, ssrContext)

	if (html === null) {
		return new Response("Render failed", { status: 500 })
	}

	/* Build response headers */
	const responseHeaders = new Headers({
		"content-type": "text/html; charset=utf-8",
		"x-flare-nav-format": "html",
		...resolvedHeaders,
	})

	return new Response(html, {
		headers: responseHeaders,
		status: 200,
	})
}

export type { HtmlNavConfig }
export { handleHtmlNavRequest }
