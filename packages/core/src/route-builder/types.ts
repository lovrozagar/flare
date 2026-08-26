import type { Duration } from "../duration/index.ts";
import type { RedirectOptions } from "../errors/index.ts";
import type { Location } from "../router-primitives/index.ts";
import type { FlareStore, FlareStoreEntry, StaticEntryData } from "../store/index.ts";
import type { RouteParamsProps, RoutePaths, RouteSearchProps } from "./register.ts";

export type { FlareStore, FlareStoreEntry, StaticEntryData };

export type AuthenticateMode = false | "optional" | true;

/**
 * Symbol marker for route builder chain methods that look like render fns
 * but return builder objects. Used to filter them out in SSR/hydration/navigation
 * so Outlet doesn't try to call them as component render fns.
 */
export const BUILDER_MARKER = Symbol("flare-builder");

/* server-only throw helpers — attached to preloader/authorize/loader contexts */
export interface ServerThrowHelpers {
	notFound: (message?: string) => never;
	redirect: <TPath extends RoutePaths>(options: RedirectOptions<TPath>) => never;
	unauthenticated: (message?: string) => never;
	unauthorized: (message?: string) => never;
}

/* cache config */
export type PrefetchStrategy = false | "intent" | "render" | "viewport";

export interface ClientCacheConfig {
	cacheDeferred?: boolean;
	gcTime?: Duration;
	prefetch?: PrefetchStrategy;
	prefetchGcTime?: Duration;
	prefetchStaleTime?: Duration;
	staleTime?: Duration;
}

export interface SsrCacheConfig {
	key?: (ctx: { params: Record<string, string | string[]>; search: Record<string, string | string[]> }) => string;
	staleTime?: Duration;
	tags?: string[] | ((ctx: { params: Record<string, string | string[]> }) => string[]);
	ttl?: Duration;
}

export interface CdnCacheConfig {
	maxAge?: Duration;
	private?: boolean;
	swr?: Duration;
	tags?: string[] | ((ctx: { params: Record<string, string | string[]> }) => string[]);
	vary?: string[];
}

/* static/ISR route cache — conditional on path params */
type _Segment<T extends string> = T extends `[[...${infer N}]]`
	? { [K in N]: string[] | undefined }
	: T extends `[[${infer N}]]`
		? { [K in N]: string | undefined }
		: T extends `[...${infer N}]`
			? { [K in N]: string[] }
			: T extends `[${infer N}]`
				? { [K in N]: string }
				: {};

type _PathParams<T extends string> = T extends `${infer H}/${infer R}` ? _Segment<H> & _PathParams<R> : _Segment<T>;

type FlatPathParams<T extends string> = _PathParams<T> extends infer R ? { [K in keyof R]: R[K] } : never;

type HasDynamicSegments<T extends string> = T extends `${string}[${string}]${string}` ? true : false;

export type StaticDeferMode = "resolve" | "stream";

type ParamsFn<TPath extends string> = (ctx: {
	params: Record<string, string | string[]>;
}) => FlatPathParams<TPath>[] | Promise<FlatPathParams<TPath>[]>;

/**
 * SSG config — fully static at build time, no revalidation.
 *
 * - `true` — static, inherits params from parent layouts
 * - `{ defer?: ... }` — static with defer mode
 * - `(ctx) => Params[]` — static with dynamic segments (shorthand)
 * - `{ params, defer? }` — static with dynamic segments + options
 */
type SsgCacheConfig<TPath extends string> =
	| true
	| { defer?: StaticDeferMode }
	| (HasDynamicSegments<TPath> extends true
			? ParamsFn<TPath> | { defer?: StaticDeferMode; params: ParamsFn<TPath> }
			: never);

/**
 * ISR config — incremental static regeneration.
 *
 * - `true` — on-demand ISR, no build-time prerender, tag-invalidated only
 * - `{ revalidate?, defer? }` — time-based ISR, inherits params from parent layouts
 * - `{ revalidate?, params, defer?, dynamicParams? }` — ISR with dynamic segments
 *
 * When `revalidate` is omitted, pages are cached forever and only
 * refreshed via on-demand revalidation (tags/keys).
 *
 * `dynamicParams` (default `true`): when `false`, unlisted param values return 404.
 * When `true`, unlisted values fall through to on-demand SSR.
 */
type IsrCacheConfig<TPath extends string> =
	| true
	| { defer?: StaticDeferMode; revalidate?: Duration }
	| (HasDynamicSegments<TPath> extends true
			? {
					defer?: StaticDeferMode;
					dynamicParams?: boolean;
					params: ParamsFn<TPath>;
					revalidate?: Duration;
				}
			: never);

interface BaseCacheConfig {
	cdn?: CdnCacheConfig | false;
	client?: ClientCacheConfig | false;
}

/* ssg, isr, ssr are mutually exclusive rendering strategies via discriminated union */
export type CacheConfig<TPath extends string = string> = BaseCacheConfig &
	(
		| { isr: IsrCacheConfig<TPath>; ssg?: never; ssr?: never }
		| { isr?: never; ssg: SsgCacheConfig<TPath>; ssr?: never }
		| { isr?: never; ssg?: never; ssr: SsrCacheConfig }
		| { isr?: never; ssg?: never; ssr?: never }
	);

/* input validation — uses unified Validator<T> from validation module */
import type { StandardSchemaV1 } from "../validation/index.ts";

export type { Validator } from "../validation/index.ts";

/* Params validators receive Record<string, string | string[]> at runtime.
 * Standard Schema validators work directly on the plain object. */
export type ParamsValidator<T> =
	| StandardSchemaV1<T>
	| { parse: (raw: Record<string, string | string[]>) => T }
	| ((raw: Record<string, string | string[]>) => T);

/* Search params validators receive URLSearchParams at runtime.
 * Standard Schema validators get auto-converted to plain object in the pipeline. */
export type SearchParamsValidator<T> =
	| StandardSchemaV1<T>
	| { parse: (raw: URLSearchParams) => T }
	| ((raw: URLSearchParams) => T);

export interface InputConfig<TParams, TSearch> {
	params?: ParamsValidator<TParams>;
	searchParams?: SearchParamsValidator<TSearch>;
}

/* effects */
export interface EffectsContext<TParams, TSearch> {
	location: {
		current: { hash: string; params: TParams; pathname: string; search: TSearch };
		next: { hash: string; params: TParams; pathname: string; search: TSearch };
	};
	trigger: "initial" | "navigation" | "revalidation";
}

export interface EffectsConfig<TParams, TSearch> {
	loaderDeps?: (ctx: { search: TSearch }) => unknown[];
	shouldRefetch?: (ctx: EffectsContext<TParams, TSearch>) => boolean;
}

/* loader */
export type LoaderCause = "enter" | "prefetch" | "stay";

export interface Deferred<T> {
	__deferred: true;
	key: string;
	prerender?: StaticDeferMode;
	promise: Promise<T>;
}

export type DeferFn = <T>(fn: () => Promise<T>, options?: { key?: string; prerender?: StaticDeferMode }) => Deferred<T>;

/* head */
export interface SeoImage {
	alt?: string;
	height?: number;
	type?: string;
	url: string;
	width?: number;
}

export interface FaviconConfig {
	"96x96"?: string;
	"192x192"?: string;
	"512x512"?: string;
	appleTouchIcon?: string;
	ico?: string;
	svg?: string;
}

export interface RobotsConfig {
	follow?: boolean;
	index?: boolean;
	"max-image-preview"?: "large" | "none" | "standard";
	"max-snippet"?: number;
	"max-video-preview"?: number;
	noarchive?: boolean;
	noimageindex?: boolean;
}

export interface OpenGraphConfig {
	alternateLocale?: string[];
	audio?: Array<{ secureUrl?: string; type?: string; url: string }>;
	description?: string;
	images?: SeoImage[];
	locale?: string;
	siteName?: string;
	title?: string;
	type?: "article" | "product" | "profile" | "website";
	url?: string;
	videos?: Array<{
		height?: number;
		secureUrl?: string;
		type?: string;
		url: string;
		width?: number;
	}>;
}

export interface TwitterConfig {
	card?: "app" | "player" | "summary" | "summary_large_image";
	creator?: string;
	description?: string;
	images?: Array<{ alt?: string; url: string }>;
	site?: string;
	title?: string;
}

export interface MetaConfig {
	applicationName?: string;
	appleMobileWebAppCapable?: "no" | "yes";
	appleMobileWebAppStatusBarStyle?: "black" | "black-translucent" | "default";
	appleMobileWebAppTitle?: string;
	author?: string;
	charset?: string;
	creator?: string;
	generator?: string;
	manifest?: string;
	mobileWebAppCapable?: "no" | "yes";
	publisher?: string;
	viewport?: false | string;
}

export interface CustomHeadConfig {
	links?: Array<Record<string, string>>;
	meta?: Array<Record<string, string>>;
	scripts?: Array<{ async?: boolean; children?: string; extra?: Record<string, string>; src?: string; type?: string }>;
	styles?: Array<{ children: string }>;
}

export interface HeadConfig {
	canonical?: string;
	css?: string | string[];
	custom?: CustomHeadConfig;
	description?: string;
	favicons?: FaviconConfig;
	images?: SeoImage[];
	jsonLd?: Array<Record<string, unknown>>;
	keywords?: string;
	languages?: Record<string, string>;
	meta?: MetaConfig;
	openGraph?: OpenGraphConfig;
	robots?: RobotsConfig;
	title?: string;
	twitter?: TwitterConfig;
}

export interface HeadOptions {
	replace?: boolean;
}

export type ResponseHeaders = Record<string, string | string[]>;

/* type-safe URL building — shared by FlareRouter (client) and server contexts */
export type BuildUrlOptions<TPath extends RoutePaths = RoutePaths> = {
	hash?: string;
	to: TPath;
} & RouteParamsProps<TPath> &
	RouteSearchProps<TPath>;

/* server-only URL helpers — attached to preloader/authorize/loader/head/headers contexts */
export interface ServerUrlHelpers {
	buildUrl: <TPath extends RoutePaths>(options: BuildUrlOptions<TPath>) => string;
}

/* re-export Location for convenience */
export type { Location };
