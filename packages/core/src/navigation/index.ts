import { batch } from "solid-js"
import type { DeferredTracker } from "../caches/index.ts"
import { collectDeferredPromises, createDeferredTracker } from "../caches/index.ts"
import type { DirectionConfig } from "../direction.ts"
import { getDirFromLocale } from "../direction.ts"
import { parseMilliseconds } from "../duration/index.ts"
import { NotFoundError, RedirectResponse } from "../errors/index.ts"
import type { PerRouteHead } from "../head-client/index.ts"
import { applyPerRouteHeads } from "../head-client/index.ts"
import {
	createHistoryListener,
	createScrollStore,
	getCurrentScroll,
	getHistoryIndex,
	type HistoryNavigateEvent,
	incrementHistoryIndex,
	parseHistoryState,
	pushHistoryState,
	replaceHistoryState,
	restoreScroll,
	type ScrollStore,
	scrollToTop,
	setHistoryIndex,
} from "../history/index.ts"
import { isChunkLoadError, isRenderFn } from "../internal.ts"
import type { LocaleConfig } from "../locale.ts"
import { warn } from "../logger.ts"
import { fetchNDJSON } from "../ndjson-client/index.ts"
import type {
	FlareProviderContext,
	InternalNavigateOptions,
	LocationChangeInfo,
	ViewTransitionConfig,
	ViewTransitionDirection,
} from "../outlet/types.ts"
import { executeRewriteInput, executeRewriteOutput, type LocationRewrite } from "../rewrite/index.ts"
import type { HeadConfig } from "../route-builder/types.ts"
import {
	computeMatchId,
	isRootLayoutPath,
	matchRoute,
	matchRoutePartial,
	toLocaleMatch,
} from "../router-primitives/index.ts"
import { buildUrl, parseSearchParams, type SearchParams, serializeSearchParams } from "../url/index.ts"
import type { LoadedRouteModule, LoadRouteModulesFn } from "./types.ts"

function extractRootIdentity(virtualPath: string): string {
	const segments = virtualPath.split("/")
	const rootIdx = segments.findIndex((s) => isRootLayoutPath(s))
	if (rootIdx < 0) return ""
	return segments.slice(0, rootIdx + 1).join("/")
}

/** FlareProviderContext with hidden setters defined via Object.defineProperty in outlet */
interface InternalProviderContext extends FlareProviderContext {
	_setNavigate?: (fn: (opts: InternalNavigateOptions) => Promise<void>) => void
	_setPrefetch?: (
		fn: (opts: {
			params?: Record<string, unknown>
			search?: Record<string, unknown>
			to: string
		}) => Promise<void>,
	) => void
}

/** Document with View Transitions API support (types arg form not yet in TS DOM lib) */
interface ViewTransitionResult {
	finished: Promise<void>
	ready: Promise<void>
	skipTransition: () => void
	updateCallbackDone: Promise<void>
}

interface ViewTransitionDocument {
	startViewTransition: (
		arg: (() => void) | { types?: string[]; update: () => void },
	) => ViewTransitionResult
}

function hasViewTransitions(doc: Document): doc is Document & ViewTransitionDocument {
	return "startViewTransition" in doc && typeof doc.startViewTransition === "function"
}

export type {
	EffectsConfig,
	LoadedRouteModule,
	LoadedRouteModules,
	LoadRouteModulesFn,
} from "./types.ts"

const GC_INTERVAL = 60_000
const MAX_REDIRECTS = 10
const GC_MAX_AGE = 5 * 60 * 1000

/** Apply input rewrite to transform browser URL → internal pathname for route matching */
function rewritePathname(pathname: string): string {
	if (!rewrite) return pathname
	const url = new URL(pathname, "http://localhost")
	const rewritten = executeRewriteInput(rewrite, url)
	return rewritten.pathname
}

let ctx: FlareProviderContext | null = null
let currentController: AbortController | null = null
let navigationVersion = 0
let scrollStore: ScrollStore | null = null
let gcIntervalId: ReturnType<typeof setInterval> | null = null
let popstateCleanup: (() => void) | null = null
let loadRouteModules: LoadRouteModulesFn | null = null
let currentHistoryKey: string | null = null
let rewrite: LocationRewrite | undefined
let caseSensitive = false
let defaultViewTransition: ViewTransitionConfig = false
let deferredTracker: DeferredTracker | null = null
let notFoundMode: "fuzzy" | "root" = "fuzzy"
let queryClientRef: unknown
let scrollRestorationEnabled = true
let scrollRestorationBehavior: "auto" | "smooth" = "auto"
let localeConfig: LocaleConfig | undefined
let directionConfig: DirectionConfig | undefined
const visitedRoutes = new Set<string>()

/* Keepalive ping — keeps HTTP/2 connection and CF isolate warm */
let keepaliveIntervalId: ReturnType<typeof setInterval> | null = null
let keepaliveVisibilityHandler: (() => void) | null = null

let clickCleanup: (() => void) | null = null

/* SPA navigation blocker — set by useBlocker, checked by navigate */
let activeBlockerFn: (() => boolean) | null = null
let onBlockedCallback: (() => void) | null = null
let pendingNavigation: InternalNavigateOptions | null = null

/** Reset navigation phase + clear controller in one place — used at all early-return sites */
function stopNavigation(): void {
	if (ctx) {
		ctx.setNavigationPhase("idle")
		ctx.setViewTransition(null)
	}
	currentController = null
}

/**
 * Sync locale state (cookie, html lang, direction) on navigation commit.
 * Called at every c.setParams() site — these only fire during actual
 * navigations, never during hydration (signals are initialized from SSR state).
 */
function syncLocale(params: Record<string, string | string[]>): void {
	if (!localeConfig || typeof document === "undefined") return

	const paramName = localeConfig.paramName ?? "locale"
	const val = params[paramName]
	const effectiveLocale = (typeof val === "string" ? val : undefined) ?? localeConfig.defaultLocale

	/* Cookie — always write for localized routes to keep it current */
	const cookieName = localeConfig.cookieName ?? "flare.locale"
	document.cookie = `${cookieName}=${effectiveLocale}; path=/; max-age=31536000; samesite=lax`

	/* html lang */
	document.documentElement.setAttribute("lang", effectiveLocale)

	/* Direction sync (opt-in) */
	if (localeConfig.syncDirection) {
		const dir = getDirFromLocale(effectiveLocale, directionConfig?.rtlLocales)
		document.documentElement.setAttribute("dir", dir)
		const attr = directionConfig?.attribute ?? "data-dir"
		document.documentElement.setAttribute(attr, dir)
	}
}

export function setActiveBlocker(when: (() => boolean) | null, onBlocked?: () => void): void {
	activeBlockerFn = when
	onBlockedCallback = onBlocked ?? null
}

export function clearPendingNavigation(): void {
	pendingNavigation = null
}

export function proceedPendingNavigation(): void {
	const pending = pendingNavigation
	pendingNavigation = null
	if (pending) {
		void navigate(pending)
	}
}

export interface SetupNavigationOptions {
	caseSensitive?: boolean
	direction?: DirectionConfig
	initialRouteIds?: string[]
	keepalive?: false | number
	locale?: LocaleConfig
	notFoundMode?: "fuzzy" | "root"
	queryClient?: unknown
	rewrite?: LocationRewrite
	scrollRestoration?: boolean
	scrollRestorationBehavior?: "auto" | "smooth"
	scrollRestorationMaxEntries?: number
	viewTransitions?: ViewTransitionConfig
}

function setupAnchorIntercept(): () => void {
	if (typeof document === "undefined") return () => {}

	const handler = (event: MouseEvent): void => {
		if (event.defaultPrevented) return
		if (event.button !== 0) return
		if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return

		const target = event.target
		if (!(target instanceof Element)) return
		const anchor = target.closest("a")
		if (!anchor) return
		if (anchor.hasAttribute("data-flare-skip")) return

		const href = anchor.getAttribute("href")
		if (href === null) return

		const anchorTarget = anchor.getAttribute("target")
		if (anchorTarget && anchorTarget !== "_self") return
		if (anchor.hasAttribute("download")) return
		const rel = anchor.getAttribute("rel")
		if (rel && rel.split(/\s+/).includes("external")) return

		/* Dangerous + non-http protocols — let browser handle. mailto/tel/javascript/data/blob/vbscript. */
		if (isExternal(href)) return
		const lower = href.trim().toLowerCase()
		if (
			lower.startsWith("javascript:") ||
			lower.startsWith("data:") ||
			lower.startsWith("blob:") ||
			lower.startsWith("vbscript:")
		)
			return

		let url: URL
		try {
			url = new URL(href, window.location.href)
		} catch {
			return
		}
		/* same-origin only — isExternal already covers mailto/tel and cross-origin http(s) */
		if (url.origin !== window.location.origin) return

		if (!ctx) return
		const matchPath = rewritePathname(url.pathname)
		const match = matchRoute(ctx.routeTree, matchPath, caseSensitive, toLocaleMatch(localeConfig))
		if (!match) return

		event.preventDefault()
		/* hash passed separately — buildUrl appends it; if `to` also carried it we'd double-apply */
		void navigate({
			_precomputedMatch: match,
			hash: url.hash || undefined,
			to: url.pathname + url.search,
		})
	}

	/* bubble phase on document — capture handlers (incl. external blockers) fire first, then we handle unclaimed same-origin anchors */
	document.addEventListener("click", handler)
	return () => document.removeEventListener("click", handler)
}

export function setupNavigation(
	providerCtx: FlareProviderContext,
	loadModulesFn: LoadRouteModulesFn,
	initialRouteIdsOrOptions?: SetupNavigationOptions | string[],
): void {
	ctx = providerCtx
	loadRouteModules = loadModulesFn

	const options: SetupNavigationOptions = Array.isArray(initialRouteIdsOrOptions)
		? { initialRouteIds: initialRouteIdsOrOptions }
		: (initialRouteIdsOrOptions ?? {})

	scrollStore = createScrollStore(options.scrollRestorationMaxEntries)
	deferredTracker = createDeferredTracker(providerCtx.matchCache)

	rewrite = options.rewrite
	caseSensitive = options.caseSensitive ?? false

	defaultViewTransition = options.viewTransitions ?? false
	localeConfig = options.locale
	directionConfig = options.direction
	notFoundMode = options.notFoundMode ?? "fuzzy"
	queryClientRef = options.queryClient
	scrollRestorationEnabled = options.scrollRestoration ?? true
	scrollRestorationBehavior = options.scrollRestorationBehavior ?? "auto"

	/* Pre-populate visitedRoutes with hydrated page's route IDs */
	if (options.initialRouteIds) {
		for (const id of options.initialRouteIds) {
			visitedRoutes.add(id)
		}
	}

	if (
		scrollRestorationEnabled &&
		typeof history !== "undefined" &&
		"scrollRestoration" in history
	) {
		history.scrollRestoration = "manual"
	}

	/* Track current history key for scroll save on popstate */
	const initialState = parseHistoryState(typeof history !== "undefined" ? history.state : null)
	currentHistoryKey = initialState?.key ?? null

	/* Bind navigate + prefetch on context via hidden setters */
	const internal = ctx as InternalProviderContext
	if (internal._setNavigate) internal._setNavigate(navigate)
	if (internal._setPrefetch) internal._setPrefetch(prefetch)

	/* Popstate listener — clean up previous before re-registering */
	if (popstateCleanup) popstateCleanup()
	popstateCleanup = createHistoryListener((event: HistoryNavigateEvent) => {
		/* Intercept dismissal: if we're currently intercepted and the new state
		 * doesn't have the _intercepted marker, clear the intercept overlay.
		 * The background route is still rendered — just dismiss the overlay. */
		const eventState = event.state as Record<string, unknown> | null | undefined
		if (ctx?.intercepted() && !(eventState && eventState._intercepted === true)) {
			ctx.setIntercepted(null)
			setHistoryIndex(event.historyIndex)
			currentHistoryKey = event.key
			stopNavigation()
			return
		}

		/* Compute direction before updating index */
		const prevIndex = getHistoryIndex()
		let direction: ViewTransitionDirection = "same"
		if (event.historyIndex > prevIndex) direction = "forward"
		else if (event.historyIndex < prevIndex) direction = "back"
		setHistoryIndex(event.historyIndex)

		/* Save scroll for the page we're leaving (currentHistoryKey is still the old page) */
		if (scrollRestorationEnabled && scrollStore && currentHistoryKey) {
			scrollStore.save(currentHistoryKey, getCurrentScroll())
		}

		/* Update tracked key to destination */
		currentHistoryKey = event.key

		const restorePos = scrollStore?.get(event.key) ?? null

		navigate({
			_popstate: true,
			_popstateDirection: direction,
			_restoreScroll: restorePos,
			scroll: false,
			to: typeof window !== "undefined" ? window.location.href : "/",
		})
	})

	/* Garbage collection interval — clear any existing before creating new */
	if (gcIntervalId !== null) clearInterval(gcIntervalId)
	gcIntervalId = setInterval(() => {
		if (!ctx) return
		const now = Date.now()
		for (const entry of ctx.matchCache.getAll()) {
			if (now - entry.updatedAt > GC_MAX_AGE) {
				ctx.matchCache.delete(entry.matchId)
			}
		}
		ctx.prefetchCache.cleanup(GC_MAX_AGE)
	}, GC_INTERVAL)

	/* Keepalive ping — clear previous before setting up */
	if (keepaliveIntervalId !== null) clearInterval(keepaliveIntervalId)
	if (keepaliveVisibilityHandler) {
		document.removeEventListener("visibilitychange", keepaliveVisibilityHandler)
		keepaliveVisibilityHandler = null
	}

	const keepaliveMs = options.keepalive
	if (typeof keepaliveMs === "number" && keepaliveMs > 0) {
		const ping = () => {
			fetch("/_flare/keepalive", { priority: "low" }).catch(() => {})
		}

		keepaliveIntervalId = setInterval(ping, keepaliveMs)

		keepaliveVisibilityHandler = () => {
			if (document.visibilityState === "hidden") {
				if (keepaliveIntervalId !== null) {
					clearInterval(keepaliveIntervalId)
					keepaliveIntervalId = null
				}
			} else {
				if (keepaliveIntervalId !== null) clearInterval(keepaliveIntervalId)
				ping()
				keepaliveIntervalId = setInterval(ping, keepaliveMs)
			}
		}
		document.addEventListener("visibilitychange", keepaliveVisibilityHandler)
	}

	/* Anchor intercept — clear previous before re-installing (HMR / re-init safety) */
	if (clickCleanup) clickCleanup()
	clickCleanup = setupAnchorIntercept()
}

/** Resolve URL from navigate options. Returns null if same-URL guard triggers. */
function resolveNavigationUrl(options: InternalNavigateOptions): URL | null {
	const resolvedPath = buildUrl({
		hash: options.hash,
		params: options.params,
		search: options.search,
		to: options.to,
	})
	const url = new URL(
		resolvedPath,
		typeof window !== "undefined" ? window.location.href : "http://localhost/",
	)

	/* Same-URL guard (popstate always proceeds — browser already changed URL) */
	if (
		typeof window !== "undefined" &&
		url.href === window.location.href &&
		!options.revalidate &&
		!options._popstate
	) {
		return null
	}

	return url
}

/** Save scroll position + push/replace history state. */
function handleHistoryUpdate(
	options: InternalNavigateOptions,
	url: URL,
	params: Record<string, string | string[]>,
): void {
	if (scrollRestorationEnabled && scrollStore && currentHistoryKey) {
		scrollStore.save(currentHistoryKey, getCurrentScroll())
	}

	let newState: ReturnType<typeof pushHistoryState>
	if (options.replace) {
		newState = replaceHistoryState(url.pathname, params, url.search, {
			hash: url.hash,
			historyIndex: getHistoryIndex(),
			state: options.state,
		})
	} else {
		incrementHistoryIndex()
		newState = pushHistoryState(url.pathname, params, url.search, {
			hash: url.hash,
			historyIndex: getHistoryIndex(),
			state: options.state,
		})
	}
	currentHistoryKey = newState.key
}

/** Map loaded modules to client match objects using cached data. */
function buildClientMatches(
	allModules: LoadedRouteModule[],
	search: SearchParams,
	params: Record<string, string | string[]>,
) {
	return allModules.map((mod) => {
		const deps = mod.effectsConfig?.loaderDeps?.({ search }) ?? []
		const matchId = computeMatchId({
			loaderDeps: () => deps,
			params,
			routeId: mod.virtualPath,
			search,
		})
		const cached = ctx?.matchCache.get(matchId)
		const error = cached?.error instanceof Error ? cached.error : undefined

		return {
			_type: mod._type,
			error,
			errorRender: isRenderFn(mod.errorRender) ? mod.errorRender : undefined,
			loaderData: cached?.data ?? null,
			notFoundRender: isRenderFn(mod.notFoundRender) ? mod.notFoundRender : undefined,
			preloaderContext: cached?.preloaderContext,
			render: mod.render,
			unauthenticatedRender: isRenderFn(mod.unauthenticatedRender)
				? mod.unauthenticatedRender
				: undefined,
			unauthorizedRender: isRenderFn(mod.unauthorizedRender) ? mod.unauthorizedRender : undefined,
			variablePath: mod.variablePath,
			virtualPath: mod.virtualPath,
		}
	})
}

/** Apply view transition with VT API, or call update() directly as fallback.
 * Returns a promise that resolves after update() has executed so navigate()
 * callers can rely on state being settled when the promise resolves.
 *
 * Phase transitions: sets "transitioning" + exposes VT object after startViewTransition,
 * wires finished → "idle". The update() callback (which calls stopNavigation)
 * only handles the non-VT cleanup; VT cleanup is deferred to finished. */
async function applyViewTransition(
	resolvedVT: ViewTransitionConfig,
	update: () => void,
	options: InternalNavigateOptions,
	url: URL,
	version: number,
): Promise<void> {
	const doc = typeof document !== "undefined" ? document : null
	if (doc && hasViewTransitions(doc) && resolvedVT) {
		const startVT = doc.startViewTransition.bind(doc)

		let transition: ViewTransitionResult | undefined
		try {
			if (typeof resolvedVT === "object" && resolvedVT.types) {
				const rawTypes = resolvedVT.types
				if (typeof rawTypes === "function") {
					const direction: ViewTransitionDirection =
						options._popstateDirection ?? (options._popstate ? "back" : "forward")
					const fromLoc = ctx
						? {
								hash: ctx.location().hash,
								pathname: ctx.location().pathname,
								search: serializeSearchParams(ctx.location().search),
							}
						: null
					const toLoc = { hash: url.hash, pathname: url.pathname, search: url.search }
					const info: LocationChangeInfo = {
						direction,
						fromLocation: fromLoc,
						pathChanged: fromLoc?.pathname !== toLoc.pathname,
						toLocation: toLoc,
					}
					const result = rawTypes(info)
					if (result === false) {
						update()
						stopNavigation()
						return
					}
					if (result.length > 0) {
						transition = startVT({ types: result, update })
					} else {
						transition = startVT(update)
					}
				} else if (rawTypes.length > 0) {
					transition = startVT({ types: rawTypes, update })
				} else {
					transition = startVT(update)
				}
			} else {
				transition = startVT(update)
			}
		} catch (e: unknown) {
			warn("nav", "view transition API failed", e)
			update()
			stopNavigation()
			return
		}

		if (transition) {
			/**
			 * WebKit rejects transition.ready with AbortError when a new startViewTransition
			 * call replaces an in-flight one. Chromium swallows this internally but WebKit
			 * surfaces it as an unhandledrejection, which triggers the dev error overlay and
			 * blocks pointer events. The finished promise is already handled below.
			 */
			transition.ready.catch(() => {})

			await transition.updateCallbackDone

			/* State is settled — enter transitioning phase while VT animation plays */
			if (ctx) {
				ctx.setNavigationPhase("transitioning")
				ctx.setViewTransition(transition)
			}

			/* Wire finished → idle (catch rejection too — VT can be skipped/aborted).
			 * Version check prevents stale VT from resetting phase when a new navigation superseded this one. */
			transition.finished.then(
				() => {
					if (ctx && version === navigationVersion) {
						ctx.setNavigationPhase("idle")
						ctx.setViewTransition(null)
					}
				},
				(e: unknown) => {
					warn("nav", "view transition finished with error", e)
					if (ctx && version === navigationVersion) {
						ctx.setNavigationPhase("idle")
						ctx.setViewTransition(null)
					}
				},
			)
		} else {
			/* startVT returned void/undefined — update ran inside it, just clean up */
			stopNavigation()
		}
	} else {
		update()
		stopNavigation()
	}
}

export async function navigate(options: InternalNavigateOptions, redirectCount = 0): Promise<void> {
	if (!ctx)
		throw new Error(
			"navigate() called before setupNavigation(). Call setupNavigation() in your root layout initialization.",
		)
	if (!loadRouteModules)
		throw new Error(
			"loadRouteModules not configured. Ensure the Flare Vite plugin is active in your vite.config.",
		)
	const c = ctx

	/* Step 0: Check SPA blocker (skip for popstate — browser already changed URL) */
	if (activeBlockerFn && !options._popstate && activeBlockerFn()) {
		pendingNavigation = options
		/* Defer to avoid re-entrant navigation from SolidJS reactive effects */
		if (onBlockedCallback) {
			const cb = onBlockedCallback
			queueMicrotask(() => cb())
		}
		return
	}

	/* Step 1: Resolve URL + same-URL guard */
	const url = resolveNavigationUrl(options)
	if (!url) return

	/* Step 2: Abort previous + set navigating */
	if (currentController) currentController.abort()
	const controller = new AbortController()
	currentController = controller
	navigationVersion++
	const myVersion = navigationVersion
	ctx.setNavigationPhase("loading")

	/* Step 3: Match route */
	const matchPath = rewritePathname(url.pathname)
	/* _precomputedMatch: anchor delegate already ran matchRoute — skip the second call */
	const match =
		options._precomputedMatch ??
		matchRoute(ctx.routeTree, matchPath, caseSensitive, toLocaleMatch(localeConfig))
	if (!match) {
		if (notFoundMode === "fuzzy") {
			const partial = matchRoutePartial(
				ctx.routeTree,
				matchPath,
				caseSensitive,
				toLocaleMatch(localeConfig),
			)
			if (partial && loadRouteModules) {
				/* Build a pathname from the partial match that loadRouteModules can resolve */
				const partialUrl = buildUrl({ params: partial.params, to: partial.route.v })
				const modules = await loadRouteModules(partialUrl, ctx.routeTree, ctx.layouts).catch(
					() => null,
				)

				if (modules && !controller.signal.aborted && myVersion === navigationVersion) {
					const search = parseSearchParams(url.searchParams)
					const nonRootLayouts = modules.layouts.filter((m) => m._type !== "root-layout")
					const clientMatches = buildClientMatches(nonRootLayouts, search, partial.params)
					clientMatches.push({
						_type: "render",
						error: new NotFoundError(),
						errorRender: undefined,
						loaderData: null,
						notFoundRender: undefined,
						preloaderContext: undefined,
						render: () => null,
						unauthenticatedRender: undefined,
						unauthorizedRender: undefined,
						variablePath: "",
						virtualPath: `${partial.route.x}/__notfound`,
					})

					if (!options._popstate) {
						handleHistoryUpdate(options, url, partial.params)
					}

					batch(() => {
						c.setNotFound(false)
						c.setMatches(clientMatches)
						c.setParams(partial.params)
						c.setSearch(search)
						stopNavigation()
					})
					syncLocale(partial.params)
					return
				}
			}
		}

		batch(() => {
			c.setNotFound(true)
			c.setMatches([])
			stopNavigation()
		})
		return
	}

	/* Step 3b: Cross-root detection */
	const currentMatches = ctx.matches()
	const currentRoot = extractRootIdentity(currentMatches[0]?.virtualPath ?? "")
	const newRoot = extractRootIdentity(match.route.x)
	if (currentRoot && newRoot && currentRoot !== newRoot) {
		stopNavigation()
		hardNavigate(url.href)
		return
	}

	/* Response route detection */
	if (match.route.t === "x") {
		stopNavigation()
		hardNavigate(url.href)
		return
	}

	/* Intercept route detection: if target has intercept config and current variablePath
	 * matches one of the "from" routes, render as overlay instead of full navigation. */
	const interceptConfig = match.route.o.intercept
	if (interceptConfig && !options._popstate && !options.revalidate) {
		const currentVarPath = ctx.location().variablePath
		if (interceptConfig.from.includes(currentVarPath)) {
			try {
				/* Load modules + fetch data for the intercepted target */
				const modules = await loadRouteModules(matchPath, ctx.routeTree, ctx.layouts)
				if (controller.signal.aborted || myVersion !== navigationVersion) return

				const search = parseSearchParams(url.searchParams)
				const fetchResult = await fetchNDJSON({
					queryClient: queryClientRef,
					signal: controller.signal,
					url: url.href,
				})
				if (controller.signal.aborted || myVersion !== navigationVersion) return

				/* Update matchCache with fetched data */
				const now = Date.now()
				for (const m of fetchResult.matches) {
					ctx.matchCache.set({
						data: m.loaderData,
						error: m.error,
						hasDeferred: m.hasDeferredMarkers,
						invalid: false,
						matchId: m.matchId,
						preloaderContext: m.preloaderContext,
						updatedAt: now,
					})
				}

				/* Build single ClientMatch for the intercepted page */
				const allModules: LoadedRouteModule[] = [modules.page]
				const clientMatches = buildClientMatches(allModules, search, modules.params)
				const interceptedMatch = clientMatches[0]

				if (interceptedMatch) {
					/* Freeze current location as background */
					const backgroundLocation = { ...ctx.location() }

					/* Push state with _intercepted marker */
					if (scrollStore && currentHistoryKey) {
						scrollStore.save(currentHistoryKey, getCurrentScroll())
					}
					incrementHistoryIndex()
					const newState = pushHistoryState(url.pathname, match.params, url.search, {
						hash: url.hash,
						historyIndex: getHistoryIndex(),
						state: { _intercepted: true },
					})
					currentHistoryKey = newState.key

					/* Set intercepted signal — background matches stay untouched */
					c.setIntercepted({
						backgroundLocation,
						dismiss: () => {
							if (typeof history !== "undefined") history.back()
						},
						match: interceptedMatch,
						render: interceptConfig.render,
					})
					c.setParams(modules.params)
					c.setSearch(search)
					syncLocale(modules.params)
				}

				stopNavigation()
				return
			} catch (error: unknown) {
				if (
					typeof error === "object" &&
					error !== null &&
					"name" in error &&
					error.name === "AbortError"
				)
					return
				/* Fall through to normal navigation on intercept failure */
			}
		}
	}

	/* Step 4: Save scroll + update history (skip for popstate — handled in listener) */
	if (!options._popstate) {
		handleHistoryUpdate(options, url, match.params)
	}

	/* Step 4b: Hash-only change — skip loaders, just update hash + scroll.
	 * Compare against ctx.location() since Step 4 already updated window.location.
	 * Skip for popstate — browser already updated window.location, so ctx.location()
	 * reads the new URL, making the comparison always match (false positive).
	 * Skip when revalidate is set — caller explicitly wants loaders to re-run. */
	if (!options._popstate && !options.revalidate) {
		const loc = ctx.location()
		const currentSearch = serializeSearchParams(loc.search)
		if (url.pathname === loc.pathname && url.search === currentSearch) {
			const search = parseSearchParams(url.searchParams)
			batch(() => {
				c.setIntercepted(null)
				c.setParams(match.params)
				c.setSearch(search)
			})
			syncLocale(match.params)
			if (url.hash) {
				const el =
					typeof document !== "undefined" ? document.getElementById(url.hash.slice(1)) : null
				if (el) {
					el.scrollIntoView()
				} else {
					scrollToTop()
				}
			}
			stopNavigation()
			return
		}
	}

	/* Step 5: Shallow navigation guard — only works for same-route URL changes */
	if (options.shallow) {
		const currentPage = c.matches().at(-1)?.virtualPath
		const targetPage = match.route.x
		if (currentPage !== targetPage) {
			warn("nav", `shallow navigation to different route "${targetPage}" ignored`)
		} else {
			let validatedParams: Record<string, string | string[]> = match.params
			let validatedSearch: SearchParams = parseSearchParams(url.searchParams)

			try {
				const mod = await match.route
					.p()
					.then((m: { default?: unknown }) => (m.default ?? m) as Record<string, unknown>)
				const ic = mod.inputConfig as
					| {
							params?:
								| ((r: Record<string, string | string[]>) => Record<string, string | string[]>)
								| {
										parse: (
											r: Record<string, string | string[]>,
										) => Record<string, string | string[]>
								  }
							searchParams?:
								| ((r: URLSearchParams) => Record<string, string>)
								| { parse: (r: URLSearchParams) => Record<string, string> }
					  }
					| undefined

				if (ic?.params) {
					validatedParams =
						typeof ic.params === "function"
							? ic.params(match.params)
							: ic.params.parse(match.params)
				}
				if (ic?.searchParams) {
					validatedSearch =
						typeof ic.searchParams === "function"
							? ic.searchParams(url.searchParams)
							: ic.searchParams.parse(url.searchParams)
				}
			} catch (e: unknown) {
				warn("nav", `shallow validation failed: ${e instanceof Error ? e.message : String(e)}`)
			}

			batch(() => {
				c.setParams(validatedParams)
				c.setSearch(validatedSearch)
				stopNavigation()
			})
			syncLocale(validatedParams)
			return
		}
	}

	try {
		/* Step 6: Load route modules */
		const isNewRoute = !visitedRoutes.has(match.route.x)
		let modules: Awaited<ReturnType<LoadRouteModulesFn>>
		let fetchResult: Awaited<ReturnType<typeof fetchNDJSON>> | null = null

		if (isNewRoute && !options._popstate) {
			/* Parallel fetch for new routes — can't compute stale matchIds without modules */
			const [mods, fetched] = await Promise.all([
				loadRouteModules(matchPath, ctx.routeTree, ctx.layouts),
				fetchNDJSON({ queryClient: queryClientRef, signal: controller.signal, url: url.href }),
			])
			modules = mods
			fetchResult = fetched
		} else {
			modules = await loadRouteModules(matchPath, ctx.routeTree, ctx.layouts)
		}

		if (controller.signal.aborted || myVersion !== navigationVersion) return

		/* Mark route as visited */
		visitedRoutes.add(match.route.x)

		const search = parseSearchParams(url.searchParams)
		/*
		 * Root layout wraps all providers and persists across navigations —
		 * exclude it from client matches so Outlet never re-renders it.
		 */
		const nonRootLayouts = modules.layouts.filter((m) => m._type !== "root-layout")
		const allModules: LoadedRouteModule[] = [...nonRootLayouts, modules.page]

		/* Step 7: Compute match IDs + check staleness (only for known-cached routes) */
		if (!fetchResult) {
			const staleMatchIds: string[] = []

			for (const mod of allModules) {
				const deps = mod.effectsConfig?.loaderDeps?.({ search }) ?? []
				const matchId = computeMatchId({
					loaderDeps: () => deps,
					params: modules.params,
					routeId: mod.virtualPath,
					search,
				})

				const cc = mod.cache?.client
				const staleTime =
					cc === false
						? 0
						: parseMilliseconds(cc?.staleTime ?? ctx?.routerCacheDefaults?.staleTime ?? 0)
				const refetch = mod.effectsConfig?.shouldRefetch?.({
					location: {
						current: {
							hash: ctx.location().hash,
							params: ctx.location().params,
							pathname: ctx.location().pathname,
							search: ctx.location().search,
						},
						next: {
							hash: url.hash,
							params: modules.params,
							pathname: url.pathname,
							search,
						},
					},
					trigger: "navigation",
				})

				if (options._popstate) {
					if (!ctx.matchCache.isCached(matchId)) {
						staleMatchIds.push(matchId)
					}
				} else if (options.revalidate || refetch || ctx.matchCache.isStale(matchId, staleTime)) {
					staleMatchIds.push(matchId)
				}
			}

			/* Step 8: Fetch if needed */
			if (staleMatchIds.length > 0) {
				fetchResult = await fetchNDJSON({
					matchIds: staleMatchIds,
					queryClient: queryClientRef,
					signal: controller.signal,
					url: url.href,
				})
			}
		}

		if (controller.signal.aborted || myVersion !== navigationVersion) return

		/* Step 9: Update matchCache (includes headConfig for per-route head management) */
		if (fetchResult) {
			const headByMatchId = new Map<string, HeadConfig>()
			for (const h of fetchResult.perRouteHeads) {
				headByMatchId.set(h.matchId, h.head)
			}

			/* Build cacheDeferred lookup: matchId → boolean for routes that opt in */
			const cacheDeferredIds = new Set<string>()
			for (const mod of allModules) {
				const clientCache = mod.cache?.client
				if (clientCache !== false && clientCache !== undefined && clientCache.cacheDeferred) {
					const deps = mod.effectsConfig?.loaderDeps?.({ search }) ?? []
					const mId = computeMatchId({
						loaderDeps: () => deps,
						params: modules.params,
						routeId: mod.virtualPath,
						search,
					})
					cacheDeferredIds.add(mId)
				}
			}

			const now = Date.now()
			for (const m of fetchResult.matches) {
				ctx.matchCache.set({
					data: m.loaderData,
					error: m.error,
					hasDeferred: m.hasDeferredMarkers,
					headConfig: headByMatchId.get(m.matchId),
					invalid: false,
					matchId: m.matchId,
					preloaderContext: m.preloaderContext,
					updatedAt: now,
				})

				/* Wire DeferredTracker for cacheDeferred routes */
				if (m.hasDeferredMarkers && deferredTracker && cacheDeferredIds.has(m.matchId)) {
					const collected = collectDeferredPromises(m.loaderData)
					const tracker = deferredTracker
					for (const d of collected) {
						const gen = tracker.track(m.matchId, d.key, () => {})
						d.promise.then(
							(data) => tracker.resolve(m.matchId, d.key, data, gen),
							(err) =>
								tracker.reject(
									m.matchId,
									d.key,
									err instanceof Error ? err : new Error(String(err)),
									gen,
								),
						)
					}
				}
			}

			/* Prune stale deferred entries from previous navigations */
			if (deferredTracker) {
				const activeIds = new Set<string>()
				for (const m of fetchResult.matches) activeIds.add(m.matchId)
				deferredTracker.prune(activeIds)
			}
		}

		/* Step 10: Build client matches */
		const clientMatches = buildClientMatches(allModules, search, modules.params)

		/* Step 11: Compute head data before update — used inside VT callback */
		const freshHeads = fetchResult?.perRouteHeads ?? []
		const fetchedHeadIds = new Set<string>()
		for (const h of freshHeads) fetchedHeadIds.add(h.matchId)
		const perRouteHeads: PerRouteHead[] = [...freshHeads]
		for (const mod of allModules) {
			const deps = mod.effectsConfig?.loaderDeps?.({ search }) ?? []
			const matchId = computeMatchId({
				loaderDeps: () => deps,
				params: modules.params,
				routeId: mod.virtualPath,
				search,
			})
			if (!fetchedHeadIds.has(matchId)) {
				const cached = ctx.matchCache.get(matchId)
				if (cached?.headConfig) {
					perRouteHeads.push({ head: cached.headConfig, matchId })
				}
			}
		}

		/* Step 12: Update state + scroll + head + cleanup.
		 * Everything inside update() so VT captures the complete state transition. */
		const update = () => {
			batch(() => {
				c.setIntercepted(null)
				c.setNotFound(false)
				c.setMatches(clientMatches)
				c.setParams(modules.params)
				c.setSearch(search)
			})
			syncLocale(modules.params)

			/* Popstate scroll restoration — double rAF ensures SolidJS has flushed its
			 * reactive updates and the DOM is ready before we scroll.
			 * Version check prevents stale restore when a new navigation supersedes this one. */
			if (scrollRestorationEnabled && options._restoreScroll !== undefined) {
				requestAnimationFrame(() => {
					requestAnimationFrame(() => {
						if (myVersion !== navigationVersion) return
						if (options._restoreScroll) {
							restoreScroll(options._restoreScroll, scrollRestorationBehavior)
						} else {
							scrollToTop()
						}
					})
				})
			} else if (options.scroll !== false) {
				if (url.hash) {
					const el =
						typeof document !== "undefined" ? document.getElementById(url.hash.slice(1)) : null
					if (el) {
						el.scrollIntoView()
					} else {
						scrollToTop()
					}
				} else {
					scrollToTop()
				}
			}

			applyPerRouteHeads(perRouteHeads)
		}

		/* Step 13: Apply view transition or direct update.
		 * Await ensures navigate() doesn't resolve until update() has run,
		 * so callers see settled state (matches, params, head) after await.
		 * Phase management is handled by applyViewTransition:
		 * - VT path: "transitioning" after updateCallbackDone, "idle" on finished
		 * - No VT: "idle" immediately after update() */
		const resolvedVT = options.viewTransition ?? defaultViewTransition
		await applyViewTransition(resolvedVT, update, options, url, myVersion)
	} catch (error: unknown) {
		if (error instanceof RedirectResponse) {
			if (error.external) {
				stopNavigation()
				hardNavigate(error.url)
				return
			}
			if (redirectCount >= MAX_REDIRECTS) {
				stopNavigation()
				throw new Error(
					`Redirect loop detected after ${redirectCount} redirects. Last target: ${error.url}. Check route redirects for circular references.`,
					{ cause: error },
				)
			}
			return navigate(
				{
					replace: error.replace ?? true,
					to: error.url,
				},
				redirectCount + 1,
			)
		}
		if (error instanceof DOMException && error.name === "AbortError") {
			return
		}
		if (isChunkLoadError(error) && typeof window !== "undefined") {
			try {
				const key = "__flare_chunk_reload__"
				const last = Number(sessionStorage.getItem(key) || 0)
				if (Date.now() - last > 10_000) {
					sessionStorage.setItem(key, String(Date.now()))
					window.location.reload()
					return
				}
			} catch {
				/* sessionStorage unavailable — reload once without guard */
				window.location.reload()
				return
			}
			/* Already reloaded recently — don't loop, let the error propagate */
		}
		stopNavigation()
		throw error
	}
}

const DEFAULT_PREFETCH_STALE_TIME = 30_000

export async function prefetch(options: {
	params?: Record<string, unknown>
	search?: Record<string, unknown>
	to: string
}): Promise<void> {
	if (!ctx) return
	if (!loadRouteModules) return

	const resolved = buildUrl({ params: options.params, search: options.search, to: options.to })
	const url = new URL(
		resolved,
		typeof window !== "undefined" ? window.location.href : "http://localhost/",
	)

	/* Resolve route to read per-route prefetchStaleTime, fall back to default */
	const match = matchRoute(
		ctx.routeTree,
		rewritePathname(url.pathname),
		caseSensitive,
		toLocaleMatch(localeConfig),
	)
	const staleTime = parseMilliseconds(
		match?.route.o.client?.prefetchStaleTime ??
			ctx?.routerCacheDefaults?.prefetchStaleTime ??
			DEFAULT_PREFETCH_STALE_TIME,
	)

	if (!ctx.prefetchCache.shouldPrefetch(url.href, staleTime)) return

	try {
		const [fetchResult] = await Promise.all([
			fetchNDJSON({ prefetch: true, queryClient: queryClientRef, url: url.href }),
			loadRouteModules(rewritePathname(url.pathname), ctx.routeTree, ctx.layouts),
		])

		ctx.prefetchCache.mark(url.href)

		/* Mark route visited so navigate() checks staleness instead of blind re-fetch */
		if (match) visitedRoutes.add(match.route.x)

		const headByMatchId = new Map<string, HeadConfig>()
		for (const h of fetchResult.perRouteHeads) {
			headByMatchId.set(h.matchId, h.head)
		}
		const now = Date.now()
		for (const m of fetchResult.matches) {
			ctx.matchCache.set({
				data: m.loaderData,
				error: m.error,
				hasDeferred: m.hasDeferredMarkers,
				headConfig: headByMatchId.get(m.matchId),
				invalid: false,
				matchId: m.matchId,
				preloaderContext: m.preloaderContext,
				updatedAt: now,
			})
		}
	} catch {
		/* Silently discard errors including redirects — prefetch is speculative
		 * (hover/touch). Navigating on redirect would move the user away from
		 * the current page before they actually click the link. */
	}
}

/* Extracted for testability — jsdom can't spy on window.location.href assignment */
export function hardNavigate(href: string): void {
	if (typeof window !== "undefined") window.location.href = href
}

export function resetNavigationState(): void {
	ctx = null
	currentController = null
	navigationVersion = 0
	scrollStore = null
	loadRouteModules = null
	rewrite = undefined
	caseSensitive = false
	currentHistoryKey = null
	defaultViewTransition = false
	notFoundMode = "fuzzy"
	queryClientRef = undefined
	scrollRestorationEnabled = true
	scrollRestorationBehavior = "auto"
	if (deferredTracker) {
		deferredTracker.clear()
		deferredTracker = null
	}
	visitedRoutes.clear()
	activeBlockerFn = null
	onBlockedCallback = null
	pendingNavigation = null
	if (popstateCleanup) {
		popstateCleanup()
		popstateCleanup = null
	}
	if (clickCleanup) {
		clickCleanup()
		clickCleanup = null
	}
	if (gcIntervalId !== null) {
		clearInterval(gcIntervalId)
		gcIntervalId = null
	}
	if (keepaliveIntervalId !== null) {
		clearInterval(keepaliveIntervalId)
		keepaliveIntervalId = null
	}
	if (keepaliveVisibilityHandler) {
		document.removeEventListener("visibilitychange", keepaliveVisibilityHandler)
		keepaliveVisibilityHandler = null
	}
}

/** Set rewrite for SSR — server handler calls this before render, clears after. */
export function setRewrite(rw: LocationRewrite | undefined): void {
	rewrite = rw
}

/**
 * Apply output rewrite to transform internal path → browser URL.
 * Used by Link to generate correct hrefs when rewrites are active.
 */
export function applyRewriteOutput(href: string): string {
	if (!rewrite) return href
	const url = new URL(href, "http://localhost")
	const rewritten = executeRewriteOutput(rewrite, url)
	let result = rewritten.pathname
	if (rewritten.search) result += rewritten.search
	if (rewritten.hash) result += rewritten.hash
	return result
}

export function isExternal(href: string): boolean {
	if (href.startsWith("http://") || href.startsWith("https://") || href.startsWith("//")) {
		if (typeof window === "undefined") return true
		try {
			const url = new URL(href, window.location.origin)
			return url.origin !== window.location.origin
		} catch {
			return false
		}
	}
	if (href.startsWith("mailto:") || href.startsWith("tel:")) return true
	return false
}
