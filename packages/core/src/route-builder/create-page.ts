import type { FlareRouter } from "../outlet/types.ts"
import type { Location } from "../router-primitives/index.ts"
import type {
	ExtractPathParams,
	ParentAuthResolution,
	ParentPreloaderContext,
	ResolvedAuth,
	ResolvedEnv,
	ResolvedQueryClient,
	ResolvedServerContext,
} from "./register.ts"
import {
	type AuthenticateMode,
	BUILDER_MARKER,
	type CacheConfig,
	type DeferFn,
	type EffectsConfig,
	type HeadConfig,
	type HeadOptions,
	type InputConfig,
	type LoaderCause,
	type ParamsValidator,
	type ResponseHeaders,
	type SearchParamsValidator,
	type ServerThrowHelpers,
	type ServerUrlHelpers,
} from "./types.ts"

/* ── callback context types ─────────────────────────────────────── */

export interface PageAuthorizeContext<
	TParams,
	TSearch,
	TAuth extends AuthenticateMode,
	TPreloaderContext,
>
	extends ServerThrowHelpers, ServerUrlHelpers {
	abortController: AbortController
	auth: ResolvedAuth<TAuth>
	env: ResolvedEnv
	locale: () => string
	location: Location<TParams, TSearch>
	preloaderContext: TPreloaderContext
	request: Request
	serverContext: ResolvedServerContext
}

export interface PagePreloaderContext<
	TParams,
	TSearch,
	TAuth extends AuthenticateMode,
	TPreloaderContext,
>
	extends ServerThrowHelpers, ServerUrlHelpers {
	abortController: AbortController
	auth: ResolvedAuth<TAuth>
	env: ResolvedEnv
	locale: () => string
	location: Location<TParams, TSearch>
	preloaderContext: TPreloaderContext
	request: Request
	serverContext: ResolvedServerContext
}

export type PageLoaderContext<
	TParams,
	TSearch,
	TAuth extends AuthenticateMode,
	TPreloaderContext,
> = ServerThrowHelpers &
	ServerUrlHelpers &
	ResolvedQueryClient & {
		abortController: AbortController
		auth: ResolvedAuth<TAuth>
		cause: LoaderCause
		defer: DeferFn
		deps: unknown[]
		env: ResolvedEnv
		locale: () => string
		location: Location<TParams, TSearch>
		prefetch: boolean
		preloaderContext: TPreloaderContext
		request: Request
		serverContext: ResolvedServerContext
	}

export interface PageHeadContext<
	TParams,
	TSearch,
	TPreloaderContext,
	TLoaderData,
> extends ServerUrlHelpers {
	cause: LoaderCause
	loaderData: TLoaderData
	location: Location<TParams, TSearch>
	parentHead: HeadConfig | undefined
	prefetch: boolean
	preloaderContext: TPreloaderContext
	serverContext: ResolvedServerContext
}

export interface PageHeadersContext<
	TParams,
	TSearch,
	TPreloaderContext,
	TLoaderData,
> extends ServerUrlHelpers {
	cause: LoaderCause
	env: ResolvedEnv
	loaderData: TLoaderData
	location: Location<TParams, TSearch>
	parentHeaders: ResponseHeaders | undefined
	prefetch: boolean
	preloaderContext: TPreloaderContext
	request: Request
	serverContext: ResolvedServerContext
}

export interface PageRenderProps<TParams, TSearch, TPreloaderContext, TLoaderData> {
	loaderData: TLoaderData
	location: Location<TParams, TSearch>
	preloaderContext: TPreloaderContext
	router: FlareRouter
}

export interface PageResponseContext<TParams = Record<string, string | undefined>> {
	env: ResolvedEnv
	params: TParams
	request: Request
	url: URL
}

export interface PageErrorRenderProps<TParams, TSearch> {
	error: Error
	location: Location<TParams, TSearch>
	reset: () => void
	retry: () => void
}

export interface PageNotFoundRenderProps<TParams, TSearch> {
	location: Location<TParams, TSearch>
}

export interface PageUnauthenticatedRenderProps<TParams, TSearch> {
	error: Error
	location: Location<TParams, TSearch>
	retry: () => void
}

export interface PageUnauthorizedRenderProps<TParams, TSearch> {
	error: Error
	location: Location<TParams, TSearch>
	retry: () => void
}

/* ── result types ───────────────────────────────────────────────── */

export interface PageResultRender<
	TPath extends string,
	TParams,
	TSearch,
	TAuth extends AuthenticateMode,
	TPreloaderContext,
	TLoaderData,
> {
	_type: "render"
	authenticate?: unknown[]
	authenticateMode?: AuthenticateMode
	authorize?: (
		ctx: PageAuthorizeContext<TParams, TSearch, TAuth, TPreloaderContext>,
	) => boolean | Promise<boolean>
	effectsConfig?: EffectsConfig<TParams, TSearch>
	errorRender?: (props: PageErrorRenderProps<TParams, TSearch>) => unknown
	head?: (ctx: PageHeadContext<TParams, TSearch, TPreloaderContext, TLoaderData>) => HeadConfig
	headReplace?: boolean
	headers?: (
		ctx: PageHeadersContext<TParams, TSearch, TPreloaderContext, TLoaderData>,
	) => ResponseHeaders
	inputConfig?: InputConfig<TParams, TSearch>
	intercept?: InterceptConfig
	loader?: (
		ctx: PageLoaderContext<TParams, TSearch, TAuth, TPreloaderContext>,
	) => Promise<TLoaderData> | TLoaderData
	notFoundRender?: (props: PageNotFoundRenderProps<TParams, TSearch>) => unknown
	cache?: CacheConfig<TPath>
	preloader?: (ctx: PagePreloaderContext<TParams, TSearch, TAuth, TPreloaderContext>) => unknown
	render: (props: PageRenderProps<TParams, TSearch, TPreloaderContext, TLoaderData>) => unknown
	unauthenticatedRender?: (props: PageUnauthenticatedRenderProps<TParams, TSearch>) => unknown
	unauthorizedRender?: (props: PageUnauthorizedRenderProps<TParams, TSearch>) => unknown
	virtualPath: TPath
}

export interface PageResultResponse<
	TPath extends string,
	TParams,
	TSearch,
	TAuth extends AuthenticateMode,
	TPreloaderContext,
> {
	_type: "response"
	authenticate?: unknown[]
	authenticateMode?: AuthenticateMode
	authorize?: (
		ctx: PageAuthorizeContext<TParams, TSearch, TAuth, TPreloaderContext>,
	) => boolean | Promise<boolean>
	effectsConfig?: EffectsConfig<TParams, TSearch>
	inputConfig?: InputConfig<TParams, TSearch>
	cache?: CacheConfig<TPath>
	preloader?: (ctx: PagePreloaderContext<TParams, TSearch, TAuth, TPreloaderContext>) => unknown
	response: (ctx: PageResponseContext<TParams>) => Response | Promise<Response>
	virtualPath: TPath
}

/* ── internal builder state ─────────────────────────────────────── */

export interface InterceptConfig {
	from: string[]
	render: string
}

interface BuilderStateInternal {
	authenticate?: unknown[]
	authenticateMode?: AuthenticateMode
	authorize?: unknown
	cache?: unknown
	effectsConfig?: unknown
	head?: unknown
	headReplace?: boolean
	headers?: unknown
	inputConfig?: unknown
	intercept?: InterceptConfig
	loader?: unknown
	preloader?: unknown
	virtualPath: string
}

/* ── progressive builder interfaces ─────────────────────────────── */

type PageResultCore<
	TPath extends string,
	TParams,
	TSearch,
	TAuth extends AuthenticateMode,
	TPreloaderContext,
	TLoaderData,
> = Omit<
	PageResultRender<TPath, TParams, TSearch, TAuth, TPreloaderContext, TLoaderData>,
	keyof PageBoundaryPropsMap<TParams, TSearch>
>

/* after render: boundary methods (any order, each at most once) */
interface PageBoundaryPropsMap<TParams, TSearch> {
	errorRender: PageErrorRenderProps<TParams, TSearch>
	notFoundRender: PageNotFoundRenderProps<TParams, TSearch>
	unauthenticatedRender: PageUnauthenticatedRenderProps<TParams, TSearch>
	unauthorizedRender: PageUnauthorizedRenderProps<TParams, TSearch>
}

type PageAfterRender<
	TPath extends string,
	TParams,
	TSearch,
	TAuth extends AuthenticateMode,
	TPreloaderContext,
	TLoaderData,
	TSet extends keyof PageBoundaryPropsMap<TParams, TSearch> = never,
> = {
	[K in Exclude<keyof PageBoundaryPropsMap<TParams, TSearch>, TSet>]: (
		fn: (props: PageBoundaryPropsMap<TParams, TSearch>[K]) => unknown,
	) => PageResultCore<TPath, TParams, TSearch, TAuth, TPreloaderContext, TLoaderData> &
		PageAfterRender<TPath, TParams, TSearch, TAuth, TPreloaderContext, TLoaderData, TSet | K>
}

/* L1: render only */
interface PageBuilderRenderOnly<
	TPath extends string,
	TParams,
	TSearch,
	TAuth extends AuthenticateMode,
	TPreloaderContext,
	TLoaderData,
> {
	render(
		fn: (props: PageRenderProps<TParams, TSearch, TPreloaderContext, TLoaderData>) => unknown,
	): PageResultCore<TPath, TParams, TSearch, TAuth, TPreloaderContext, TLoaderData> &
		PageAfterRender<TPath, TParams, TSearch, TAuth, TPreloaderContext, TLoaderData>
}

/* L2: + headers */
interface PageBuilderWithHeaders<
	TPath extends string,
	TParams,
	TSearch,
	TAuth extends AuthenticateMode,
	TPreloaderContext,
	TLoaderData,
> extends PageBuilderRenderOnly<TPath, TParams, TSearch, TAuth, TPreloaderContext, TLoaderData> {
	headers(
		fn: (
			ctx: PageHeadersContext<TParams, TSearch, TPreloaderContext, TLoaderData>,
		) => ResponseHeaders,
	): PageBuilderRenderOnly<TPath, TParams, TSearch, TAuth, TPreloaderContext, TLoaderData>
}

/* L3: + head */
interface PageBuilderWithHead<
	TPath extends string,
	TParams,
	TSearch,
	TAuth extends AuthenticateMode,
	TPreloaderContext,
	TLoaderData,
> extends PageBuilderWithHeaders<TPath, TParams, TSearch, TAuth, TPreloaderContext, TLoaderData> {
	head(
		fn: (ctx: PageHeadContext<TParams, TSearch, TPreloaderContext, TLoaderData>) => HeadConfig,
		options?: HeadOptions,
	): PageBuilderWithHeaders<TPath, TParams, TSearch, TAuth, TPreloaderContext, TLoaderData>
}

/* L4: loader + response + head/headers/render with void loaderData */
interface PageBuilderWithLoader<
	TPath extends string,
	TParams,
	TSearch,
	TAuth extends AuthenticateMode,
	TPreloaderContext,
> {
	head(
		fn: (ctx: PageHeadContext<TParams, TSearch, TPreloaderContext, void>) => HeadConfig,
		options?: HeadOptions,
	): PageBuilderWithHeaders<TPath, TParams, TSearch, TAuth, TPreloaderContext, void>
	headers(
		fn: (ctx: PageHeadersContext<TParams, TSearch, TPreloaderContext, void>) => ResponseHeaders,
	): PageBuilderRenderOnly<TPath, TParams, TSearch, TAuth, TPreloaderContext, void>
	loader<T>(
		fn: (ctx: PageLoaderContext<TParams, TSearch, TAuth, TPreloaderContext>) => Promise<T> | T,
	): PageBuilderWithHead<TPath, TParams, TSearch, TAuth, TPreloaderContext, Awaited<T>>
	render(
		fn: (props: PageRenderProps<TParams, TSearch, TPreloaderContext, void>) => unknown,
	): PageResultCore<TPath, TParams, TSearch, TAuth, TPreloaderContext, void> &
		PageAfterRender<TPath, TParams, TSearch, TAuth, TPreloaderContext, void>
	response(
		fn: (ctx: PageResponseContext<TParams>) => Response | Promise<Response>,
	): PageResultResponse<TPath, TParams, TSearch, TAuth, TPreloaderContext>
}

/* L4b: after preloader — loader path only (no response alternative) */
interface PageBuilderAfterPreloader<
	TPath extends string,
	TParams,
	TSearch,
	TAuth extends AuthenticateMode,
	TPreloaderContext,
> {
	head(
		fn: (ctx: PageHeadContext<TParams, TSearch, TPreloaderContext, void>) => HeadConfig,
		options?: HeadOptions,
	): PageBuilderWithHeaders<TPath, TParams, TSearch, TAuth, TPreloaderContext, void>
	headers(
		fn: (ctx: PageHeadersContext<TParams, TSearch, TPreloaderContext, void>) => ResponseHeaders,
	): PageBuilderRenderOnly<TPath, TParams, TSearch, TAuth, TPreloaderContext, void>
	loader<T>(
		fn: (ctx: PageLoaderContext<TParams, TSearch, TAuth, TPreloaderContext>) => Promise<T> | T,
	): PageBuilderWithHead<TPath, TParams, TSearch, TAuth, TPreloaderContext, Awaited<T>>
	render(
		fn: (props: PageRenderProps<TParams, TSearch, TPreloaderContext, void>) => unknown,
	): PageResultCore<TPath, TParams, TSearch, TAuth, TPreloaderContext, void> &
		PageAfterRender<TPath, TParams, TSearch, TAuth, TPreloaderContext, void>
}

/* L5: + preloader */
interface PageBuilderWithPreloader<
	TPath extends string,
	TParams,
	TSearch,
	TAuth extends AuthenticateMode,
	TPreloaderContext,
> extends PageBuilderWithLoader<TPath, TParams, TSearch, TAuth, TPreloaderContext> {
	preloader<T extends Record<string, unknown>>(
		fn: (ctx: PagePreloaderContext<TParams, TSearch, TAuth, TPreloaderContext>) => Promise<T> | T,
	): PageBuilderAfterPreloader<TPath, TParams, TSearch, TAuth, TPreloaderContext & Awaited<T>>
}

/* L6: + effects */
interface PageBuilderAfterAuthorize<
	TPath extends string,
	TParams,
	TSearch,
	TAuth extends AuthenticateMode,
	TPreloaderContext,
> extends PageBuilderWithPreloader<TPath, TParams, TSearch, TAuth, TPreloaderContext> {
	effects(
		config: EffectsConfig<TParams, TSearch>,
	): PageBuilderWithPreloader<TPath, TParams, TSearch, TAuth, TPreloaderContext>
}

/* L7: + authorize */
interface PageBuilderAfterAuthenticate<
	TPath extends string,
	TParams,
	TSearch,
	TAuth extends AuthenticateMode,
	TPreloaderContext,
> extends PageBuilderAfterAuthorize<TPath, TParams, TSearch, TAuth, TPreloaderContext> {
	authorize(
		fn: (
			ctx: PageAuthorizeContext<TParams, TSearch, TAuth, TPreloaderContext>,
		) => boolean | Promise<boolean>,
	): PageBuilderAfterAuthorize<TPath, TParams, TSearch, TAuth, TPreloaderContext>
}

/* L8: + authenticate */
interface PageBuilderAfterInput<
	TPath extends string,
	TParams,
	TSearch,
	TAuth extends AuthenticateMode,
	TPreloaderContext,
> extends PageBuilderAfterAuthenticate<TPath, TParams, TSearch, TAuth, TPreloaderContext> {
	authenticate(
		...args: unknown[]
	): PageBuilderAfterAuthenticate<TPath, TParams, TSearch, true, TPreloaderContext>
	authenticateOptional(
		...args: unknown[]
	): PageBuilderAfterAuthenticate<TPath, TParams, TSearch, "optional", TPreloaderContext>
}

/* L9: + input */
interface PageBuilderAfterCache<
	TPath extends string,
	TAuth extends AuthenticateMode,
	TPreloaderContext,
> extends PageBuilderAfterInput<
	TPath,
	ExtractPathParams<TPath>,
	Record<string, string>,
	TAuth,
	TPreloaderContext
> {
	input<TNewParams = ExtractPathParams<TPath>, TNewSearch = Record<string, string>>(config: {
		params?: ParamsValidator<TNewParams>
		searchParams?: SearchParamsValidator<TNewSearch>
	}): PageBuilderAfterInput<TPath, TNewParams, TNewSearch, TAuth, TPreloaderContext>
}

/* L10a: after intercept — + cache only (no re-intercept) */
interface PageBuilderAfterIntercept<
	TPath extends string,
	TAuth extends AuthenticateMode = false,
	TPreloaderContext = {},
> extends PageBuilderAfterCache<TPath, TAuth, TPreloaderContext> {
	cache(config: CacheConfig<TPath>): PageBuilderAfterCache<TPath, TAuth, TPreloaderContext>
}

/* L10b: initial — + cache + intercept */
export interface PageBuilderInitial<
	TPath extends string,
	TAuth extends AuthenticateMode = false,
	TPreloaderContext = {},
> extends PageBuilderAfterIntercept<TPath, TAuth, TPreloaderContext> {
	intercept(config: InterceptConfig): PageBuilderAfterIntercept<TPath, TAuth, TPreloaderContext>
}

/* ── factory functions ──────────────────────────────────────────── */

type PageResult<
	TPath extends string,
	TParams,
	TSearch,
	TAuth extends AuthenticateMode,
	TPreloaderContext,
	TLoaderData,
	TSet extends keyof PageBoundaryPropsMap<TParams, TSearch> = never,
> = PageResultCore<TPath, TParams, TSearch, TAuth, TPreloaderContext, TLoaderData> &
	PageAfterRender<TPath, TParams, TSearch, TAuth, TPreloaderContext, TLoaderData, TSet>

function boundarySlot<TProps>(
	existing: ((props: TProps) => unknown) | undefined,
	make: () => (fn: (props: TProps) => unknown) => unknown,
): unknown {
	if (existing) return existing
	const builder = make()
	Object.defineProperty(builder, BUILDER_MARKER, { value: true })
	return builder
}

function createResultWithBoundaries<
	TPath extends string,
	TParams,
	TSearch,
	TAuth extends AuthenticateMode,
	TPreloaderContext,
	TLoaderData,
	TSet extends keyof PageBoundaryPropsMap<TParams, TSearch> = never,
>(
	state: BuilderStateInternal,
	renderFn: (props: PageRenderProps<TParams, TSearch, TPreloaderContext, TLoaderData>) => unknown,
	errorFn?: (props: PageErrorRenderProps<TParams, TSearch>) => unknown,
	notFoundFn?: (props: PageNotFoundRenderProps<TParams, TSearch>) => unknown,
	unauthenticatedFn?: (props: PageUnauthenticatedRenderProps<TParams, TSearch>) => unknown,
	unauthorizedFn?: (props: PageUnauthorizedRenderProps<TParams, TSearch>) => unknown,
): PageResult<TPath, TParams, TSearch, TAuth, TPreloaderContext, TLoaderData, TSet> {
	return {
		_type: "render" as const,
		authenticate: state.authenticate,
		authenticateMode: state.authenticateMode,
		authorize: state.authorize,
		cache: state.cache,
		effectsConfig: state.effectsConfig,
		errorRender: boundarySlot(
			errorFn,
			() => (fn) =>
				createResultWithBoundaries<TPath, TParams, TSearch, TAuth, TPreloaderContext, TLoaderData>(
					state,
					renderFn,
					fn,
					notFoundFn,
					unauthenticatedFn,
					unauthorizedFn,
				),
		),
		head: state.head,
		headReplace: state.headReplace,
		headers: state.headers,
		inputConfig: state.inputConfig,
		intercept: state.intercept,
		loader: state.loader,
		notFoundRender: boundarySlot(
			notFoundFn,
			() => (fn) =>
				createResultWithBoundaries<TPath, TParams, TSearch, TAuth, TPreloaderContext, TLoaderData>(
					state,
					renderFn,
					errorFn,
					fn,
					unauthenticatedFn,
					unauthorizedFn,
				),
		),
		preloader: state.preloader,
		render: renderFn,
		unauthenticatedRender: boundarySlot(
			unauthenticatedFn,
			() => (fn) =>
				createResultWithBoundaries<TPath, TParams, TSearch, TAuth, TPreloaderContext, TLoaderData>(
					state,
					renderFn,
					errorFn,
					notFoundFn,
					fn,
					unauthorizedFn,
				),
		),
		unauthorizedRender: boundarySlot(
			unauthorizedFn,
			() => (fn) =>
				createResultWithBoundaries<TPath, TParams, TSearch, TAuth, TPreloaderContext, TLoaderData>(
					state,
					renderFn,
					errorFn,
					notFoundFn,
					unauthenticatedFn,
					fn,
				),
		),
		virtualPath: state.virtualPath,
	} as unknown as PageResult<TPath, TParams, TSearch, TAuth, TPreloaderContext, TLoaderData, TSet>
}

function createBuilderRenderOnly<
	TPath extends string,
	TParams,
	TSearch,
	TAuth extends AuthenticateMode,
	TPreloaderContext,
	TLoaderData,
>(
	state: BuilderStateInternal,
): PageBuilderRenderOnly<TPath, TParams, TSearch, TAuth, TPreloaderContext, TLoaderData> {
	return {
		render(fn) {
			return createResultWithBoundaries<
				TPath,
				TParams,
				TSearch,
				TAuth,
				TPreloaderContext,
				TLoaderData
			>(state, fn)
		},
	}
}

function createBuilderWithHeaders<
	TPath extends string,
	TParams,
	TSearch,
	TAuth extends AuthenticateMode,
	TPreloaderContext,
	TLoaderData,
>(
	state: BuilderStateInternal,
): PageBuilderWithHeaders<TPath, TParams, TSearch, TAuth, TPreloaderContext, TLoaderData> {
	return {
		...createBuilderRenderOnly<TPath, TParams, TSearch, TAuth, TPreloaderContext, TLoaderData>(
			state,
		),
		headers(fn) {
			return createBuilderRenderOnly<
				TPath,
				TParams,
				TSearch,
				TAuth,
				TPreloaderContext,
				TLoaderData
			>({ ...state, headers: fn })
		},
	}
}

function createBuilderWithHead<
	TPath extends string,
	TParams,
	TSearch,
	TAuth extends AuthenticateMode,
	TPreloaderContext,
	TLoaderData,
>(
	state: BuilderStateInternal,
): PageBuilderWithHead<TPath, TParams, TSearch, TAuth, TPreloaderContext, TLoaderData> {
	return {
		...createBuilderWithHeaders<TPath, TParams, TSearch, TAuth, TPreloaderContext, TLoaderData>(
			state,
		),
		head(fn, options) {
			return createBuilderWithHeaders<
				TPath,
				TParams,
				TSearch,
				TAuth,
				TPreloaderContext,
				TLoaderData
			>({ ...state, head: fn, headReplace: options?.replace })
		},
	}
}

function createBuilderWithLoader<
	TPath extends string,
	TParams,
	TSearch,
	TAuth extends AuthenticateMode,
	TPreloaderContext,
>(
	state: BuilderStateInternal,
): PageBuilderWithLoader<TPath, TParams, TSearch, TAuth, TPreloaderContext> {
	return {
		head(fn, options) {
			return createBuilderWithHeaders<TPath, TParams, TSearch, TAuth, TPreloaderContext, void>({
				...state,
				head: fn,
				headReplace: options?.replace,
			})
		},
		headers(fn) {
			return createBuilderRenderOnly<TPath, TParams, TSearch, TAuth, TPreloaderContext, void>({
				...state,
				headers: fn,
			})
		},
		loader<T>(
			fn: (ctx: PageLoaderContext<TParams, TSearch, TAuth, TPreloaderContext>) => Promise<T> | T,
		) {
			return createBuilderWithHead<TPath, TParams, TSearch, TAuth, TPreloaderContext, Awaited<T>>({
				...state,
				loader: fn,
			})
		},
		render(fn) {
			return createResultWithBoundaries<TPath, TParams, TSearch, TAuth, TPreloaderContext, void>(
				state,
				fn,
			)
		},
		response(fn) {
			return {
				_type: "response" as const,
				authenticate: state.authenticate,
				authenticateMode: state.authenticateMode,
				authorize: state.authorize,
				cache: state.cache,
				effectsConfig: state.effectsConfig,
				inputConfig: state.inputConfig,
				preloader: state.preloader,
				response: fn,
				virtualPath: state.virtualPath as TPath,
			} as PageResultResponse<TPath, TParams, TSearch, TAuth, TPreloaderContext>
		},
	}
}

function createBuilderAfterPreloader<
	TPath extends string,
	TParams,
	TSearch,
	TAuth extends AuthenticateMode,
	TPreloaderContext,
>(
	state: BuilderStateInternal,
): PageBuilderAfterPreloader<TPath, TParams, TSearch, TAuth, TPreloaderContext> {
	return {
		head(fn, options) {
			return createBuilderWithHeaders<TPath, TParams, TSearch, TAuth, TPreloaderContext, void>({
				...state,
				head: fn,
				headReplace: options?.replace,
			})
		},
		headers(fn) {
			return createBuilderRenderOnly<TPath, TParams, TSearch, TAuth, TPreloaderContext, void>({
				...state,
				headers: fn,
			})
		},
		loader<T>(
			fn: (ctx: PageLoaderContext<TParams, TSearch, TAuth, TPreloaderContext>) => Promise<T> | T,
		) {
			return createBuilderWithHead<TPath, TParams, TSearch, TAuth, TPreloaderContext, Awaited<T>>({
				...state,
				loader: fn,
			})
		},
		render(fn) {
			return createResultWithBoundaries<TPath, TParams, TSearch, TAuth, TPreloaderContext, void>(
				state,
				fn,
			)
		},
	}
}

function createBuilderWithPreloader<
	TPath extends string,
	TParams,
	TSearch,
	TAuth extends AuthenticateMode,
	TPreloaderContext,
>(
	state: BuilderStateInternal,
): PageBuilderWithPreloader<TPath, TParams, TSearch, TAuth, TPreloaderContext> {
	return {
		...createBuilderWithLoader<TPath, TParams, TSearch, TAuth, TPreloaderContext>(state),
		preloader<T extends Record<string, unknown>>(
			fn: (ctx: PagePreloaderContext<TParams, TSearch, TAuth, TPreloaderContext>) => Promise<T> | T,
		) {
			return createBuilderAfterPreloader<
				TPath,
				TParams,
				TSearch,
				TAuth,
				TPreloaderContext & Awaited<T>
			>({ ...state, preloader: fn })
		},
	}
}

function createBuilderAfterAuthorize<
	TPath extends string,
	TParams,
	TSearch,
	TAuth extends AuthenticateMode,
	TPreloaderContext,
>(
	state: BuilderStateInternal,
): PageBuilderAfterAuthorize<TPath, TParams, TSearch, TAuth, TPreloaderContext> {
	return {
		...createBuilderWithPreloader<TPath, TParams, TSearch, TAuth, TPreloaderContext>(state),
		effects(config) {
			return createBuilderWithPreloader<TPath, TParams, TSearch, TAuth, TPreloaderContext>({
				...state,
				effectsConfig: config,
			})
		},
	}
}

function createBuilderAfterAuthenticate<
	TPath extends string,
	TParams,
	TSearch,
	TAuth extends AuthenticateMode,
	TPreloaderContext,
>(
	state: BuilderStateInternal,
): PageBuilderAfterAuthenticate<TPath, TParams, TSearch, TAuth, TPreloaderContext> {
	return {
		...createBuilderAfterAuthorize<TPath, TParams, TSearch, TAuth, TPreloaderContext>(state),
		authorize(fn) {
			return createBuilderAfterAuthorize<TPath, TParams, TSearch, TAuth, TPreloaderContext>({
				...state,
				authorize: fn,
			})
		},
	}
}

function createBuilderAfterInput<
	TPath extends string,
	TParams,
	TSearch,
	TAuth extends AuthenticateMode,
	TPreloaderContext,
>(
	state: BuilderStateInternal,
): PageBuilderAfterInput<TPath, TParams, TSearch, TAuth, TPreloaderContext> {
	return {
		...createBuilderAfterAuthenticate<TPath, TParams, TSearch, TAuth, TPreloaderContext>(state),
		authenticate(...args: unknown[]) {
			return createBuilderAfterAuthenticate<TPath, TParams, TSearch, true, TPreloaderContext>({
				...state,
				authenticate: args,
				authenticateMode: true,
			})
		},
		authenticateOptional(...args: unknown[]) {
			return createBuilderAfterAuthenticate<TPath, TParams, TSearch, "optional", TPreloaderContext>(
				{
					...state,
					authenticate: args,
					authenticateMode: "optional",
				},
			)
		},
	}
}

function createBuilderAfterCache<
	TPath extends string,
	TAuth extends AuthenticateMode,
	TPreloaderContext,
>(state: BuilderStateInternal): PageBuilderAfterCache<TPath, TAuth, TPreloaderContext> {
	return {
		...createBuilderAfterInput<
			TPath,
			ExtractPathParams<TPath>,
			Record<string, string>,
			TAuth,
			TPreloaderContext
		>(state),
		input<TNewParams = ExtractPathParams<TPath>, TNewSearch = Record<string, string>>(config: {
			params?: ParamsValidator<TNewParams>
			searchParams?: SearchParamsValidator<TNewSearch>
		}) {
			return createBuilderAfterInput<TPath, TNewParams, TNewSearch, TAuth, TPreloaderContext>({
				...state,
				inputConfig: config,
			})
		},
	}
}

function createBuilderAfterIntercept<
	TPath extends string,
	TAuth extends AuthenticateMode,
	TPreloaderContext,
>(state: BuilderStateInternal): PageBuilderAfterIntercept<TPath, TAuth, TPreloaderContext> {
	return {
		...createBuilderAfterCache<TPath, TAuth, TPreloaderContext>(state),
		cache(config) {
			return createBuilderAfterCache<TPath, TAuth, TPreloaderContext>({
				...state,
				cache: config,
			})
		},
	}
}

function createBuilderInitialFromState<
	TPath extends string,
	TAuth extends AuthenticateMode,
	TPreloaderContext,
>(state: BuilderStateInternal): PageBuilderInitial<TPath, TAuth, TPreloaderContext> {
	return {
		...createBuilderAfterIntercept<TPath, TAuth, TPreloaderContext>(state),
		intercept(config) {
			return createBuilderAfterIntercept<TPath, TAuth, TPreloaderContext>({
				...state,
				intercept: config,
			})
		},
	}
}

function createBuilderInitial<
	TPath extends string,
	TAuth extends AuthenticateMode,
	TPreloaderContext,
>(virtualPath: TPath): PageBuilderInitial<TPath, TAuth, TPreloaderContext> {
	const state: BuilderStateInternal = { virtualPath }
	return createBuilderInitialFromState<TPath, TAuth, TPreloaderContext>(state)
}

/* ── public API ─────────────────────────────────────────────────── */

export function createPage<TPath extends string>(
	virtualPath: TPath,
): PageBuilderInitial<TPath, ParentAuthResolution<TPath>, ParentPreloaderContext<TPath>> {
	return createBuilderInitial<TPath, ParentAuthResolution<TPath>, ParentPreloaderContext<TPath>>(
		virtualPath,
	)
}
