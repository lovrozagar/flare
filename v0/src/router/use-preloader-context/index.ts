/**
 * usePreloaderContext Hook
 *
 * Type-safe hook for accessing preloader context by virtualPath.
 * Local type definition allows proper module augmentation resolution.
 *
 * @example
 * // Access full preloader context
 * const ctx = usePreloaderContext({ from: "_root_/(shop)/products/[id]" })
 *
 * // Transform with select
 * const theme = usePreloaderContext({
 *   from: "_root_/(shop)/products/[id]",
 *   select: (ctx) => ctx.theme
 * })
 */

import { FlareContext, getGlobalFlareContext } from "@flare/v0/client/flare-context"
import { type Accessor, useContext } from "solid-js"
import type { FlareRegister } from "../register"

/**
 * Local map type - evaluated at call site where augmentation is visible
 */
type PreloaderContextMap = FlareRegister extends { preloaderContext: infer TMap }
	? TMap extends Record<string, unknown>
		? TMap
		: Record<string, never>
	: Record<string, never>

interface MatchesContext {
	matches: () => Array<{ preloaderContext?: unknown; virtualPath: string }>
}

/**
 * Options without select - returns full preloader context
 */
interface UsePreloaderContextOptionsBase<TPath extends keyof PreloaderContextMap> {
	from: TPath
}

/**
 * Options with select - returns transformed data
 */
interface UsePreloaderContextOptionsWithSelect<TPath extends keyof PreloaderContextMap, TSelected> {
	from: TPath
	select: (ctx: PreloaderContextMap[TPath]) => TSelected
}

/**
 * Type-safe hook - only accepts valid virtualPaths from FlareRegister.preloaderContext
 *
 * Uses solid-js context on client, falls back to global SSR value during SSR
 * due to module identity issues with Vite's SSR environment.
 *
 * @param options.from - The virtualPath of the route whose preloader context to access
 * @param options.select - Optional transform function to derive data
 *
 * @example
 * // Full context
 * const ctx = usePreloaderContext({ from: "_root_/(shop)/products/[id]" })
 *
 * // With select
 * const theme = usePreloaderContext({
 *   from: "_root_/(shop)/products/[id]",
 *   select: (ctx) => ctx.theme
 * })
 */
export function usePreloaderContext<
	TPath extends keyof PreloaderContextMap,
	TSelected = PreloaderContextMap[TPath],
>(
	options:
		| UsePreloaderContextOptionsBase<TPath>
		| UsePreloaderContextOptionsWithSelect<TPath, TSelected>,
): Accessor<TSelected> {
	/* Try solid-js context first (works on client) */
	let ctx = useContext(FlareContext) as MatchesContext | undefined

	/* Fall back to global (works during SSR and client with module identity issues) */
	if (!ctx) {
		ctx = getGlobalFlareContext() as MatchesContext | undefined
	}

	if (!ctx) {
		throw new Error("[usePreloaderContext] Must be used within FlareProvider")
	}

	/* Validate virtualPath is in current route chain */
	const matches = ctx.matches()
	const match = matches.find((m) => m.virtualPath === options.from)

	if (!match) {
		const availablePaths = matches.map((m) => m.virtualPath).join(", ")
		throw new Error(
			`[usePreloaderContext] Route "${options.from}" is not in the current route chain. ` +
				`Available routes: [${availablePaths}]. ` +
				"You can only access preloader context from routes that are ancestors of or the current route.",
		)
	}

	const selectFn = "select" in options ? options.select : undefined

	if (selectFn) {
		return (() =>
			selectFn(match.preloaderContext as PreloaderContextMap[TPath])) as Accessor<TSelected>
	}

	return (() => match.preloaderContext) as Accessor<TSelected>
}
