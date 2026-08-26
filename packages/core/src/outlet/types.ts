import type { Accessor } from "solid-js";
import type { JSX } from "@solidjs/web";
import type { GlobalBoundaries } from "../boundaries/index.ts";
import type { InvalidateOptions, MatchCache, PrefetchCache } from "../caches/index.ts";
import type { ExtractT, Translator } from "../i18n/index.ts";
import type { LocaleConfig } from "../locale.ts";
import type {
	RouteLoaderData,
	RouteParamsProps,
	RoutePathParams,
	RoutePaths,
	RoutePreloaderContext,
	RouteSearchParams,
	RouteSearchProps,
	RouteVirtualPaths,
} from "../route-builder/register.ts";
import type { BuildUrlOptions, ClientCacheConfig } from "../route-builder/types.ts";
import type { MatchResult, TreeNode } from "../router-primitives/types.ts";
import type { SearchParams } from "../url/index.ts";

export type ViewTransitionDirection = "back" | "forward" | "same";

export interface LocationChangeInfo {
	direction: ViewTransitionDirection;
	fromLocation: { hash: string; pathname: string; search: string } | null;
	pathChanged: boolean;
	toLocation: { hash: string; pathname: string; search: string };
}

export interface ViewTransitionOptions {
	types: string[] | ((info: LocationChangeInfo) => string[] | false);
}

export type ViewTransitionConfig = boolean | ViewTransitionOptions;

export type NavigationPhase = "idle" | "loading" | "transitioning";

export interface BrowserViewTransition {
	finished: Promise<void>;
	ready: Promise<void>;
	skipTransition: () => void;
	updateCallbackDone: Promise<void>;
}

/* Simplified location for FlareProvider — not the full generic Location from router-primitives */
export interface ProviderLocation {
	hash: string;
	params: Record<string, string | string[]>;
	pathname: string;
	search: SearchParams;
	url: URL;
	variablePath: string;
	virtualPath: string;
}

export interface RenderProps {
	children?: JSX.Element;
	loaderData: unknown;
	location: ProviderLocation;
	preloaderContext?: Record<string, unknown>;
	router: FlareRouter;
}

/* Boundary render props — simplified from boundaries module generics */
export interface ClientErrorRenderProps {
	error: unknown;
	location: ProviderLocation;
	reset: () => void;
	retry: () => void;
}

export interface ClientNotFoundRenderProps {
	location: ProviderLocation;
}

export interface ClientUnauthenticatedRenderProps {
	error: unknown;
	location: ProviderLocation;
	retry: () => void;
}

export interface ClientUnauthorizedRenderProps {
	error: unknown;
	location: ProviderLocation;
	retry: () => void;
}

export interface InterceptedState {
	backgroundLocation: ProviderLocation;
	dismiss: () => void;
	match: ClientMatch;
	params: Record<string, string | string[]>;
	render: string;
	search: SearchParams;
}

export interface ClientMatch {
	_type: "layout" | "render" | "root-layout";
	error?: unknown;
	errorRender?: (props: ClientErrorRenderProps) => JSX.Element;
	loaderData: unknown;
	notFoundRender?: (props: ClientNotFoundRenderProps) => JSX.Element;
	preloaderContext?: Record<string, unknown>;
	render: (props: RenderProps) => JSX.Element;
	unauthenticatedRender?: (props: ClientUnauthenticatedRenderProps) => JSX.Element;
	unauthorizedRender?: (props: ClientUnauthorizedRenderProps) => JSX.Element;
	variablePath: string;
	virtualPath: string;
}

export interface DeferredResolver {
	reject: (e: Error) => void;
	resolve: (d: unknown) => void;
}

export type NavigateOptions<TPath extends RoutePaths = RoutePaths> = {
	broadcast?: boolean;
	hash?: string;
	replace?: boolean;
	revalidate?: boolean;
	scroll?: boolean;
	shallow?: boolean;
	state?: unknown;
	to: TPath;
	viewTransition?: ViewTransitionConfig;
} & RouteParamsProps<TPath> &
	RouteSearchProps<TPath>;

export interface InternalNavigateOptions {
	/* internal: skip redundant matchRoute when delegate already resolved */
	_precomputedMatch?: MatchResult;
	/* internal: user confirmed a blocked navigation — do not re-check the blocker */
	_bypassBlocker?: boolean;
	_popstate?: boolean;
	_popstateDirection?: ViewTransitionDirection;
	_restoreScroll?: { x: number; y: number } | null;
	broadcast?: boolean;
	hash?: string;
	params?: Record<string, unknown>;
	replace?: boolean;
	revalidate?: boolean;
	scroll?: boolean;
	search?: Record<string, unknown>;
	shallow?: boolean;
	state?: unknown;
	to: string;
	viewTransition?: ViewTransitionConfig;
}

export type PrefetchOptions<TPath extends RoutePaths = RoutePaths> = {
	/** Viewport/render: load route modules only, no per-URL NDJSON. */
	modulesOnly?: boolean;
	params?: Record<string, unknown>;
	to: TPath;
} & RouteSearchProps<TPath>;

export interface FlareProviderContext {
	boundaries?: GlobalBoundaries;
	caseSensitive?: boolean;
	hydrated: Accessor<boolean>;
	localeConfig?: LocaleConfig;
	intercepted: Accessor<InterceptedState | null>;
	invalidate: (options?: InvalidateOptions) => void;
	isNavigating: Accessor<boolean>;
	layouts: Record<string, () => Promise<{ default: unknown }>>;
	location: Accessor<ProviderLocation>;
	matchCache: MatchCache;
	matches: Accessor<ClientMatch[]>;
	navigate: (options: InternalNavigateOptions) => Promise<void>;
	navigationPhase: Accessor<NavigationPhase>;
	notFound: Accessor<boolean>;
	params: Accessor<Record<string, string | string[]>>;
	prefetch: (options: PrefetchOptions) => Promise<void>;
	prefetchCache: PrefetchCache;
	resolvers: Map<string, DeferredResolver>;
	routerCacheDefaults?: ClientCacheConfig;
	routeTree: TreeNode;
	search: Accessor<SearchParams>;
	setHydrated: (v: boolean) => void;
	setIntercepted: (state: InterceptedState | null) => void;
	setMatches: (matches: ClientMatch[]) => void;
	setNavigationPhase: (phase: NavigationPhase) => void;
	setNotFound: (notFound: boolean) => void;
	setParams: (params: Record<string, string | string[]>) => void;
	setSearch: (search: SearchParams) => void;
	setViewTransition: (vt: BrowserViewTransition | null) => void;
	viewTransition: Accessor<BrowserViewTransition | null>;
}

export interface FlareProviderProps {
	boundaries?: GlobalBoundaries;
	caseSensitive?: boolean;
	children: JSX.Element;
	initialLocation?: ProviderLocation;
	localeConfig?: LocaleConfig;
	layouts: Record<string, () => Promise<{ default: unknown }>>;
	matchCache: MatchCache;
	matches: ClientMatch[];
	onContextReady?: (ctx: FlareProviderContext) => void;
	params: Record<string, string | string[]>;
	prefetchCache: PrefetchCache;
	resolvers: Map<string, DeferredResolver>;
	routerCacheDefaults?: ClientCacheConfig;
	routeTree: TreeNode;
	search?: SearchParams;
}

export interface BlockerState {
	blocked: Accessor<boolean>;
	proceed: () => void;
	reset: () => void;
}

export type { BuildUrlOptions } from "../route-builder/types.ts";

export interface FlareRouter {
	buildLocation: <TPath extends RoutePaths>(options: BuildUrlOptions<TPath>) => ProviderLocation;
	buildUrl: <TPath extends RoutePaths>(options: BuildUrlOptions<TPath>) => string;
	clearCache: () => void;
	hydrated: Accessor<boolean>;
	intercepted: Accessor<InterceptedState | null>;
	invalidate: (options?: InvalidateOptions) => void;
	isNavigating: Accessor<boolean>;
	locale: Accessor<string | undefined>;
	location: Accessor<ProviderLocation>;
	matches: Accessor<ClientMatch[]>;
	navigate: <TPath extends RoutePaths>(options: NavigateOptions<TPath>) => Promise<void>;
	navigationPhase: Accessor<NavigationPhase>;
	params: Accessor<Record<string, string | string[]>>;
	prefetch: (options: PrefetchOptions) => Promise<void>;
	refetch: () => Promise<void>;
	search: Accessor<SearchParams>;
	useBlocker: (when: () => boolean) => BlockerState;
	useLoaderData: <TPath extends RouteVirtualPaths>(options: { from: TPath }) => Accessor<RouteLoaderData<TPath>>;
	useLoaderT: <TPath extends RouteVirtualPaths>(options: {
		from: TPath;
	}) => Translator<ExtractT<RouteLoaderData<TPath>>>;
	useMatch: (options: { from: RouteVirtualPaths }) => Accessor<ClientMatch | undefined>;
	useParams: <TPath extends RouteVirtualPaths>(options: { from: TPath }) => Accessor<RoutePathParams<TPath>>;
	usePreloaderContext: <TPath extends RouteVirtualPaths>(options: {
		from: TPath;
	}) => Accessor<RoutePreloaderContext<TPath>>;
	usePreloaderT: <TPath extends RouteVirtualPaths>(options: {
		from: TPath;
	}) => Translator<ExtractT<RoutePreloaderContext<TPath>>>;
	useSearch: <TPath extends RouteVirtualPaths>(options: { from: TPath }) => Accessor<RouteSearchParams<TPath>>;
	viewTransition: Accessor<BrowserViewTransition | null>;
}
