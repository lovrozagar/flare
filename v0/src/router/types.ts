/**
 * Shared Route Types
 *
 * Common types used across createPage, createLayout, and createRootLayout
 */

import type { Thing } from "schema-dts"

/* ============================================================================
 * Auth Types
 * ============================================================================ */

export interface Auth {
	email?: string
	sub: string
	[key: string]: unknown
}

/* ============================================================================
 * Location Object (new unified API)
 *
 * Replaces: params, url, search as separate props
 * ============================================================================ */

export interface FlareLocation<
	TParams = Record<string, string>,
	TSearch = Record<string, string>,
	THash = string,
> {
	/** URL hash (e.g., "#section") - typed from .input({ hash }) */
	hash: THash
	/** Extracted route params (e.g., { slug: "hello" }) - auto from path */
	params: TParams
	/** Resolved URL pathname (e.g., "/blog/hello") */
	pathname: string
	/** Parsed/validated query params - typed from .input({ searchParams }) */
	search: TSearch
	/** Full URL object */
	url: URL
	/** URL pattern with variables (e.g., "/blog/[slug]") */
	variablePath: string
	/** Full virtual path including root/groups (e.g., "_root_/blog/[slug]") */
	virtualPath: string
}

/* ============================================================================
 * Loader Cause
 * ============================================================================ */

export type LoaderCause = "enter" | "prefetch" | "stay"

/* ============================================================================
 * Cache & Prefetch Options
 * ============================================================================ */

export type CacheControl =
	| "no-cache"
	| "no-store"
	| "private, no-cache"
	| `private, max-age=${number}`
	| `private, max-age=${number}, stale-while-revalidate=${number}`
	| `public, max-age=${number}`
	| `public, max-age=${number}, stale-while-revalidate=${number}`

export type PrefetchStrategy = false | "hover" | "viewport"

/**
 * Location state for effects callbacks (current vs next navigation)
 */
export interface EffectsLocationState<
	TParams = Record<string, string>,
	TSearch = Record<string, string>,
	THash = string,
> {
	hash: THash | undefined
	params: TParams
	pathname: string
	search: TSearch
}

/**
 * Context for shouldRefetch and other effects callbacks
 * Typed from .input() validators when available
 */
export interface EffectsContext<
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

/* ============================================================================
 * Route Options
 * ============================================================================ */

export type AuthenticateMode = true | "optional"

export interface RouteOptions<TAuth extends AuthenticateMode | false = false> {
	authenticate?: TAuth
	prefetch?: PrefetchStrategy
	prefetchStaleTime?: number
	staleTime?: number
}

export interface RouteMeta {
	authenticate?: AuthenticateMode
	gcTime?: number
	prefetch?: PrefetchStrategy
	prefetchGcTime?: number
	prefetchStaleTime?: number
	staleTime?: number
}

/* ============================================================================
 * Loader Mode
 * ============================================================================ */

export type LoaderMode = "isomorphic" | "server"

/* ============================================================================
 * Head Configuration
 * ============================================================================ */

export interface SeoImage {
	alt?: string
	height?: number
	type?: string
	url: string
	width?: number
}

export interface FaviconConfig {
	"96x96"?: string
	"192x192"?: string
	"512x512"?: string
	appleTouchIcon?: string
	ico?: string
	svg?: string
}

export interface RobotsConfig {
	follow?: boolean
	index?: boolean
	"max-image-preview"?: "large" | "none" | "standard"
	"max-snippet"?: number
	"max-video-preview"?: number
	noarchive?: boolean
	noimageindex?: boolean
}

export interface OpenGraphVideo {
	height?: number
	secureUrl?: string
	type?: string
	url: string
	width?: number
}

export interface OpenGraphAudio {
	secureUrl?: string
	type?: string
	url: string
}

export interface OpenGraphConfig {
	alternateLocale?: string[]
	audio?: OpenGraphAudio[]
	description?: string
	images?: SeoImage[]
	locale?: string
	siteName?: string
	title?: string
	type?: "article" | "product" | "profile" | "website"
	url?: string
	videos?: OpenGraphVideo[]
}

export interface TwitterConfig {
	card?: "app" | "player" | "summary_large_image" | "summary"
	creator?: string
	description?: string
	images?: Array<{ alt?: string; url: string }>
	site?: string
	title?: string
}

export interface MetaConfig {
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
	/** Viewport meta tag. Set to false to disable. Default: "width=device-width, initial-scale=1.0" */
	viewport?: string | false
}

export interface CustomHead {
	links?: Array<Record<string, string>>
	meta?: Array<Record<string, string>>
	scripts?: Array<{ children?: string; src?: string; type?: string }>
	styles?: Array<{ children: string }>
}

export interface HeadConfig {
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

/* ============================================================================
 * Response Headers
 * ============================================================================ */

export type CommonHeader =
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

export type ResponseHeaders = {
	[K in CommonHeader]?: string
} & Record<string, string>

export type ResponseHeadersResult = ResponseHeaders

/* ============================================================================
 * Client Route Types
 * ============================================================================ */

export interface ClientRouteBoundaries {
	error?: () => Promise<unknown>
	notFound?: () => Promise<unknown>
	streaming?: () => Promise<unknown>
	unauthorized?: () => Promise<unknown>
}

export interface ClientRoute {
	boundaries?: ClientRouteBoundaries
	layouts: string[]
	loaderMode?: LoaderMode
	module?: () => Promise<{ default: unknown }>
	params: string[]
	/** Full path including groups - for layout resolution and types */
	path: string
	pattern: RegExp
	/** URL path with groups stripped - for URL matching */
	urlPath: string
}

/* ============================================================================
 * Layout Module Types
 * ============================================================================ */

export interface LayoutModule {
	default: unknown
}

/* ============================================================================
 * Helper: Create Location Object
 * ============================================================================ */

export function createLocation<
	TParams extends Record<string, string>,
	TSearch = Record<string, string>,
	THash = string,
>(
	url: URL,
	params: TParams,
	virtualPath: string,
	variablePath: string,
	search?: TSearch,
	hash?: THash,
): FlareLocation<TParams, TSearch, THash> {
	/* Default search: parse from URL if not provided (validated) */
	const defaultSearch: Record<string, string> = {}
	url.searchParams.forEach((value, key) => {
		defaultSearch[key] = value
	})

	return {
		hash: (hash ?? url.hash) as THash,
		params,
		pathname: url.pathname,
		search: (search ?? defaultSearch) as TSearch,
		url,
		variablePath,
		virtualPath,
	}
}
