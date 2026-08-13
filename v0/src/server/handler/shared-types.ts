/**
 * Shared Handler Types
 *
 * Common types used across SSR render and HTML nav handlers.
 */

import type { JSX } from "solid-js"
import type { TrackedQueryClient } from "../../query-client/tracked-client"
import type {
	FlareLocation,
	HeadConfig,
	PrefetchStrategy,
	ResponseHeaders,
} from "../../router/_internal/types"
import type { NavFormat } from "./constants"
import type { DeferContext } from "./defer"
import type { HeadContext } from "./head-resolution"
import type { HeadersContext } from "./headers-resolution"
import type { InputConfig } from "./input-validation"

/** Serializable view transition config for SSR (no functions) */
type ViewTransitionDefaults = boolean | { types: string[] }

interface RouterDefaults {
	gcTime?: number
	navFormat?: NavFormat
	prefetchIntent?: PrefetchStrategy
	prefetchStaleTime?: number
	staleTime?: number
	/** View transition config. true = direction-based, object for custom types */
	viewTransitions?: ViewTransitionDefaults
}

interface LoaderContext {
	abortController: AbortController
	auth: unknown
	cause: "enter" | "stay"
	defer: DeferContext["defer"]
	deps: unknown[]
	env: unknown
	location: FlareLocation
	prefetch: boolean
	preloaderContext: Record<string, unknown>
	queryClient?: TrackedQueryClient<unknown>
	request: Request
}

interface PreloaderContext {
	abortController: AbortController
	auth: unknown
	env: unknown
	location: FlareLocation
	preloaderContext: Record<string, unknown>
	queryClient: unknown
	request: Request
}

interface LoadedComponent {
	_type: "layout" | "page" | "render" | "root-layout"
	head?: (ctx: HeadContext) => HeadConfig
	headers?: (ctx: HeadersContext) => ResponseHeaders
	inputConfig?: InputConfig
	loader?: (ctx: LoaderContext) => Promise<unknown>
	preloader?: (ctx: PreloaderContext) => Promise<unknown>
	render: (props: unknown) => JSX.Element
	virtualPath: string
}

interface MatchedComponent {
	component: LoadedComponent
	loaderData: unknown
	preloaderContext: unknown
	virtualPath: string
}

export type { LoadedComponent, LoaderContext, MatchedComponent, PreloaderContext, RouterDefaults }
