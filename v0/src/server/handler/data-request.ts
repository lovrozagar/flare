/**
 * CSR Data Request Handler
 *
 * Handles CSR navigation data requests.
 * Returns NDJSON stream (default) or full HTML (navFormat: html).
 */

import type { JSX } from "solid-js"
import { isRedirectResponse } from "../../errors"
import { setServerQueryClient } from "../../query-client/create-query-client-getter"
import {
	createTrackedQueryClient,
	type TrackedQueryClient,
} from "../../query-client/tracked-client"
import { createLocation, type HeadConfig } from "../../router/_internal/types"
import { deriveLayouts, type MatchResult } from "../../router/tree-types"
import type { LayoutModule } from "../index"
import { CSR_HEADER_VALUES, CSR_HEADERS, NAV_FORMAT, type NavFormat } from "./constants"
import { createDeferContext, type DeferContext } from "./defer"
import { type HeadContext, resolveHeadChain } from "./head-resolution"
import { validateInput } from "./input-validation"
import {
	createStreamingNDJSONResponse,
	formatDoneMessage,
	formatRedirectMessage,
	type LoaderResult,
	type RouteHead,
} from "./ndjson-nav"
import type { LoaderContext, PreloaderContext } from "./shared-types"

interface DataRequestConfig<TEnv = unknown> {
	abortController: AbortController
	env: TEnv
	layouts?: Record<string, () => Promise<LayoutModule>>
	matchResult: MatchResult
	queryClientGetter?: () => unknown
	request: Request
	url: URL
}

interface LoadedComponent {
	_type: "layout" | "page" | "root-layout"
	head?: (ctx: HeadContext) => HeadConfig
	inputConfig?: Parameters<typeof validateInput>[0]
	loader?: (ctx: LoaderContext) => Promise<unknown>
	preloader?: (ctx: PreloaderContext) => Promise<unknown>
	render: (props: unknown) => JSX.Element
	virtualPath: string
}

/**
 * Get navigation format from CSR request.
 * Returns null if not a CSR data request.
 */
function getNavFormat(request: Request): NavFormat | null {
	const dataHeader = request.headers.get(CSR_HEADERS.DATA_REQUEST)
	if (dataHeader !== CSR_HEADER_VALUES.DATA_REQUEST_ENABLED) {
		return null
	}

	const formatHeader = request.headers.get(CSR_HEADERS.NAV_FORMAT)
	return formatHeader === NAV_FORMAT.HTML ? "html" : "ndjson"
}

/**
 * Check if request is a CSR data request (any format)
 */
function isDataRequest(request: Request): boolean {
	return request.headers.get(CSR_HEADERS.DATA_REQUEST) === CSR_HEADER_VALUES.DATA_REQUEST_ENABLED
}

/**
 * Create NDJSON response for redirect
 */
function createRedirectNDJSONResponse(url: string, status: number, replace?: boolean): Response {
	const body = `${formatRedirectMessage(url, status, replace)}\n${formatDoneMessage()}\n`
	return new Response(body, {
		headers: {
			"Cache-Control": "no-store",
			"Content-Type": "application/x-ndjson",
		},
	})
}

/**
 * Handle CSR data request
 */
async function handleDataRequest<TEnv>(config: DataRequestConfig<TEnv>): Promise<Response> {
	const { env, layouts, matchResult, queryClientGetter, request, url } = config
	const { route, params } = matchResult

	/* Create tracked query client if getter provided */
	let queryClient: TrackedQueryClient<unknown> | undefined
	if (queryClientGetter) {
		const baseQC = queryClientGetter()
		if (baseQC) {
			queryClient = createTrackedQueryClient(baseQC as object)
			/* Set for SSR fallback in useQueryClient */
			setServerQueryClient(baseQC as Parameters<typeof setServerQueryClient>[0])
		}
	}

	/* Get requested matchIds from header */
	const requestedMatchIds = parseMatchIds(request.headers.get(CSR_HEADERS.MATCH_IDS))

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

	/* Build component hierarchy */
	const components: LoadedComponent[] = [...loadedLayouts, pageComponent]

	/* Create base FlareLocation for this request */
	const baseLocation = createLocation(url, params, route.x, route.v)

	/* Get raw query client for preloader context */
	const rawQueryClient = queryClientGetter?.()

	/* Run preloaders and loaders */
	const results: LoaderResult[] = []
	let accumulatedPreloaderContext: Record<string, unknown> = {}
	const deferContexts = new Map<string, DeferContext>()

	for (const component of components) {
		/* Skip if not in requested matchIds */
		if (requestedMatchIds.size > 0 && !requestedMatchIds.has(component.virtualPath)) {
			continue
		}

		try {
			/* Run preloader if exists */
			if (component.preloader) {
				const preloaderCtx: PreloaderContext = {
					abortController: config.abortController,
					auth: undefined,
					env,
					location: baseLocation,
					preloaderContext: { ...accumulatedPreloaderContext },
					queryClient: rawQueryClient,
					request,
				}
				const preloaderResult = await component.preloader(preloaderCtx)
				if (preloaderResult && typeof preloaderResult === "object") {
					accumulatedPreloaderContext = { ...accumulatedPreloaderContext, ...preloaderResult }
				}
			}

			/* Run loader if exists */
			let loaderData: unknown = {}
			if (component.loader) {
				/* Create defer context for this component - CSR nav always streams */
				const deferCtx = createDeferContext({
					defaultAwaitOnInitialLoad: false,
					initialLoad: false,
					matchId: component.virtualPath,
				})
				deferContexts.set(component.virtualPath, deferCtx)

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
					env,
					location: loaderLocation,
					prefetch: false,
					preloaderContext: { ...accumulatedPreloaderContext },
					queryClient,
					request,
				}

				loaderData = await component.loader(loaderCtx)
			}

			results.push({
				data: loaderData,
				matchId: component.virtualPath,
				preloaderContext: { ...accumulatedPreloaderContext },
				status: "success",
			})
		} catch (error) {
			/* Handle redirect responses - return immediately */
			if (isRedirectResponse(error)) {
				return createRedirectNDJSONResponse(error.url, error.status, error.replace)
			}

			results.push({
				error: error instanceof Error ? error : new Error(String(error)),
				matchId: component.virtualPath,
				status: "error",
			})
		}
	}

	/* Await stream: false deferred before serializing */
	await Promise.all(Array.from(deferContexts.values()).map((ctx) => ctx.awaitDeferred()))

	/* Collect per-route head configs for route-based cleanup on client */
	const perRouteHeads: RouteHead[] = []
	let accumulatedHead = {}

	for (const component of components) {
		if (!component.head) continue

		const result = results.find((r) => r.matchId === component.virtualPath)
		const ctx: HeadContext = {
			cause: "enter" as const,
			loaderData: result?.status === "success" ? result.data : undefined,
			location: baseLocation,
			parentHead: accumulatedHead,
			prefetch: false,
			preloaderContext: result?.status === "success" ? result.preloaderContext : {},
		}

		const routeHead = component.head(ctx)
		if (routeHead && Object.keys(routeHead).length > 0) {
			perRouteHeads.push({ head: routeHead, matchId: component.virtualPath })
			/* Accumulate for parentHead in next iteration */
			accumulatedHead = { ...accumulatedHead, ...routeHead }
		}
	}

	/* Also compute merged head for backward compatibility */
	const headMatches = components.map((component) => {
		const result = results.find((r) => r.matchId === component.virtualPath)
		return {
			context: {
				cause: "enter" as const,
				loaderData: result?.status === "success" ? result.data : undefined,
				location: baseLocation,
				prefetch: false,
				preloaderContext: result?.status === "success" ? result.preloaderContext : {},
			},
			route: { head: component.head },
		}
	})
	const headConfig = resolveHeadChain(headMatches)

	/* Collect tracked queries for client hydration */
	const queries = queryClient?.getTrackedQueries().map((q) => ({ data: q.data, key: q.key })) ?? []

	return createStreamingNDJSONResponse(results, deferContexts, headConfig, queries, perRouteHeads)
}

/**
 * Parse comma-separated matchIds from x-m header
 */
function parseMatchIds(header: string | null): Set<string> {
	if (!header) return new Set()
	return new Set(
		header
			.split(",")
			.map((id) => id.trim())
			.filter(Boolean),
	)
}

export type { NavFormat }

export { getNavFormat, handleDataRequest, isDataRequest }
