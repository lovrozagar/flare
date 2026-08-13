/**
 * Flare Router Context
 * Provides router state and navigation methods to components.
 */

import { createContext, useContext } from "solid-js"
import type { MatchedRoute } from "../outlet"

interface Location {
	hash: string
	pathname: string
	search: string
}

interface RouterState {
	isNavigating: boolean
	location: Location
	matches: MatchedRoute[]
}

/**
 * Navigation options for router.navigate()
 * Uses variablePath format for `to` prop (e.g., "/products/[id]", "/[[locale]]/compare")
 */
interface NavigateOptions {
	/** URL hash (without #) */
	hash?: string
	/** Route params - supports optional params via undefined values */
	params?: Record<string, string | string[] | undefined>
	/** Use replaceState instead of pushState */
	replace?: boolean
	/** Search/query params */
	search?: Record<string, unknown>
	/** Update URL without fetching data */
	shallow?: boolean
	/** Route path pattern (variablePath format) */
	to: string
	/** Enable view transitions */
	viewTransition?: boolean
}

/**
 * Prefetch options for router.prefetch()
 */
interface PrefetchOptions {
	/** Route params - supports optional params via undefined values */
	params?: Record<string, string | string[] | undefined>
	/** Route path pattern (variablePath format) */
	to: string
}

interface Router {
	clearCache: () => void
	navigate: (options: NavigateOptions) => void
	prefetch: (options: PrefetchOptions) => void
	refetch: () => void
	state: RouterState
}

function createRouterState(config?: Partial<RouterState>): RouterState {
	return {
		isNavigating: config?.isNavigating ?? false,
		location: config?.location ?? { hash: "", pathname: "/", search: "" },
		matches: config?.matches ?? [],
	}
}

function isRouterState(value: unknown): value is RouterState {
	if (typeof value !== "object" || value === null) {
		return false
	}

	const obj = value as Record<string, unknown>

	if (typeof obj.isNavigating !== "boolean") {
		return false
	}

	if (typeof obj.location !== "object" || obj.location === null) {
		return false
	}

	if (!Array.isArray(obj.matches)) {
		return false
	}

	return true
}

interface CreateRouterConfig {
	initialState?: RouterState
}

function createRouter(config?: CreateRouterConfig): Router {
	const state = config?.initialState ?? createRouterState()

	return {
		clearCache: () => {},
		navigate: () => {},
		prefetch: () => {},
		refetch: () => {},
		state,
	}
}

const RouterContext = createContext<Router | undefined>(undefined)

function useRouter(): Router {
	const router = useContext(RouterContext)
	if (!router) {
		throw new Error("[useRouter] Must be used within RouterContext.Provider")
	}
	return router
}

export type { CreateRouterConfig, Location, NavigateOptions, PrefetchOptions, Router, RouterState }

export { createRouter, createRouterState, isRouterState, RouterContext, useRouter }
