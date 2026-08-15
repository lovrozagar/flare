import type { JSX } from "solid-js";
import type { FlareRouter } from "../outlet/types.ts";
import type { Location } from "../router-primitives/index.ts";
import type { ResolvedAuth, ResolvedEnv, ResolvedQueryClient, ResolvedServerContext } from "./register.ts";
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
} from "./types.ts";

/* ── callback context types (root-specific) ─────────────────────── */

/* no preloaderContext — root has no parent */
export interface RootAuthorizeContext<TParams, TSearch, TAuth extends AuthenticateMode>
	extends ServerThrowHelpers, ServerUrlHelpers {
	abortController: AbortController;
	auth: ResolvedAuth<TAuth>;
	env: ResolvedEnv;
	locale: () => string;
	location: Location<TParams, TSearch>;
	request: Request;
	serverContext: ResolvedServerContext;
}

/* no preloaderContext — root has no parent */
export interface RootPreloaderContext<TParams, TSearch, TAuth extends AuthenticateMode>
	extends ServerThrowHelpers, ServerUrlHelpers {
	abortController: AbortController;
	auth: ResolvedAuth<TAuth>;
	env: ResolvedEnv;
	locale: () => string;
	location: Location<TParams, TSearch>;
	request: Request;
	serverContext: ResolvedServerContext;
}

/* root loader DOES get preloaderContext (from root's own preloader) */
export type RootLoaderContext<
	TParams,
	TSearch,
	TAuth extends AuthenticateMode,
	TPreloaderContext,
> = ServerThrowHelpers &
	ServerUrlHelpers &
	ResolvedQueryClient & {
		abortController: AbortController;
		auth: ResolvedAuth<TAuth>;
		cause: LoaderCause;
		defer: DeferFn;
		deps: unknown[];
		env: ResolvedEnv;
		locale: () => string;
		location: Location<TParams, TSearch>;
		prefetch: boolean;
		preloaderContext: TPreloaderContext;
		request: Request;
		serverContext: ResolvedServerContext;
	};

/* no parentHead — root IS the base */
export interface RootHeadContext<TParams, TSearch, TPreloaderContext, TLoaderData> extends ServerUrlHelpers {
	cause: LoaderCause;
	loaderData: TLoaderData;
	location: Location<TParams, TSearch>;
	prefetch: boolean;
	preloaderContext: TPreloaderContext;
	serverContext: ResolvedServerContext;
}

/* no parentHeaders — root IS the base */
export interface RootHeadersContext<TParams, TSearch, TPreloaderContext, TLoaderData> extends ServerUrlHelpers {
	cause: LoaderCause;
	env: ResolvedEnv;
	loaderData: TLoaderData;
	location: Location<TParams, TSearch>;
	prefetch: boolean;
	preloaderContext: TPreloaderContext;
	request: Request;
	serverContext: ResolvedServerContext;
}

export interface RootRenderProps<TParams, TSearch, TPreloaderContext, TLoaderData> {
	children: JSX.Element;
	loaderData: TLoaderData;
	location: Location<TParams, TSearch>;
	preloaderContext: TPreloaderContext;
	router: FlareRouter;
}

export interface RootErrorRenderProps<TParams, TSearch> {
	error: Error;
	location: Location<TParams, TSearch>;
	reset: () => void;
	retry: () => void;
}

export interface RootNotFoundRenderProps<TParams, TSearch> {
	location: Location<TParams, TSearch>;
}

export interface RootUnauthenticatedRenderProps<TParams, TSearch> {
	error: Error;
	location: Location<TParams, TSearch>;
	retry: () => void;
}

export interface RootUnauthorizedRenderProps<TParams, TSearch> {
	error: Error;
	location: Location<TParams, TSearch>;
	retry: () => void;
}

/* ── result type ────────────────────────────────────────────────── */

export interface RootLayoutResult<
	TPath extends string,
	TParams,
	TSearch,
	TAuth extends AuthenticateMode,
	TPreloaderContext,
	TLoaderData,
> {
	_type: "root-layout";
	authenticate?: unknown[];
	authenticateMode?: AuthenticateMode;
	authorize?: (ctx: RootAuthorizeContext<TParams, TSearch, TAuth>) => boolean | Promise<boolean>;
	effectsConfig?: EffectsConfig<TParams, TSearch>;
	errorRender?: (props: RootErrorRenderProps<TParams, TSearch>) => unknown;
	head?: (ctx: RootHeadContext<TParams, TSearch, TPreloaderContext, TLoaderData>) => HeadConfig;
	headReplace?: boolean;
	headers?: (ctx: RootHeadersContext<TParams, TSearch, TPreloaderContext, TLoaderData>) => ResponseHeaders;
	inputConfig?: InputConfig<TParams, TSearch>;
	loader?: (ctx: RootLoaderContext<TParams, TSearch, TAuth, TPreloaderContext>) => Promise<TLoaderData> | TLoaderData;
	notFoundRender?: (props: RootNotFoundRenderProps<TParams, TSearch>) => unknown;
	cache?: CacheConfig<TPath>;
	preloader?: (ctx: RootPreloaderContext<TParams, TSearch, TAuth>) => unknown;
	render: (props: RootRenderProps<TParams, TSearch, TPreloaderContext, TLoaderData>) => unknown;
	unauthenticatedRender?: (props: RootUnauthenticatedRenderProps<TParams, TSearch>) => unknown;
	unauthorizedRender?: (props: RootUnauthorizedRenderProps<TParams, TSearch>) => unknown;
	virtualPath: TPath;
}

/* ── internal builder state ─────────────────────────────────────── */

interface BuilderStateInternal {
	authenticate?: unknown[];
	authenticateMode?: AuthenticateMode;
	authorize?: unknown;
	cache?: unknown;
	effectsConfig?: unknown;
	head?: unknown;
	headReplace?: boolean;
	headers?: unknown;
	inputConfig?: unknown;
	loader?: unknown;
	preloader?: unknown;
	virtualPath: string;
}

/* ── progressive builder interfaces ─────────────────────────────── */

/* after render: boundary methods (any order, each at most once) */
interface RootBoundaryPropsMap<TParams, TSearch> {
	errorRender: RootErrorRenderProps<TParams, TSearch>;
	notFoundRender: RootNotFoundRenderProps<TParams, TSearch>;
	unauthenticatedRender: RootUnauthenticatedRenderProps<TParams, TSearch>;
	unauthorizedRender: RootUnauthorizedRenderProps<TParams, TSearch>;
}

type RootAfterRender<
	TPath extends string,
	TParams,
	TSearch,
	TAuth extends AuthenticateMode,
	TPreloaderContext,
	TLoaderData,
	TSet extends keyof RootBoundaryPropsMap<TParams, TSearch> = never,
> = {
	[K in Exclude<keyof RootBoundaryPropsMap<TParams, TSearch>, TSet>]: (
		fn: (props: RootBoundaryPropsMap<TParams, TSearch>[K]) => unknown,
	) => RootLayoutResult<TPath, TParams, TSearch, TAuth, TPreloaderContext, TLoaderData> &
		RootAfterRender<TPath, TParams, TSearch, TAuth, TPreloaderContext, TLoaderData, TSet | K>;
};

/* L1: render only */
interface RootBuilderRenderOnly<
	TPath extends string,
	TParams,
	TSearch,
	TAuth extends AuthenticateMode,
	TPreloaderContext,
	TLoaderData,
> {
	render(
		fn: (props: RootRenderProps<TParams, TSearch, TPreloaderContext, TLoaderData>) => unknown,
	): RootLayoutResult<TPath, TParams, TSearch, TAuth, TPreloaderContext, TLoaderData> &
		RootAfterRender<TPath, TParams, TSearch, TAuth, TPreloaderContext, TLoaderData>;
}

/* L2: + headers */
interface RootBuilderWithHeaders<
	TPath extends string,
	TParams,
	TSearch,
	TAuth extends AuthenticateMode,
	TPreloaderContext,
	TLoaderData,
> extends RootBuilderRenderOnly<TPath, TParams, TSearch, TAuth, TPreloaderContext, TLoaderData> {
	headers(
		fn: (ctx: RootHeadersContext<TParams, TSearch, TPreloaderContext, TLoaderData>) => ResponseHeaders,
	): RootBuilderRenderOnly<TPath, TParams, TSearch, TAuth, TPreloaderContext, TLoaderData>;
}

/* L3: + head */
interface RootBuilderWithHead<
	TPath extends string,
	TParams,
	TSearch,
	TAuth extends AuthenticateMode,
	TPreloaderContext,
	TLoaderData,
> extends RootBuilderWithHeaders<TPath, TParams, TSearch, TAuth, TPreloaderContext, TLoaderData> {
	head(
		fn: (ctx: RootHeadContext<TParams, TSearch, TPreloaderContext, TLoaderData>) => HeadConfig,
		options?: HeadOptions,
	): RootBuilderWithHeaders<TPath, TParams, TSearch, TAuth, TPreloaderContext, TLoaderData>;
}

/* L4: loader + head/headers/render with void */
interface RootBuilderWithLoader<
	TPath extends string,
	TParams,
	TSearch,
	TAuth extends AuthenticateMode,
	TPreloaderContext,
> {
	head(
		fn: (ctx: RootHeadContext<TParams, TSearch, TPreloaderContext, void>) => HeadConfig,
		options?: HeadOptions,
	): RootBuilderWithHeaders<TPath, TParams, TSearch, TAuth, TPreloaderContext, void>;
	headers(
		fn: (ctx: RootHeadersContext<TParams, TSearch, TPreloaderContext, void>) => ResponseHeaders,
	): RootBuilderRenderOnly<TPath, TParams, TSearch, TAuth, TPreloaderContext, void>;
	loader<T>(
		fn: (ctx: RootLoaderContext<TParams, TSearch, TAuth, TPreloaderContext>) => Promise<T> | T,
	): RootBuilderWithHead<TPath, TParams, TSearch, TAuth, TPreloaderContext, Awaited<T>>;
	render(
		fn: (props: RootRenderProps<TParams, TSearch, TPreloaderContext, void>) => unknown,
	): RootLayoutResult<TPath, TParams, TSearch, TAuth, TPreloaderContext, void> &
		RootAfterRender<TPath, TParams, TSearch, TAuth, TPreloaderContext, void>;
}

/* L5: + preloader (root-specific: fn receives no preloaderContext) */
interface RootBuilderWithPreloader<
	TPath extends string,
	TParams,
	TSearch,
	TAuth extends AuthenticateMode,
> extends RootBuilderWithLoader<TPath, TParams, TSearch, TAuth, {}> {
	preloader<T extends Record<string, unknown>>(
		fn: (ctx: RootPreloaderContext<TParams, TSearch, TAuth>) => Promise<T> | T,
	): RootBuilderWithLoader<TPath, TParams, TSearch, TAuth, Awaited<T>>;
}

/* L6: + effects */
interface RootBuilderAfterAuthorize<
	TPath extends string,
	TParams,
	TSearch,
	TAuth extends AuthenticateMode,
> extends RootBuilderWithPreloader<TPath, TParams, TSearch, TAuth> {
	effects(config: EffectsConfig<TParams, TSearch>): RootBuilderWithPreloader<TPath, TParams, TSearch, TAuth>;
}

/* L7: + authorize (root-specific: no preloaderContext in ctx) */
interface RootBuilderAfterAuthenticate<
	TPath extends string,
	TParams,
	TSearch,
	TAuth extends AuthenticateMode,
> extends RootBuilderAfterAuthorize<TPath, TParams, TSearch, TAuth> {
	authorize(
		fn: (ctx: RootAuthorizeContext<TParams, TSearch, TAuth>) => boolean | Promise<boolean>,
	): RootBuilderAfterAuthorize<TPath, TParams, TSearch, TAuth>;
}

/* L8: + authenticate */
interface RootBuilderAfterInput<TPath extends string, TParams, TSearch> extends RootBuilderAfterAuthenticate<
	TPath,
	TParams,
	TSearch,
	false
> {
	authenticate(...args: unknown[]): RootBuilderAfterAuthenticate<TPath, TParams, TSearch, true>;
	authenticateOptional(...args: unknown[]): RootBuilderAfterAuthenticate<TPath, TParams, TSearch, "optional">;
}

/* L9: + input */
interface RootBuilderAfterCache<TPath extends string> extends RootBuilderAfterInput<
	TPath,
	Record<string, string>,
	Record<string, string>
> {
	input<
		PV extends ParamsValidator<unknown> | undefined = undefined,
		SV extends SearchParamsValidator<unknown> | undefined = undefined,
	>(config: {
		params?: PV;
		searchParams?: SV;
	}): RootBuilderAfterInput<
		TPath,
		PV extends ParamsValidator<infer P> ? P : Record<string, string>,
		SV extends SearchParamsValidator<infer S> ? S : Record<string, string>
	>;
}

/* L10: initial */
export interface RootLayoutBuilderInitial<TPath extends string> extends RootBuilderAfterCache<TPath> {
	cache(config: CacheConfig<TPath>): RootBuilderAfterCache<TPath>;
}

type RootLayoutResultFull<
	TPath extends string,
	TParams,
	TSearch,
	TAuth extends AuthenticateMode,
	TPreloaderContext,
	TLoaderData,
> = RootLayoutResult<TPath, TParams, TSearch, TAuth, TPreloaderContext, TLoaderData> &
	RootAfterRender<TPath, TParams, TSearch, TAuth, TPreloaderContext, TLoaderData>;

/* ── factory functions ──────────────────────────────────────────── */

function createResultWithBoundaries<
	TPath extends string,
	TParams,
	TSearch,
	TAuth extends AuthenticateMode,
	TPreloaderContext,
	TLoaderData,
>(
	state: BuilderStateInternal,
	renderFn: (props: RootRenderProps<TParams, TSearch, TPreloaderContext, TLoaderData>) => unknown,
	errorFn?: (props: RootErrorRenderProps<TParams, TSearch>) => unknown,
	notFoundFn?: (props: RootNotFoundRenderProps<TParams, TSearch>) => unknown,
	unauthenticatedFn?: (props: RootUnauthenticatedRenderProps<TParams, TSearch>) => unknown,
	unauthorizedFn?: (props: RootUnauthorizedRenderProps<TParams, TSearch>) => unknown,
): RootLayoutResultFull<TPath, TParams, TSearch, TAuth, TPreloaderContext, TLoaderData> {
	function boundarySlot<TProps>(
		existing: ((props: TProps) => unknown) | undefined,
		make: () => (fn: (props: TProps) => unknown) => unknown,
	): unknown {
		if (existing) return existing;
		const builder = make();
		Object.defineProperty(builder, BUILDER_MARKER, { value: true });
		return builder;
	}

	return {
		_type: "root-layout" as const,
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
	} as RootLayoutResultFull<TPath, TParams, TSearch, TAuth, TPreloaderContext, TLoaderData>;
}

function createBuilderRenderOnly<
	TPath extends string,
	TParams,
	TSearch,
	TAuth extends AuthenticateMode,
	TPreloaderContext,
	TLoaderData,
>(state: BuilderStateInternal): RootBuilderRenderOnly<TPath, TParams, TSearch, TAuth, TPreloaderContext, TLoaderData> {
	return {
		render(fn) {
			return createResultWithBoundaries<TPath, TParams, TSearch, TAuth, TPreloaderContext, TLoaderData>(state, fn);
		},
	};
}

function createBuilderWithHeaders<
	TPath extends string,
	TParams,
	TSearch,
	TAuth extends AuthenticateMode,
	TPreloaderContext,
	TLoaderData,
>(state: BuilderStateInternal): RootBuilderWithHeaders<TPath, TParams, TSearch, TAuth, TPreloaderContext, TLoaderData> {
	return {
		...createBuilderRenderOnly<TPath, TParams, TSearch, TAuth, TPreloaderContext, TLoaderData>(state),
		headers(fn) {
			return createBuilderRenderOnly<TPath, TParams, TSearch, TAuth, TPreloaderContext, TLoaderData>({
				...state,
				headers: fn,
			});
		},
	};
}

function createBuilderWithHead<
	TPath extends string,
	TParams,
	TSearch,
	TAuth extends AuthenticateMode,
	TPreloaderContext,
	TLoaderData,
>(state: BuilderStateInternal): RootBuilderWithHead<TPath, TParams, TSearch, TAuth, TPreloaderContext, TLoaderData> {
	return {
		...createBuilderWithHeaders<TPath, TParams, TSearch, TAuth, TPreloaderContext, TLoaderData>(state),
		head(fn, options) {
			return createBuilderWithHeaders<TPath, TParams, TSearch, TAuth, TPreloaderContext, TLoaderData>({
				...state,
				head: fn,
				headReplace: options?.replace,
			});
		},
	};
}

function createBuilderWithLoader<
	TPath extends string,
	TParams,
	TSearch,
	TAuth extends AuthenticateMode,
	TPreloaderContext,
>(state: BuilderStateInternal): RootBuilderWithLoader<TPath, TParams, TSearch, TAuth, TPreloaderContext> {
	return {
		head(fn, options) {
			return createBuilderWithHeaders<TPath, TParams, TSearch, TAuth, TPreloaderContext, void>({
				...state,
				head: fn,
				headReplace: options?.replace,
			});
		},
		headers(fn) {
			return createBuilderRenderOnly<TPath, TParams, TSearch, TAuth, TPreloaderContext, void>({
				...state,
				headers: fn,
			});
		},
		loader<T>(fn: (ctx: RootLoaderContext<TParams, TSearch, TAuth, TPreloaderContext>) => Promise<T> | T) {
			return createBuilderWithHead<TPath, TParams, TSearch, TAuth, TPreloaderContext, Awaited<T>>({
				...state,
				loader: fn,
			});
		},
		render(fn) {
			return createResultWithBoundaries<TPath, TParams, TSearch, TAuth, TPreloaderContext, void>(state, fn);
		},
	};
}

function createBuilderWithPreloader<TPath extends string, TParams, TSearch, TAuth extends AuthenticateMode>(
	state: BuilderStateInternal,
): RootBuilderWithPreloader<TPath, TParams, TSearch, TAuth> {
	return {
		...createBuilderWithLoader<TPath, TParams, TSearch, TAuth, {}>(state),
		preloader<T extends Record<string, unknown>>(
			fn: (ctx: RootPreloaderContext<TParams, TSearch, TAuth>) => Promise<T> | T,
		) {
			return createBuilderWithLoader<TPath, TParams, TSearch, TAuth, Awaited<T>>({
				...state,
				preloader: fn,
			});
		},
	};
}

function createBuilderAfterAuthorize<TPath extends string, TParams, TSearch, TAuth extends AuthenticateMode>(
	state: BuilderStateInternal,
): RootBuilderAfterAuthorize<TPath, TParams, TSearch, TAuth> {
	return {
		...createBuilderWithPreloader<TPath, TParams, TSearch, TAuth>(state),
		effects(config) {
			return createBuilderWithPreloader<TPath, TParams, TSearch, TAuth>({
				...state,
				effectsConfig: config,
			});
		},
	};
}

function createBuilderAfterAuthenticate<TPath extends string, TParams, TSearch, TAuth extends AuthenticateMode>(
	state: BuilderStateInternal,
): RootBuilderAfterAuthenticate<TPath, TParams, TSearch, TAuth> {
	return {
		...createBuilderAfterAuthorize<TPath, TParams, TSearch, TAuth>(state),
		authorize(fn) {
			return createBuilderAfterAuthorize<TPath, TParams, TSearch, TAuth>({
				...state,
				authorize: fn,
			});
		},
	};
}

function createBuilderAfterInput<TPath extends string, TParams, TSearch>(
	state: BuilderStateInternal,
): RootBuilderAfterInput<TPath, TParams, TSearch> {
	return {
		...createBuilderAfterAuthenticate<TPath, TParams, TSearch, false>(state),
		authenticate(...args: unknown[]) {
			return createBuilderAfterAuthenticate<TPath, TParams, TSearch, true>({
				...state,
				authenticate: args,
				authenticateMode: true,
			});
		},
		authenticateOptional(...args: unknown[]) {
			return createBuilderAfterAuthenticate<TPath, TParams, TSearch, "optional">({
				...state,
				authenticate: args,
				authenticateMode: "optional",
			});
		},
	};
}

function createBuilderAfterCache<TPath extends string>(state: BuilderStateInternal): RootBuilderAfterCache<TPath> {
	const base = createBuilderAfterInput<TPath, Record<string, string>, Record<string, string>>(state);
	return Object.assign(base, {
		input(config: { params?: ParamsValidator<unknown>; searchParams?: SearchParamsValidator<unknown> }) {
			return createBuilderAfterInput({ ...state, inputConfig: config });
		},
	}) as RootBuilderAfterCache<TPath>;
}

/* ── public API ─────────────────────────────────────────────────── */

export function createRootLayout<TPath extends string>(virtualPath: TPath): RootLayoutBuilderInitial<TPath> {
	const state: BuilderStateInternal = { virtualPath };
	return {
		...createBuilderAfterCache<TPath>(state),
		cache(config) {
			return createBuilderAfterCache<TPath>({ ...state, cache: config });
		},
	};
}
