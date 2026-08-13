/**
 * Type-Safe Navigation Utilities
 *
 * Provides type-safe navigation using registered routes from FlareRegister.
 * Uses variablePath format for routes (e.g., "/products/[id]", "/[[locale]]/compare").
 *
 * @example
 * // Type-safe Link
 * <Link to="/products/[id]" params={{ id: "123" }}>Product</Link>
 *
 * // Type-safe redirect in loader (throws)
 * throw redirect({ to: "/login" })
 *
 * // Type-safe router.navigate
 * router.navigate({ to: "/products/[id]", params: { id: "123" } })
 */

import type { JSX } from "solid-js"
import type { ViewTransitionConfig } from "../../client/view-transitions/types"
import { isRedirectResponse as isRedirectResponseBase, RedirectResponse } from "../../errors"
import type { NavFormat } from "../../server/handler/constants"
import type { PrefetchStrategy } from "../_internal/types"
import { buildUrl } from "../build-url"
import type { HasRequiredParams, RegisteredRoutes, RouteParams, RouteSearch } from "../register"

/**
 * Anchor attributes to forward (excludes conflicting props)
 */
type AnchorAttributes = Omit<
	JSX.AnchorHTMLAttributes<HTMLAnchorElement>,
	"href" | "onClick" | "class" | "children"
>

/**
 * Base navigation options shared across Link, navigate, and redirect
 */
interface NavigationOptionsBase {
	/** URL hash (without #) */
	hash?: string
	/** Use replaceState instead of pushState */
	replace?: boolean
	/** Scroll to top after navigation (default: true) */
	scroll?: boolean
	/** Update URL without fetching data */
	shallow?: boolean
}

/**
 * Type-safe navigation options for a specific route.
 * Params are required if the route has required params, otherwise optional.
 *
 * @example
 * // Route with required params
 * NavigateOptions<"/products/[id]">
 * // = { to: "/products/[id]"; params: { id: string }; search?: ...; ... }
 *
 * // Route with optional params
 * NavigateOptions<"/[[locale]]/compare">
 * // = { to: "/[[locale]]/compare"; params?: { locale?: string }; search?: ...; ... }
 *
 * // Route with no params
 * NavigateOptions<"/about">
 * // = { to: "/about"; params?: undefined; search?: ...; ... }
 */
export type TypedNavigateOptions<TPath extends RegisteredRoutes> = NavigationOptionsBase & {
	to: TPath
	search?: RouteSearch<TPath>
} & (HasRequiredParams<TPath> extends true
		? { params: RouteParams<TPath> }
		: { params?: RouteParams<TPath> })

/**
 * Type-safe Link props for a specific route.
 * Combines anchor attributes with typed navigation options.
 */
export type TypedLinkProps<TPath extends RegisteredRoutes> = AnchorAttributes &
	TypedNavigateOptions<TPath> & {
		/* Behavior */
		/** Force navigation even if URL matches current */
		force?: boolean
		/** Prefetch strategy: false, "hover", or "viewport" */
		prefetch?: PrefetchStrategy
		/** Navigation format for data fetching */
		navFormat?: NavFormat
		/** View transition configuration */
		viewTransition?: ViewTransitionConfig
		/** Render as disabled span instead of anchor */
		disabled?: boolean

		/* Children */
		children?: JSX.Element

		/* Base styling */
		/** CSS class */
		class?: string
		/** Inline CSS string */
		css?: string
		/** Tailwind classes */
		tw?: string

		/* Active styling (when link matches current route) */
		/** CSS class when active */
		activeClass?: string
		/** Inline CSS string when active */
		activeCss?: string
		/** Tailwind classes when active */
		activeTw?: string

		/* Inactive styling (when link doesn't match current route) */
		/** CSS class when inactive */
		inactiveClass?: string
		/** Inline CSS string when inactive */
		inactiveCss?: string
		/** Tailwind classes when inactive */
		inactiveTw?: string
	}

/**
 * Type-safe redirect options for loaders and actions.
 *
 * @example
 * // In a loader
 * export const loader = () => {
 *   if (!user) {
 *     throw redirect({ to: "/login" })
 *   }
 *   return { user }
 * }
 *
 * // With params
 * throw redirect({ to: "/products/[id]", params: { id: "123" } })
 *
 * // With status code
 * throw redirect({ to: "/login", status: 302 })
 */
export type TypedRedirectOptions<TPath extends RegisteredRoutes> = {
	to: TPath
	/** HTTP status code (default: 302) */
	status?: 301 | 302 | 303 | 307 | 308
	search?: RouteSearch<TPath>
	hash?: string
	/** Use replaceState instead of pushState on client */
	replace?: boolean
} & (HasRequiredParams<TPath> extends true
	? { params: RouteParams<TPath> }
	: { params?: RouteParams<TPath> })

/**
 * Type-safe redirect function for loaders and actions.
 * Throws a RedirectResponse that the framework catches.
 *
 * @example
 * // Simple redirect
 * throw redirect({ to: "/login" })
 *
 * // With params
 * throw redirect({ to: "/products/[id]", params: { id: "123" } })
 *
 * // With search params
 * throw redirect({ to: "/products", search: { page: 2 } })
 *
 * // Permanent redirect
 * throw redirect({ to: "/new-page", status: 301 })
 */
export function redirect<TPath extends RegisteredRoutes>(
	options: TypedRedirectOptions<TPath>,
): never {
	const url = buildUrl({
		hash: options.hash,
		params: options.params as Record<string, string | string[] | undefined>,
		search: options.search as Record<string, unknown>,
		to: options.to,
	})

	throw new RedirectResponse({
		replace: options.replace,
		status: options.status,
		to: url,
	})
}

/**
 * Re-export isRedirectResponse from errors for convenience
 */
export const isRedirectResponse = isRedirectResponseBase

/**
 * Re-export RedirectResponse for type checking
 */
export { RedirectResponse }

/**
 * Type-safe prefetch options
 */
export type TypedPrefetchOptions<TPath extends RegisteredRoutes> = {
	to: TPath
	navFormat?: NavFormat
} & (HasRequiredParams<TPath> extends true
	? { params: RouteParams<TPath> }
	: { params?: RouteParams<TPath> })

/**
 * Type-safe router interface for navigation.
 * Used by router context to provide type-safe navigate/prefetch.
 */
export interface TypedRouter {
	navigate: <TPath extends RegisteredRoutes>(options: TypedNavigateOptions<TPath>) => Promise<void>
	prefetch: <TPath extends RegisteredRoutes>(options: TypedPrefetchOptions<TPath>) => Promise<void>
}
