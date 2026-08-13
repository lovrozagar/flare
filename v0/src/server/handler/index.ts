/**
 * Flare Server Handler
 *
 * Main server entry point for SSR.
 * Works directly with generated route manifests.
 */

import type { FlareTreeNode } from "../../router/tree-types"
import { matchRoute } from "../../router/tree-types"
import {
	createMiddlewareContext,
	type FlareMiddleware,
	runMiddlewares,
} from "../_internal/middleware"
import { type CspDirectives, generateNonce } from "../_internal/security"
import type { ExecutionContext } from "../_internal/types"
import { runWithServerContext } from "../context/request-context"
import { enableFetchDedupe } from "../dedupe"
import type { GeneratedBoundary, LayoutModule } from "../index"
import { getNavFormat, handleDataRequest } from "./data-request"
import { handleHtmlNavRequest } from "./html-nav"
import { render404Page, renderPage } from "./render"
import { applySecurityHeaders } from "./security"
import type { RouterDefaults } from "./shared-types"
import { handleStaticFile, normalizeUrl } from "./url"

interface AuthenticateFnContext<TEnv> {
	env: TEnv
	request: Request
	url: URL
}

interface ServerHandlerConfig<TEnv = unknown, TAuth = unknown> {
	authenticateFn?: (ctx: AuthenticateFnContext<TEnv>) => Promise<TAuth>
	boundaries?: GeneratedBoundary[]
	csp?: CspDirectives
	defaultDeferAwaitOnInitialLoad?: boolean
	/** Enable automatic fetch deduplication for GET/HEAD requests (default: true) */
	dedupeFetch?: boolean
	entryScript?: string
	isDev?: boolean
	layouts?: Record<string, () => Promise<LayoutModule>>
	middlewares?: FlareMiddleware<TEnv>[]
	queryClientGetter?: () => unknown
	routerDefaults?: RouterDefaults
	routeTree?: FlareTreeNode
}

interface ServerHandler<TEnv = unknown> {
	fetch: (request: Request, env: TEnv, ctx?: ExecutionContext) => Promise<Response>
}

function createServerHandler<TEnv = unknown>(
	config: ServerHandlerConfig<TEnv>,
): ServerHandler<TEnv> {
	const { csp = {}, dedupeFetch = true, isDev = false, middlewares = [] } = config

	/* Enable fetch deduplication if configured (default: true) */
	if (dedupeFetch) {
		enableFetchDedupe()
	}

	/* Default entry script in dev mode if not provided */
	const entryScript = config.entryScript ?? (isDev ? "/src/client.ts" : undefined)

	return {
		fetch: (
			request: Request,
			env: TEnv,
			executionContext?: ExecutionContext,
		): Promise<Response> => {
			const nonce = generateNonce()
			const url = new URL(request.url)
			const abortController = new AbortController()

			return runWithServerContext({ nonce, request }, async () => {
				const normalizedResponse = normalizeUrl(url)
				if (normalizedResponse) {
					return normalizedResponse
				}

				const staticResponse = handleStaticFile(url)
				if (staticResponse) {
					return staticResponse
				}

				const middlewareCtx = createMiddlewareContext({
					env,
					executionContext,
					nonce,
					request,
					url,
				})

				const middlewareResult = await runMiddlewares(middlewares, middlewareCtx)

				if (middlewareResult.type === "bypass") {
					return middlewareResult.response
				}

				if (middlewareResult.type === "respond") {
					let response = middlewareResult.response
					response = await middlewareCtx.applyResponseHandlers(response)
					response = applySecurityHeaders(response, nonce, isDev, csp)
					return response
				}

				/* Match route against generated tree */
				if (!config.routeTree) {
					let response = render404Page(nonce, url)
					response = await middlewareCtx.applyResponseHandlers(response)
					response = applySecurityHeaders(response, nonce, isDev, csp)
					return response
				}

				const matchResult = matchRoute(config.routeTree, url.pathname)

				if (!matchResult) {
					let response = render404Page(nonce, url)
					response = await middlewareCtx.applyResponseHandlers(response)
					response = applySecurityHeaders(response, nonce, isDev, csp)
					return response
				}

				/* Handle CSR navigation request (x-d header) */
				const navFormat = getNavFormat(request)

				if (navFormat === "html") {
					/* HTML nav mode - return full HTML for client swap */
					let response = await handleHtmlNavRequest({
						abortController,
						boundaries: config.boundaries,
						entryScript,
						env,
						layouts: config.layouts,
						matchResult,
						nonce,
						queryClientGetter: config.queryClientGetter,
						request,
						routerDefaults: config.routerDefaults,
						url,
					})
					response = await middlewareCtx.applyResponseHandlers(response)
					response = applySecurityHeaders(response, nonce, isDev, csp)
					return response
				}

				if (navFormat === "ndjson") {
					/* NDJSON nav mode - return loader data stream */
					const response = await handleDataRequest({
						abortController,
						env,
						layouts: config.layouts,
						matchResult,
						queryClientGetter: config.queryClientGetter,
						request,
						url,
					})
					return response
				}

				let response = await renderPage({
					abortController,
					boundaries: config.boundaries,
					defaultDeferAwaitOnInitialLoad: config.defaultDeferAwaitOnInitialLoad,
					entryScript,
					env,
					layouts: config.layouts,
					matchResult,
					nonce,
					queryClientGetter: config.queryClientGetter,
					request,
					routerDefaults: config.routerDefaults,
					url,
				})

				response = await middlewareCtx.applyResponseHandlers(response)
				response = applySecurityHeaders(response, nonce, isDev, csp)

				return response
			})
		},
	}
}

export type { PrefetchStrategy } from "../../router/_internal/types"
export type { ExecutionContext } from "../_internal/types"
export type { FlareMiddleware, MiddlewareContext, MiddlewareResult } from "../middleware"
export type { CspDirectives } from "../security"
export type { NavFormat } from "./constants"
export type {
	ContextState,
	DevError,
	FlareState,
	MatchState,
	PerRouteHead,
	QueryState,
	RouteState,
} from "./flare-state"
export type { LoaderContext, MatchedComponent, PreloaderContext } from "./shared-types"
export type { AuthenticateFnContext, RouterDefaults, ServerHandler, ServerHandlerConfig }

export { createServerHandler }
