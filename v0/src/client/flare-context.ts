/**
 * Flare Context
 *
 * Solid context for FlareProvider.
 * Separated from provider.tsx to allow SSR import without circular dependencies.
 *
 * Uses global singleton pattern to ensure same context instance even if
 * module is loaded multiple times by Vite during SSR.
 */

import type { Accessor, Context, Setter } from "solid-js"
import { createContext } from "solid-js"
import type { MatchedRoute } from "../router/outlet-context"
import type { FlareClient, FlareRouter, Location } from "./init"

interface FlareProviderContext {
	client: FlareClient
	isNavigating: Accessor<boolean>
	location: Accessor<Location>
	matches: Accessor<MatchedRoute[]>
	params: Accessor<Record<string, string | string[]>>
	router: FlareRouter
	setIsNavigating: Setter<boolean>
	setLocation: Setter<Location>
	setMatches: Setter<MatchedRoute[]>
	setParams: Setter<Record<string, string | string[]>>
}

/**
 * Global key for FlareContext singleton.
 * Ensures same context instance even if module loaded multiple times.
 */
const CONTEXT_KEY = "__FLARE_CONTEXT__"

/**
 * Global key for FlareContext value.
 * Used to bypass solid-js context system where module identity issues
 * can cause useContext to fail even when Provider is used correctly.
 * This happens in both SSR (Vite module identity) and client (bundled vs source).
 */
const GLOBAL_VALUE_KEY = "__FLARE_CONTEXT_VALUE__"

function getOrCreateContext(): Context<FlareProviderContext | undefined> {
	const g = globalThis as unknown as Record<string, Context<FlareProviderContext | undefined>>
	if (!g[CONTEXT_KEY]) {
		g[CONTEXT_KEY] = createContext<FlareProviderContext | undefined>(undefined)
	}
	return g[CONTEXT_KEY]
}

const FlareContext = getOrCreateContext()

/**
 * Set global context value.
 * Called by FlareProvider on mount and SSR renderer before rendering.
 */
function setGlobalFlareContext(value: unknown): void {
	;(globalThis as Record<string, unknown>)[GLOBAL_VALUE_KEY] = value
}

/**
 * Get global context value.
 * Called by useLoaderData/usePreloaderContext when solid-js context fails.
 */
function getGlobalFlareContext(): unknown {
	return (globalThis as Record<string, unknown>)[GLOBAL_VALUE_KEY]
}

/**
 * Clear global context value.
 * Called after SSR render completes (not on client).
 */
function clearGlobalFlareContext(): void {
	delete (globalThis as Record<string, unknown>)[GLOBAL_VALUE_KEY]
}

export type { FlareProviderContext }
export { clearGlobalFlareContext, FlareContext, getGlobalFlareContext, setGlobalFlareContext }
