import {
	type Accessor,
	createContext,
	createEffect,
	createMemo,
	createSignal,
	ErrorBoundary,
	type JSX,
	onCleanup,
	onMount,
	Show,
	Suspense,
	useContext,
} from "solid-js"
import type { GlobalBoundaries } from "../boundaries/index.ts"
import type { ChannelMessage, SerializedInvalidateOptions } from "../broadcast/channel.ts"
import { BroadcastCtx } from "../broadcast/context.ts"
import { NotFoundError, UnauthenticatedError, UnauthorizedError } from "../errors/index.ts"
import { createTranslator } from "../i18n/index.ts"
import { clearPendingNavigation, proceedPendingNavigation, setActiveBlocker } from "../navigation/index.ts"
import { matchRoute, toLocaleMatch } from "../router-primitives/tree.ts"
import { buildUrl, parseSearchParams, type SearchParams } from "../url/index.ts"
import type {
	BrowserViewTransition,
	ClientMatch,
	FlareProviderContext,
	FlareProviderProps,
	FlareRouter,
	InterceptedState,
	InternalNavigateOptions,
	NavigationPhase,
} from "./types.ts"

export type {
	BlockerState,
	BrowserViewTransition,
	ClientErrorRenderProps,
	ClientMatch,
	ClientNotFoundRenderProps,
	ClientUnauthenticatedRenderProps,
	ClientUnauthorizedRenderProps,
	DeferredResolver,
	FlareProviderContext,
	FlareProviderProps,
	FlareRouter,
	InterceptedState,
	InternalNavigateOptions,
	LocationChangeInfo,
	NavigateOptions,
	NavigationPhase,
	PrefetchOptions,
	ProviderLocation,
	RenderProps,
	ViewTransitionConfig,
	ViewTransitionDirection,
	ViewTransitionOptions,
} from "./types.ts"

/** Exported for SSR — SSR injects context directly on sharedConfig.context */
export const RouterContext = createContext<FlareProviderContext>()
export const DepthContext = createContext<number>(0)

export function FlareProvider(props: FlareProviderProps): JSX.Element {
	const [hydrated, setHydrated] = createSignal(false)
	const [intercepted, setIntercepted] = createSignal<InterceptedState | null>(null)
	const [navigationPhase, setNavigationPhase] = createSignal<NavigationPhase>("idle")
	const isNavigating = createMemo(() => navigationPhase() !== "idle")
	const [viewTransitionSignal, setViewTransition] = createSignal<BrowserViewTransition | null>(null)
	const [matches, setMatches] = createSignal<ClientMatch[]>(props.matches)
	const [notFound, setNotFound] = createSignal(false)
	const [params, setParams] = createSignal<Record<string, string | string[]>>(props.params)
	const [search, setSearch] = createSignal<SearchParams>(props.search ?? {})

	const location = createMemo(() => {
		const allMatches = matches()
		const lastMatch = allMatches[allMatches.length - 1]
		const p = params()
		const s = search()
		const il = props.initialLocation
		/* Client: read from window.location (updated by pushState before signals fire).
		 * SSR: no window, fall back to initialLocation from the request. */
		const win = typeof window !== "undefined" ? window : null
		const pathname = win?.location.pathname ?? il?.pathname ?? "/"
		const href = win?.location.href ?? il?.url?.href ?? "http://localhost/"
		const hash = win?.location.hash ?? il?.hash ?? ""

		return {
			hash,
			params: p,
			pathname,
			search: s,
			url: new URL(href),
			variablePath: lastMatch?.variablePath ?? il?.variablePath ?? "",
			virtualPath: lastMatch?.virtualPath ?? "",
		}
	})

	/* Stub navigate/prefetch — replaced by setupNavigation */
	let navigateFn: (options: InternalNavigateOptions) => Promise<void> = () => Promise.resolve()
	let prefetchFn: (options: {
		params?: Record<string, unknown>
		search?: Record<string, unknown>
		to: string
	}) => Promise<void> = () => Promise.resolve()

	const channel = useContext(BroadcastCtx)

	function invalidate(options?: Parameters<FlareProviderContext["invalidate"]>[0]): void {
		props.matchCache.invalidate(options)
		navigateFn({
			replace: true,
			revalidate: true,
			to: typeof window !== "undefined" ? window.location.href : "/",
		})
		if (options?.broadcast) {
			const serialized: SerializedInvalidateOptions = {}
			if (options.matchId) serialized.matchId = options.matchId
			if (options.routeId) serialized.routeId = options.routeId
			if (options.tags) serialized.tags = options.tags
			channel.broadcast({ options: serialized, type: "invalidate" })
		}
	}

	const ctx: FlareProviderContext = {
		boundaries: props.boundaries,
		caseSensitive: props.caseSensitive,
		hydrated,
		intercepted,
		invalidate,
		isNavigating,
		layouts: props.layouts,
		localeConfig: props.localeConfig,
		location,
		matchCache: props.matchCache,
		matches,
		navigate: (opts) => {
			if (opts.broadcast) {
				channel.broadcast({ replace: opts.replace, to: opts.to, type: "navigate" })
			}
			return navigateFn(opts)
		},
		navigationPhase,
		notFound,
		params,
		prefetch: (opts) => prefetchFn(opts),
		prefetchCache: props.prefetchCache,
		resolvers: props.resolvers,
		routeTree: props.routeTree,
		routerCacheDefaults: props.routerCacheDefaults,
		search,
		setHydrated,
		setIntercepted,
		setMatches,
		setNavigationPhase,
		setNotFound,
		setParams,
		setSearch,
		setViewTransition,
		viewTransition: viewTransitionSignal,
	}

	/* Allow external code to bind navigate/prefetch implementations */
	Object.defineProperty(ctx, "_setNavigate", {
		value: (fn: typeof navigateFn) => {
			navigateFn = fn
		},
	})
	Object.defineProperty(ctx, "_setPrefetch", {
		value: (fn: typeof prefetchFn) => {
			prefetchFn = fn
		},
	})

	/* Expose matches + cache to devtools in dev mode */
	if (typeof window !== "undefined" && import.meta.env.DEV) {
		Object.defineProperty(window, "__flare_devtools_matches__", {
			configurable: true,
			get: () =>
				matches().map((m) => ({
					loaderData: m.loaderData,
					preloaderContext: m.preloaderContext,
					type: m._type,
					virtualPath: m.virtualPath,
				})),
		})
		Object.defineProperty(window, "__flare_devtools_cache__", {
			configurable: true,
			get: () => props.matchCache.getAll(),
		})
		Object.defineProperty(window, "__flare_devtools_actions__", {
			configurable: true,
			get: () => ({
				clearError: () => {
					const current = matches()
					const restored = current.map((m) => {
						if (m.error === undefined) return m
						const { error: _, ...rest } = m
						return rest as typeof m
					})
					setMatches(restored)
				},
				clearPrefetchCache: () => props.prefetchCache.clear(),
				getCacheStats: () => ({
					entries: props.matchCache.getAll().map((c) => ({
						age: Date.now() - c.updatedAt,
						matchId: c.matchId,
					})),
					matchCount: props.matchCache.getAll().length,
					prefetchCount: props.prefetchCache.size(),
				}),
				invalidate: (opts?: Parameters<FlareProviderContext["invalidate"]>[0]) => invalidate(opts),
				navigate: (opts: InternalNavigateOptions) => navigateFn(opts),
				prefetch: (opts: { to: string }) => prefetchFn(opts),
				setError: (error: unknown) => {
					const current = matches()
					if (current.length === 0) return
					const updated = current.map((m, i) => (i === current.length - 1 ? { ...m, error } : m))
					setMatches(updated)
				},
				setNotFound: (v: boolean) => setNotFound(v),
			}),
		})
	}

	/* Cross-tab broadcast: receive invalidate/navigate from other tabs */
	onMount(() => {
		const unsubscribe = channel.onMessage((msg: ChannelMessage) => {
			if (msg.type === "invalidate") {
				props.matchCache.invalidate(msg.options)
				props.prefetchCache.clear()
				navigateFn({
					replace: true,
					revalidate: true,
					to: typeof window !== "undefined" ? window.location.href : "/",
				})
			} else if (msg.type === "navigate") {
				navigateFn({
					replace: msg.replace,
					to: msg.to,
				})
			}
		})
		onCleanup(unsubscribe)
	})

	createEffect(() => {
		if (props.onContextReady) {
			props.onContextReady(ctx)
		}
	})

	return <RouterContext.Provider value={ctx}>{props.children}</RouterContext.Provider>
}

export function useRouterContext(): FlareProviderContext {
	const ctx = useContext(RouterContext)
	if (!ctx)
		throw new Error(
			"useRouterContext() called outside FlareProvider. Ensure <FlareProvider> wraps your app root.",
		)
	return ctx
}

export function useRouter(): FlareRouter {
	const ctx = useRouterContext()

	return {
		buildLocation: (options) => {
			const url = buildUrl({
				hash: options.hash,
				params: options.params,
				search: options.search,
				to: options.to,
			})
			const parsed = new URL(url, "http://localhost")
			const result = matchRoute(
					ctx.routeTree,
					parsed.pathname,
					ctx.caseSensitive,
					toLocaleMatch(ctx.localeConfig),
				)
			return {
				hash: parsed.hash,
				params: result?.params ?? {},
				pathname: parsed.pathname,
				search: parseSearchParams(parsed.searchParams),
				url: parsed,
				variablePath: result?.route.v ?? "",
				virtualPath: result?.route.x ?? "",
			}
		},
		buildUrl: (options) =>
			buildUrl({
				hash: options.hash,
				params: options.params,
				search: options.search,
				to: options.to,
			}),
		clearCache: () => ctx.matchCache.clear(),
		hydrated: ctx.hydrated,
		intercepted: ctx.intercepted,
		invalidate: ctx.invalidate,
		isNavigating: ctx.isNavigating,
		locale: () => {
			const lc = ctx.localeConfig
			if (!lc) return undefined
			const p = ctx.params()
			const val = p[lc.paramName ?? "locale"]
			return (typeof val === "string" ? val : undefined) ?? lc.defaultLocale
		},
		location: ctx.location,
		matches: ctx.matches,
		navigate: (options) => ctx.navigate(options),
		navigationPhase: ctx.navigationPhase,
		params: ctx.params,
		prefetch: ctx.prefetch,
		refetch: () =>
			ctx.navigate({
				replace: true,
				revalidate: true,
				to: typeof window !== "undefined" ? window.location.href : "/",
			}),
		search: ctx.search,
		useBlocker: (when) => {
			const [blocked, setBlocked] = createSignal(false)

			/* Register SPA blocker — navigate() checks this before proceeding */
			setActiveBlocker(when, () => setBlocked(true))
			onCleanup(() => setActiveBlocker(null))

			/* Also handle browser-level unload (tab close, external nav) */
			const handler = (e: BeforeUnloadEvent) => {
				if (when()) {
					e.preventDefault()
					setBlocked(true)
				}
			}
			if (typeof window !== "undefined") {
				window.addEventListener("beforeunload", handler)
				onCleanup(() => window.removeEventListener("beforeunload", handler))
			}

			return {
				blocked,
				proceed: () => {
					setBlocked(false)
					proceedPendingNavigation()
				},
				reset: () => {
					setBlocked(false)
					clearPendingNavigation()
				},
			}
		},
		useLoaderData: ((options: { from: string }) =>
			createMemo(() => {
				const m = ctx.matches().find((match) => match.virtualPath === options.from)
				return m?.loaderData
			})) as never,
		useLoaderT: ((options: { from: string }) => {
			const data = createMemo(() => {
				const m = ctx.matches().find((match) => match.virtualPath === options.from)
				return (m?.loaderData as Record<string, unknown> | undefined)?.t
			})
			const lc = ctx.localeConfig
			const locale = () => {
				if (!lc) return undefined
				const p = ctx.params()
				const val = p[lc.paramName ?? "locale"]
				return (typeof val === "string" ? val : undefined) ?? lc.defaultLocale
			}
			return createTranslator((data() ?? {}) as Record<string, Record<string, string>>, locale())
		}) as never,
		useMatch: (options) =>
			createMemo(() => ctx.matches().find((match) => match.virtualPath === options.from)),
		useParams: ((_options: { from: string }) => createMemo(() => ctx.params())) as never,
		usePreloaderContext: ((options: { from: string }) =>
			createMemo(() => {
				const m = ctx.matches().find((match) => match.virtualPath === options.from)
				return m?.preloaderContext
			})) as never,
		usePreloaderT: ((options: { from: string }) => {
			const data = createMemo(() => {
				const m = ctx.matches().find((match) => match.virtualPath === options.from)
				return (m?.preloaderContext as Record<string, unknown> | undefined)?.t
			})
			const lc = ctx.localeConfig
			const locale = () => {
				if (!lc) return undefined
				const p = ctx.params()
				const val = p[lc.paramName ?? "locale"]
				return (typeof val === "string" ? val : undefined) ?? lc.defaultLocale
			}
			return createTranslator((data() ?? {}) as Record<string, Record<string, string>>, locale())
		}) as never,
		useSearch: ((_options: { from: string }) => createMemo(() => ctx.search())) as never,
		viewTransition: ctx.viewTransition,
	}
}

function useDepth(): number {
	return useContext(DepthContext) ?? 0
}

export interface OutletProps {
	fallback?: JSX.Element
}

export function Outlet(props?: OutletProps): JSX.Element {
	const depth = useDepth()
	const ctx = useRouterContext()

	return (
		<Show when={!ctx.notFound() || depth === 0}>
			<DepthContext.Provider value={depth + 1}>
				<OutletContent depth={depth} fallback={props?.fallback} />
			</DepthContext.Provider>
		</Show>
	) as JSX.Element
}

function OutletContent(props: { depth: number; fallback?: JSX.Element }): JSX.Element {
	const ctx = useRouterContext()
	const router = useRouter()
	const match: Accessor<ClientMatch | undefined> = createMemo(() => ctx.matches()[props.depth])

	return (
		<Show
			fallback={
				ctx.notFound() && props.depth === 0 ? resolveNotFoundBoundary(ctx, props.depth) : null
			}
			when={match()}
		>
			{(m) => {
				const isPage = () => m()._type === "render"
				const renderFn = () => m().render
				const hasError = createMemo(() => m().error)
				const renderProps = () => ({
					children: isPage() ? undefined : <Outlet fallback={props.fallback} />,
					loaderData: m().loaderData,
					location: ctx.location(),
					preloaderContext: m().preloaderContext,
					router,
				})

				/*
				 * Pipeline errors rendered via reactive Show — must react to SPA nav
				 * match updates. Static `if (current.error)` only works for SSR initial render.
				 */
				return (
					<Show
						fallback={
							<ErrorBoundaryWrapper depth={props.depth} match={m()}>
								<Suspense fallback={props.fallback ?? null}>
									{(() => {
										const fn = renderFn()
										const p = renderProps()
										return fn(p)
									})()}
								</Suspense>
							</ErrorBoundaryWrapper>
						}
						when={hasError()}
					>
						{renderMatchError(ctx, props.depth, hasError())}
					</Show>
				)
			}}
		</Show>
	) as JSX.Element
}

/**
 * Re-run loaders for the current URL. Used by error boundaries
 * to let users retry after transient failures.
 */
function makeRetry(ctx: FlareProviderContext): () => void {
	return () => {
		const to =
			typeof window !== "undefined"
				? `${window.location.pathname}${window.location.search}`
				: "/"
		ctx.navigate({
			replace: true,
			revalidate: true,
			to,
		})
	}
}

/**
 * Render the correct boundary for a pipeline error on a match.
 * Same logic as ErrorBoundaryWrapper fallback, but called directly
 * so it works during both SSR and client hydration.
 */
function renderMatchError(ctx: FlareProviderContext, depth: number, error: unknown): JSX.Element {
	const retry = makeRetry(ctx)
	if (error instanceof NotFoundError) {
		return resolveNotFoundBoundary(ctx, depth)
	}
	if (error instanceof UnauthenticatedError) {
		return resolveUnauthenticatedBoundary(ctx, depth, error, retry)
	}
	if (error instanceof UnauthorizedError) {
		return resolveUnauthorizedBoundary(ctx, depth, error, retry)
	}
	/* Pipeline errors: reset = retry (no ErrorBoundary to clear, must re-run loaders) */
	return resolveErrorBoundary(ctx, depth, error, retry, retry)
}

function ErrorBoundaryWrapper(props: {
	children: JSX.Element
	depth: number
	match: ClientMatch
}): JSX.Element {
	const ctx = useRouterContext()
	let resetFn: (() => void) | undefined

	/*
	 * When match changes (SPA navigation), reset ErrorBoundary so it exits
	 * fallback mode. Without this, navigating from error page → valid page
	 * stays stuck in ErrorBoundary fallback.
	 */
	createEffect(() => {
		/* Track reactive deps — resets ErrorBoundary on SPA navigation */
		void props.match.virtualPath
		void props.match.error
		if (resetFn) resetFn()
	})

	const retry = makeRetry(ctx)

	return (
		<ErrorBoundary
			fallback={(error, reset) => {
				resetFn = reset
				if (error instanceof NotFoundError) {
					return resolveNotFoundBoundary(ctx, props.depth)
				}
				if (error instanceof UnauthenticatedError) {
					return resolveUnauthenticatedBoundary(ctx, props.depth, error, retry)
				}
				if (error instanceof UnauthorizedError) {
					return resolveUnauthorizedBoundary(ctx, props.depth, error, retry)
				}
				return resolveErrorBoundary(ctx, props.depth, error, reset, retry)
			}}
		>
			{props.children}
		</ErrorBoundary>
	) as JSX.Element
}

/* Boundary resolution uses ClientMatch render fns (wide types) and falls back to GlobalBoundaries.
   GlobalBoundaries uses narrower Location type — safe to pass ProviderLocation at runtime. */

function resolveErrorBoundary(
	ctx: FlareProviderContext,
	depth: number,
	error: unknown,
	reset: () => void,
	retry: () => void,
): JSX.Element {
	const allMatches = ctx.matches()
	const loc = ctx.location()
	for (let i = depth; i >= 0; i--) {
		const m = allMatches[i]
		if (m?.errorRender) {
			return m.errorRender({ error, location: loc, reset, retry })
		}
	}
	if (ctx.boundaries?.error) {
		/* GlobalBoundaries expects Error + narrower Location — cast safe at runtime */
		const errorVal = error instanceof Error ? error : new Error(String(error))
		return ctx.boundaries.error({
			error: errorVal,
			location: loc as Parameters<NonNullable<GlobalBoundaries["error"]>>[0]["location"],
			reset,
			retry,
		}) as JSX.Element
	}
	return (<div>Something went wrong</div>) as JSX.Element
}

function resolveNotFoundBoundary(ctx: FlareProviderContext, depth: number): JSX.Element {
	const allMatches = ctx.matches()
	const loc = ctx.location()
	for (let i = depth; i >= 0; i--) {
		const m = allMatches[i]
		if (m?.notFoundRender) {
			return m.notFoundRender({ location: loc })
		}
	}
	if (ctx.boundaries?.notFound) {
		return ctx.boundaries.notFound({
			location: loc as Parameters<NonNullable<GlobalBoundaries["notFound"]>>[0]["location"],
		}) as JSX.Element
	}
	return (<div>Page not found</div>) as JSX.Element
}

function resolveUnauthenticatedBoundary(
	ctx: FlareProviderContext,
	depth: number,
	error: unknown,
	retry: () => void,
): JSX.Element {
	const allMatches = ctx.matches()
	const loc = ctx.location()
	for (let i = depth; i >= 0; i--) {
		const m = allMatches[i]
		if (m?.unauthenticatedRender) {
			return m.unauthenticatedRender({ error, location: loc, retry })
		}
	}
	if (ctx.boundaries?.unauthenticated) {
		const errVal = error instanceof UnauthenticatedError ? error : new UnauthenticatedError()
		return ctx.boundaries.unauthenticated({
			error: errVal,
			location: loc as Parameters<NonNullable<GlobalBoundaries["unauthenticated"]>>[0]["location"],
			retry,
		}) as JSX.Element
	}
	return (<div>Please log in</div>) as JSX.Element
}

function resolveUnauthorizedBoundary(
	ctx: FlareProviderContext,
	depth: number,
	error: unknown,
	retry: () => void,
): JSX.Element {
	const allMatches = ctx.matches()
	const loc = ctx.location()
	for (let i = depth; i >= 0; i--) {
		const m = allMatches[i]
		if (m?.unauthorizedRender) {
			return m.unauthorizedRender({ error, location: loc, retry })
		}
	}
	if (ctx.boundaries?.unauthorized) {
		const errVal = error instanceof UnauthorizedError ? error : new UnauthorizedError()
		return ctx.boundaries.unauthorized({
			error: errVal,
			location: loc as Parameters<NonNullable<GlobalBoundaries["unauthorized"]>>[0]["location"],
			retry,
		}) as JSX.Element
	}
	return (<div>Access denied</div>) as JSX.Element
}
