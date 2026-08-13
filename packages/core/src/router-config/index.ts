import type { DirectionConfig } from "../direction.ts"
import type { LocaleConfig } from "../locale/index.tsx"
import type { LocationRewrite } from "../rewrite/index.ts"
import type { ClientCacheConfig } from "../route-builder/types.ts"
import type { Location, TreeNode } from "../router-primitives/types.ts"
import { parseFlareState as _parseFlareState } from "../state-parser/index.ts"
import type { ThemeConfig } from "../theme.ts"

export type PrefetchStrategy = false | "intent" | "render" | "viewport"
export type TrailingSlashMode = "always" | "never" | "preserve"
export type ViewTransitionDefaults = boolean | { types: string[] }

export interface RouterCacheConfig {
	client?: ClientCacheConfig | false
}

export interface RouterConfig {
	basePath?: string
	cache?: RouterCacheConfig
	caseSensitive?: boolean
	direction?: DirectionConfig
	getScrollRestorationKey?: (location: Location) => string
	layouts: Record<string, () => Promise<{ default: unknown }>>
	locale?: LocaleConfig
	notFoundMode?: "fuzzy" | "root"
	queryClientGetter?: () => unknown
	rewrite?: LocationRewrite
	routeCacheMaxEntries?: number
	routeTree: TreeNode
	scrollRestoration?: boolean
	scrollRestorationBehavior?: "auto" | "smooth"
	scrollRestorationMaxEntries?: number
	theme?: ThemeConfig
	trailingSlash?: TrailingSlashMode
	viewTransitions?: ViewTransitionDefaults
}

export interface SerializableRouterConfig {
	basePath?: string
	cache?: RouterCacheConfig
	caseSensitive?: boolean
	direction?: DirectionConfig
	keepalive?: false | number
	locale?: LocaleConfig
	notFoundMode?: "fuzzy" | "root"
	routeCacheMaxEntries?: number
	scrollRestoration?: boolean
	scrollRestorationBehavior?: "auto" | "smooth"
	scrollRestorationMaxEntries?: number
	theme?: ThemeConfig
	trailingSlash?: TrailingSlashMode
	viewTransitions?: ViewTransitionDefaults
}

const MARKER = Symbol.for("flare/router-config")

export interface MarkedRouterConfig extends RouterConfig {
	[key: symbol]: true
}

export function createRouter(config: RouterConfig): MarkedRouterConfig {
	return { ...config, [MARKER]: true } as MarkedRouterConfig
}

export function isRouterConfig(value: unknown): value is MarkedRouterConfig {
	return (
		value !== null &&
		value !== undefined &&
		typeof value === "object" &&
		MARKER in (value as Record<symbol, unknown>) &&
		(value as Record<symbol, unknown>)[MARKER] === true
	)
}

export function extractSerializable(router: MarkedRouterConfig): SerializableRouterConfig {
	const {
		getScrollRestorationKey: _gsr,
		layouts: _l,
		queryClientGetter: _q,
		rewrite: _rw,
		routeTree: _rt,
		...clean
	} = router

	/* remove symbol marker */
	const result = { ...clean } as Record<string | symbol, unknown>
	delete result[MARKER]
	return result as SerializableRouterConfig
}

export const parseFlareState = _parseFlareState
