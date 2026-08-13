/**
 * useLoaderData Hook
 *
 * Type-safe hook for accessing loader data by virtualPath.
 * Local type definition allows proper module augmentation resolution.
 *
 * @example
 * // Access full loader data
 * const data = useLoaderData({ from: "_root_/(shop)/products/[id]" })
 *
 * // Transform with select
 * const name = useLoaderData({
 *   from: "_root_/(shop)/products/[id]",
 *   select: (data) => data.product.name
 * })
 */

import { FlareContext, getGlobalFlareContext } from "@flare/v0/client/flare-context"
import { type Accessor, useContext } from "solid-js"
import type { FlareRegister } from "../register"

/**
 * Local map type - evaluated at call site where augmentation is visible
 */
type LoaderDataMap = FlareRegister extends { loaderData: infer TMap }
	? TMap extends Record<string, unknown>
		? TMap
		: Record<string, never>
	: Record<string, never>

interface MatchesContext {
	matches: () => Array<{ loaderData?: unknown; virtualPath: string }>
}

/**
 * Options without select - returns full loader data
 */
interface UseLoaderDataOptionsBase<TPath extends keyof LoaderDataMap> {
	from: TPath
}

/**
 * Options with select - returns transformed data
 */
interface UseLoaderDataOptionsWithSelect<TPath extends keyof LoaderDataMap, TSelected> {
	from: TPath
	select: (data: LoaderDataMap[TPath]) => TSelected
}

/**
 * Type-safe hook - only accepts valid virtualPaths from FlareRegister.loaderData
 *
 * Uses solid-js context on client, falls back to global SSR value during SSR
 * due to module identity issues with Vite's SSR environment.
 *
 * @param options.from - The virtualPath of the route whose loader data to access
 * @param options.select - Optional transform function to derive data
 *
 * @example
 * // Full data
 * const { product } = useLoaderData({ from: "_root_/(shop)/products/[id]" })
 *
 * // With select
 * const productName = useLoaderData({
 *   from: "_root_/(shop)/products/[id]",
 *   select: (d) => d.product.name
 * })
 */
export function useLoaderData<TPath extends keyof LoaderDataMap, TSelected = LoaderDataMap[TPath]>(
	options: UseLoaderDataOptionsBase<TPath> | UseLoaderDataOptionsWithSelect<TPath, TSelected>,
): Accessor<TSelected> {
	/* Try solid-js context first (works on client) */
	let ctx = useContext(FlareContext) as MatchesContext | undefined

	/* Fall back to global (works during SSR and client with module identity issues) */
	if (!ctx) {
		ctx = getGlobalFlareContext() as MatchesContext | undefined
	}

	if (!ctx) {
		throw new Error("[useLoaderData] Must be used within FlareProvider")
	}

	/* Validate virtualPath is in current route chain */
	const matches = ctx.matches()
	const match = matches.find((m) => m.virtualPath === options.from)

	if (!match) {
		const availablePaths = matches.map((m) => m.virtualPath).join(", ")
		throw new Error(
			`[useLoaderData] Route "${options.from}" is not in the current route chain. ` +
				`Available routes: [${availablePaths}]. ` +
				"You can only access loader data from routes that are ancestors of or the current route.",
		)
	}

	const selectFn = "select" in options ? options.select : undefined

	if (selectFn) {
		return (() => selectFn(match.loaderData as LoaderDataMap[TPath])) as Accessor<TSelected>
	}

	return (() => match.loaderData) as Accessor<TSelected>
}
