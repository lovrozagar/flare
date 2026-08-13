import type { JSX } from "solid-js"
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

export interface LayoutAuthorizeContext<
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

export interface LayoutPreloaderContext<
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

export type LayoutLoaderContext<
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

export interface LayoutHeadContext<
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

export interface LayoutHeadersContext<
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

export interface LayoutRenderProps<TParams, TSearch, TPreloaderContext, TLoaderData> {
	children: JSX.Element
	loaderData: TLoaderData
	location: Location<TParams, TSearch>
	preloaderContext: TPreloaderContext
	router: FlareRouter
}

export interface LayoutErrorRenderProps<TParams, TSearch> {
	error: Error
	location: Location<TParams, TSearch>
	reset: () => void
	retry: () => void
}

export interface LayoutNotFoundRenderProps<TParams, TSearch> {
	location: Location<TParams, TSearch>
}

export interface LayoutUnauthenticatedRenderProps<TParams, TSearch> {
	error: Error
	location: Location<TParams, TSearch>
	retry: () => void
}

export interface LayoutUnauthorizedRenderProps<TParams, TSearch> {
	error: Error
	location: Location<TParams, TSearch>
	retry: () => void
}

/* ── result type ────────────────────────────────────────────────── */

export interface LayoutResult<
	TPath extends string,
	TParams,
	TSearch,
	TAuth extends AuthenticateMode,
	TPreloaderContext,
	TLoaderData,
> {
	_type: "layout"
	authenticate?: unknown[]
	authenticateMode?: AuthenticateMode
	authorize?: (
		ctx: LayoutAuthorizeContext<TParams, TSearch, TAuth, TPreloaderContext>,
	) => boolean | Promise<boolean>
	effectsConfig?: EffectsConfig<TParams, TSearch>
	errorRender?: (props: LayoutErrorRenderProps<TParams, TSearch>) => unknown
	head?: (ctx: LayoutHeadContext<TParams, TSearch, TPreloaderContext, TLoaderData>) => HeadConfig
	headReplace?: boolean
	headers?: (
		ctx: LayoutHeadersContext<TParams, TSearch, TPreloaderContext, TLoaderData>,
	) => ResponseHeaders
	inputConfig?: InputConfig<TParams, TSearch>
	loader?: (
		ctx: LayoutLoaderContext<TParams, TSearch, TAuth, TPreloaderContext>,
	) => Promise<TLoaderData> | TLoaderData
	notFoundRender?: (props: LayoutNotFoundRenderProps<TParams, TSearch>) => unknown
	cache?: CacheConfig<TPath>
	preloader?: (ctx: LayoutPreloaderContext<TParams, TSearch, TAuth, TPreloaderContext>) => unknown
	render: (props: LayoutRenderProps<TParams, TSearch, TPreloaderContext, TLoaderData>) => unknown
	unauthenticatedRender?: (props: LayoutUnauthenticatedRenderProps<TParams, TSearch>) => unknown
	unauthorizedRender?: (props: LayoutUnauthorizedRenderProps<TParams, TSearch>) => unknown
	virtualPath: TPath
}

/* ── internal builder state ─────────────────────────────────────── */

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
	loader?: unknown
	preloader?: unknown
	virtualPath: string
}

/* ── progressive builder interfaces ─────────────────────────────── */

/* after render: boundary methods (any order, each at most once) */
interface LayoutBoundaryPropsMap<TParams, TSearch> {
	errorRender: LayoutErrorRenderProps<TParams, TSearch>
	notFoundRender: LayoutNotFoundRenderProps<TParams, TSearch>
	unauthenticatedRender: LayoutUnauthenticatedRenderProps<TParams, TSearch>
	unauthorizedRender: LayoutUnauthorizedRenderProps<TParams, TSearch>
}

type LayoutAfterRender<
	TPath extends string,
	TParams,
	TSearch,
	TAuth extends AuthenticateMode,
	TPreloaderContext,
	TLoaderData,
	TSet extends keyof LayoutBoundaryPropsMap<TParams, TSearch> = never,
> = {
	[K in Exclude<keyof LayoutBoundaryPropsMap<TParams, TSearch>, TSet>]: (
		fn: (props: LayoutBoundaryPropsMap<TParams, TSearch>[K]) => unknown,
	) => LayoutResult<TPath, TParams, TSearch, TAuth, TPreloaderContext, TLoaderData> &
		LayoutAfterRender<TPath, TParams, TSearch, TAuth, TPreloaderContext, TLoaderData, TSet | K>
}

/* L1: render only */
interface LayoutBuilderRenderOnly<
	TPath extends string,
	TParams,
	TSearch,
	TAuth extends AuthenticateMode,
	TPreloaderContext,
	TLoaderData,
> {
	render(
		fn: (props: LayoutRenderProps<TParams, TSearch, TPreloaderContext, TLoaderData>) => unknown,
	): LayoutResult<TPath, TParams, TSearch, TAuth, TPreloaderContext, TLoaderData> &
		LayoutAfterRender<TPath, TParams, TSearch, TAuth, TPreloaderContext, TLoaderData>
}

/* L2: + headers */
interface LayoutBuilderWithHeaders<
	TPath extends string,
	TParams,
	TSearch,
	TAuth extends AuthenticateMode,
	TPreloaderContext,
	TLoaderData,
> extends LayoutBuilderRenderOnly<TPath, TParams, TSearch, TAuth, TPreloaderContext, TLoaderData> {
	headers(
		fn: (
			ctx: LayoutHeadersContext<TParams, TSearch, TPreloaderContext, TLoaderData>,
		) => ResponseHeaders,
	): LayoutBuilderRenderOnly<TPath, TParams, TSearch, TAuth, TPreloaderContext, TLoaderData>
}

/* L3: + head */
interface LayoutBuilderWithHead<
	TPath extends string,
	TParams,
	TSearch,
	TAuth extends AuthenticateMode,
	TPreloaderContext,
	TLoaderData,
> extends LayoutBuilderWithHeaders<TPath, TParams, TSearch, TAuth, TPreloaderContext, TLoaderData> {
	head(
		fn: (ctx: LayoutHeadContext<TParams, TSearch, TPreloaderContext, TLoaderData>) => HeadConfig,
		options?: HeadOptions,
	): LayoutBuilderWithHeaders<TPath, TParams, TSearch, TAuth, TPreloaderContext, TLoaderData>
}

/* L4: loader + head/headers/render with void (no .response on layouts) */
interface LayoutBuilderWithLoader<
	TPath extends string,
	TParams,
	TSearch,
	TAuth extends AuthenticateMode,
	TPreloaderContext,
> {
	head(
		fn: (ctx: LayoutHeadContext<TParams, TSearch, TPreloaderContext, void>) => HeadConfig,
		options?: HeadOptions,
	): LayoutBuilderWithHeaders<TPath, TParams, TSearch, TAuth, TPreloaderContext, void>
	headers(
		fn: (ctx: LayoutHeadersContext<TParams, TSearch, TPreloaderContext, void>) => ResponseHeaders,
	): LayoutBuilderRenderOnly<TPath, TParams, TSearch, TAuth, TPreloaderContext, void>
	loader<T>(
		fn: (ctx: LayoutLoaderContext<TParams, TSearch, TAuth, TPreloaderContext>) => Promise<T> | T,
	): LayoutBuilderWithHead<TPath, TParams, TSearch, TAuth, TPreloaderContext, Awaited<T>>
	render(
		fn: (props: LayoutRenderProps<TParams, TSearch, TPreloaderContext, void>) => unknown,
	): LayoutResult<TPath, TParams, TSearch, TAuth, TPreloaderContext, void> &
		LayoutAfterRender<TPath, TParams, TSearch, TAuth, TPreloaderContext, void>
}

/* L5: + preloader */
interface LayoutBuilderWithPreloader<
	TPath extends string,
	TParams,
	TSearch,
	TAuth extends AuthenticateMode,
	TPreloaderContext,
> extends LayoutBuilderWithLoader<TPath, TParams, TSearch, TAuth, TPreloaderContext> {
	preloader<T extends Record<string, unknown>>(
		fn: (ctx: LayoutPreloaderContext<TParams, TSearch, TAuth, TPreloaderContext>) => Promise<T> | T,
	): LayoutBuilderWithLoader<TPath, TParams, TSearch, TAuth, TPreloaderContext & Awaited<T>>
}

/* L6: + effects */
interface LayoutBuilderAfterAuthorize<
	TPath extends string,
	TParams,
	TSearch,
	TAuth extends AuthenticateMode,
	TPreloaderContext,
> extends LayoutBuilderWithPreloader<TPath, TParams, TSearch, TAuth, TPreloaderContext> {
	effects(
		config: EffectsConfig<TParams, TSearch>,
	): LayoutBuilderWithPreloader<TPath, TParams, TSearch, TAuth, TPreloaderContext>
}

/* L7: + authorize */
interface LayoutBuilderAfterAuthenticate<
	TPath extends string,
	TParams,
	TSearch,
	TAuth extends AuthenticateMode,
	TPreloaderContext,
> extends LayoutBuilderAfterAuthorize<TPath, TParams, TSearch, TAuth, TPreloaderContext> {
	authorize(
		fn: (
			ctx: LayoutAuthorizeContext<TParams, TSearch, TAuth, TPreloaderContext>,
		) => boolean | Promise<boolean>,
	): LayoutBuilderAfterAuthorize<TPath, TParams, TSearch, TAuth, TPreloaderContext>
}

/* L8: + authenticate */
interface LayoutBuilderAfterInput<
	TPath extends string,
	TParams,
	TSearch,
	TAuth extends AuthenticateMode,
	TPreloaderContext,
> extends LayoutBuilderAfterAuthenticate<TPath, TParams, TSearch, TAuth, TPreloaderContext> {
	authenticate(
		...args: unknown[]
	): LayoutBuilderAfterAuthenticate<TPath, TParams, TSearch, true, TPreloaderContext>
	authenticateOptional(
		...args: unknown[]
	): LayoutBuilderAfterAuthenticate<TPath, TParams, TSearch, "optional", TPreloaderContext>
}

/* L9: + input */
interface LayoutBuilderAfterCache<
	TPath extends string,
	TAuth extends AuthenticateMode,
	TPreloaderContext,
> extends LayoutBuilderAfterInput<
	TPath,
	ExtractPathParams<TPath>,
	Record<string, string>,
	TAuth,
	TPreloaderContext
> {
	input<TNewParams = ExtractPathParams<TPath>, TNewSearch = Record<string, string>>(config: {
		params?: ParamsValidator<TNewParams>
		searchParams?: SearchParamsValidator<TNewSearch>
	}): LayoutBuilderAfterInput<TPath, TNewParams, TNewSearch, TAuth, TPreloaderContext>
}

/* L10: initial */
export interface LayoutBuilderInitial<
	TPath extends string,
	TAuth extends AuthenticateMode = false,
	TPreloaderContext = {},
> extends LayoutBuilderAfterCache<TPath, TAuth, TPreloaderContext> {
	cache(config: CacheConfig<TPath>): LayoutBuilderAfterCache<TPath, TAuth, TPreloaderContext>
}

/* ── factory functions ──────────────────────────────────────────── */

type LayoutResultFull<
	TPath extends string,
	TParams,
	TSearch,
	TAuth extends AuthenticateMode,
	TPreloaderContext,
	TLoaderData,
> = LayoutResult<TPath, TParams, TSearch, TAuth, TPreloaderContext, TLoaderData> &
	LayoutAfterRender<TPath, TParams, TSearch, TAuth, TPreloaderContext, TLoaderData>

function createResultWithBoundaries<
	TPath extends string,
	TParams,
	TSearch,
	TAuth extends AuthenticateMode,
	TPreloaderContext,
	TLoaderData,
>(
	state: BuilderStateInternal,
	renderFn: (props: LayoutRenderProps<TParams, TSearch, TPreloaderContext, TLoaderData>) => unknown,
	errorFn?: (props: LayoutErrorRenderProps<TParams, TSearch>) => unknown,
	notFoundFn?: (props: LayoutNotFoundRenderProps<TParams, TSearch>) => unknown,
	unauthenticatedFn?: (props: LayoutUnauthenticatedRenderProps<TParams, TSearch>) => unknown,
	unauthorizedFn?: (props: LayoutUnauthorizedRenderProps<TParams, TSearch>) => unknown,
): LayoutResultFull<TPath, TParams, TSearch, TAuth, TPreloaderContext, TLoaderData> {
	function boundarySlot<TProps>(
		existing: ((props: TProps) => unknown) | undefined,
		make: () => (fn: (props: TProps) => unknown) => unknown,
	): unknown {
		if (existing) return existing
		const builder = make()
		Object.defineProperty(builder, BUILDER_MARKER, { value: true })
		return builder
	}

	return {
		_type: "layout" as const,
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
	} as LayoutResultFull<TPath, TParams, TSearch, TAuth, TPreloaderContext, TLoaderData>
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
): LayoutBuilderRenderOnly<TPath, TParams, TSearch, TAuth, TPreloaderContext, TLoaderData> {
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
): LayoutBuilderWithHeaders<TPath, TParams, TSearch, TAuth, TPreloaderContext, TLoaderData> {
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
): LayoutBuilderWithHead<TPath, TParams, TSearch, TAuth, TPreloaderContext, TLoaderData> {
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
): LayoutBuilderWithLoader<TPath, TParams, TSearch, TAuth, TPreloaderContext> {
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
			fn: (ctx: LayoutLoaderContext<TParams, TSearch, TAuth, TPreloaderContext>) => Promise<T> | T,
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
): LayoutBuilderWithPreloader<TPath, TParams, TSearch, TAuth, TPreloaderContext> {
	return {
		...createBuilderWithLoader<TPath, TParams, TSearch, TAuth, TPreloaderContext>(state),
		preloader<T extends Record<string, unknown>>(
			fn: (
				ctx: LayoutPreloaderContext<TParams, TSearch, TAuth, TPreloaderContext>,
			) => Promise<T> | T,
		) {
			return createBuilderWithLoader<
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
): LayoutBuilderAfterAuthorize<TPath, TParams, TSearch, TAuth, TPreloaderContext> {
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
): LayoutBuilderAfterAuthenticate<TPath, TParams, TSearch, TAuth, TPreloaderContext> {
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
): LayoutBuilderAfterInput<TPath, TParams, TSearch, TAuth, TPreloaderContext> {
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
>(state: BuilderStateInternal): LayoutBuilderAfterCache<TPath, TAuth, TPreloaderContext> {
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

/* ── public API ─────────────────────────────────────────────────── */

export function createLayout<TPath extends string>(
	virtualPath: TPath,
): LayoutBuilderInitial<TPath, ParentAuthResolution<TPath>, ParentPreloaderContext<TPath>> {
	const state: BuilderStateInternal = { virtualPath }
	return {
		...createBuilderAfterCache<TPath, ParentAuthResolution<TPath>, ParentPreloaderContext<TPath>>(
			state,
		),
		cache(config) {
			return createBuilderAfterCache<
				TPath,
				ParentAuthResolution<TPath>,
				ParentPreloaderContext<TPath>
			>({ ...state, cache: config })
		},
	}
}
