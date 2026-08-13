import type { AuthenticateMode } from "./types.ts"

/**
 * Module augmentation target. Apps extend via:
 *
 * declare module "flare" {
 *   interface FlareRegister {
 *     auth: AppAuth
 *   }
 * }
 */
export interface FlareRegister {}

/* ── Path param extraction ────────────────────────────────── */

type _ExtractSegment<T extends string> = T extends `[[...${infer N}]]`
	? { [K in N]: string[] | undefined }
	: T extends `[[${infer N}]]`
		? { [K in N]: string | undefined }
		: T extends `[...${infer N}]`
			? { [K in N]: string[] }
			: T extends `[${infer N}]`
				? { [K in N]: string }
				: {}

type _ExtractPathParams<T extends string> = T extends `${infer Head}/${infer Tail}`
	? _ExtractSegment<Head> & _ExtractPathParams<Tail>
	: _ExtractSegment<T>

export type ExtractPathParams<T extends string> =
	_ExtractPathParams<T> extends infer R ? { [K in keyof R]: R[K] } : never

/* resolve env type: user-augmented when set, unknown fallback otherwise */
export type ResolvedEnv = FlareRegister extends { env: infer E } ? E : unknown

/* resolve serverContext type: user-augmented when set, loose fallback otherwise */
export type ResolvedServerContext = FlareRegister extends { serverContext: infer SC }
	? SC
	: Record<string, unknown>

/* resolve queryClient: present when hasQueryClient is true, absent otherwise */
export type ResolvedQueryClient = FlareRegister extends { hasQueryClient: true }
	? { queryClient: import("@tanstack/solid-query").QueryClient }
	: {}

/* resolve auth type: Auth when required, Auth|null when optional, null when false */
type RegisteredAuth = FlareRegister extends { auth: infer A } ? A : null

export type ResolvedAuth<TAuth extends AuthenticateMode> = TAuth extends true
	? RegisteredAuth
	: TAuth extends "optional"
		? RegisteredAuth | null
		: null

/* ── Auth mode utilities ───────────────────────────────────── */

/* registered auth modes map — virtualPath → AuthenticateMode */
type RegisteredAuthModes = FlareRegister extends { authModes: infer M } ? M : {}

/** Infer auth mode from a route module result type */
export type InferAuthMode<T> = T extends { authenticateMode: infer M extends AuthenticateMode }
	? M
	: false

/** Auth mode for a route by virtualPath — reads from generated authModes map */
export type RouteAuthMode<TPath extends string> = TPath extends keyof RegisteredAuthModes
	? RegisteredAuthModes[TPath] extends AuthenticateMode
		? RegisteredAuthModes[TPath]
		: false
	: false

/** Resolve effective auth from parent chain — strictest wins: true > "optional" > false */
type StrictestAuth<A extends AuthenticateMode, B extends AuthenticateMode> = A extends true
	? true
	: B extends true
		? true
		: A extends "optional"
			? "optional"
			: B extends "optional"
				? "optional"
				: false

type AuthChain<TPaths extends readonly string[]> = TPaths extends readonly [
	infer First extends string,
	...infer Rest extends readonly string[],
]
	? StrictestAuth<RouteAuthMode<First>, AuthChain<Rest>>
	: false

/** Initial auth for a route based on parent chain */
export type ParentAuthResolution<TPath extends string> = TPath extends keyof RegisteredRouteParents
	? RegisteredRouteParents[TPath] extends readonly string[]
		? AuthChain<RegisteredRouteParents[TPath]>
		: false
	: false

/* ── Route type utilities ──────────────────────────────────── */

/* registered maps — resolve to empty when not augmented */
type RegisteredRoutes = FlareRegister extends { routes: infer R } ? R : {}
type RegisteredRouteModules = FlareRegister extends { routeModules: infer M } ? M : {}
type RegisteredRouteParents = FlareRegister extends { routeParents: infer P } ? P : {}

/** All registered URL paths (e.g. "/about", "/blog/[slug]") — string when not registered */
export type RoutePaths = "routes" extends keyof FlareRegister
	? keyof RegisteredRoutes & string
	: string

/** All registered virtualPaths (e.g. "_root_/about") — string when not registered */
export type RouteVirtualPaths = "routeModules" extends keyof FlareRegister
	? keyof RegisteredRouteModules & string
	: string

/** Resolve the route module type for a given virtualPath */
export type RouteModule<TPath extends string> = TPath extends keyof RegisteredRouteModules
	? RegisteredRouteModules[TPath]
	: never

/** Extract loaderData type from a route module's render props */
export type InferLoaderData<T> = T extends { render: (props: infer P) => unknown }
	? P extends { loaderData: infer L }
		? L
		: void
	: void

/** Extract own preloader context from a route module's render props */
export type InferPreloaderContext<T> = T extends { render: (props: infer P) => unknown }
	? P extends { preloaderContext: infer C }
		? C
		: {}
	: {}

/** Extract params type from a route module's render props */
export type InferParams<T> = T extends { render: (props: infer P) => unknown }
	? P extends { location: { params: infer Params } }
		? Params
		: Record<string, string | string[]>
	: Record<string, string | string[]>

/** Extract search params type from a route module's render props */
export type InferSearchParams<T> = T extends { render: (props: infer P) => unknown }
	? P extends { location: { search: infer S } }
		? S
		: Record<string, string>
	: Record<string, string>

/** Recursively intersect preloader contexts from a tuple of virtualPaths */
export type PreloaderChain<TPaths extends readonly string[]> = TPaths extends readonly [
	infer First extends string,
	...infer Rest extends readonly string[],
]
	? InferPreloaderContext<RouteModule<First>> & PreloaderChain<Rest>
	: {}

/* ── Route search params utilities ────────────────────────── */

type RegisteredRouteSearchParams = FlareRegister extends { routeSearchParams: infer S } ? S : {}

/** Resolved search param type for a URL path — specific when registered, loose otherwise */
export type RouteSearchType<TPath extends string> = "routeSearchParams" extends keyof FlareRegister
	? TPath extends keyof RegisteredRouteSearchParams
		? RegisteredRouteSearchParams[TPath]
		: Record<string, unknown>
	: Record<string, unknown>

/** Optional search prop — typed when route has .input(), loose otherwise */
export type RouteSearchProps<TPath extends string> = { search?: RouteSearchType<TPath> }

/* ── Route params utilities ──────────────────────────────── */

type RegisteredRouteParams = FlareRegister extends { routeParams: infer P } ? P : {}

/** Extract params shape — prefers routeParams (validator-inferred) over routes (URL-derived) */
export type RouteParams<TPath extends string> = "routeParams" extends keyof FlareRegister
	? TPath extends keyof RegisteredRouteParams
		? RegisteredRouteParams[TPath]
		: "routes" extends keyof FlareRegister
			? TPath extends keyof RegisteredRoutes
				? RegisteredRoutes[TPath] extends { params: infer P }
					? P
					: {}
				: {}
			: ExtractPathParams<TPath>
	: "routes" extends keyof FlareRegister
		? TPath extends keyof RegisteredRoutes
			? RegisteredRoutes[TPath] extends { params: infer P }
				? P
				: {}
			: {}
		: ExtractPathParams<TPath>

/** Conditional params prop — required when route has params, forbidden otherwise */
export type RouteParamsProps<TPath extends string> = "routeParams" extends keyof FlareRegister
	? _ParamsFromInferred<TPath>
	: "routes" extends keyof FlareRegister
		? _ParamsForRoute<TPath>
		: _ParamsFromPath<TPath>

type _ParamsFromInferred<TPath extends string> = TPath extends keyof RegisteredRouteParams
	? [keyof RegisteredRouteParams[TPath]] extends [never]
		? { params?: never }
		: { params: RegisteredRouteParams[TPath] }
	: "routes" extends keyof FlareRegister
		? _ParamsForRoute<TPath>
		: _ParamsFromPath<TPath>

type _ParamsForRoute<TPath extends string> = TPath extends keyof RegisteredRoutes
	? RegisteredRoutes[TPath] extends { params: infer P }
		? [keyof P] extends [never]
			? { params?: never }
			: { params: P }
		: { params?: never }
	: { params?: never }

type _ParamsFromPath<TPath extends string> = [keyof ExtractPathParams<TPath>] extends [never]
	? { params?: never }
	: { params: ExtractPathParams<TPath> }

/** Loader data type for a route by virtualPath — falls back to unknown for unregistered paths */
export type RouteLoaderData<TPath extends string> = [RouteModule<TPath>] extends [never]
	? unknown
	: InferLoaderData<RouteModule<TPath>>

/** Path params type for a route by virtualPath — falls back to ExtractPathParams for unregistered paths */
export type RoutePathParams<TPath extends string> = [RouteModule<TPath>] extends [never]
	? ExtractPathParams<TPath>
	: InferParams<RouteModule<TPath>>

/** Search params type for a route by virtualPath — falls back to unknown for unregistered paths */
export type RouteSearchParams<TPath extends string> = [RouteModule<TPath>] extends [never]
	? unknown
	: InferSearchParams<RouteModule<TPath>>

/** Parent preloader context for a route (parents only, excludes self) — used by builders */
export type ParentPreloaderContext<TPath extends string> =
	TPath extends keyof RegisteredRouteParents
		? RegisteredRouteParents[TPath] extends readonly string[]
			? PreloaderChain<RegisteredRouteParents[TPath]>
			: {}
		: {}

/** Accumulated preloader context for a route (includes all parent layouts) — falls back to unknown */
export type RoutePreloaderContext<TPath extends string> = [RouteModule<TPath>] extends [never]
	? unknown
	: TPath extends keyof RegisteredRouteParents
		? RegisteredRouteParents[TPath] extends readonly string[]
			? PreloaderChain<[...RegisteredRouteParents[TPath], TPath]>
			: InferPreloaderContext<RouteModule<TPath>>
		: InferPreloaderContext<RouteModule<TPath>>
