export { createLayout } from "./create-layout.ts";
export type { InterceptConfig } from "./create-page.ts";
export { createPage } from "./create-page.ts";
export { createPathSegment } from "./create-path-segment.ts";
export { createRootLayout } from "./create-root-layout.ts";
export type {
	ExtractPathParams,
	FlareRegister,
	InferAuthMode,
	InferLoaderData,
	InferParams,
	InferPreloaderContext,
	InferSearchParams,
	ParentAuthResolution,
	ParentPreloaderContext,
	PreloaderChain,
	ResolvedAuth,
	ResolvedEnv,
	ResolvedServerContext,
	RouteAuthMode,
	RouteLoaderData,
	RouteModule,
	RouteParams,
	RouteParamsProps,
	RoutePathParams,
	RoutePaths,
	RoutePreloaderContext,
	RouteSearchParams,
	RouteSearchProps,
	RouteSearchType,
	RouteVirtualPaths,
} from "./register.ts";
export type {
	AuthenticateMode,
	CacheConfig,
	CdnCacheConfig,
	ClientCacheConfig,
	DeferFn,
	Deferred,
	EffectsConfig,
	HeadConfig,
	InputConfig,
	LoaderCause,
	PrefetchStrategy,
	ResponseHeaders,
	ServerThrowHelpers,
	SsrCacheConfig,
} from "./types.ts";
export { BUILDER_MARKER } from "./types.ts";
