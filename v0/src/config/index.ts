/**
 * Flare Configuration
 *
 * Build config: FlareBuildConfig, createFlareBuild (static, read at build time)
 */

import type { Component, JSX } from "solid-js"
import type { DirectionConfig } from "../direction"
import type { RouteMeta } from "../router/types"
import type { ThemeConfig } from "../theme"

/* ============================================================================
 * Build Config (static, read at build time by Vite plugin)
 * ============================================================================ */

/**
 * Global boundary paths for error/notFound/streaming/unauthorized pages
 * Paths are relative to src/, resolved at build time
 */
export interface GlobalBoundariesConfig {
	error?: string
	notFound?: string
	streaming?: string
	unauthorized?: string
}

/**
 * Server function plugin options
 */
export interface ServerFnPluginOptions {
	/** File patterns to exclude */
	exclude?: RegExp
	/** File patterns to include (default: all .ts/.tsx) */
	include?: RegExp
}

/**
 * Tailwind plugin options (tw= transform)
 */
export interface TailwindPluginOptions {
	/** Path to CSS file for @theme resolution */
	filePath?: string
	/** Error on unresolvable tw= dynamic expressions @default false */
	strict?: boolean
}

/**
 * CSS configuration (global styles)
 */
export interface CssConfig {
	/** Path to global CSS file to inline */
	filePath?: string
}

/**
 * Symbol marker for identifying FlareBuildConfig objects.
 * Used by Vite plugin to detect createFlareBuild() exports regardless of export name.
 */
export const FLARE_BUILD_CONFIG_MARKER = Symbol.for("@flare/v0/build-config")

/**
 * Build-time config - all static values pre-computed during build
 * Use createFlareBuild() to define in flare.build.ts
 */
export interface FlareBuildConfig {
	/* ========== Generate config ========== */

	/** Client entry file path @default "src/client.ts" */
	clientEntryFilePath?: string

	/** File prefix for pages (e.g., "flare-web" matches "flare-web.index.tsx") */
	filePrefix?: string

	/** Generated file paths (relative to project root) */
	generated?: {
		/** Routes manifest @default "src/_gen/routes.gen.ts" */
		routesFilePath?: string
		/** Type declarations @default "src/_gen/types.gen.d.ts" */
		typesFilePath?: string
	}

	/** Prefix for files/dirs to ignore @default "_" */
	ignorePrefix?: string

	/** Server/worker entry file path @default "src/server.ts" */
	serverEntryFilePath?: string

	/* ========== Build config ========== */

	/** Direction (LTR/RTL) settings - generates inline script */
	direction?: DirectionConfig & { enabled?: boolean }

	/** Global boundary component paths (relative to src/) */
	globalBoundaries?: GlobalBoundariesConfig

	/** Global route options applied to all routes */
	globalOptions?: RouteMeta

	/** Pattern-based route options (glob patterns → options) */
	globalOptionsPatterns?: Record<string, Partial<RouteMeta>>

	/** Navigation progress bar config */
	progress?: ProgressConfig | false

	/** Theme settings - generates inline script */
	theme?: ThemeConfig

	/** View Transitions API for smooth SPA navigation @default false (opt-in) */
	viewTransitions?: boolean

	/* ========== Plugin config ========== */

	/** CSS config (global styles). Set to false to disable. */
	css?: CssConfig | false

	/** Server function options. Set to false to disable. @default enabled */
	serverFn?: ServerFnPluginOptions | false

	/** Tailwind tw= transform options. Set to false to disable. */
	tailwind?: TailwindPluginOptions | false
}

/** FlareBuildConfig with Symbol marker attached */
export type MarkedFlareBuildConfig = FlareBuildConfig & {
	[FLARE_BUILD_CONFIG_MARKER]: true
}

/**
 * Check if a value is a FlareBuildConfig (has the marker Symbol)
 */
export function isFlareBuildConfig(value: unknown): value is MarkedFlareBuildConfig {
	return typeof value === "object" && value !== null && FLARE_BUILD_CONFIG_MARKER in value
}

/**
 * Define build-time config in flare.build.ts
 * All static values are pre-computed during build, not per-request
 *
 * @example
 * ```ts
 * // flare.build.ts
 * import { createFlareBuild } from "@flare/v0/config"
 *
 * export default createFlareBuild({
 *   clientEntryFilePath: "./src/client.ts",
 *   filePrefix: "flare-web",
 *   theme: { defaultTheme: "system" },
 *   direction: { enabled: true, defaultDir: "ltr" },
 *   globalOptions: { prefetch: "hover" },
 *   tailwind: { cssFilePath: "./src/styles/tailwind.css" },
 * })
 * ```
 */
export function createFlareBuild(config: FlareBuildConfig): MarkedFlareBuildConfig {
	return Object.assign(config, {
		[FLARE_BUILD_CONFIG_MARKER]: true as const,
	}) as MarkedFlareBuildConfig
}

/* ============================================================================
 * Resolved Config (internal use by plugins)
 * ============================================================================ */

export interface ResolvedFlareBuildConfig {
	clientEntryFilePath: string
	filePrefix: string | undefined
	generated: {
		routesFilePath: string
		typesFilePath: string
	}
	ignorePrefix: string
	serverEntryFilePath: string
}

export const DEFAULT_BUILD_CONFIG: ResolvedFlareBuildConfig = {
	clientEntryFilePath: "src/client.ts",
	filePrefix: undefined,
	generated: {
		routesFilePath: "src/_gen/routes.gen.ts",
		typesFilePath: "src/_gen/types.gen.d.ts",
	},
	ignorePrefix: "_",
	serverEntryFilePath: "src/server.ts",
}

export function resolveBuildConfig(config: FlareBuildConfig = {}): ResolvedFlareBuildConfig {
	return {
		clientEntryFilePath: config.clientEntryFilePath ?? DEFAULT_BUILD_CONFIG.clientEntryFilePath,
		filePrefix: config.filePrefix,
		generated: {
			routesFilePath:
				config.generated?.routesFilePath ?? DEFAULT_BUILD_CONFIG.generated.routesFilePath,
			typesFilePath:
				config.generated?.typesFilePath ?? DEFAULT_BUILD_CONFIG.generated.typesFilePath,
		},
		ignorePrefix: config.ignorePrefix ?? DEFAULT_BUILD_CONFIG.ignorePrefix,
		serverEntryFilePath: config.serverEntryFilePath ?? DEFAULT_BUILD_CONFIG.serverEntryFilePath,
	}
}

/* ============================================================================
 * CSP Types & Defaults
 * ============================================================================ */

export interface CspDirectives {
	baseUri?: string[]
	connectSrc?: string[]
	defaultSrc?: string[]
	fontSrc?: string[]
	formAction?: string[]
	frameAncestors?: string[]
	frameSrc?: string[]
	imgSrc?: string[]
	objectSrc?: string[]
	requireTrustedTypesFor?: string[]
	scriptSrc?: string[]
	styleSrc?: string[]
	trustedTypes?: string[]
	upgradeInsecureRequests?: boolean
	workerSrc?: string[]
}

/**
 * Strict CSP defaults - secure out of the box
 * Apps can extend via csp option in createServerHandler()
 */
export const CSP_DEFAULTS: CspDirectives = {
	baseUri: ["'self'"],
	connectSrc: ["'self'", "https:"],
	defaultSrc: ["'self'"],
	fontSrc: ["'self'", "data:"],
	formAction: ["'self'"],
	frameAncestors: ["'none'"],
	imgSrc: ["'self'", "data:", "https:"],
	objectSrc: ["'none'"],
	requireTrustedTypesFor: ["'script'"],
	/* nonce added at runtime, strict-dynamic propagates trust, unsafe-inline fallback for old browsers */
	scriptSrc: ["'self'", "'strict-dynamic'", "'unsafe-inline'", "https:", "http:"],
	styleSrc: ["'self'", "'unsafe-inline'"],
	trustedTypes: ["default"],
	upgradeInsecureRequests: true,
}

/* ============================================================================
 * Security Headers Defaults
 * ============================================================================ */

/**
 * Non-CSP security headers - secure out of the box
 */
export const SECURITY_HEADERS_DEFAULTS = {
	"Cross-Origin-Opener-Policy": "same-origin-allow-popups",
	"Cross-Origin-Resource-Policy": "same-origin",
	"Permissions-Policy":
		"camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
	"Referrer-Policy": "strict-origin-when-cross-origin",
	"Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
	"X-Content-Type-Options": "nosniff",
	"X-Frame-Options": "DENY",
} as const

export type SecurityHeaders = Record<string, string>

/* ============================================================================
 * Security Context
 * ============================================================================ */

export interface SecurityContext {
	isDev: boolean
	nonce: string
	request: Request
	url: URL
}

/* ============================================================================
 * Progress Config
 * ============================================================================ */

export interface ProgressConfig {
	color?: string
	easing?: string
	height?: number
	minDisplayTime?: number
	minimum?: number
	showPeg?: boolean
	speed?: number
	trickleSpeed?: number
	zIndex?: number
}

/* ============================================================================
 * Error Page Props
 * ============================================================================ */

export interface ErrorPageProps {
	error: Error
	pathname: string
	timestamp?: number
}

export interface NotFoundPageProps {
	pathname: string
	referrer?: string
}

/* ============================================================================
 * Boundaries Config
 * ============================================================================ */

export type BoundaryComponent<TProps extends object = object> =
	| Component<TProps>
	| (() => Promise<Component<TProps>>)
export type BoundaryElement = (() => JSX.Element) | (() => Promise<() => JSX.Element>)

export interface BoundariesConfig {
	error?: BoundaryComponent<ErrorPageProps>
	notFound?: BoundaryComponent<NotFoundPageProps>
	streaming?: BoundaryElement
	unauthorized?: BoundaryElement
}

/* ============================================================================
 * Headers Config
 * ============================================================================ */

export type HeadersFn<TDefaults> = (
	ctx: SecurityContext,
	defaults: TDefaults,
) => Record<string, string>
export type HeadersValue<TDefaults> = Record<string, string> | HeadersFn<TDefaults>

export interface HeadersConfig {
	csp?: CspDirectives | ((ctx: SecurityContext, defaults: CspDirectives) => CspDirectives)
	global?: Record<string, string> | ((ctx: SecurityContext) => Record<string, string>)
	security?: HeadersValue<typeof SECURITY_HEADERS_DEFAULTS>
}
