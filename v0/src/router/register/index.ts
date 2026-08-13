/**
 * Flare Type Registration
 *
 * Type utilities for module augmentation in generated types.
 * Pattern matches v1 exactly for proper type resolution.
 */

/**
 * FlareRegister interface - augmented by generated types.gen.d.ts
 * Apps extend this to provide type-safe route information.
 *
 * Must be empty - apps augment via declare module to add properties.
 */
export type FlareRegister = {}

/**
 * Extract valid virtual paths from FlareRegister.preloaderContext.
 * Returns string union of all registered preloader context paths.
 */
export type RegisteredPreloaderPaths = FlareRegister extends {
	preloaderContext: infer TMap
}
	? TMap extends Record<string, unknown>
		? keyof TMap & string
		: string
	: string

/**
 * Extract valid virtual paths from FlareRegister.loaderData.
 * Returns string union of all registered loader data paths.
 */
export type RegisteredLoaderPaths = FlareRegister extends {
	loaderData: infer TMap
}
	? TMap extends Record<string, unknown>
		? keyof TMap & string
		: string
	: string

/**
 * Resolve preloader context for a path from Register.
 * TPath must be a valid key from FlareRegister.preloaderContext.
 * Same pattern as ResolvedLoaderData for consistency.
 */
export type ResolvedPreloaderContext<TPath extends RegisteredPreloaderPaths> =
	FlareRegister extends { preloaderContext: infer TMap }
		? TMap extends Record<string, unknown>
			? TPath extends keyof TMap
				? TMap[TPath]
				: Record<string, never>
			: Record<string, never>
		: Record<string, never>

/**
 * Extract valid virtual paths from FlareRegister.parentPreloaderContext.
 */
export type RegisteredParentPreloaderPaths = FlareRegister extends {
	parentPreloaderContext: infer TMap
}
	? TMap extends Record<string, unknown>
		? keyof TMap & string
		: string
	: string

/**
 * Resolve PARENT preloader context for a path from Register.
 * Only includes parent layouts, NOT self - for builders to avoid circular dependency.
 */
export type ResolvedParentPreloaderContext<TPath extends RegisteredParentPreloaderPaths> =
	FlareRegister extends {
		parentPreloaderContext: infer TMap
	}
		? TMap extends Record<string, unknown>
			? TPath extends keyof TMap
				? TMap[TPath]
				: Record<string, never>
			: Record<string, never>
		: Record<string, never>

/**
 * Resolve loader data for a path from Register.
 * TPath must be a valid key from FlareRegister.loaderData.
 * Returns { layout: ...; page: ... } structure.
 */
export type ResolvedLoaderData<TPath extends RegisteredLoaderPaths> = FlareRegister extends {
	loaderData: infer TMap
}
	? TMap extends Record<string, unknown>
		? TPath extends keyof TMap
			? TMap[TPath]
			: unknown
		: unknown
	: unknown

/**
 * Extract preloader context type from a route's render props.
 * The render function receives props with `preloaderContext: TPreloaderContext`.
 * This extracts TPreloaderContext directly from the generic, not from function return.
 */
export type ExtractPreloaderData<T> = T extends { render: (props: infer P) => any }
	? P extends { preloaderContext: infer C }
		? C
		: Record<string, never>
	: Record<string, never>

/**
 * Extract loader data type from a route's loader function return type.
 */
export type ExtractLoaderData<T> = T extends { loader?: infer L }
	? NonNullable<L> extends (...args: any[]) => infer R
		? Awaited<R>
		: undefined
	: undefined

/**
 * Extract search params type from a route factory result
 */
export type ExtractSearchParams<T> = T extends { inputConfig: { searchParams: infer S } }
	? S extends { _output: infer O }
		? O
		: Record<string, string>
	: Record<string, string>

/**
 * Extract params type from a route factory result.
 * Returns Record<string, never> when no params defined, allowing intersection with path-derived params.
 */
export type ExtractParams<T> = T extends { inputConfig: { params: infer P } }
	? P extends { _output: infer O }
		? O
		: Record<string, never>
	: Record<string, never>

/**
 * Extract authenticate mode from route options.
 * Returns true | "optional" | false based on route's .options({ authenticate }).
 *
 * Handles optional properties by using NonNullable to unwrap.
 */
export type ExtractAuthMode<T> = T extends { options?: infer O }
	? NonNullable<O> extends { authenticate?: infer A }
		? NonNullable<A> extends true
			? true
			: NonNullable<A> extends "optional"
				? "optional"
				: false
		: false
	: false

/**
 * Check if any element in tuple is true
 */
type HasRequiredAuth<T extends unknown[]> = T extends [infer Head, ...infer Tail]
	? Head extends true
		? true
		: HasRequiredAuth<Tail>
	: false

/**
 * Check if any element in tuple is "optional"
 */
type HasOptionalAuth<T extends unknown[]> = T extends [infer Head, ...infer Tail]
	? Head extends "optional"
		? true
		: HasOptionalAuth<Tail>
	: false

/**
 * Get the Auth type from FlareRegister, or null if not defined
 */
type RegisteredAuth = FlareRegister extends { auth: infer A } ? A : null

/**
 * Resolve auth type from a chain of auth modes.
 * If any is true → Auth (required)
 * Else if any is "optional" → Auth | null
 * Else → null
 */
export type ResolveAuthChain<TModes extends unknown[]> =
	HasRequiredAuth<TModes> extends true
		? RegisteredAuth
		: HasOptionalAuth<TModes> extends true
			? RegisteredAuth | null
			: null

/**
 * Resolve auth type for a path from Register.
 * Returns Auth (required), Auth | null (optional), or null (no auth).
 */
export type ResolvedAuth<TPath extends string> = FlareRegister extends {
	authContext: infer TMap
}
	? TMap extends Record<string, unknown>
		? TPath extends keyof TMap
			? TMap[TPath]
			: null
		: null
	: null

/**
 * Route configuration shape in FlareRegister.routes
 */
interface RouteConfig {
	params: Record<string, string | string[] | undefined>
	search: Record<string, unknown>
}

/**
 * Extract registered route paths from FlareRegister.routes.
 * Routes are keyed by variablePath (e.g., "/products/[id]", "/[[locale]]/compare").
 * Returns string union of all registered route paths, or string if not registered.
 */
export type RegisteredRoutes = FlareRegister extends { routes: infer TMap }
	? TMap extends Record<string, RouteConfig>
		? keyof TMap & string
		: string
	: string

/**
 * Get params type for a registered route.
 * Returns the params object type, or Record<string, never> if no params.
 *
 * @example
 * RouteParams<"/products/[id]">        // { id: string }
 * RouteParams<"/[[locale]]/compare">   // { locale?: string }
 * RouteParams<"/products">             // Record<string, never>
 */
export type RouteParams<TPath extends RegisteredRoutes> = FlareRegister extends {
	routes: infer TMap
}
	? TMap extends Record<string, RouteConfig>
		? TPath extends keyof TMap
			? TMap[TPath]["params"]
			: Record<string, never>
		: Record<string, never>
	: Record<string, never>

/**
 * Get search params type for a registered route.
 * Returns the search object type, or Record<string, never> if no search params.
 *
 * @example
 * RouteSearch<"/products">             // { page?: number; sort?: string }
 * RouteSearch<"/products/[id]">        // Record<string, never>
 */
export type RouteSearch<TPath extends RegisteredRoutes> = FlareRegister extends {
	routes: infer TMap
}
	? TMap extends Record<string, RouteConfig>
		? TPath extends keyof TMap
			? TMap[TPath]["search"]
			: Record<string, never>
		: Record<string, never>
	: Record<string, never>

/**
 * Check if a route has required params (non-empty params object with required keys).
 * Used for conditional params requirement in Link and navigate.
 *
 * @example
 * HasRequiredParams<"/products/[id]">       // true (id is required)
 * HasRequiredParams<"/[[locale]]/compare">  // false (locale is optional)
 * HasRequiredParams<"/products">            // false (no params)
 */
export type HasRequiredParams<TPath extends RegisteredRoutes> =
	RouteParams<TPath> extends Record<string, never>
		? false
		: undefined extends RouteParams<TPath>[keyof RouteParams<TPath>]
			? keyof RouteParams<TPath> extends never
				? false
				: HasAnyRequiredKey<RouteParams<TPath>>
			: keyof RouteParams<TPath> extends never
				? false
				: true

/**
 * Helper: Check if object has any required (non-optional) keys
 */
type HasAnyRequiredKey<T> = {
	[K in keyof T]-?: undefined extends T[K] ? never : K
}[keyof T] extends never
	? false
	: true

/**
 * Conditional params type for navigation.
 * If route has required params, params is required. Otherwise optional.
 */
export type WithParams<TPath extends RegisteredRoutes> =
	HasRequiredParams<TPath> extends true
		? { params: RouteParams<TPath> }
		: { params?: RouteParams<TPath> }
