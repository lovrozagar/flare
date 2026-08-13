/**
 * Flare createRootLayout Factory
 * Builder pattern for root layout routes that render <html>.
 * Root layouts receive children (app content) and render <HeadContent />, <Scripts /> components.
 * Path must match _name_ pattern (e.g., "_root_", "_docs_").
 */

import type { JSX } from "solid-js"
import type { RootLayoutPath, ValidateRootPath } from "../_internal/path-types"
import type {
	AuthenticateMode,
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
import type { ResolvedAuth } from "../register"

interface RootLayoutPreloaderContext<
	TPath extends string = string,
	TParams = Record<string, string>,
	TSearch = Record<string, string>,
> {
	abortController: AbortController
	auth: ResolvedAuth<TPath>
	env: unknown
	location: FlareLocation<TParams, TSearch>
	queryClient: unknown
	request: Request
}

interface RootLayoutLoaderContext<
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

interface RootLayoutAuthorizeContext<
	TPath extends string = string,
	TParams = Record<string, string>,
	TSearch = Record<string, string>,
> {
	abortController: AbortController
	auth: ResolvedAuth<TPath>
	env: unknown
	location: FlareLocation<TParams, TSearch>
	queryClient: unknown
	request: Request
}

interface RootLayoutRenderProps<
	TPath extends string = string,
	TParams = Record<string, string>,
	TSearch = Record<string, string>,
	TPreloaderContext = unknown,
	TLoaderData = unknown,
> {
	auth: ResolvedAuth<TPath>
	cause: LoaderCause
	children: JSX.Element
	loaderData: TLoaderData
	location: FlareLocation<TParams, TSearch>
	prefetch: boolean
	preloaderContext: TPreloaderContext
	queryClient: unknown
}

interface RootLayoutErrorRenderProps<
	TParams = Record<string, string>,
	TSearch = Record<string, string>,
> {
	error: Error
	location: FlareLocation<TParams, TSearch>
	reset: () => void
}

interface RootLayoutNotFoundRenderProps<
	TParams = Record<string, string>,
	TSearch = Record<string, string>,
> {
	location: FlareLocation<TParams, TSearch>
}

interface RootLayoutHeadContext<
	TParams = Record<string, string>,
	TSearch = Record<string, string>,
	TPreloaderContext = unknown,
	TLoaderData = unknown,
> {
	cause: LoaderCause
	loaderData: TLoaderData
	location: FlareLocation<TParams, TSearch>
	prefetch: boolean
	preloaderContext: TPreloaderContext
}

interface RootLayoutHeadersContext<
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

interface RootLayoutResult<
	TPath extends string = string,
	TParams = Record<string, string>,
	TSearch = Record<string, string>,
	TAuth extends AuthenticateMode | false = false,
	TPreloaderContext = unknown,
	TLoaderData = unknown,
> {
	_type: "root-layout"
	authorize?: (
		ctx: RootLayoutAuthorizeContext<TPath, TParams, TSearch>,
	) => boolean | Promise<boolean>
	effectsConfig?: EffectsConfig<TParams, TSearch>
	errorRender?: (props: RootLayoutErrorRenderProps<TParams, TSearch>) => JSX.Element
	head?: (
		ctx: RootLayoutHeadContext<TParams, TSearch, TPreloaderContext, TLoaderData>,
	) => HeadConfig
	headers?: (
		ctx: RootLayoutHeadersContext<TParams, TSearch, TPreloaderContext, TLoaderData>,
	) => ResponseHeaders
	inputConfig?: InputConfig<Record<string, string>, TParams, TSearch>
	loader?: (
		ctx: RootLayoutLoaderContext<TPath, TParams, TSearch, TPreloaderContext>,
	) => Promise<TLoaderData> | TLoaderData
	notFoundRender?: (props: RootLayoutNotFoundRenderProps<TParams, TSearch>) => JSX.Element
	options?: RouteOptions<TAuth>
	virtualPath: TPath
	preloader?: (
		ctx: RootLayoutPreloaderContext<TPath, TParams, TSearch>,
	) => Promise<TPreloaderContext> | TPreloaderContext
	render: (
		props: RootLayoutRenderProps<TPath, TParams, TSearch, TPreloaderContext, TLoaderData>,
	) => JSX.Element
}

function isRootLayoutResult(result: unknown): result is { _type: "root-layout" } {
	return (
		typeof result === "object" &&
		result !== null &&
		"_type" in result &&
		result._type === "root-layout"
	)
}

interface BuilderState<
	TPath extends string,
	TParams,
	TSearch,
	TAuth extends AuthenticateMode | false,
	TPreloaderContext,
	TLoaderData,
> {
	authorize?: (
		ctx: RootLayoutAuthorizeContext<TPath, TParams, TSearch>,
	) => boolean | Promise<boolean>
	effectsConfig?: EffectsConfig<TParams, TSearch>
	head?: (
		ctx: RootLayoutHeadContext<TParams, TSearch, TPreloaderContext, TLoaderData>,
	) => HeadConfig
	headers?: (
		ctx: RootLayoutHeadersContext<TParams, TSearch, TPreloaderContext, TLoaderData>,
	) => ResponseHeaders
	inputConfig?: InputConfig<Record<string, string>, TParams, TSearch>
	loader?: (
		ctx: RootLayoutLoaderContext<TPath, TParams, TSearch, TPreloaderContext>,
	) => Promise<TLoaderData> | TLoaderData
	options?: RouteOptions<TAuth>
	virtualPath: TPath
	preloader?: (
		ctx: RootLayoutPreloaderContext<TPath, TParams, TSearch>,
	) => Promise<TPreloaderContext> | TPreloaderContext
}

interface RootLayoutBuilderAfterRender<
	TPath extends string,
	TParams,
	TSearch,
	TAuth extends AuthenticateMode | false,
	TPreloaderContext,
	TLoaderData,
> {
	errorRender(
		fn: (props: RootLayoutErrorRenderProps<TParams, TSearch>) => JSX.Element,
	): RootLayoutBuilderAfterErrorRender<
		TPath,
		TParams,
		TSearch,
		TAuth,
		TPreloaderContext,
		TLoaderData
	>
	notFoundRender(
		fn: (props: RootLayoutNotFoundRenderProps<TParams, TSearch>) => JSX.Element,
	): RootLayoutBuilderAfterNotFoundRender<
		TPath,
		TParams,
		TSearch,
		TAuth,
		TPreloaderContext,
		TLoaderData
	>
}

interface RootLayoutBuilderAfterErrorRender<
	TPath extends string,
	TParams,
	TSearch,
	TAuth extends AuthenticateMode | false,
	TPreloaderContext,
	TLoaderData,
> {
	notFoundRender(
		fn: (props: RootLayoutNotFoundRenderProps<TParams, TSearch>) => JSX.Element,
	): RootLayoutResult<TPath, TParams, TSearch, TAuth, TPreloaderContext, TLoaderData>
}

interface RootLayoutBuilderAfterNotFoundRender<
	TPath extends string,
	TParams,
	TSearch,
	TAuth extends AuthenticateMode | false,
	TPreloaderContext,
	TLoaderData,
> {
	errorRender(
		fn: (props: RootLayoutErrorRenderProps<TParams, TSearch>) => JSX.Element,
	): RootLayoutResult<TPath, TParams, TSearch, TAuth, TPreloaderContext, TLoaderData>
}

interface RootLayoutBuilderTerminal<
	TPath extends string,
	TParams,
	TSearch,
	TAuth extends AuthenticateMode | false,
	TPreloaderContext,
	TLoaderData,
> {
	render(
		fn: (
			props: RootLayoutRenderProps<TPath, TParams, TSearch, TPreloaderContext, TLoaderData>,
		) => JSX.Element,
	): Omit<
		RootLayoutResult<TPath, TParams, TSearch, TAuth, TPreloaderContext, TLoaderData>,
		"errorRender" | "notFoundRender"
	> &
		RootLayoutBuilderAfterRender<TPath, TParams, TSearch, TAuth, TPreloaderContext, TLoaderData>
}

interface RootLayoutBuilderWithHeaders<
	TPath extends string,
	TParams,
	TSearch,
	TAuth extends AuthenticateMode | false,
	TPreloaderContext,
	TLoaderData,
> extends RootLayoutBuilderTerminal<
	TPath,
	TParams,
	TSearch,
	TAuth,
	TPreloaderContext,
	TLoaderData
> {
	headers(
		fn: (
			ctx: RootLayoutHeadersContext<TParams, TSearch, TPreloaderContext, TLoaderData>,
		) => ResponseHeaders,
	): RootLayoutBuilderTerminal<TPath, TParams, TSearch, TAuth, TPreloaderContext, TLoaderData>
}

interface RootLayoutBuilderWithHead<
	TPath extends string,
	TParams,
	TSearch,
	TAuth extends AuthenticateMode | false,
	TPreloaderContext,
	TLoaderData,
> extends RootLayoutBuilderWithHeaders<
	TPath,
	TParams,
	TSearch,
	TAuth,
	TPreloaderContext,
	TLoaderData
> {
	head(
		fn: (
			ctx: RootLayoutHeadContext<TParams, TSearch, TPreloaderContext, TLoaderData>,
		) => HeadConfig,
	): RootLayoutBuilderWithHeaders<TPath, TParams, TSearch, TAuth, TPreloaderContext, TLoaderData>
}

interface RootLayoutBuilderWithPreloaderAndHead<
	TPath extends string,
	TParams,
	TSearch,
	TAuth extends AuthenticateMode | false,
	TPreloaderContext,
> {
	headers(
		fn: (
			ctx: RootLayoutHeadersContext<TParams, TSearch, TPreloaderContext, void>,
		) => ResponseHeaders,
	): RootLayoutBuilderWithPreloaderHeadHeaders<TPath, TParams, TSearch, TAuth, TPreloaderContext>
	loader<T>(
		fn: (
			ctx: RootLayoutLoaderContext<TPath, TParams, TSearch, TPreloaderContext>,
		) => Promise<T> | T,
	): RootLayoutBuilderWithHead<TPath, TParams, TSearch, TAuth, TPreloaderContext, Awaited<T>>
	render(
		fn: (
			props: RootLayoutRenderProps<TPath, TParams, TSearch, TPreloaderContext, void>,
		) => JSX.Element,
	): RootLayoutResult<TPath, TParams, TSearch, TAuth, TPreloaderContext, void> &
		RootLayoutBuilderAfterRender<TPath, TParams, TSearch, TAuth, TPreloaderContext, void>
}

interface RootLayoutBuilderWithPreloaderAndHeaders<
	TPath extends string,
	TParams,
	TSearch,
	TAuth extends AuthenticateMode | false,
	TPreloaderContext,
> {
	head(
		fn: (ctx: RootLayoutHeadContext<TParams, TSearch, TPreloaderContext, void>) => HeadConfig,
	): RootLayoutBuilderWithPreloaderHeadHeaders<TPath, TParams, TSearch, TAuth, TPreloaderContext>
	loader<T>(
		fn: (
			ctx: RootLayoutLoaderContext<TPath, TParams, TSearch, TPreloaderContext>,
		) => Promise<T> | T,
	): RootLayoutBuilderWithHead<TPath, TParams, TSearch, TAuth, TPreloaderContext, Awaited<T>>
	render(
		fn: (
			props: RootLayoutRenderProps<TPath, TParams, TSearch, TPreloaderContext, void>,
		) => JSX.Element,
	): RootLayoutResult<TPath, TParams, TSearch, TAuth, TPreloaderContext, void> &
		RootLayoutBuilderAfterRender<TPath, TParams, TSearch, TAuth, TPreloaderContext, void>
}

interface RootLayoutBuilderWithPreloaderHeadHeaders<
	TPath extends string,
	TParams,
	TSearch,
	TAuth extends AuthenticateMode | false,
	TPreloaderContext,
> {
	loader<T>(
		fn: (
			ctx: RootLayoutLoaderContext<TPath, TParams, TSearch, TPreloaderContext>,
		) => Promise<T> | T,
	): RootLayoutBuilderWithHead<TPath, TParams, TSearch, TAuth, TPreloaderContext, Awaited<T>>
	render(
		fn: (
			props: RootLayoutRenderProps<TPath, TParams, TSearch, TPreloaderContext, void>,
		) => JSX.Element,
	): RootLayoutResult<TPath, TParams, TSearch, TAuth, TPreloaderContext, void> &
		RootLayoutBuilderAfterRender<TPath, TParams, TSearch, TAuth, TPreloaderContext, void>
}

interface RootLayoutBuilderWithLoader<
	TPath extends string,
	TParams,
	TSearch,
	TAuth extends AuthenticateMode | false,
	TPreloaderContext,
> {
	head(
		fn: (ctx: RootLayoutHeadContext<TParams, TSearch, TPreloaderContext, void>) => HeadConfig,
	): RootLayoutBuilderWithPreloaderAndHead<TPath, TParams, TSearch, TAuth, TPreloaderContext>
	headers(
		fn: (
			ctx: RootLayoutHeadersContext<TParams, TSearch, TPreloaderContext, void>,
		) => ResponseHeaders,
	): RootLayoutBuilderWithPreloaderAndHeaders<TPath, TParams, TSearch, TAuth, TPreloaderContext>
	loader<T>(
		fn: (
			ctx: RootLayoutLoaderContext<TPath, TParams, TSearch, TPreloaderContext>,
		) => Promise<T> | T,
	): RootLayoutBuilderWithHead<TPath, TParams, TSearch, TAuth, TPreloaderContext, Awaited<T>>
	render(
		fn: (
			props: RootLayoutRenderProps<TPath, TParams, TSearch, TPreloaderContext, void>,
		) => JSX.Element,
	): RootLayoutResult<TPath, TParams, TSearch, TAuth, TPreloaderContext, void> &
		RootLayoutBuilderAfterRender<TPath, TParams, TSearch, TAuth, TPreloaderContext, void>
}

interface RootLayoutBuilderWithPreloader<
	TPath extends string,
	TParams,
	TSearch,
	TAuth extends AuthenticateMode | false,
> {
	head(
		fn: (ctx: RootLayoutHeadContext<TParams, TSearch, unknown, void>) => HeadConfig,
	): RootLayoutBuilderWithPreloaderAndHead<TPath, TParams, TSearch, TAuth, unknown>
	headers(
		fn: (ctx: RootLayoutHeadersContext<TParams, TSearch, unknown, void>) => ResponseHeaders,
	): RootLayoutBuilderWithPreloaderAndHeaders<TPath, TParams, TSearch, TAuth, unknown>
	loader<T>(
		fn: (ctx: RootLayoutLoaderContext<TPath, TParams, TSearch, unknown>) => Promise<T> | T,
	): RootLayoutBuilderWithHead<TPath, TParams, TSearch, TAuth, unknown, Awaited<T>>
	preloader<T>(
		fn: (ctx: RootLayoutPreloaderContext<TPath, TParams, TSearch>) => Promise<T> | T,
	): RootLayoutBuilderWithLoader<TPath, TParams, TSearch, TAuth, Awaited<T>>
	render(
		fn: (props: RootLayoutRenderProps<TPath, TParams, TSearch, unknown, void>) => JSX.Element,
	): RootLayoutResult<TPath, TParams, TSearch, TAuth, unknown, void> &
		RootLayoutBuilderAfterRender<TPath, TParams, TSearch, TAuth, unknown, void>
}

interface RootLayoutBuilderWithAuthorize<
	TPath extends string,
	TParams,
	TSearch,
	TAuth extends AuthenticateMode | false,
> extends RootLayoutBuilderWithPreloader<TPath, TParams, TSearch, TAuth> {
	authorize(
		fn: (ctx: RootLayoutAuthorizeContext<TPath, TParams, TSearch>) => boolean | Promise<boolean>,
	): RootLayoutBuilderWithPreloader<TPath, TParams, TSearch, TAuth>
}

interface RootLayoutBuilderAfterEffects<
	TPath extends string,
	TParams,
	TSearch,
	TAuth extends AuthenticateMode | false,
> extends RootLayoutBuilderWithAuthorize<TPath, TParams, TSearch, TAuth> {}

interface RootLayoutBuilderAfterInput<
	TPath extends string,
	TParams,
	TSearch,
	TAuth extends AuthenticateMode | false,
> extends RootLayoutBuilderAfterEffects<TPath, TParams, TSearch, TAuth> {
	effects(
		config: EffectsConfig<TParams, TSearch>,
	): RootLayoutBuilderAfterEffects<TPath, TParams, TSearch, TAuth>
}

interface RootLayoutBuilderAfterOptions<
	TPath extends string,
	TParams,
	TSearch,
	TAuth extends AuthenticateMode | false,
> extends RootLayoutBuilderAfterInput<TPath, TParams, TSearch, TAuth> {
	input<
		TParamsValidator extends ParamsValidator<Record<string, string>, unknown> | undefined =
			undefined,
		TSearchValidator extends SearchParamsValidator<unknown> | undefined = undefined,
	>(config?: {
		params?: TParamsValidator
		searchParams?: TSearchValidator
	}): RootLayoutBuilderAfterInput<
		TPath,
		TParamsValidator extends ParamsValidator<Record<string, string>, infer P>
			? P
			: Record<string, string>,
		TSearchValidator extends SearchParamsValidator<infer S> ? S : Record<string, string>,
		TAuth
	>
}

interface RootLayoutBuilderInitial<TPath extends string> extends RootLayoutBuilderAfterOptions<
	TPath,
	Record<string, string>,
	Record<string, string>,
	false
> {
	options<TAuth extends AuthenticateMode | false = false>(
		opts: RouteOptions<TAuth>,
	): RootLayoutBuilderAfterOptions<TPath, Record<string, string>, Record<string, string>, TAuth>
}

function createResultWithBoundaries<
	TPath extends string,
	TParams,
	TSearch,
	TAuth extends AuthenticateMode | false,
	TPreloaderContext,
	TLoaderData,
>(
	state: BuilderState<TPath, TParams, TSearch, TAuth, TPreloaderContext, TLoaderData>,
	renderFn: (
		props: RootLayoutRenderProps<TPath, TParams, TSearch, TPreloaderContext, TLoaderData>,
	) => JSX.Element,
	errorRenderFn?: (props: RootLayoutErrorRenderProps<TParams, TSearch>) => JSX.Element,
	notFoundRenderFn?: (props: RootLayoutNotFoundRenderProps<TParams, TSearch>) => JSX.Element,
): Omit<
	RootLayoutResult<TPath, TParams, TSearch, TAuth, TPreloaderContext, TLoaderData>,
	"errorRender" | "notFoundRender"
> &
	RootLayoutBuilderAfterRender<TPath, TParams, TSearch, TAuth, TPreloaderContext, TLoaderData> {
	return {
		_type: "root-layout" as const,
		authorize: state.authorize,
		effectsConfig: state.effectsConfig,
		errorRender(fn: (props: RootLayoutErrorRenderProps<TParams, TSearch>) => JSX.Element) {
			return createResultWithBoundaries(state, renderFn, fn, notFoundRenderFn) as never
		},
		head: state.head,
		headers: state.headers,
		inputConfig: state.inputConfig,
		loader: state.loader,
		notFoundRender(fn: (props: RootLayoutNotFoundRenderProps<TParams, TSearch>) => JSX.Element) {
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
	TAuth extends AuthenticateMode | false,
	TPreloaderContext,
	TLoaderData,
>(
	state: BuilderState<TPath, TParams, TSearch, TAuth, TPreloaderContext, TLoaderData>,
): RootLayoutBuilderTerminal<TPath, TParams, TSearch, TAuth, TPreloaderContext, TLoaderData> {
	return {
		render(fn) {
			return createResultWithBoundaries(state, fn)
		},
	}
}

function createBuilderWithHeaders<
	TPath extends string,
	TParams,
	TSearch,
	TAuth extends AuthenticateMode | false,
	TPreloaderContext,
	TLoaderData,
>(
	state: BuilderState<TPath, TParams, TSearch, TAuth, TPreloaderContext, TLoaderData>,
): RootLayoutBuilderWithHeaders<TPath, TParams, TSearch, TAuth, TPreloaderContext, TLoaderData> {
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
	TAuth extends AuthenticateMode | false,
	TPreloaderContext,
	TLoaderData,
>(
	state: BuilderState<TPath, TParams, TSearch, TAuth, TPreloaderContext, TLoaderData>,
): RootLayoutBuilderWithHead<TPath, TParams, TSearch, TAuth, TPreloaderContext, TLoaderData> {
	return {
		...createBuilderWithHeaders(state),
		head(fn) {
			return createBuilderWithHeaders({ ...state, head: fn })
		},
	}
}

function createBuilderWithPreloaderHeadHeaders<
	TPath extends string,
	TParams,
	TSearch,
	TAuth extends AuthenticateMode | false,
	TPreloaderContext,
>(
	state: BuilderState<TPath, TParams, TSearch, TAuth, TPreloaderContext, void>,
): RootLayoutBuilderWithPreloaderHeadHeaders<TPath, TParams, TSearch, TAuth, TPreloaderContext> {
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
	}
}

function createBuilderWithPreloaderAndHead<
	TPath extends string,
	TParams,
	TSearch,
	TAuth extends AuthenticateMode | false,
	TPreloaderContext,
>(
	state: BuilderState<TPath, TParams, TSearch, TAuth, TPreloaderContext, void>,
): RootLayoutBuilderWithPreloaderAndHead<TPath, TParams, TSearch, TAuth, TPreloaderContext> {
	return {
		headers(fn) {
			return createBuilderWithPreloaderHeadHeaders({ ...state, headers: fn } as never) as never
		},
		loader(fn) {
			return createBuilderWithHead({
				...state,
				loader: fn,
			} as never) as never
		},
		render(fn) {
			return createResultWithBoundaries(state, fn as never) as never
		},
	}
}

function createBuilderWithPreloaderAndHeaders<
	TPath extends string,
	TParams,
	TSearch,
	TAuth extends AuthenticateMode | false,
	TPreloaderContext,
>(
	state: BuilderState<TPath, TParams, TSearch, TAuth, TPreloaderContext, void>,
): RootLayoutBuilderWithPreloaderAndHeaders<TPath, TParams, TSearch, TAuth, TPreloaderContext> {
	return {
		head(fn) {
			return createBuilderWithPreloaderHeadHeaders({ ...state, head: fn } as never) as never
		},
		loader(fn) {
			return createBuilderWithHead({
				...state,
				loader: fn,
			} as never) as never
		},
		render(fn) {
			return createResultWithBoundaries(state, fn as never) as never
		},
	}
}

function createBuilderWithLoader<
	TPath extends string,
	TParams,
	TSearch,
	TAuth extends AuthenticateMode | false,
	TPreloaderContext,
>(
	state: BuilderState<TPath, TParams, TSearch, TAuth, TPreloaderContext, void>,
): RootLayoutBuilderWithLoader<TPath, TParams, TSearch, TAuth, TPreloaderContext> {
	return {
		head(fn) {
			return createBuilderWithPreloaderAndHead({ ...state, head: fn } as never) as never
		},
		headers(fn) {
			return createBuilderWithPreloaderAndHeaders({ ...state, headers: fn } as never) as never
		},
		loader(fn) {
			return createBuilderWithHead({
				...state,
				loader: fn,
			} as never) as never
		},
		render(fn) {
			return createResultWithBoundaries(state, fn as never) as never
		},
	}
}

function createBuilderWithPreloader<
	TPath extends string,
	TParams,
	TSearch,
	TAuth extends AuthenticateMode | false,
>(
	state: BuilderState<TPath, TParams, TSearch, TAuth, unknown, void>,
): RootLayoutBuilderWithPreloader<TPath, TParams, TSearch, TAuth> {
	return {
		head(fn) {
			return createBuilderWithPreloaderAndHead({ ...state, head: fn } as never) as never
		},
		headers(fn) {
			return createBuilderWithPreloaderAndHeaders({ ...state, headers: fn } as never) as never
		},
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
	}
}

function createBuilderWithAuthorize<
	TPath extends string,
	TParams,
	TSearch,
	TAuth extends AuthenticateMode | false,
>(
	state: BuilderState<TPath, TParams, TSearch, TAuth, unknown, void>,
): RootLayoutBuilderWithAuthorize<TPath, TParams, TSearch, TAuth> {
	return {
		...createBuilderWithPreloader(state),
		authorize(fn) {
			return createBuilderWithPreloader({ ...state, authorize: fn } as never) as never
		},
	}
}

function createBuilderAfterEffects<
	TPath extends string,
	TParams,
	TSearch,
	TAuth extends AuthenticateMode | false,
>(
	state: BuilderState<TPath, TParams, TSearch, TAuth, unknown, void>,
): RootLayoutBuilderAfterEffects<TPath, TParams, TSearch, TAuth> {
	return createBuilderWithAuthorize(state)
}

function createBuilderAfterInput<
	TPath extends string,
	TParams,
	TSearch,
	TAuth extends AuthenticateMode | false,
>(
	state: BuilderState<TPath, TParams, TSearch, TAuth, unknown, void>,
): RootLayoutBuilderAfterInput<TPath, TParams, TSearch, TAuth> {
	return {
		...createBuilderAfterEffects(state),
		effects(config) {
			return createBuilderAfterEffects({ ...state, effectsConfig: config } as never) as never
		},
	}
}

function createBuilderAfterOptions<
	TPath extends string,
	TParams,
	TSearch,
	TAuth extends AuthenticateMode | false,
>(
	state: BuilderState<TPath, TParams, TSearch, TAuth, unknown, void>,
): RootLayoutBuilderAfterOptions<TPath, TParams, TSearch, TAuth> {
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

function createBuilderInitial<TPath extends string>(
	virtualPath: TPath,
): RootLayoutBuilderInitial<TPath> {
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

interface RootLayoutConfig<TPath extends RootLayoutPath = RootLayoutPath> {
	virtualPath: ValidateRootPath<TPath> extends never ? never : TPath
}

function createRootLayout<TPath extends RootLayoutPath>(
	config: RootLayoutConfig<TPath>,
): RootLayoutBuilderInitial<TPath> {
	return createBuilderInitial(config.virtualPath)
}

export type {
	RootLayoutBuilderInitial,
	RootLayoutConfig,
	RootLayoutErrorRenderProps,
	RootLayoutHeadContext,
	RootLayoutHeadersContext,
	RootLayoutLoaderContext,
	RootLayoutNotFoundRenderProps,
	RootLayoutPreloaderContext,
	RootLayoutRenderProps,
	RootLayoutResult,
}

export { createRootLayout, isRootLayoutResult }
