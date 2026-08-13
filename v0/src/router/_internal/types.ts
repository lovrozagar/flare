/**
 * Flare Router Internal Types
 * Shared across createPage, createLayout, createRootLayout.
 */

import type { Thing } from "schema-dts"

interface Auth {
	email?: string
	sub: string
	[key: string]: unknown
}

interface FlareLocation<
	TParams = Record<string, string | string[]>,
	TSearch = Record<string, string>,
> {
	params: TParams
	pathname: string
	search: TSearch
	url: URL
	variablePath: string
	virtualPath: string
}

type LoaderCause = "enter" | "prefetch" | "stay"
type PrefetchStrategy = false | "hover" | "viewport"
type RouteType = "layout" | "render" | "root-layout"

type CacheControl =
	| "no-cache"
	| "no-store"
	| "private, no-cache"
	| `private, max-age=${number}`
	| `private, max-age=${number}, stale-while-revalidate=${number}`
	| `public, max-age=${number}`
	| `public, max-age=${number}, stale-while-revalidate=${number}`

interface EffectsLocationState<
	TParams = Record<string, string>,
	TSearch = Record<string, string>,
	THash = string,
> {
	hash: THash | undefined
	params: TParams
	pathname: string
	search: TSearch
}

interface EffectsContext<
	TParams = Record<string, string>,
	TSearch = Record<string, string>,
	THash = string,
> {
	location: {
		current: EffectsLocationState<TParams, TSearch, THash>
		next: EffectsLocationState<TParams, TSearch, THash>
	}
	trigger: "initial" | "navigation" | "revalidation"
}

interface EffectsConfig<
	TParams = Record<string, string>,
	TSearch = Record<string, string>,
	THash = string,
> {
	loaderDeps?: (ctx: { search: TSearch }) => unknown[]
	shouldRefetch?: (ctx: EffectsContext<TParams, TSearch, THash>) => boolean
}

interface DeferOptions {
	awaitOnInitialLoad?: boolean
	key?: string
}

interface Deferred<T> {
	__deferred: true
	promise: Promise<T>
}

type DeferFn = <T>(fn: () => Promise<T>, options?: DeferOptions) => Deferred<T>

type AuthenticateMode = true | "optional"

type ResolveAuth<TAuth extends AuthenticateMode | false> = TAuth extends true
	? Auth
	: TAuth extends "optional"
		? Auth | null
		: null

type ResolveAuthForAuthorize<TAuth extends AuthenticateMode | false> = TAuth extends true
	? Auth
	: TAuth extends "optional"
		? Auth | null
		: undefined

interface RouteOptions<TAuth extends AuthenticateMode | false = false> {
	authenticate?: TAuth
	prefetch?: PrefetchStrategy
	prefetchStaleTime?: number
	staleTime?: number
}

interface RouteMeta {
	authenticate?: AuthenticateMode
	gcTime?: number
	prefetch?: PrefetchStrategy
	prefetchGcTime?: number
	prefetchStaleTime?: number
	staleTime?: number
}

interface SeoImage {
	alt?: string
	height?: number
	type?: string
	url: string
	width?: number
}

interface FaviconConfig {
	"96x96"?: string
	"192x192"?: string
	"512x512"?: string
	appleTouchIcon?: string
	ico?: string
	svg?: string
}

interface RobotsConfig {
	follow?: boolean
	index?: boolean
	"max-image-preview"?: "large" | "none" | "standard"
	"max-snippet"?: number
	"max-video-preview"?: number
	noarchive?: boolean
	noimageindex?: boolean
}

interface OpenGraphMedia {
	height?: number
	secureUrl?: string
	type?: string
	url: string
	width?: number
}

interface OpenGraphConfig {
	alternateLocale?: string[]
	audio?: OpenGraphMedia[]
	description?: string
	images?: SeoImage[]
	locale?: string
	siteName?: string
	title?: string
	type?: "article" | "product" | "profile" | "website"
	url?: string
	videos?: OpenGraphMedia[]
}

interface TwitterConfig {
	card?: "app" | "player" | "summary_large_image" | "summary"
	creator?: string
	description?: string
	images?: Array<{ alt?: string; url: string }>
	site?: string
	title?: string
}

interface MetaConfig {
	appleMobileWebAppCapable?: "no" | "yes"
	appleMobileWebAppStatusBarStyle?: "black-translucent" | "black" | "default"
	appleMobileWebAppTitle?: string
	applicationName?: string
	author?: string
	charset?: string
	creator?: string
	generator?: string
	manifest?: string
	mobileWebAppCapable?: "no" | "yes"
	publisher?: string
	viewport?: string | false
}

interface CustomHead {
	links?: Array<Record<string, string>>
	meta?: Array<Record<string, string>>
	scripts?: Array<{ children?: string; src?: string; type?: string }>
	styles?: Array<{ children: string }>
}

interface HeadConfig {
	canonical?: string
	css?: string
	custom?: CustomHead
	description?: string
	favicons?: FaviconConfig
	images?: SeoImage[]
	jsonLd?: Thing | Thing[]
	keywords?: string
	languages?: Record<string, string>
	meta?: MetaConfig
	openGraph?: OpenGraphConfig
	robots?: RobotsConfig
	title?: string
	twitter?: TwitterConfig
}

type CommonHeader =
	| "accept"
	| "accept-language"
	| "cache-control"
	| "content-disposition"
	| "content-language"
	| "content-security-policy"
	| "content-type"
	| "etag"
	| "expires"
	| "last-modified"
	| "link"
	| "location"
	| "set-cookie"
	| "vary"
	| "x-content-type-options"
	| "x-frame-options"
	| "x-robots-tag"
	| "x-xss-protection"

type ResponseHeaders = { [K in CommonHeader]?: string } & Record<string, string>

type ParamsValidator<TRaw, T> = ((raw: TRaw) => T) | { _output: T } | { parse: (raw: TRaw) => T }

type SearchParamsValidator<T> =
	| ((raw: URLSearchParams) => T)
	| { _output: T }
	| { parse: (raw: URLSearchParams) => T }

interface InputConfig<
	TRawParams = Record<string, string>,
	TParams = TRawParams,
	TSearch = Record<string, string>,
> {
	params?: ParamsValidator<TRawParams, TParams>
	searchParams?: SearchParamsValidator<TSearch>
}

type InferValidatorOutput<T> = T extends (raw: unknown) => infer R
	? R
	: T extends { _output: infer R }
		? R
		: T extends { parse: (raw: unknown) => infer R }
			? R
			: unknown

interface ClientRouteBoundaries {
	error?: () => Promise<unknown>
	notFound?: () => Promise<unknown>
	streaming?: () => Promise<unknown>
	unauthorized?: () => Promise<unknown>
}

interface ClientRoute {
	boundaries?: ClientRouteBoundaries
	layouts: string[]
	module?: () => Promise<{ default: unknown }>
	params: string[]
	path: string
	pattern: RegExp
	urlPath: string
}

interface LayoutModule {
	default: unknown
}

function createLocation<
	TParams extends Record<string, string | string[]>,
	TSearch = Record<string, string>,
>(
	url: URL,
	params: TParams,
	virtualPath: string,
	variablePath: string,
	search?: TSearch,
): FlareLocation<TParams, TSearch> {
	const defaultSearch: Record<string, string> = {}
	url.searchParams.forEach((value, key) => {
		defaultSearch[key] = value
	})

	return {
		params,
		pathname: url.pathname,
		search: (search ?? defaultSearch) as TSearch,
		url,
		variablePath,
		virtualPath,
	}
}

export type {
	Auth,
	AuthenticateMode,
	CacheControl,
	ClientRoute,
	ClientRouteBoundaries,
	CommonHeader,
	CustomHead,
	Deferred,
	DeferFn,
	DeferOptions,
	EffectsConfig,
	EffectsContext,
	EffectsLocationState,
	FaviconConfig,
	FlareLocation,
	HeadConfig,
	InferValidatorOutput,
	InputConfig,
	LayoutModule,
	LoaderCause,
	MetaConfig,
	OpenGraphConfig,
	OpenGraphMedia,
	ParamsValidator,
	PrefetchStrategy,
	ResolveAuth,
	ResolveAuthForAuthorize,
	ResponseHeaders,
	RobotsConfig,
	RouteOptions,
	RouteMeta,
	RouteType,
	SearchParamsValidator,
	SeoImage,
	TwitterConfig,
}

export { createLocation }
