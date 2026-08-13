/**
 * Flare Client Initialization
 *
 * Creates client for browser-side hydration and navigation.
 * Reads self.flare state and sets up router with caches.
 * Supports both NDJSON and HTML navigation modes.
 */

import { createMatchCache, type MatchCache } from "../router/_internal/match-cache"
import { createPrefetchCache, type PrefetchCache } from "../router/_internal/prefetch-cache"
import type { PrefetchStrategy } from "../router/_internal/types"
import { buildUrl } from "../router/build-url"
import type { NavFormat } from "../server/handler/constants"
import { applyHeadConfig, applyPerRouteHeads, initRouteHierarchy } from "./head-merge"
import {
	createHistoryListener,
	createScrollStore,
	getCurrentScroll,
	type HistoryNavigateEvent,
	pushHistoryState,
	replaceHistoryState,
	restoreScroll,
	type ScrollPosition,
	scrollToTop,
} from "./history"
import { createHtmlNavFetcher, mergeHeadFromHtml } from "./html-nav"
import type { NavFetcher, QueryClient, QueryState, RouteState } from "./nav-types"
import { updateMatchCache, updateQueryClient } from "./nav-types"
import { createNdjsonNavFetcher } from "./ndjson-nav"
import {
	detectDirection,
	getHistoryIndex,
	incrementHistoryIndex,
	initHistoryIndex,
	type LocationChangeInfo,
	setHistoryIndex,
	type ViewTransitionConfig,
	withViewTransition,
} from "./view-transitions"

/**
 * Max scroll positions to cache for back/forward restoration.
 * Each entry ~100 bytes (key + x + y). 200 entries ≈ 20KB.
 */
const SCROLL_POSITION_CACHE_SIZE = 200

/** Filter undefined values from params record */
function filterParams(
	params: Record<string, string | string[] | undefined> | undefined,
): Record<string, string | string[]> {
	if (!params) return {}
	const result: Record<string, string | string[]> = {}
	for (const [key, value] of Object.entries(params)) {
		if (value !== undefined) {
			result[key] = value
		}
	}
	return result
}

interface ContextState {
	dir?: string
	locale?: string
	routerDefaults?: {
		gcTime?: number
		navFormat?: NavFormat
		prefetchIntent?: PrefetchStrategy
		prefetchStaleTime?: number
		staleTime?: number
		/** Default view transition config. true = direction-based, object for static types */
		viewTransitions?: boolean | { types: string[] }
	}
	theme?: string
}

interface DevError {
	message: string
	name: string
	source: string
	stack?: string
}

interface FlareState {
	c: ContextState
	/** Dev-only: SSR errors for client overlay */
	e?: DevError[]
	q: QueryState[]
	r: RouteState
}

interface Location {
	hash: string
	pathname: string
	search: string
}

interface RouterState {
	isNavigating: boolean
	location: Location
}

interface NavigateOptions {
	_popstate?: boolean
	/** History index from popstate event for direction detection */
	_popstateHistoryIndex?: number
	/** Internal: Scroll position to restore inside view transition (for popstate) */
	_restoreScroll?: ScrollPosition
	hash?: string
	navFormat?: NavFormat
	/** Callback invoked inside view transition after cache updates, for signal updates */
	onUpdate?: () => void
	params?: Record<string, string | string[] | undefined>
	replace?: boolean
	scroll?: boolean
	search?: Record<string, unknown>
	shallow?: boolean
	to: string
	/** View transition configuration. true = use direction-based types, object = custom types */
	viewTransition?: ViewTransitionConfig
}

interface PrefetchOptions {
	navFormat?: NavFormat
	params?: Record<string, string | string[] | undefined>
	to: string
}

interface InvalidateOptions {
	filter?: (match: { matchId: string; routeId: string }) => boolean
	matchId?: string
	routeId?: string
}

interface FlareRouter {
	buildUrl: (options: {
		hash?: string
		params?: Record<string, string | string[] | undefined>
		search?: Record<string, unknown>
		to: string
	}) => string
	clearCache: () => void
	invalidate: (options?: InvalidateOptions) => void
	navigate: (options: NavigateOptions) => Promise<void>
	prefetch: (options: PrefetchOptions) => Promise<void>
	refetch: () => Promise<void>
	state: RouterState
}

interface FlareClientConfig {
	fetch?: typeof globalThis.fetch
	flareState?: FlareState
	queryClient?: QueryClient
}

interface FlareClient {
	cleanup: () => void
	getContext: () => ContextState
	getMatchCache: () => MatchCache
	getNavFormat: () => NavFormat
	getParams: () => Record<string, string | string[]>
	getPrefetchCache: () => PrefetchCache
	getRouter: () => FlareRouter
	getScrollStore: () => ReturnType<typeof createScrollStore>
	onPopstate: (handler: (event: HistoryNavigateEvent) => void) => void
}

function parseFlareState(raw: unknown): FlareState | null {
	if (raw === null || raw === undefined) {
		return null
	}
	if (typeof raw !== "object") {
		return null
	}

	const obj = raw as Record<string, unknown>

	if (!("c" in obj) || !("q" in obj) || !("r" in obj)) {
		return null
	}

	const r = obj.r as Record<string, unknown>
	if (!r || !("matches" in r) || !("params" in r) || !("pathname" in r)) {
		return null
	}

	return raw as FlareState
}

function createFlareClient(config: FlareClientConfig): FlareClient {
	const { fetch: fetchFn, flareState, queryClient } = config

	const matchCache = createMatchCache()
	const prefetchCache = createPrefetchCache()
	const scrollStore = createScrollStore(SCROLL_POSITION_CACHE_SIZE)
	const context = flareState?.c ?? {}
	const params = flareState?.r.params ?? {}

	/* Store current root layout ID for multi-root-layout detection */
	const currentRootLayoutId = flareState?.r.matches[0]?.id ?? null

	/* Get default nav format from router defaults */
	const defaultNavFormat: NavFormat = context.routerDefaults?.navFormat ?? "ndjson"
	const defaultViewTransitions = context.routerDefaults?.viewTransitions

	/* Create fetchers for both modes */
	const fetcherConfig = { baseUrl: "", fetch: fetchFn }
	const ndjsonFetcher = createNdjsonNavFetcher(fetcherConfig)
	const htmlFetcher = createHtmlNavFetcher(fetcherConfig)

	/* Get appropriate fetcher based on nav format */
	function getFetcher(navFormat: NavFormat): NavFetcher {
		return navFormat === "html" ? htmlFetcher : ndjsonFetcher
	}

	/* Popstate handlers for back/forward navigation */
	const popstateHandlers: Array<(event: HistoryNavigateEvent) => void> = []

	function handlePopstate(event: HistoryNavigateEvent): void {
		for (const handler of popstateHandlers) {
			handler(event)
		}
	}

	/* Setup history listener */
	const cleanupHistory = createHistoryListener(handlePopstate)

	/* Initialize history index from existing state or start at 0 */
	const existingState = typeof history !== "undefined" ? history.state : null
	const initialHistoryIndex = existingState?.historyIndex ?? 0
	initHistoryIndex(initialHistoryIndex)

	/* Replace initial history state so back navigation to this page works */
	/* Capture the key for scroll restoration on first navigation */
	let initialHistoryKey: string | null = null
	if (flareState?.r.pathname) {
		const initialState = replaceHistoryState(
			flareState.r.pathname,
			flareState.r.params,
			"",
			"",
			defaultNavFormat,
			initialHistoryIndex,
		)
		initialHistoryKey = initialState.key
	}

	/* Initialize match cache from SSR state */
	if (flareState?.r.matches) {
		const now = Date.now()
		const matchIds: string[] = []
		for (const match of flareState.r.matches) {
			matchCache.set({
				data: match.loaderData,
				invalid: false,
				matchId: match.id,
				preloaderContext: match.preloaderContext,
				routeId: match.id,
				updatedAt: now,
			})
			matchIds.push(match.id)
		}
		/* Initialize route hierarchy for head cleanup on first navigation */
		initRouteHierarchy(matchIds)
	}

	/* Hydrate query client from SSR state */
	if (queryClient && flareState?.q) {
		updateQueryClient(queryClient, flareState.q)
	}

	/* Create router state */
	const routerState: RouterState = {
		isNavigating: false,
		location: {
			hash: "",
			pathname: flareState?.r.pathname ?? "/",
			search: "",
		},
	}

	/* Build search string from object */
	function buildSearchString(search?: Record<string, unknown>): string {
		if (!search) return ""
		const params = new URLSearchParams()
		for (const [key, value] of Object.entries(search)) {
			if (value !== undefined && value !== null) {
				params.set(key, String(value))
			}
		}
		const str = params.toString()
		return str ? `?${str}` : ""
	}

	/* Track current history key for scroll restoration */
	let currentHistoryKey: string | null = initialHistoryKey

	/* Track current navigation for cancellation */
	let currentNavigationController: AbortController | null = null

	/* Create router */
	const router: FlareRouter = {
		buildUrl: (options) => {
			return buildUrl(options)
		},

		clearCache: () => {
			matchCache.clear()
			prefetchCache.clear()
		},

		invalidate: (options) => {
			matchCache.invalidate(options)
		},

		navigate: async (options) => {
			const {
				_popstate = false,
				hash = "",
				navFormat = defaultNavFormat,
				onUpdate,
				replace = false,
				scroll = true,
				shallow = false,
				to,
				viewTransition,
			} = options

			/* Resolve view transition config: per-nav option → router default */
			const vtConfig: ViewTransitionConfig | undefined =
				viewTransition !== undefined ? viewTransition : defaultViewTransitions
			const searchStr = buildSearchString(options.search)
			let hashStr = ""
			if (hash) {
				hashStr = hash.startsWith("#") ? hash : `#${hash}`
			}

			/* Resolve URL pattern with params */
			const resolvedPath = buildUrl({
				hash: hash || undefined,
				params: options.params,
				search: options.search,
				to,
			})

			/* Save current scroll position before navigating */
			if (currentHistoryKey) {
				const scroll = getCurrentScroll()
				scrollStore.save(currentHistoryKey, scroll)
			}

			/* Shallow navigation: URL change only, no data fetch */
			if (shallow) {
				const nextHistoryIndex = _popstate ? getHistoryIndex() : getHistoryIndex() + 1
				const shallowFilteredParams = filterParams(options.params)
				const historyState = replace
					? replaceHistoryState(
							resolvedPath,
							shallowFilteredParams,
							searchStr,
							hashStr,
							navFormat,
							nextHistoryIndex,
						)
					: pushHistoryState(
							resolvedPath,
							shallowFilteredParams,
							searchStr,
							hashStr,
							navFormat,
							nextHistoryIndex,
						)

				if (!_popstate && !replace) {
					incrementHistoryIndex()
				}

				currentHistoryKey = historyState.key
				routerState.location = {
					hash: hashStr,
					pathname: resolvedPath,
					search: searchStr,
				}
				return
			}

			/* Cancel any in-progress link navigation */
			if (currentNavigationController) {
				currentNavigationController.abort()
				currentNavigationController = null
			}

			/* Create abort controller only for link navigations (not popstate) */
			let controller: AbortController | null = null
			if (!_popstate) {
				currentNavigationController = new AbortController()
				controller = currentNavigationController
			}

			routerState.isNavigating = true

			try {
				const fetcher = getFetcher(navFormat)
				const result = await fetcher.fetch({
					signal: controller?.signal,
					url: resolvedPath,
				})

				/* Skip state updates if this navigation was superseded */
				if (controller?.signal.aborted) {
					return
				}

				if (result.success && result.state) {
					const navState = result.state
					const navHtml = result.html
					const navHead = result.head
					const navPerRouteHeads = result.perRouteHeads

					/* Check for root layout change - requires full page reload */
					const newRootLayoutId = navState.matches[0]?.id ?? null
					if (currentRootLayoutId && newRootLayoutId && currentRootLayoutId !== newRootLayoutId) {
						if (typeof window !== "undefined") {
							window.location.href = resolvedPath + searchStr + hashStr
						}
						return
					}

					/* Apply updates - optionally with View Transitions */
					const applyUpdates = () => {
						/* Apply head from response - always use per-route heads for cleanup
						 * Even if empty, this triggers cleanup of stale head elements from
						 * routes that are no longer in the hierarchy. */
						if (navPerRouteHeads !== undefined) {
							/* Per-route heads: supports route-based cleanup */
							applyPerRouteHeads(navPerRouteHeads)
						} else if (navHtml) {
							/* HTML nav without per-route heads: Turbo Drive style merge */
							mergeHeadFromHtml(navHtml)
						} else if (navHead) {
							/* Fallback: merged head (backward compat) */
							applyHeadConfig(navHead)
						}

						/* Update caches from navigation result */
						updateMatchCache(matchCache, navState)
						if (queryClient && navState.queries.length > 0) {
							updateQueryClient(queryClient, navState.queries)
						}

						/* Update history after successful navigation (skip for popstate) */
						if (!_popstate) {
							const nextHistoryIndex = getHistoryIndex() + 1
							const filteredParams = filterParams(options.params)
							const historyState = replace
								? replaceHistoryState(
										resolvedPath,
										filteredParams,
										searchStr,
										hashStr,
										navFormat,
										nextHistoryIndex,
									)
								: pushHistoryState(
										resolvedPath,
										filteredParams,
										searchStr,
										hashStr,
										navFormat,
										nextHistoryIndex,
									)
							currentHistoryKey = historyState.key
							if (!replace) {
								incrementHistoryIndex()
							}
						}

						routerState.location = {
							hash: hashStr,
							pathname: resolvedPath,
							search: searchStr,
						}

						/* Call provider's update callback for signal updates */
						onUpdate?.()

						/* Handle scroll after DOM is painted.
						 * Double rAF ensures DOM updates from signal changes are committed and painted.
						 * First rAF: scheduled after current frame
						 * Second rAF: runs after browser has painted, DOM is ready */
						if (typeof requestAnimationFrame !== "undefined") {
							requestAnimationFrame(() => {
								requestAnimationFrame(() => {
									if (options._restoreScroll) {
										restoreScroll(options._restoreScroll)
									} else if (scroll) {
										scrollToTop()
									}
								})
							})
						} else {
							/* SSR fallback */
							if (options._restoreScroll) {
								restoreScroll(options._restoreScroll)
							} else if (scroll) {
								scrollToTop()
							}
						}
					}

					/* Build location change info for view transitions */
					const currentIndex = getHistoryIndex()
					const targetIndex = options._popstateHistoryIndex ?? currentIndex + 1
					const locationInfo: LocationChangeInfo = {
						direction: _popstate ? detectDirection(currentIndex, targetIndex) : "forward",
						fromLocation: {
							hash: routerState.location.hash,
							pathname: routerState.location.pathname,
							search: routerState.location.search,
						},
						pathChanged: routerState.location.pathname !== resolvedPath,
						toLocation: {
							hash: hashStr,
							pathname: resolvedPath,
							search: searchStr,
						},
					}

					/* Update history index for popstate (direction already calculated) */
					if (_popstate && options._popstateHistoryIndex !== undefined) {
						setHistoryIndex(options._popstateHistoryIndex)
					}

					/* Apply updates - with View Transitions if configured */
					await withViewTransition(applyUpdates, vtConfig, locationInfo)
				} else if (result.error) {
					console.error("Navigation failed:", result.error)
				}
			} catch (e) {
				/* Ignore abort errors */
				if (e instanceof Error && e.name === "AbortError") {
					return
				}
				throw e
			} finally {
				/* Only clear navigating if this is still the current navigation */
				if (!controller?.signal.aborted) {
					routerState.isNavigating = false
				}
			}
		},

		prefetch: async (options) => {
			/* Check prefetch cache - skip if already prefetched recently */
			const prefetchStaleTime = context.routerDefaults?.prefetchStaleTime ?? 30000
			if (!prefetchCache.shouldPrefetch(options.to, prefetchStaleTime)) {
				return
			}

			/* Mark as prefetched BEFORE fetch to prevent concurrent duplicate requests */
			prefetchCache.mark(options.to)

			const navFormat = options.navFormat ?? defaultNavFormat
			const fetcher = getFetcher(navFormat)

			const result = await fetcher.fetch({
				prefetch: true,
				url: options.to,
			})

			if (result.success && result.state) {
				updateMatchCache(matchCache, result.state)
				if (queryClient && result.state.queries.length > 0) {
					updateQueryClient(queryClient, result.state.queries)
				}
			}
		},

		refetch: async () => {
			/* TODO: Implement refetch of current route */
		},

		state: routerState,
	}

	return {
		cleanup: () => {
			cleanupHistory()
		},
		getContext: () => context,
		getMatchCache: () => matchCache,
		getNavFormat: () => defaultNavFormat,
		getParams: () => params,
		getPrefetchCache: () => prefetchCache,
		getRouter: () => router,
		getScrollStore: () => scrollStore,
		onPopstate: (handler: (event: HistoryNavigateEvent) => void) => {
			popstateHandlers.push(handler)
		},
	}
}

export type { MatchState, QueryClient, QueryState, RouteState } from "./nav-types"

export type {
	ContextState,
	FlareClient,
	FlareClientConfig,
	FlareRouter,
	FlareState,
	HistoryNavigateEvent,
	InvalidateOptions,
	Location,
	NavigateOptions,
	PrefetchOptions,
	RouterState,
	ScrollPosition,
}

export { createFlareClient, parseFlareState }
