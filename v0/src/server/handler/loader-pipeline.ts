/**
 * Loader Pipeline
 *
 * Executes auth, preloaders and loaders for matched routes.
 * Auth: called once if any route needs it, cached for request
 * Authorize: runs per-route after auth
 * Preloaders: sequential (root → page), accumulates merged context
 * Loaders: parallel via Promise.allSettled
 */

import type { JSX } from "solid-js"
import type { Auth, AuthenticateMode, LoaderCause, RouteType } from "../../router/_internal/types"
import type { MatchedRoute } from "../../router/outlet"
import { createDeferContext, type DeferContext } from "./defer"

interface AuthenticateFnContext<TEnv> {
	env: TEnv
	request: Request
	url: URL
}

interface AuthorizeContext {
	abortController: AbortController
	auth: Auth | undefined
	env: unknown
	location: LocationInfo
	preloaderContext: Record<string, unknown>
	queryClient?: unknown
	request: Request
}

interface StoredRouteWithLoader {
	_type: RouteType
	authorize?: (ctx: AuthorizeContext) => boolean | Promise<boolean>
	loader?: (ctx: LoaderFnContext) => Promise<unknown>
	options?: { authenticate?: AuthenticateMode }
	path: string
	preloader?: (ctx: PreloaderFnContext) => Promise<unknown>
	render: (props: unknown) => JSX.Element | null
	variablePath: string
	virtualPath: string
}

interface LocationInfo {
	params: Record<string, string | string[]>
	pathname: string
	search: Record<string, unknown>
}

interface LoaderContext<TEnv = unknown> {
	abortController: AbortController
	authenticateFn?: (ctx: AuthenticateFnContext<TEnv>) => Promise<Auth>
	cause: LoaderCause
	defaultDeferAwaitOnInitialLoad?: boolean
	env: TEnv
	location: LocationInfo
	prefetch: boolean
	queryClient?: unknown
	request: Request
	url: URL
}

interface PreloaderFnContext {
	abortController: AbortController
	auth: Auth | null
	env: unknown
	location: LocationInfo
	preloaderContext: Record<string, unknown>
	queryClient?: unknown
	request: Request
}

interface LoaderFnContext {
	abortController: AbortController
	auth: Auth | null
	cause: LoaderCause
	defer: DeferContext["defer"]
	env: unknown
	location: LocationInfo
	prefetch: boolean
	preloaderContext: Record<string, unknown>
	queryClient?: unknown
	request: Request
}

interface DevError {
	message: string
	name: string
	source: string
	stack?: string
}

interface LoaderPipelineResult {
	auth: Auth | null
	deferContexts: Map<string, DeferContext>
	devErrors: DevError[]
	matches: MatchedRoute[]
	preloaderContext: Record<string, unknown>
}

/**
 * Check if any route in the chain requires authentication
 */
function needsAuthentication(routes: StoredRouteWithLoader[]): boolean {
	return routes.some(
		(route) => route.options?.authenticate === true || route.options?.authenticate === "optional",
	)
}

/**
 * Run the loader pipeline for matched routes.
 *
 * 1. Authenticate if any route needs auth (cached for request)
 * 2. Authorize runs per-route
 * 3. Preloaders run sequentially (root → page)
 * 4. Loaders run in parallel
 */
async function runLoaderPipeline<TEnv>(
	routes: StoredRouteWithLoader[],
	ctx: LoaderContext<TEnv>,
): Promise<LoaderPipelineResult> {
	let preloaderContext: Record<string, unknown> = {}
	const deferContexts = new Map<string, DeferContext>()
	const devErrors: DevError[] = []
	const isInitialLoad = !ctx.prefetch && ctx.cause === "enter"

	/* Track accumulated context for each route (snapshot at time of loader) */
	const routePreloaderSnapshots = new Map<string, Record<string, unknown>>()

	/* 1. Authenticate if any route needs it */
	let auth: Auth | null = null
	if (needsAuthentication(routes) && ctx.authenticateFn) {
		const authCtx: AuthenticateFnContext<TEnv> = {
			env: ctx.env,
			request: ctx.request,
			url: ctx.url,
		}
		/* authenticateFn may throw redirect or UnauthenticatedError */
		auth = await ctx.authenticateFn(authCtx)
	}

	/* 2. Run authorize and preloaders sequentially */
	for (const route of routes) {
		/* Run authorize if defined */
		if (route.authorize) {
			const authorizeCtx: AuthorizeContext = {
				abortController: ctx.abortController,
				auth: auth ?? undefined,
				env: ctx.env,
				location: ctx.location,
				preloaderContext: { ...preloaderContext },
				queryClient: ctx.queryClient,
				request: ctx.request,
			}

			const authorized = await route.authorize(authorizeCtx)
			if (!authorized) {
				/* Throw ForbiddenError - will be caught by error boundary */
				const { ForbiddenError } = await import("../../errors")
				throw new ForbiddenError()
			}
		}

		/* Run preloader */
		if (route.preloader) {
			const preloaderCtx: PreloaderFnContext = {
				abortController: ctx.abortController,
				auth,
				env: ctx.env,
				location: ctx.location,
				preloaderContext: { ...preloaderContext },
				queryClient: ctx.queryClient,
				request: ctx.request,
			}

			const result = await route.preloader(preloaderCtx)
			if (result && typeof result === "object") {
				preloaderContext = { ...preloaderContext, ...result }
			}
		}

		/* Store snapshot of accumulated context for this route's loader */
		routePreloaderSnapshots.set(route.virtualPath, { ...preloaderContext })
	}

	/* 3. Run loaders in parallel */
	const loaderPromises = routes.map(async (route) => {
		if (!route.loader) {
			return { data: {}, status: "success" as const }
		}

		/* Create defer context for this route */
		const deferCtx = createDeferContext({
			defaultAwaitOnInitialLoad: ctx.defaultDeferAwaitOnInitialLoad ?? false,
			initialLoad: isInitialLoad,
			matchId: route.virtualPath,
		})
		deferContexts.set(route.virtualPath, deferCtx)

		const loaderCtx: LoaderFnContext = {
			abortController: ctx.abortController,
			auth,
			cause: ctx.cause,
			defer: deferCtx.defer,
			env: ctx.env,
			location: ctx.location,
			prefetch: ctx.prefetch,
			preloaderContext: routePreloaderSnapshots.get(route.virtualPath) ?? {},
			queryClient: ctx.queryClient,
			request: ctx.request,
		}

		try {
			const data = await route.loader(loaderCtx)
			return { data, status: "success" as const }
		} catch (error) {
			const err = error instanceof Error ? error : new Error(String(error))

			/* Collect for dev overlay (only in dev mode) */
			if (import.meta.env.DEV) {
				devErrors.push({
					message: err.message,
					name: err.name,
					source: `loader:${route.virtualPath}`,
					stack: err.stack,
				})
			}

			return { error: err, status: "error" as const }
		}
	})

	const loaderResults = await Promise.all(loaderPromises)

	/* 4. Build matches with loader data */
	const matches: MatchedRoute[] = routes.map((route, index) => {
		const result = loaderResults[index]
		if (!result) {
			return {
				_type: route._type,
				loaderData: {},
				render: route.render as (props: unknown) => JSX.Element,
				status: "success",
				virtualPath: route.virtualPath,
			}
		}

		if (result.status === "error") {
			return {
				_type: route._type,
				error: result.error,
				loaderData: {},
				render: route.render as (props: unknown) => JSX.Element,
				status: "error",
				virtualPath: route.virtualPath,
			}
		}

		return {
			_type: route._type,
			loaderData: result.data,
			render: route.render as (props: unknown) => JSX.Element,
			status: "success",
			virtualPath: route.virtualPath,
		}
	})

	return {
		auth,
		deferContexts,
		devErrors,
		matches,
		preloaderContext,
	}
}

export type {
	AuthenticateFnContext,
	AuthorizeContext,
	DevError,
	LoaderContext,
	LoaderFnContext,
	LoaderPipelineResult,
	LocationInfo,
	PreloaderFnContext,
	StoredRouteWithLoader,
}

export { runLoaderPipeline }
