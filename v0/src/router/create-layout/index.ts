/**
 * Flare createLayout Factory
 * Builder pattern for layout routes with server-only loaders.
 * Layouts use <Outlet /> component for nested content placement.
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
import type { ValidateLayoutPath, VirtualPath } from "../path-types"
import type { ResolvedAuth } from "../register"

interface LayoutPreloaderContext<
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

interface LayoutLoaderContext<
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

interface LayoutAuthorizeContext<
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

interface LayoutRenderProps<
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

interface LayoutErrorRenderProps<
	TParams = Record<string, string>,
	TSearch = Record<string, string>,
> {
	error: Error
	location: FlareLocation<TParams, TSearch>
	reset: () => void
}

interface LayoutNotFoundRenderProps<
	TParams = Record<string, string>,
	TSearch = Record<string, string>,
> {
	location: FlareLocation<TParams, TSearch>
}

interface LayoutHeadContext<
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

interface LayoutHeadersContext<
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

interface LayoutResult<
	TPath extends string = string,
	TParams = Record<string, string>,
	TSearch = Record<string, string>,
	TAuth extends boolean = false,
	TPreloaderContext = unknown,
	TLoaderData = unknown,
> {
	_type: "layout"
	authorize?: (
		ctx: LayoutAuthorizeContext<TPath, TParams, TSearch, TPreloaderContext>,
	) => boolean | Promise<boolean>
	effectsConfig?: EffectsConfig<TParams, TSearch>
	errorRender?: (props: LayoutErrorRenderProps<TParams, TSearch>) => JSX.Element
	head?: (ctx: LayoutHeadContext<TParams, TSearch, TPreloaderContext, TLoaderData>) => HeadConfig
	headers?: (
		ctx: LayoutHeadersContext<TParams, TSearch, TPreloaderContext, TLoaderData>,
	) => ResponseHeaders
	inputConfig?: InputConfig<Record<string, string>, TParams, TSearch>
	loader?: (
		ctx: LayoutLoaderContext<TPath, TParams, TSearch, TPreloaderContext>,
	) => Promise<TLoaderData> | TLoaderData
	notFoundRender?: (props: LayoutNotFoundRenderProps<TParams, TSearch>) => JSX.Element
	options?: RouteOptions<TAuth>
	virtualPath: TPath
	preloader?: (
		ctx: LayoutPreloaderContext<TPath, TParams, TSearch>,
	) => Promise<TPreloaderContext> | TPreloaderContext
	render: (
		props: LayoutRenderProps<TPath, TParams, TSearch, TPreloaderContext, TLoaderData>,
	) => JSX.Element
}

interface LayoutWithLoader {
	loader: (ctx: LayoutLoaderContext) => Promise<unknown> | unknown
}

function isLayoutWithLoader(result: {
	_type: "layout"
	loader?: unknown
}): result is { _type: "layout"; loader: unknown } {
	return result.loader !== undefined
}

function isLayoutResult(result: unknown): result is { _type: "layout" } {
	return (
		typeof result === "object" && result !== null && "_type" in result && result._type === "layout"
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
		ctx: LayoutAuthorizeContext<TPath, TParams, TSearch, TPreloaderContext>,
	) => boolean | Promise<boolean>
	effectsConfig?: EffectsConfig<TParams, TSearch>
	head?: (ctx: LayoutHeadContext<TParams, TSearch, TPreloaderContext, TLoaderData>) => HeadConfig
	headers?: (
		ctx: LayoutHeadersContext<TParams, TSearch, TPreloaderContext, TLoaderData>,
	) => ResponseHeaders
	inputConfig?: InputConfig<Record<string, string>, TParams, TSearch>
	loader?: (
		ctx: LayoutLoaderContext<TPath, TParams, TSearch, TPreloaderContext>,
	) => Promise<TLoaderData> | TLoaderData
	options?: RouteOptions<TAuth>
	virtualPath: TPath
	preloader?: (
		ctx: LayoutPreloaderContext<TPath, TParams, TSearch>,
	) => Promise<TPreloaderContext> | TPreloaderContext
}

interface LayoutBuilderAfterRender<
	TPath extends string,
	TParams,
	TSearch,
	TAuth extends boolean,
	TPreloaderContext,
	TLoaderData,
> {
	errorRender(
		fn: (props: LayoutErrorRenderProps<TParams, TSearch>) => JSX.Element,
	): LayoutBuilderAfterErrorRender<TPath, TParams, TSearch, TAuth, TPreloaderContext, TLoaderData>
	notFoundRender(
		fn: (props: LayoutNotFoundRenderProps<TParams, TSearch>) => JSX.Element,
	): LayoutBuilderAfterNotFoundRender<
		TPath,
		TParams,
		TSearch,
		TAuth,
		TPreloaderContext,
		TLoaderData
	>
}

interface LayoutBuilderAfterErrorRender<
	TPath extends string,
	TParams,
	TSearch,
	TAuth extends boolean,
	TPreloaderContext,
	TLoaderData,
> {
	notFoundRender(
		fn: (props: LayoutNotFoundRenderProps<TParams, TSearch>) => JSX.Element,
	): LayoutResult<TPath, TParams, TSearch, TAuth, TPreloaderContext, TLoaderData>
}

interface LayoutBuilderAfterNotFoundRender<
	TPath extends string,
	TParams,
	TSearch,
	TAuth extends boolean,
	TPreloaderContext,
	TLoaderData,
> {
	errorRender(
		fn: (props: LayoutErrorRenderProps<TParams, TSearch>) => JSX.Element,
	): LayoutResult<TPath, TParams, TSearch, TAuth, TPreloaderContext, TLoaderData>
}

interface LayoutBuilderTerminal<
	TPath extends string,
	TParams,
	TSearch,
	TAuth extends boolean,
	TPreloaderContext,
	TLoaderData,
> {
	render(
		fn: (
			props: LayoutRenderProps<TPath, TParams, TSearch, TPreloaderContext, TLoaderData>,
		) => JSX.Element,
	): Omit<
		LayoutResult<TPath, TParams, TSearch, TAuth, TPreloaderContext, TLoaderData>,
		"errorRender" | "notFoundRender"
	> &
		LayoutBuilderAfterRender<TPath, TParams, TSearch, TAuth, TPreloaderContext, TLoaderData>
}

interface LayoutBuilderWithHeaders<
	TPath extends string,
	TParams,
	TSearch,
	TAuth extends boolean,
	TPreloaderContext,
	TLoaderData,
> extends LayoutBuilderTerminal<TPath, TParams, TSearch, TAuth, TPreloaderContext, TLoaderData> {
	headers(
		fn: (
			ctx: LayoutHeadersContext<TParams, TSearch, TPreloaderContext, TLoaderData>,
		) => ResponseHeaders,
	): LayoutBuilderTerminal<TPath, TParams, TSearch, TAuth, TPreloaderContext, TLoaderData>
}

interface LayoutBuilderWithHead<
	TPath extends string,
	TParams,
	TSearch,
	TAuth extends boolean,
	TPreloaderContext,
	TLoaderData,
> extends LayoutBuilderWithHeaders<TPath, TParams, TSearch, TAuth, TPreloaderContext, TLoaderData> {
	head(
		fn: (ctx: LayoutHeadContext<TParams, TSearch, TPreloaderContext, TLoaderData>) => HeadConfig,
	): LayoutBuilderWithHeaders<TPath, TParams, TSearch, TAuth, TPreloaderContext, TLoaderData>
}

interface LayoutBuilderWithLoader<
	TPath extends string,
	TParams,
	TSearch,
	TAuth extends boolean,
	TPreloaderContext,
> {
	loader<T>(
		fn: (ctx: LayoutLoaderContext<TPath, TParams, TSearch, TPreloaderContext>) => Promise<T> | T,
	): LayoutBuilderWithHead<TPath, TParams, TSearch, TAuth, TPreloaderContext, Awaited<T>>
	render(
		fn: (props: LayoutRenderProps<TPath, TParams, TSearch, TPreloaderContext, void>) => JSX.Element,
	): LayoutResult<TPath, TParams, TSearch, TAuth, TPreloaderContext, void> &
		LayoutBuilderAfterRender<TPath, TParams, TSearch, TAuth, TPreloaderContext, void>
}

interface LayoutBuilderWithPreloader<
	TPath extends string,
	TParams,
	TSearch,
	TAuth extends boolean,
> {
	loader<T>(
		fn: (ctx: LayoutLoaderContext<TPath, TParams, TSearch, unknown>) => Promise<T> | T,
	): LayoutBuilderWithHead<TPath, TParams, TSearch, TAuth, unknown, Awaited<T>>
	preloader<T>(
		fn: (ctx: LayoutPreloaderContext<TPath, TParams, TSearch>) => Promise<T> | T,
	): LayoutBuilderWithLoader<TPath, TParams, TSearch, TAuth, Awaited<T>>
	render(
		fn: (props: LayoutRenderProps<TPath, TParams, TSearch, unknown, void>) => JSX.Element,
	): LayoutResult<TPath, TParams, TSearch, TAuth, unknown, void> &
		LayoutBuilderAfterRender<TPath, TParams, TSearch, TAuth, unknown, void>
}

interface LayoutBuilderWithAuthorize<
	TPath extends string,
	TParams,
	TSearch,
	TAuth extends boolean,
> extends LayoutBuilderWithPreloader<TPath, TParams, TSearch, TAuth> {
	authorize(
		fn: (
			ctx: LayoutAuthorizeContext<TPath, TParams, TSearch, unknown>,
		) => boolean | Promise<boolean>,
	): LayoutBuilderWithPreloader<TPath, TParams, TSearch, TAuth>
}

interface LayoutBuilderAfterEffects<
	TPath extends string,
	TParams,
	TSearch,
	TAuth extends boolean,
> extends LayoutBuilderWithAuthorize<TPath, TParams, TSearch, TAuth> {}

interface LayoutBuilderAfterInput<
	TPath extends string,
	TParams,
	TSearch,
	TAuth extends boolean,
> extends LayoutBuilderAfterEffects<TPath, TParams, TSearch, TAuth> {
	effects(
		config: EffectsConfig<TParams, TSearch>,
	): LayoutBuilderAfterEffects<TPath, TParams, TSearch, TAuth>
}

interface LayoutBuilderAfterOptions<
	TPath extends string,
	TParams,
	TSearch,
	TAuth extends boolean,
> extends LayoutBuilderAfterInput<TPath, TParams, TSearch, TAuth> {
	input<
		TParamsValidator extends ParamsValidator<Record<string, string>, unknown> | undefined =
			undefined,
		TSearchValidator extends SearchParamsValidator<unknown> | undefined = undefined,
	>(config?: {
		params?: TParamsValidator
		searchParams?: TSearchValidator
	}): LayoutBuilderAfterInput<
		TPath,
		TParamsValidator extends ParamsValidator<Record<string, string>, infer P>
			? P
			: Record<string, string>,
		TSearchValidator extends SearchParamsValidator<infer S> ? S : Record<string, string>,
		TAuth
	>
}

interface LayoutBuilderInitial<TPath extends string> extends LayoutBuilderAfterOptions<
	TPath,
	Record<string, string>,
	Record<string, string>,
	false
> {
	options<TAuth extends boolean = false>(
		opts: RouteOptions<TAuth>,
	): LayoutBuilderAfterOptions<TPath, Record<string, string>, Record<string, string>, TAuth>
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
		props: LayoutRenderProps<TPath, TParams, TSearch, TPreloaderContext, TLoaderData>,
	) => JSX.Element,
	errorRenderFn?: (props: LayoutErrorRenderProps<TParams, TSearch>) => JSX.Element,
	notFoundRenderFn?: (props: LayoutNotFoundRenderProps<TParams, TSearch>) => JSX.Element,
): Omit<
	LayoutResult<TPath, TParams, TSearch, TAuth, TPreloaderContext, TLoaderData>,
	"errorRender" | "notFoundRender"
> &
	LayoutBuilderAfterRender<TPath, TParams, TSearch, TAuth, TPreloaderContext, TLoaderData> {
	return {
		_type: "layout" as const,
		authorize: state.authorize,
		effectsConfig: state.effectsConfig,
		errorRender(fn: (props: LayoutErrorRenderProps<TParams, TSearch>) => JSX.Element) {
			return createResultWithBoundaries(state, renderFn, fn, notFoundRenderFn) as never
		},
		head: state.head,
		headers: state.headers,
		inputConfig: state.inputConfig,
		loader: state.loader,
		notFoundRender(fn: (props: LayoutNotFoundRenderProps<TParams, TSearch>) => JSX.Element) {
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
): LayoutBuilderTerminal<TPath, TParams, TSearch, TAuth, TPreloaderContext, TLoaderData> {
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
	TAuth extends boolean,
	TPreloaderContext,
	TLoaderData,
>(
	state: BuilderState<TPath, TParams, TSearch, TAuth, TPreloaderContext, TLoaderData>,
): LayoutBuilderWithHeaders<TPath, TParams, TSearch, TAuth, TPreloaderContext, TLoaderData> {
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
): LayoutBuilderWithHead<TPath, TParams, TSearch, TAuth, TPreloaderContext, TLoaderData> {
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
): LayoutBuilderWithLoader<TPath, TParams, TSearch, TAuth, TPreloaderContext> {
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

function createBuilderWithPreloader<TPath extends string, TParams, TSearch, TAuth extends boolean>(
	state: BuilderState<TPath, TParams, TSearch, TAuth, unknown, void>,
): LayoutBuilderWithPreloader<TPath, TParams, TSearch, TAuth> {
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
	}
}

function createBuilderWithAuthorize<TPath extends string, TParams, TSearch, TAuth extends boolean>(
	state: BuilderState<TPath, TParams, TSearch, TAuth, unknown, void>,
): LayoutBuilderWithAuthorize<TPath, TParams, TSearch, TAuth> {
	return {
		...createBuilderWithPreloader(state),
		authorize(fn) {
			return createBuilderWithPreloader({ ...state, authorize: fn } as never) as never
		},
	}
}

function createBuilderAfterEffects<TPath extends string, TParams, TSearch, TAuth extends boolean>(
	state: BuilderState<TPath, TParams, TSearch, TAuth, unknown, void>,
): LayoutBuilderAfterEffects<TPath, TParams, TSearch, TAuth> {
	return createBuilderWithAuthorize(state)
}

function createBuilderAfterInput<TPath extends string, TParams, TSearch, TAuth extends boolean>(
	state: BuilderState<TPath, TParams, TSearch, TAuth, unknown, void>,
): LayoutBuilderAfterInput<TPath, TParams, TSearch, TAuth> {
	return {
		...createBuilderAfterEffects(state),
		effects(config) {
			return createBuilderAfterEffects({ ...state, effectsConfig: config } as never) as never
		},
	}
}

function createBuilderAfterOptions<TPath extends string, TParams, TSearch, TAuth extends boolean>(
	state: BuilderState<TPath, TParams, TSearch, TAuth, unknown, void>,
): LayoutBuilderAfterOptions<TPath, TParams, TSearch, TAuth> {
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
): LayoutBuilderInitial<TPath> {
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

interface LayoutConfig<TPath extends VirtualPath = VirtualPath> {
	virtualPath: ValidateLayoutPath<TPath> extends never ? never : TPath
}

function createLayout<TPath extends VirtualPath>(
	config: LayoutConfig<TPath>,
): LayoutBuilderInitial<TPath> {
	return createBuilderInitial(config.virtualPath)
}

export type {
	LayoutBuilderInitial,
	LayoutConfig,
	LayoutErrorRenderProps,
	LayoutHeadContext,
	LayoutHeadersContext,
	LayoutLoaderContext,
	LayoutNotFoundRenderProps,
	LayoutPreloaderContext,
	LayoutRenderProps,
	LayoutResult,
	LayoutWithLoader,
}

export { createLayout, isLayoutResult, isLayoutWithLoader }
