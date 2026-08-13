/**
 * Codegen barrel — merges internal + register exports.
 * Used by generated routes.gen.ts files only.
 */
export {
	applyResponseHeaders,
	concatArrays,
	isChunkLoadError,
	isRenderFn,
	mergeHeadConfigs,
	mergeResponseHeaders,
	retryImport,
} from "../internal/index.ts"
export { preload } from "../preload/index.ts"
export type { InferParams, InferSearchParams } from "../route-builder/index.ts"
export type {
	ExtractPathParams,
	FlareRegister,
	InferAuthMode,
	InferLoaderData,
	InferPreloaderContext,
	ParentAuthResolution,
	ParentPreloaderContext,
	PreloaderChain,
	ResolvedAuth,
	ResolvedEnv,
	ResolvedQueryClient,
	ResolvedServerContext,
	RouteAuthMode,
	RouteLoaderData,
	RouteModule,
	RouteParams,
	RouteParamsProps,
	RoutePathParams,
	RoutePaths,
	RouteSearchParams,
	RouteSearchProps,
	RouteSearchType,
	RouteVirtualPaths,
} from "../route-builder/register.ts"
export type { RouteData, TreeNode } from "../router-primitives/index.ts"
