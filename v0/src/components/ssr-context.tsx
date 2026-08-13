/**
 * SSR Context
 *
 * Provides SSR-specific data to components during server rendering.
 * Uses sharedConfig.context pattern to avoid React-style providers in component tree.
 * This prevents hydration mismatches from differing tree structures.
 */

import { createContext, type JSX, sharedConfig, useContext } from "solid-js"
import { isServer } from "solid-js/web"
import type { HeadConfig } from "../router/_internal/types"

interface SSRContextValue {
	entryScript?: string
	flareStateScript: string
	isServer: boolean
	nonce: string
	resolvedHead?: HeadConfig
}

interface SharedConfigWithFlare {
	flare?: SSRContextValue
}

/* Fallback context for testing - used when sharedConfig.context isn't available */
const SSRContext = createContext<SSRContextValue | undefined>(undefined)

/**
 * Set SSR context on sharedConfig during render.
 * Must be called inside renderToStringAsync callback where sharedConfig.context exists.
 */
function setSSRContext(value: SSRContextValue): void {
	if (sharedConfig.context) {
		;(sharedConfig.context as SharedConfigWithFlare).flare = value
	}
}

/**
 * Read SSR context from sharedConfig.
 * On server: returns context set by setSSRContext or from provider.
 * On client: returns undefined (no SSR context available).
 */
function useSSRContext(): SSRContextValue | undefined {
	/* Try sharedConfig first (SSR render context) */
	if (isServer && sharedConfig.context) {
		const value = (sharedConfig.context as SharedConfigWithFlare).flare
		if (value) return value
	}
	/* Fall back to context provider (for testing) */
	return useContext(SSRContext)
}

interface SSRContextProviderProps {
	children: JSX.Element
	value: SSRContextValue
}

/**
 * SSR Context Provider component.
 * Use for testing or when sharedConfig.context isn't available.
 * In production SSR, prefer setSSRContext for cleaner tree structure.
 */
function SSRContextProvider(props: SSRContextProviderProps): JSX.Element {
	return <SSRContext.Provider value={props.value}>{props.children}</SSRContext.Provider>
}

export { setSSRContext, SSRContext, SSRContextProvider, useSSRContext }
export type { SSRContextProviderProps, SSRContextValue }
