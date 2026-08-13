/**
 * Outlet Context
 *
 * Shared context for outlet rendering.
 * Separated from outlet.tsx to avoid duplicate context instances.
 *
 * Uses global singleton pattern to ensure same context instance even if
 * module is loaded multiple times by Vite during SSR.
 */

import { type Context, createContext, type JSX, useContext } from "solid-js"
import type { RouteType } from "./_internal/types"

interface MatchedRoute<TLoaderData = unknown, TPreloaderContext = unknown> {
	_type?: RouteType
	error?: Error
	loaderData: TLoaderData
	preloaderContext?: TPreloaderContext
	render: (props: unknown) => JSX.Element
	status?: "error" | "pending" | "success"
	virtualPath: string
}

interface OutletContextValue {
	depth: number
	matches: () => MatchedRoute[]
}

/**
 * Global key for OutletContext singleton.
 * Ensures same context instance even if module loaded multiple times.
 */
const CONTEXT_KEY = "__FLARE_OUTLET_CONTEXT__"

function getOrCreateContext(): Context<OutletContextValue | undefined> {
	const g = globalThis as unknown as Record<string, Context<OutletContextValue | undefined>>
	if (!g[CONTEXT_KEY]) {
		g[CONTEXT_KEY] = createContext<OutletContextValue | undefined>(undefined)
	}
	return g[CONTEXT_KEY]
}

const OutletContext = getOrCreateContext()

function createOutletContext(config: {
	depth: number
	matches: () => MatchedRoute[]
}): OutletContextValue {
	return {
		depth: config.depth,
		matches: config.matches,
	}
}

function isOutletContext(value: unknown): value is OutletContextValue {
	if (typeof value !== "object" || value === null) {
		return false
	}

	const obj = value as Record<string, unknown>

	if (typeof obj.depth !== "number") {
		return false
	}

	if (typeof obj.matches !== "function") {
		return false
	}

	return true
}

function useOutletContext(): OutletContextValue {
	const ctx = useContext(OutletContext)
	if (!ctx) {
		throw new Error("[useOutletContext] Must be used within OutletContext.Provider")
	}
	return ctx
}

/**
 * Get the child match for the current outlet depth.
 * Returns the match at depth + 1.
 */
function getChildMatch(ctx: OutletContextValue): MatchedRoute | undefined {
	return ctx.matches()[ctx.depth + 1]
}

export type { MatchedRoute, OutletContextValue }

export { createOutletContext, getChildMatch, isOutletContext, OutletContext, useOutletContext }
