/**
 * Flare Router Hooks
 * Reactive hooks for accessing router state in components.
 *
 * All hooks use dual-access pattern:
 * 1. Try solid-js useContext(FlareContext) - works on client
 * 2. Fall back to getGlobalFlareContext() - works during SSR
 */

import { FlareContext, getGlobalFlareContext } from "@flare/v0/client/flare-context"
import { type Accessor, createSignal, onCleanup, useContext } from "solid-js"
import type { MatchedRoute } from "../outlet"
import type { FlareRegister } from "../register"
import type { Location } from "../router-context"

/**
 * Local map type - evaluated at call site where augmentation is visible
 */
type VirtualPathMap = FlareRegister extends { loaderData: infer TMap }
	? TMap extends Record<string, unknown>
		? TMap
		: Record<string, never>
	: Record<string, never>

interface UseMatchOptions<TPath extends keyof VirtualPathMap = keyof VirtualPathMap> {
	from: TPath
}

interface UseLoaderDataOptions {
	from: string
}

/**
 * Minimal context shape that both SSR and client provide.
 * SSR provides: { matches, location, params }
 * Client provides: FlareProviderContext with all signals
 */
interface MinimalFlareContext {
	location?: () => Location
	matches?: () => MatchedRoute[]
	params?: () => Record<string, string | string[]>
}

/**
 * Get FlareContext using dual-access pattern.
 * Returns undefined if not in FlareProvider context.
 */
function getFlareContext(): MinimalFlareContext | undefined {
	let ctx = useContext(FlareContext) as MinimalFlareContext | undefined
	if (!ctx) {
		ctx = getGlobalFlareContext() as MinimalFlareContext | undefined
	}
	return ctx
}

function createLocationSignal(
	initial: Location,
): [Accessor<Location>, (location: Location) => void] {
	const [location, setLocation] = createSignal(initial)
	return [location, setLocation]
}

function createParamsSignal<T extends Record<string, string>>(
	initial: T,
): [Accessor<T>, (params: T) => void] {
	const [params, setParams] = createSignal(initial)
	return [params, setParams]
}

function createSearchSignal<T extends Record<string, unknown>>(
	initial: T,
): [Accessor<T>, (search: T) => void] {
	const [search, setSearch] = createSignal(initial)
	return [search, setSearch]
}

/**
 * Hook to access reactive location.
 * Works during SSR and on client.
 */
function useLocation(): Accessor<Location> {
	const ctx = getFlareContext()
	if (!ctx?.location) {
		throw new Error("[useLocation] Must be used within FlareProvider")
	}
	return ctx.location
}

/**
 * Hook to access reactive route params.
 * Works during SSR and on client.
 */
function useParams<T extends Record<string, string | string[]>>(): Accessor<T> {
	const ctx = getFlareContext()
	if (!ctx?.params) {
		throw new Error("[useParams] Must be used within FlareProvider")
	}
	return ctx.params as Accessor<T>
}

/**
 * Hook to access reactive search params.
 * Parses search string from location.
 */
function useSearch<T extends Record<string, unknown>>(): Accessor<T> {
	const ctx = getFlareContext()
	if (!ctx?.location) {
		throw new Error("[useSearch] Must be used within FlareProvider")
	}
	return (() => {
		const loc = ctx.location?.()
		const searchParams = new URLSearchParams(loc.search)
		const result: Record<string, unknown> = {}
		for (const [key, value] of searchParams.entries()) {
			result[key] = value
		}
		return result as T
	}) as Accessor<T>
}

/**
 * Hook to access a specific route match by virtualPath.
 * Returns undefined if the route is not in current match chain.
 */
function useMatch<TPath extends keyof VirtualPathMap>(
	options: UseMatchOptions<TPath>,
): Accessor<MatchedRoute | undefined> {
	const ctx = getFlareContext()
	if (!ctx?.matches) {
		throw new Error("[useMatch] Must be used within FlareProvider")
	}
	return () => ctx.matches?.().find((m) => m.virtualPath === options.from)
}

/**
 * Hook to access all matched routes.
 * Returns array of matches from root to leaf.
 */
function useMatches(): Accessor<MatchedRoute[]> {
	const ctx = getFlareContext()
	if (!ctx?.matches) {
		throw new Error("[useMatches] Must be used within FlareProvider")
	}
	return ctx.matches
}

/**
 * Hook to check if client hydration is complete.
 * Returns false during SSR, true after hydration.
 */
function useHydrated(): Accessor<boolean> {
	/* During SSR, always return false */
	if (typeof window === "undefined") {
		return () => false
	}
	/* On client, return true (hydration already happened when hooks run) */
	return () => true
}

/**
 * Options for building a URL.
 */
interface BuildUrlOptions {
	hash?: string
	params?: Record<string, string | string[] | undefined>
	search?: Record<string, unknown>
	to: string
}

/**
 * Router interface for navigation and cache control.
 */
interface Router {
	buildUrl: (options: BuildUrlOptions) => string
	clearCache: () => void
	invalidate: (options?: {
		filter?: (match: unknown) => boolean
		matchId?: string
		routeId?: string
	}) => void
	navigate: (options: NavigateOptions) => Promise<void>
	prefetch: (options: {
		params?: Record<string, string | string[]>
		search?: Record<string, unknown>
		to: string
	}) => Promise<void>
	refetch: () => Promise<void>
	state: { isNavigating: boolean; location: Location }
}

interface NavigateOptions {
	hash?: string
	navFormat?: "ndjson" | "html"
	params?: Record<string, string | string[] | undefined>
	replace?: boolean
	scroll?: boolean
	search?: Record<string, unknown>
	shallow?: boolean
	to: string
	viewTransition?: boolean | { types: string[] | ((info: unknown) => string[] | false) }
}

/**
 * Extended context with router (client-only).
 */
interface FlareContextWithRouter extends MinimalFlareContext {
	router?: Router
}

/**
 * Hook to access the router for navigation and cache control.
 * Client-only - throws during SSR.
 */
function useRouter(): Router {
	const ctx = getFlareContext() as FlareContextWithRouter | undefined
	if (!ctx?.router) {
		if (typeof window === "undefined") {
			throw new Error("[useRouter] Cannot use router during SSR - router is client-only")
		}
		throw new Error("[useRouter] Must be used within FlareProvider")
	}
	return ctx.router
}

/**
 * Hook to access the navigate function for programmatic navigation.
 * Client-only - throws during SSR.
 *
 * @example
 * const navigate = useNavigate()
 * await navigate({ to: "/products/[id]", params: { id: "123" } })
 */
function useNavigate(): (options: NavigateOptions) => Promise<void> {
	const router = useRouter()
	return router.navigate
}

/**
 * Blocker state returned by useBlocker.
 */
interface BlockerState {
	/** Whether navigation is currently blocked */
	isBlocked: Accessor<boolean>
	/** Call to proceed with blocked navigation */
	proceed: () => void
	/** Call to cancel blocked navigation and stay on current page */
	reset: () => void
}

/**
 * Hook to block navigation when there are unsaved changes.
 * Blocks both client-side navigation and browser back/forward.
 * Client-only - throws during SSR.
 *
 * @param when - Accessor that returns true when navigation should be blocked
 *
 * @example
 * const [isDirty, setIsDirty] = createSignal(false)
 * const { isBlocked, proceed, reset } = useBlocker(() => isDirty())
 *
 * <Show when={isBlocked()}>
 *   <Dialog>
 *     <p>You have unsaved changes. Leave anyway?</p>
 *     <button onClick={proceed}>Leave</button>
 *     <button onClick={reset}>Stay</button>
 *   </Dialog>
 * </Show>
 */
function useBlocker(when: () => boolean): BlockerState {
	if (typeof window === "undefined") {
		throw new Error("[useBlocker] Cannot use blocker during SSR - client-only")
	}

	const [isBlocked, setIsBlocked] = createSignal(false)
	let pendingNavigation: (() => void) | null = null

	/* Handle browser beforeunload (back/forward, close tab) */
	const handleBeforeUnload = (e: BeforeUnloadEvent) => {
		if (when()) {
			e.preventDefault()
			/* Modern browsers ignore custom messages, but we still need to set returnValue */
			e.returnValue = ""
			return ""
		}
	}

	/* Register beforeunload listener and clean up on unmount */
	window.addEventListener("beforeunload", handleBeforeUnload)
	onCleanup(() => {
		window.removeEventListener("beforeunload", handleBeforeUnload)
	})

	function proceed(): void {
		setIsBlocked(false)
		if (pendingNavigation) {
			pendingNavigation()
			pendingNavigation = null
		}
	}

	function reset(): void {
		setIsBlocked(false)
		pendingNavigation = null
	}

	return {
		isBlocked,
		proceed,
		reset,
	}
}

/* Re-export from dedicated modules */
export { useLoaderData } from "../use-loader-data"
export { usePreloaderContext } from "../use-preloader-context"

export type {
	BlockerState,
	BuildUrlOptions,
	NavigateOptions,
	Router,
	UseLoaderDataOptions,
	UseMatchOptions,
}

export {
	createLocationSignal,
	createParamsSignal,
	createSearchSignal,
	useBlocker,
	useHydrated,
	useLocation,
	useMatch,
	useMatches,
	useNavigate,
	useParams,
	useRouter,
	useSearch,
}
