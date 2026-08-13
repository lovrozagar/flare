/**
 * Flare Provider
 *
 * Solid.js integration for client-side hydration.
 * Provides reactive router state and outlet context.
 */

import {
	FlareContext,
	type FlareProviderContext,
	setGlobalFlareContext,
} from "@flare/v0/client/flare-context"
import type { QueryClient } from "@tanstack/query-core"
import { type Accessor, createSignal, type JSX, onCleanup, useContext } from "solid-js"
import { QueryClientProvider } from "../query-client/query-client-provider"
import { buildUrl } from "../router/build-url"
/* Import from relative paths - clean for npm publishing */
import { setLinkRouter } from "../router/link"
import type { MatchedRoute } from "../router/outlet-context"
import { OutletContext } from "../router/outlet-context"
import type { FlareClient, FlareRouter, InvalidateOptions, Location } from "./init"

/**
 * Create reactive provider context from FlareClient.
 * Initializes signals from SSR state.
 * Sets up popstate handler for back/forward navigation.
 *
 * IMPORTANT: This function creates signals and MUST be called from within
 * a Solid reactive context (inside a component or createRoot).
 */
function createFlareProvider(client: FlareClient): FlareProviderContext {
	const clientRouter = client.getRouter()
	const matchCache = client.getMatchCache()
	const scrollStore = client.getScrollStore()

	/* Initialize signals from SSR state */
	const [location, setLocation] = createSignal<Location>(clientRouter.state.location)
	const [isNavigating, setIsNavigating] = createSignal(clientRouter.state.isNavigating)
	const [params, setParams] = createSignal<Record<string, string | string[]>>(client.getParams())

	/* Track navigation version to detect superseded navigations */
	let navigationVersion = 0

	/* Convert match cache to MatchedRoute array */
	const initialMatches: MatchedRoute[] = matchCache.getAll().map((entry) => ({
		loaderData: entry.data,
		preloaderContext: entry.preloaderContext,
		render: () => null,
		virtualPath: entry.matchId,
	}))
	const [matches, setMatches] = createSignal<MatchedRoute[]>(initialMatches)

	/* Helper to update matches from cache */
	function updateMatchesFromCache(): void {
		const newMatches: MatchedRoute[] = matchCache.getAll().map((entry) => ({
			loaderData: entry.data,
			preloaderContext: entry.preloaderContext,
			render: () => null,
			virtualPath: entry.matchId,
		}))
		setMatches(newMatches)
	}

	/* Popstate handler will be registered after router is created */
	let popstateRegistered = false

	function registerPopstateHandler(): void {
		if (popstateRegistered) return
		popstateRegistered = true

		client.onPopstate(async (event) => {
			/* Get saved scroll BEFORE navigation so it can be restored inside view transition */
			const savedScroll = scrollStore.get(event.key)

			/* Use router.navigate (the wrapped version) so all extensions apply */
			await router.navigate({
				_popstate: true,
				_popstateHistoryIndex: event.historyIndex,
				_restoreScroll: savedScroll ?? undefined,
				navFormat: event.navFormat,
				params: event.params,
				replace: true,
				scroll: false,
				to: event.pathname,
			})

			/* Update params (router.navigate updates location and matches) */
			setParams(event.params)
		})
	}

	/* Create wrapped router that updates signals */
	const router: FlareRouter = {
		buildUrl: (options: {
			hash?: string
			params?: Record<string, string | string[] | undefined>
			search?: Record<string, unknown>
			to: string
		}) => {
			return buildUrl(options)
		},

		clearCache: () => {
			clientRouter.clearCache()
		},

		invalidate: (options?: InvalidateOptions) => {
			clientRouter.invalidate(options)
		},

		navigate: async (options) => {
			/* Increment version to track this navigation */
			navigationVersion++
			const myVersion = navigationVersion

			setIsNavigating(true)

			/* Resolve URL pattern with params */
			const resolvedPath = buildUrl({
				hash: options.hash,
				params: options.params,
				search: options.search,
				to: options.to,
			})

			try {
				/* Pass signal updates as onUpdate callback - called inside view transition */
				await clientRouter.navigate({
					...options,
					onUpdate: () => {
						/* Skip if navigation was superseded */
						if (myVersion !== navigationVersion) return

						/* Update location */
						setLocation({
							hash: options.hash ?? "",
							pathname: resolvedPath,
							search: "",
						})

						/* Update matches from cache */
						updateMatchesFromCache()
					},
				})
			} finally {
				/* Only update navigating state if still current navigation */
				if (myVersion === navigationVersion) {
					setIsNavigating(false)
				}
			}
		},

		prefetch: async (options) => {
			await clientRouter.prefetch(options)
		},

		refetch: async () => {
			await clientRouter.refetch()
		},

		state: clientRouter.state,
	}

	/* Register popstate handler now that router exists */
	registerPopstateHandler()

	return {
		client,
		isNavigating,
		location,
		matches,
		params,
		router,
		setIsNavigating,
		setLocation,
		setMatches,
		setParams,
	}
}

interface FlareProviderProps {
	children: JSX.Element
	/** Flare client - if provided, signals will be created internally */
	client?: FlareClient
	/** Pre-created context - for backwards compatibility / test usage */
	context?: FlareProviderContext
	/** Callback invoked with context after creation - for hydrate.tsx to set up navigate override */
	onContextReady?: (ctx: FlareProviderContext) => void
	queryClient?: QueryClient
}

/**
 * FlareProvider component.
 * Wraps app with router and outlet context.
 * Uses function for reactive matches - Solid tracks function calls, not getters.
 * Sets up Link router integration and cleanup.
 *
 * Can accept either a pre-created context OR a client (signals created internally).
 * When using client prop, signals are created inside the component (reactive context).
 *
 * Tree structure must match SSR's Dummy wrapper for hydration:
 * - SSR: Dummy > QueryClientProvider? > OutletContext.Provider > Outlet
 * - Client: FlareContext.Provider > QueryClientProvider? > OutletContext.Provider > Outlet
 */
function FlareProvider(props: FlareProviderProps): JSX.Element {
	/* Create context from client if not provided - signals created in reactive context */
	const ctx = props.context ?? (props.client ? createFlareProvider(props.client) : null)

	if (!ctx) {
		throw new Error("[FlareProvider] Must provide either context or client prop")
	}

	/* Set global context for hooks that can't use solid-js useContext reliably */
	setGlobalFlareContext(ctx)

	/* Notify caller that context is ready (for hydrate.tsx to set up navigate override) */
	if (props.onContextReady) {
		props.onContextReady(ctx)
	}

	/*
	 * Filter root-layout from OutletContext matches.
	 * Root layout renders the HTML shell separately (not through Outlet).
	 * This matches SSR behavior where outletMatches excludes root-layout.
	 * FlareContext.matches() still includes root-layout for hooks to access.
	 */
	const outletContext = {
		depth: -1,
		matches: () => ctx.matches().filter((m) => m._type !== "root-layout"),
	}

	/* Connect Link component to router */
	setLinkRouter(ctx.router)

	/* Cleanup on unmount */
	onCleanup(() => {
		setLinkRouter(null)
		ctx.client.cleanup()
	})

	/* Wrap with QueryClientProvider if queryClient is provided (matches SSR structure) */
	const outletContent = (
		<OutletContext.Provider value={outletContext}>{props.children}</OutletContext.Provider>
	)
	const maybeQueryWrapped = props.queryClient ? (
		<QueryClientProvider client={props.queryClient}>{outletContent}</QueryClientProvider>
	) : (
		outletContent
	)

	return <FlareContext.Provider value={ctx}>{maybeQueryWrapped}</FlareContext.Provider>
}

/**
 * Hook to access the Flare router.
 */
function useFlareRouter(): FlareRouter {
	const ctx = useContext(FlareContext)
	if (!ctx) {
		throw new Error("[useFlareRouter] Must be used within FlareProvider")
	}
	return ctx.router
}

/**
 * Hook to access reactive location.
 */
function useLocation(): Accessor<Location> {
	const ctx = useContext(FlareContext)
	if (!ctx) {
		throw new Error("[useLocation] Must be used within FlareProvider")
	}
	return ctx.location
}

/**
 * Hook to access reactive params.
 */
function useParams<
	T extends Record<string, string | string[]> = Record<string, string>,
>(): Accessor<T> {
	const ctx = useContext(FlareContext)
	if (!ctx) {
		throw new Error("[useParams] Must be used within FlareProvider")
	}
	return ctx.params as Accessor<T>
}

/**
 * Hook to access reactive matches.
 */
function useMatches(): Accessor<MatchedRoute[]> {
	const ctx = useContext(FlareContext)
	if (!ctx) {
		throw new Error("[useMatches] Must be used within FlareProvider")
	}
	return ctx.matches
}

/**
 * Hook to access navigation state.
 */
function useIsNavigating(): Accessor<boolean> {
	const ctx = useContext(FlareContext)
	if (!ctx) {
		throw new Error("[useIsNavigating] Must be used within FlareProvider")
	}
	return ctx.isNavigating
}

/**
 * Hook to access FlareClient.
 */
function useFlareClient(): FlareClient {
	const ctx = useContext(FlareContext)
	if (!ctx) {
		throw new Error("[useFlareClient] Must be used within FlareProvider")
	}
	return ctx.client
}

export type { FlareProviderContext, FlareProviderProps }

export {
	createFlareProvider,
	FlareContext,
	FlareProvider,
	useFlareClient,
	useFlareRouter,
	useIsNavigating,
	useLocation,
	useMatches,
	useParams,
}
