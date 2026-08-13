/**
 * Page Rendering
 *
 * SSR rendering for generated route manifests.
 */

import type { JSX } from "solid-js"
import { isRedirectResponse, type RedirectResponse } from "../../errors"
import { setServerQueryClient } from "../../query-client/create-query-client-getter"
import {
	createTrackedQueryClient,
	type TrackedQueryClient,
} from "../../query-client/tracked-client"
import { createLocation, type HeadConfig, type ResponseHeaders } from "../../router/_internal/types"
import { deriveLayouts, type MatchResult } from "../../router/tree-types"
import { buildHtmlDocument, escapeHtml } from "../_internal/html-template"
import type { GeneratedBoundary, LayoutModule } from "../index"
import { createDeferContext, type DeferContext } from "./defer"
import { buildFlareStateScript, type DevError, type FlareState } from "./flare-state"
import { type HeadContext, resolveHeadChain } from "./head-resolution"
import { type HeadersContext, resolveHeadersChain } from "./headers-resolution"
import { type InputConfig, validateInput } from "./input-validation"
import type { LoaderContext, PreloaderContext } from "./shared-types"
import { renderToHTML, type SSRContext } from "./ssr"

interface RouterDefaults {
	gcTime?: number
	prefetchStaleTime?: number
	staleTime?: number
}

interface RenderConfig<TEnv = unknown> {
	abortController: AbortController
	auth?: unknown
	boundaries?: GeneratedBoundary[]
	defaultDeferAwaitOnInitialLoad?: boolean
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

interface LoadedComponent {
	_type: "layout" | "page" | "render" | "root-layout"
	head?: (ctx: HeadContext) => HeadConfig
	headers?: (ctx: HeadersContext) => ResponseHeaders
	inputConfig?: InputConfig
	loader?: (ctx: LoaderContext) => Promise<unknown>
	preloader?: (ctx: PreloaderContext) => Promise<unknown>
	render: (props: unknown) => JSX.Element
	virtualPath: string
}

interface MatchedComponent {
	component: LoadedComponent
	loaderData: unknown
	preloaderContext: unknown
	virtualPath: string
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

async function renderPage<TEnv>(config: RenderConfig<TEnv>): Promise<Response> {
	const { layouts, matchResult, nonce, url } = config
	const { route, params } = matchResult

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
	let rawQueryClient: unknown
	if (config.queryClientGetter) {
		rawQueryClient = config.queryClientGetter()
		if (rawQueryClient) {
			queryClient = createTrackedQueryClient(rawQueryClient as object)
			/* Set for SSR fallback in useQueryClient */
			setServerQueryClient(rawQueryClient as Parameters<typeof setServerQueryClient>[0])
		}
	}

	/* Run preloaders and loaders */
	const matched: MatchedComponent[] = []
	let accumulatedPreloaderContext: Record<string, unknown> = {}
	const deferContexts: DeferContext[] = []
	const devErrors: DevError[] = []

	/* Create base FlareLocation for this request */
	const baseLocation = createLocation(url, params, route.x, route.v)

	for (const component of components) {
		/* Run preloader if exists */
		let preloaderResult: unknown = {}
		if (component.preloader) {
			const preloaderCtx: PreloaderContext = {
				abortController: config.abortController,
				auth: config.auth,
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
			/* Create defer context - initial load behavior based on config */
			const deferCtx = createDeferContext({
				defaultAwaitOnInitialLoad: config.defaultDeferAwaitOnInitialLoad ?? false,
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
				auth: config.auth,
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
				/* Handle redirect responses */
				if (isRedirectResponse(error)) {
					return createRedirectHttpResponse(error)
				}

				const err = error instanceof Error ? error : new Error(String(error))

				/* Collect for dev overlay (only in dev mode) */
				if (import.meta.env.DEV) {
					devErrors.push({
						message: err.message,
						name: err.name,
						source: `loader:${component.virtualPath}`,
						stack: err.stack,
					})
				}

				/* Re-throw to maintain current behavior */
				throw err
			}
		}

		matched.push({
			component,
			loaderData,
			preloaderContext: { ...accumulatedPreloaderContext },
			virtualPath: component.virtualPath,
		})
	}

	/* Await all deferred promises (SSR awaits ALL, doesn't stream) */
	await Promise.all(deferContexts.map((ctx) => ctx.awaitDeferred({ awaitAll: true })))

	/* Resolve head and headers after all loaders complete */
	const headMatches = matched.map((m) => ({
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

	const headersMatches = matched.map((m) => ({
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

	/* Build flare state for client hydration */
	const flareState: FlareState = {
		c: config.routerDefaults ? { routerDefaults: config.routerDefaults } : {},
		e: import.meta.env.DEV && devErrors.length > 0 ? devErrors : undefined,
		h: Object.keys(resolvedHead).length > 0 ? resolvedHead : undefined,
		q: trackedQueries.map((q) => ({
			data: q.data,
			key: q.key as unknown[],
			staleTime: q.staleTime,
		})),
		r: {
			matches: matched.map((m) => ({
				id: m.virtualPath,
				loaderData: m.loaderData,
				preloaderContext: m.preloaderContext,
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

	/* Check if root layout exists */
	const hasRootLayout = matched.some((m) => m.component._type === "root-layout")

	if (hasRootLayout) {
		return renderWithSolidSSR(matched, ssrContext, flareState, resolvedHeaders)
	}

	/* Fallback for routes without root layout */
	return renderFallbackPage(nonce, matched, url.pathname, flareState)
}

async function renderWithSolidSSR(
	matched: MatchedComponent[],
	ctx: SSRContext,
	flareState: FlareState,
	resolvedHeaders: ResponseHeaders = {},
): Promise<Response> {
	try {
		/* Convert to format expected by renderToHTML */
		const matches = matched.map((m) => ({
			_type: m.component._type === "page" ? ("render" as const) : m.component._type,
			loaderData: m.loaderData,
			preloaderContext: m.preloaderContext,
			render: m.component.render,
			virtualPath: m.virtualPath,
		}))

		const html = await renderToHTML(matches, ctx)

		if (html === null) {
			return renderFallbackPage(ctx.nonce, matched, ctx.location.pathname, flareState)
		}

		/* Build response headers - merge resolved headers with content-type */
		const responseHeaders = new Headers({
			"content-type": "text/html; charset=utf-8",
			...resolvedHeaders,
		})

		return new Response(html, {
			headers: responseHeaders,
			status: 200,
		})
	} catch (error) {
		console.error("SSR render failed:", error)

		/* Add render error to flareState for client overlay (dev only) */
		if (import.meta.env.DEV) {
			const err = error instanceof Error ? error : new Error(String(error))
			flareState.e = flareState.e ?? []
			flareState.e.push({
				message: err.message,
				name: err.name,
				source: "ssr-render",
				stack: err.stack,
			})
		}

		return renderErrorPage(ctx.nonce, ctx.location.pathname, flareState, ctx.entryScript)
	}
}

function renderErrorPage(
	nonce: string,
	_pathname: string,
	flareState: FlareState,
	entryScript?: string,
): Response {
	const isDev = import.meta.env.DEV

	const html = buildHtmlDocument({
		body: {
			content: `<div id="app"></div>`,
			moduleScripts: entryScript ? [entryScript] : [],
		},
		head: {
			scripts: [buildFlareStateScript(flareState)],
			title: isDev ? "SSR Error" : "Error",
		},
		lang: "en",
		nonce,
	})

	return new Response(html, {
		headers: { "Content-Type": "text/html; charset=utf-8" },
		status: 500,
	})
}

function render404Page(nonce: string, url: URL): Response {
	const html = buildHtmlDocument({
		body: {
			content: `<div style="display:flex;align-items:center;justify-content:center;min-height:100vh;font-family:system-ui,-apple-system,sans-serif;">
				<div style="text-align:center;">
					<h1 style="font-size:6rem;margin:0;color:#e5e5e5;">404</h1>
					<p style="font-size:1.25rem;color:#737373;margin-top:0.5rem;">Page not found</p>
					<p style="color:#a3a3a3;font-size:0.875rem;">${escapeHtml(url.pathname)}</p>
				</div>
			</div>`,
		},
		head: { title: "404 - Page Not Found" },
		lang: "en",
		nonce,
	})

	return new Response(html, {
		headers: { "Content-Type": "text/html; charset=utf-8" },
		status: 404,
	})
}

export { render404Page, renderPage }
export type { RenderConfig }
