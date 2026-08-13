/**
 * createPage - Factory for page routes
 *
 * Builder pattern with chainable methods for type-safe page definition.
 * Flow: createPage → [options] → [input] → [effects] → [authorize] → [preloader] → [loader] → [head] → [headers] → render|response
 */
import type { JSX } from "solid-js"
import type {
	DeferFn,
	EffectsConfig,
	FlareLocation,
	HeadConfig,
	InputConfig,
	LoaderCause,
	ParamsValidator,
	ResponseHeaders,
	RouteOptions,
	SearchParamsValidator,
} from "../_internal/types"
import type { ValidatePagePath, VirtualPath } from "../path-types"
import type { ResolvedAuth, ResolvedParentPreloaderContext } from "../register"

export type {
	Auth,
	CacheControl,
	EffectsConfig,
	EffectsContext,
	EffectsLocationState,
	FlareLocation,
	HeadConfig,
	InputConfig,
	LoaderCause,
	ParamsValidator,
	PrefetchStrategy,
	ResponseHeaders,
	RouteMeta,
	RouteOptions,
	SearchParamsValidator,
} from "../_internal/types"

interface PagePreloaderContext<
	TPath extends string = string,
	TParams = Record<string, string>,
	TSearch = Record<string, string>,
	TPreloaderContext = unknown,
> {
	abortController: AbortController
	auth: ResolvedAuth<TPath>
	env: unknown
	location: FlareLocation<TParams, TSearch>
	preloaderContext: TPreloaderContext
	queryClient: unknown
	request: Request
}
interface PageLoaderContext<
	TPath extends string = string,
	TParams = Record<string, string>,
	TSearch = Record<string, string>,
	TPreloaderContext = unknown,
	TDeps extends unknown[] = unknown[],
> {
	abortController: AbortController
	auth: ResolvedAuth<TPath>
	cause: LoaderCause
	defer: DeferFn
	deps: TDeps
	env: unknown
	location: FlareLocation<TParams, TSearch>
	prefetch: boolean
	preloaderContext: TPreloaderContext
	queryClient: unknown
	request: Request
}
interface PageAuthorizeContext<
	TPath extends string = string,
	TParams = Record<string, string>,
	TSearch = Record<string, string>,
	TPreloaderContext = unknown,
> {
	abortController: AbortController
	auth: ResolvedAuth<TPath>
	env: unknown
	location: FlareLocation<TParams, TSearch>
	preloaderContext: TPreloaderContext
	queryClient: unknown
	request: Request
}
interface PageHeadContext<
	TParams = Record<string, string>,
	TSearch = Record<string, string>,
	TPreloaderContext = unknown,
	TLoaderData = unknown,
> {
	cause: LoaderCause
	loaderData: TLoaderData
	location: FlareLocation<TParams, TSearch>
	parentHead?: HeadConfig
	prefetch: boolean
	preloaderContext: TPreloaderContext
}
interface PageHeadersContext<
	TParams = Record<string, string>,
	TSearch = Record<string, string>,
	TPreloaderContext = unknown,
	TLoaderData = unknown,
> {
	cause: LoaderCause
	env: unknown
	loaderData: TLoaderData
	location: FlareLocation<TParams, TSearch>
	parentHeaders?: ResponseHeaders
	prefetch: boolean
	preloaderContext: TPreloaderContext
	request: Request
}
interface PageRenderProps<
	TPath extends string = string,
	TParams = Record<string, string>,
	TSearch = Record<string, string>,
	TPreloaderContext = unknown,
	TLoaderData = unknown,
> {
	auth: ResolvedAuth<TPath>
	cause: LoaderCause
	loaderData: TLoaderData
	location: FlareLocation<TParams, TSearch>
	prefetch: boolean
	preloaderContext: TPreloaderContext
	queryClient: unknown
}
interface PageErrorRenderProps<TParams = Record<string, string>, TSearch = Record<string, string>> {
	error: Error
	location: FlareLocation<TParams, TSearch>
	reset: () => void
}
interface PageNotFoundRenderProps<
	TParams = Record<string, string>,
	TSearch = Record<string, string>,
> {
	location: FlareLocation<TParams, TSearch>
}
interface PageResponseContext<TLoaderData = unknown> {
	loaderData: TLoaderData
	request: Request
}
interface PageResultRender<
	TPath extends string = string,
	TParams = Record<string, string>,
	TSearch = Record<string, string>,
	TAuth extends boolean = false,
	TPreloaderContext = unknown,
	TLoaderData = unknown,
> {
	_type: "render"
	authorize?: (
		ctx: PageAuthorizeContext<TPath, TParams, TSearch, TPreloaderContext>,
	) => boolean | Promise<boolean>
	effectsConfig?: EffectsConfig<TParams, TSearch>
	errorRender?: (props: PageErrorRenderProps<TParams, TSearch>) => JSX.Element
	head?: (ctx: PageHeadContext<TParams, TSearch, TPreloaderContext, TLoaderData>) => HeadConfig
	headers?: (
		ctx: PageHeadersContext<TParams, TSearch, TPreloaderContext, TLoaderData>,
	) => ResponseHeaders
	inputConfig?: InputConfig<Record<string, string>, TParams, TSearch>
	loader?: (
		ctx: PageLoaderContext<TPath, TParams, TSearch, TPreloaderContext>,
	) => Promise<TLoaderData> | TLoaderData
	notFoundRender?: (props: PageNotFoundRenderProps<TParams, TSearch>) => JSX.Element
	options?: RouteOptions<TAuth>
	preloader?: (ctx: PagePreloaderContext<TPath, TParams, TSearch, TPreloaderContext>) => unknown
	render: (
		props: PageRenderProps<TPath, TParams, TSearch, TPreloaderContext, TLoaderData>,
	) => JSX.Element
	virtualPath: TPath
}
interface PageResultResponse<
	TPath extends string = string,
	TParams = Record<string, string>,
	TSearch = Record<string, string>,
	TAuth extends boolean = false,
	TPreloaderContext = unknown,
	TLoaderData = unknown,
> {
	_type: "response"
	authorize?: (
		ctx: PageAuthorizeContext<TPath, TParams, TSearch, TPreloaderContext>,
	) => boolean | Promise<boolean>
	effectsConfig?: EffectsConfig<TParams, TSearch>
	inputConfig?: InputConfig<Record<string, string>, TParams, TSearch>
	loader?: (
		ctx: PageLoaderContext<TPath, TParams, TSearch, TPreloaderContext>,
	) => Promise<TLoaderData> | TLoaderData
	options?: RouteOptions<TAuth>
	preloader?: (ctx: PagePreloaderContext<TPath, TParams, TSearch, TPreloaderContext>) => unknown
	response: (ctx: PageResponseContext<TLoaderData>) => Response
	virtualPath: TPath
}
type PageResult<
	TPath extends string = string,
	TParams = Record<string, string>,
	TSearch = Record<string, string>,
	TAuth extends boolean = false,
	TPreloaderContext = unknown,
	TLoaderData = unknown,
> =
	| PageResultRender<TPath, TParams, TSearch, TAuth, TPreloaderContext, TLoaderData>
	| PageResultResponse<TPath, TParams, TSearch, TAuth, TPreloaderContext, TLoaderData>
function isPageResult(result: unknown): result is { _type: "render" | "response" } {
	return (
		typeof result === "object" &&
		result !== null &&
		"_type" in result &&
		(result._type === "render" || result._type === "response")
	)
}
interface BuilderState<
	TPath extends string,
	TParams,
	TSearch,
	TAuth extends boolean,
	TPreloaderContext,
	TLoaderData,
> {
	authorize?: (
		ctx: PageAuthorizeContext<TPath, TParams, TSearch, TPreloaderContext>,
	) => boolean | Promise<boolean>
	effectsConfig?: EffectsConfig<TParams, TSearch>
	head?: (ctx: PageHeadContext<TParams, TSearch, TPreloaderContext, TLoaderData>) => HeadConfig
	headers?: (
		ctx: PageHeadersContext<TParams, TSearch, TPreloaderContext, TLoaderData>,
	) => ResponseHeaders
	inputConfig?: InputConfig<Record<string, string>, TParams, TSearch>
	loader?: (
		ctx: PageLoaderContext<TPath, TParams, TSearch, TPreloaderContext>,
	) => Promise<TLoaderData> | TLoaderData
	options?: RouteOptions<TAuth>
	preloader?: (ctx: PagePreloaderContext<TPath, TParams, TSearch, TPreloaderContext>) => unknown
	virtualPath: TPath
}
interface PageBuilderAfterRender<
	TPath extends string,
	TParams,
	TSearch,
	TAuth extends boolean,
	TPreloaderContext,
	TLoaderData,
> {
	errorRender(
		fn: (props: PageErrorRenderProps<TParams, TSearch>) => JSX.Element,
	): PageBuilderAfterErrorRender<TPath, TParams, TSearch, TAuth, TPreloaderContext, TLoaderData>
	notFoundRender(
		fn: (props: PageNotFoundRenderProps<TParams, TSearch>) => JSX.Element,
	): PageBuilderAfterNotFoundRender<TPath, TParams, TSearch, TAuth, TPreloaderContext, TLoaderData>
}
interface PageBuilderAfterErrorRender<
	TPath extends string,
	TParams,
	TSearch,
	TAuth extends boolean,
	TPreloaderContext,
	TLoaderData,
> {
	notFoundRender(
		fn: (props: PageNotFoundRenderProps<TParams, TSearch>) => JSX.Element,
	): PageResultRender<TPath, TParams, TSearch, TAuth, TPreloaderContext, TLoaderData>
}
interface PageBuilderAfterNotFoundRender<
	TPath extends string,
	TParams,
	TSearch,
	TAuth extends boolean,
	TPreloaderContext,
	TLoaderData,
> {
	errorRender(
		fn: (props: PageErrorRenderProps<TParams, TSearch>) => JSX.Element,
	): PageResultRender<TPath, TParams, TSearch, TAuth, TPreloaderContext, TLoaderData>
}
interface PageBuilderTerminal<
	TPath extends string,
	TParams,
	TSearch,
	TAuth extends boolean,
	TPreloaderContext,
	TLoaderData,
> {
	render(
		fn: (
			props: PageRenderProps<TPath, TParams, TSearch, TPreloaderContext, TLoaderData>,
		) => JSX.Element,
	): Omit<
		PageResultRender<TPath, TParams, TSearch, TAuth, TPreloaderContext, TLoaderData>,
		"errorRender" | "notFoundRender"
	> &
		PageBuilderAfterRender<TPath, TParams, TSearch, TAuth, TPreloaderContext, TLoaderData>
	response(
		fn: (ctx: PageResponseContext<TLoaderData>) => Response,
	): PageResultResponse<TPath, TParams, TSearch, TAuth, TPreloaderContext, TLoaderData>
}
interface PageBuilderWithHeaders<
	TPath extends string,
	TParams,
	TSearch,
	TAuth extends boolean,
	TPreloaderContext,
	TLoaderData,
> extends PageBuilderTerminal<TPath, TParams, TSearch, TAuth, TPreloaderContext, TLoaderData> {
	headers(
		fn: (
			ctx: PageHeadersContext<TParams, TSearch, TPreloaderContext, TLoaderData>,
		) => ResponseHeaders,
	): PageBuilderTerminal<TPath, TParams, TSearch, TAuth, TPreloaderContext, TLoaderData>
}
interface PageBuilderWithHead<
	TPath extends string,
	TParams,
	TSearch,
	TAuth extends boolean,
	TPreloaderContext,
	TLoaderData,
> extends PageBuilderWithHeaders<TPath, TParams, TSearch, TAuth, TPreloaderContext, TLoaderData> {
	head(
		fn: (ctx: PageHeadContext<TParams, TSearch, TPreloaderContext, TLoaderData>) => HeadConfig,
	): PageBuilderWithHeaders<TPath, TParams, TSearch, TAuth, TPreloaderContext, TLoaderData>
}
interface PageBuilderWithLoader<
	TPath extends string,
	TParams,
	TSearch,
	TAuth extends boolean,
	TPreloaderContext,
> {
	loader<T>(
		fn: (ctx: PageLoaderContext<TPath, TParams, TSearch, TPreloaderContext>) => Promise<T> | T,
	): PageBuilderWithHead<TPath, TParams, TSearch, TAuth, TPreloaderContext, Awaited<T>>
	render(
		fn: (props: PageRenderProps<TPath, TParams, TSearch, TPreloaderContext, void>) => JSX.Element,
	): PageResultRender<TPath, TParams, TSearch, TAuth, TPreloaderContext, void> &
		PageBuilderAfterRender<TPath, TParams, TSearch, TAuth, TPreloaderContext, void>
	response(
		fn: (ctx: PageResponseContext<void>) => Response,
	): PageResultResponse<TPath, TParams, TSearch, TAuth, TPreloaderContext, void>
}
interface PageBuilderWithPreloader<
	TPath extends string,
	TParams,
	TSearch,
	TAuth extends boolean,
	TPreloaderContext = Record<string, never>,
> {
	loader<T>(
		fn: (ctx: PageLoaderContext<TPath, TParams, TSearch, TPreloaderContext>) => Promise<T> | T,
	): PageBuilderWithHead<TPath, TParams, TSearch, TAuth, TPreloaderContext, Awaited<T>>
	preloader<T extends Record<string, unknown>>(
		fn: (ctx: PagePreloaderContext<TPath, TParams, TSearch, TPreloaderContext>) => Promise<T> | T,
	): PageBuilderWithLoader<TPath, TParams, TSearch, TAuth, TPreloaderContext & Awaited<T>>
	render(
		fn: (props: PageRenderProps<TPath, TParams, TSearch, TPreloaderContext, void>) => JSX.Element,
	): PageResultRender<TPath, TParams, TSearch, TAuth, TPreloaderContext, void> &
		PageBuilderAfterRender<TPath, TParams, TSearch, TAuth, TPreloaderContext, void>
	response(
		fn: (ctx: PageResponseContext<void>) => Response,
	): PageResultResponse<TPath, TParams, TSearch, TAuth, TPreloaderContext, void>
}
interface PageBuilderWithAuthorize<
	TPath extends string,
	TParams,
	TSearch,
	TAuth extends boolean,
	TPreloaderContext = Record<string, never>,
> extends PageBuilderWithPreloader<TPath, TParams, TSearch, TAuth, TPreloaderContext> {
	authorize(
		fn: (
			ctx: PageAuthorizeContext<TPath, TParams, TSearch, TPreloaderContext>,
		) => boolean | Promise<boolean>,
	): PageBuilderWithPreloader<TPath, TParams, TSearch, TAuth, TPreloaderContext>
}
interface PageBuilderAfterEffects<
	TPath extends string,
	TParams,
	TSearch,
	TAuth extends boolean,
	TPreloaderContext = Record<string, never>,
> extends PageBuilderWithAuthorize<TPath, TParams, TSearch, TAuth, TPreloaderContext> {}
interface PageBuilderAfterInput<
	TPath extends string,
	TParams,
	TSearch,
	TAuth extends boolean,
	TPreloaderContext = Record<string, never>,
> extends PageBuilderAfterEffects<TPath, TParams, TSearch, TAuth, TPreloaderContext> {
	effects(
		config: EffectsConfig<TParams, TSearch>,
	): PageBuilderAfterEffects<TPath, TParams, TSearch, TAuth, TPreloaderContext>
}
interface PageBuilderAfterOptions<
	TPath extends string,
	TParams,
	TSearch,
	TAuth extends boolean,
	TPreloaderContext = Record<string, never>,
> extends PageBuilderAfterInput<TPath, TParams, TSearch, TAuth, TPreloaderContext> {
	input<
		TParamsValidator extends ParamsValidator<Record<string, string>, unknown> | undefined =
			undefined,
		TSearchValidator extends SearchParamsValidator<unknown> | undefined = undefined,
	>(config?: {
		params?: TParamsValidator
		searchParams?: TSearchValidator
	}): PageBuilderAfterInput<
		TPath,
		TParamsValidator extends ParamsValidator<Record<string, string>, infer P>
			? P
			: Record<string, string>,
		TSearchValidator extends SearchParamsValidator<infer S> ? S : Record<string, string>,
		TAuth,
		TPreloaderContext
	>
}

interface PageBuilderInitial<
	TPath extends string,
	TPreloaderContext = Record<string, never>,
> extends PageBuilderAfterOptions<
	TPath,
	Record<string, string>,
	Record<string, string>,
	false,
	TPreloaderContext
> {
	options<TAuth extends boolean = false>(
		opts: RouteOptions<TAuth>,
	): PageBuilderAfterOptions<
		TPath,
		Record<string, string>,
		Record<string, string>,
		TAuth,
		TPreloaderContext
	>
}
function createResultWithBoundaries<
	TPath extends string,
	TParams,
	TSearch,
	TAuth extends boolean,
	TPreloaderContext,
	TLoaderData,
>(
	state: BuilderState<TPath, TParams, TSearch, TAuth, TPreloaderContext, TLoaderData>,
	renderFn: (
		props: PageRenderProps<TPath, TParams, TSearch, TPreloaderContext, TLoaderData>,
	) => JSX.Element,
	errorRenderFn?: (props: PageErrorRenderProps<TParams, TSearch>) => JSX.Element,
	notFoundRenderFn?: (props: PageNotFoundRenderProps<TParams, TSearch>) => JSX.Element,
): Omit<
	PageResultRender<TPath, TParams, TSearch, TAuth, TPreloaderContext, TLoaderData>,
	"errorRender" | "notFoundRender"
> &
	PageBuilderAfterRender<TPath, TParams, TSearch, TAuth, TPreloaderContext, TLoaderData> {
	return {
		_type: "render" as const,
		authorize: state.authorize,
		effectsConfig: state.effectsConfig,
		errorRender(fn: (props: PageErrorRenderProps<TParams, TSearch>) => JSX.Element) {
			return createResultWithBoundaries(state, renderFn, fn, notFoundRenderFn) as never
		},
		head: state.head,
		headers: state.headers,
		inputConfig: state.inputConfig,
		loader: state.loader,
		notFoundRender(fn: (props: PageNotFoundRenderProps<TParams, TSearch>) => JSX.Element) {
			return createResultWithBoundaries(state, renderFn, errorRenderFn, fn) as never
		},
		options: state.options,
		preloader: state.preloader,
		render: renderFn,
		virtualPath: state.virtualPath,
	}
}
function createBuilderTerminal<
	TPath extends string,
	TParams,
	TSearch,
	TAuth extends boolean,
	TPreloaderContext,
	TLoaderData,
>(
	state: BuilderState<TPath, TParams, TSearch, TAuth, TPreloaderContext, TLoaderData>,
): PageBuilderTerminal<TPath, TParams, TSearch, TAuth, TPreloaderContext, TLoaderData> {
	return {
		render(fn) {
			return createResultWithBoundaries(state, fn)
		},
		response(fn) {
			return {
				_type: "response",
				authorize: state.authorize,
				effectsConfig: state.effectsConfig,
				inputConfig: state.inputConfig,
				loader: state.loader,
				options: state.options,
				preloader: state.preloader,
				response: fn,
				virtualPath: state.virtualPath,
			} as PageResultResponse<TPath, TParams, TSearch, TAuth, TPreloaderContext, TLoaderData>
		},
	}
}
function createBuilderWithHeaders<
	TPath extends string,
	TParams,
	TSearch,
	TAuth extends boolean,
	TPreloaderContext,
	TLoaderData,
>(
	state: BuilderState<TPath, TParams, TSearch, TAuth, TPreloaderContext, TLoaderData>,
): PageBuilderWithHeaders<TPath, TParams, TSearch, TAuth, TPreloaderContext, TLoaderData> {
	return {
		...createBuilderTerminal(state),
		headers(fn) {
			return createBuilderTerminal({ ...state, headers: fn })
		},
	}
}
function createBuilderWithHead<
	TPath extends string,
	TParams,
	TSearch,
	TAuth extends boolean,
	TPreloaderContext,
	TLoaderData,
>(
	state: BuilderState<TPath, TParams, TSearch, TAuth, TPreloaderContext, TLoaderData>,
): PageBuilderWithHead<TPath, TParams, TSearch, TAuth, TPreloaderContext, TLoaderData> {
	return {
		...createBuilderWithHeaders(state),
		head(fn) {
			return createBuilderWithHeaders({ ...state, head: fn })
		},
	}
}
function createBuilderWithLoader<
	TPath extends string,
	TParams,
	TSearch,
	TAuth extends boolean,
	TPreloaderContext,
>(
	state: BuilderState<TPath, TParams, TSearch, TAuth, TPreloaderContext, void>,
): PageBuilderWithLoader<TPath, TParams, TSearch, TAuth, TPreloaderContext> {
	return {
		loader(fn) {
			return createBuilderWithHead({
				...state,
				loader: fn,
			} as never) as never
		},
		render(fn) {
			return createResultWithBoundaries(state, fn as never) as never
		},
		response(fn) {
			return {
				_type: "response",
				authorize: state.authorize,
				effectsConfig: state.effectsConfig,
				inputConfig: state.inputConfig,
				options: state.options,
				preloader: state.preloader,
				response: fn,
				virtualPath: state.virtualPath,
			} as never
		},
	}
}
function createBuilderWithPreloader<TPath extends string, TParams, TSearch, TAuth extends boolean>(
	state: BuilderState<TPath, TParams, TSearch, TAuth, unknown, void>,
): PageBuilderWithPreloader<TPath, TParams, TSearch, TAuth> {
	return {
		loader(fn) {
			return createBuilderWithHead({
				...state,
				loader: fn,
			} as never) as never
		},
		preloader(fn) {
			return createBuilderWithLoader({
				...state,
				preloader: fn,
			} as never) as never
		},
		render(fn) {
			return createResultWithBoundaries(state, fn as never) as never
		},
		response(fn) {
			return {
				_type: "response",
				authorize: state.authorize,
				effectsConfig: state.effectsConfig,
				inputConfig: state.inputConfig,
				options: state.options,
				response: fn,
				virtualPath: state.virtualPath,
			} as never
		},
	}
}
function createBuilderWithAuthorize<TPath extends string, TParams, TSearch, TAuth extends boolean>(
	state: BuilderState<TPath, TParams, TSearch, TAuth, unknown, void>,
): PageBuilderWithAuthorize<TPath, TParams, TSearch, TAuth> {
	return {
		...createBuilderWithPreloader(state),
		authorize(fn) {
			return createBuilderWithPreloader({ ...state, authorize: fn } as never) as never
		},
	}
}
function createBuilderAfterEffects<TPath extends string, TParams, TSearch, TAuth extends boolean>(
	state: BuilderState<TPath, TParams, TSearch, TAuth, unknown, void>,
): PageBuilderAfterEffects<TPath, TParams, TSearch, TAuth> {
	return createBuilderWithAuthorize(state)
}
function createBuilderAfterInput<TPath extends string, TParams, TSearch, TAuth extends boolean>(
	state: BuilderState<TPath, TParams, TSearch, TAuth, unknown, void>,
): PageBuilderAfterInput<TPath, TParams, TSearch, TAuth> {
	return {
		...createBuilderAfterEffects(state),
		effects(config) {
			return createBuilderAfterEffects({ ...state, effectsConfig: config } as never) as never
		},
	}
}
function createBuilderAfterOptions<TPath extends string, TParams, TSearch, TAuth extends boolean>(
	state: BuilderState<TPath, TParams, TSearch, TAuth, unknown, void>,
): PageBuilderAfterOptions<TPath, TParams, TSearch, TAuth> {
	return {
		...createBuilderAfterInput(state),
		input(config) {
			return createBuilderAfterInput({
				...state,
				inputConfig: config,
			} as never) as never
		},
	}
}
function createBuilderInitial<TPath extends string>(virtualPath: TPath): PageBuilderInitial<TPath> {
	const state = { virtualPath } as BuilderState<
		TPath,
		Record<string, string>,
		Record<string, string>,
		false,
		unknown,
		void
	>
	return {
		...createBuilderAfterOptions(state),
		options(opts) {
			return createBuilderAfterOptions({ ...state, options: opts } as never) as never
		},
	}
}
interface PageConfig<TPath extends VirtualPath = VirtualPath> {
	virtualPath: ValidatePagePath<TPath> extends never ? never : TPath
}
function createPage<TPath extends VirtualPath>(
	config: PageConfig<TPath>,
): PageBuilderInitial<TPath, ResolvedParentPreloaderContext<TPath>> {
	return createBuilderInitial(config.virtualPath) as PageBuilderInitial<
		TPath,
		ResolvedParentPreloaderContext<TPath>
	>
}
function isRenderResult<
	TPath extends string,
	TParams,
	TSearch,
	TAuth extends boolean,
	TPreloaderContext,
	TLoaderData,
>(
	result: PageResult<TPath, TParams, TSearch, TAuth, TPreloaderContext, TLoaderData>,
): result is PageResultRender<TPath, TParams, TSearch, TAuth, TPreloaderContext, TLoaderData> {
	return result._type === "render"
}
function isResponseResult<
	TPath extends string,
	TParams,
	TSearch,
	TAuth extends boolean,
	TPreloaderContext,
	TLoaderData,
>(
	result: PageResult<TPath, TParams, TSearch, TAuth, TPreloaderContext, TLoaderData>,
): result is PageResultResponse<TPath, TParams, TSearch, TAuth, TPreloaderContext, TLoaderData> {
	return result._type === "response"
}
export type {
	PageAuthorizeContext,
	PageBuilderInitial,
	PageConfig,
	PageErrorRenderProps,
	PageHeadContext,
	PageHeadersContext,
	PageLoaderContext,
	PageNotFoundRenderProps,
	PagePreloaderContext,
	PageRenderProps,
	PageResponseContext,
	PageResult,
	PageResultRender,
	PageResultResponse,
}
export { createPage, isPageResult, isRenderResult, isResponseResult }
