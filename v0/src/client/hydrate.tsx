/**
 * Flare Client Hydration
 *
 * Simple API for client-side hydration.
 * Encapsulates all complexity - consumer just provides routeTree, layouts, and queryClientGetter.
 */

import type { QueryClient } from "@tanstack/query-core"
import type { JSX } from "solid-js"
import { hydrate as solidHydrate } from "solid-js/web"
/* DevErrorOverlay loaded dynamically to avoid SSR compilation issues */
/* Import dev-error-store for side effect - attaches window listeners */
import { devErrorStore } from "../errors/dev-error-store"
import { waitForLazyPreloads } from "../lazy"
import { Outlet } from "../router/outlet"
import type { FlareTreeNode } from "../router/tree-types"
import { deriveLayouts, matchRoute } from "../router/tree-types"
import type { LayoutModule } from "../server"
import { createFlareClient, parseFlareState } from "./init"
import type { FlareProviderContext } from "./provider"
import { FlareProvider } from "./provider"

/**
 * Dummy component to match SSR's Hydration component depth.
 *
 * SolidStart pattern: The Hydration component on SSR adds 2 levels to the
 * component tree (Hydration function + NoHydrationContext.Provider inside).
 * On client, we use a Dummy wrapper to match the exact tree depth.
 * This ensures hydration keys align between SSR and client.
 */
function Dummy(props: { children: JSX.Element }): JSX.Element {
	return props.children
}

type RouteComponent = {
	_type: string
	loader?: (ctx: unknown) => Promise<unknown>
	render: (props: unknown) => unknown
	virtualPath: string
}

interface HydrateConfig {
	/** Layout loaders from generated routes - Record<layoutKey, () => Promise<LayoutModule>> */
	layouts: Record<string, () => Promise<LayoutModule>>
	/** Query client factory - creates new QueryClient per request */
	queryClientGetter: () => QueryClient
	/** Route tree from generated routes */
	routeTree: FlareTreeNode
}

/**
 * Hydrate the Flare app.
 *
 * Simple consumer API - all complexity is encapsulated.
 *
 * @example
 * ```tsx
 * import { hydrate } from "@flare/v0/client"
 * import { routeTree, layouts } from "./_gen/routes.gen"
 * import { getQueryClient } from "./query-client"
 *
 * hydrate({
 *   queryClientGetter: getQueryClient,
 *   routeTree,
 *   layouts
 * })
 * ```
 */
export function hydrate(config: HydrateConfig): void {
	const { layouts, queryClientGetter, routeTree } = config

	/* Read flare state from SSR - injected by server as self.flare */
	const flareState = parseFlareState((self as unknown as { flare?: unknown }).flare)

	if (!flareState) {
		console.error("[Flare] No flare state found")
		return
	}

	/* Hydrate SSR errors to dev overlay (dev only) */
	if (import.meta.env.DEV && flareState.e) {
		for (const ssrError of flareState.e) {
			devErrorStore.register(ssrError)
		}
	}

	/* Create query client early - needed for both createFlareClient and FlareProvider */
	const queryClient = queryClientGetter()

	/* Set global QueryClient BEFORE anything else.
	 * This ensures useQueryClient can find it even during hydration. */
	;(globalThis as Record<string, unknown>).__FLARE_QUERY_CLIENT__ = queryClient

	/* Create client with query client for NDJSON cache sync */
	const client = createFlareClient({ flareState, queryClient })

	/* Load JS chunks for route (page + layouts) */
	async function loadRouteModules(pathname: string): Promise<{
		layouts: RouteComponent[]
		page: RouteComponent
		params: Record<string, string | string[]>
	} | null> {
		const matchResult = matchRoute(routeTree, pathname)
		if (!matchResult) {
			console.error("[Flare] No route match for:", pathname)
			return null
		}

		const { route, params } = matchResult

		/* Load page and layouts in parallel */
		const layoutKeys = deriveLayouts(route.x)
		const [pageModule, ...layoutModules] = await Promise.all([
			route.p(),
			...layoutKeys.map((layoutKey) => {
				const layoutLoader = layouts[layoutKey]
				return layoutLoader ? layoutLoader() : null
			}),
		])

		const pageComponent = pageModule.default as RouteComponent
		const loadedLayouts = layoutModules
			.filter((m): m is LayoutModule => m !== null)
			.map((m) => m.default as RouteComponent)

		return { layouts: loadedLayouts, page: pageComponent, params }
	}

	/* Build matches from loaded modules + cached data */
	function buildMatches(
		providerContext: FlareProviderContext,
		modules: {
			layouts: RouteComponent[]
			page: RouteComponent
			params: Record<string, string | string[]>
		},
	): void {
		const matchCache = client.getMatchCache()
		const cachedMatches = matchCache.getAll()
		const pageCached = cachedMatches.find((m) => m.matchId === modules.page.virtualPath)

		/*
		 * Include ALL layouts in matches for hooks (useLoaderData, usePreloaderContext).
		 * Root layouts don't render on client (HTML already in DOM), but hooks still need their data.
		 * Outlet filters out root-layout when rendering.
		 */
		const matches = [
			...modules.layouts.map((layout) => {
				const cached = cachedMatches.find((m) => m.matchId === layout.virtualPath)
				return {
					_type: layout._type as "layout" | "root-layout",
					loaderData: cached?.data ?? {},
					preloaderContext: cached?.preloaderContext,
					render: layout.render,
					virtualPath: layout.virtualPath,
				}
			}),
			{
				_type: modules.page._type as "render",
				loaderData: pageCached?.data ?? {},
				preloaderContext: pageCached?.preloaderContext,
				render: modules.page.render,
				virtualPath: modules.page.virtualPath,
			},
		]

		providerContext.setMatches(matches as never)
		providerContext.setParams(modules.params)
	}

	/* Setup navigate override when context is ready */
	function setupNavigateOverride(providerContext: FlareProviderContext): void {
		const clientRouter = client.getRouter()

		providerContext.router.navigate = async (
			options: Parameters<typeof clientRouter.navigate>[0],
		) => {
			const resolvedUrl =
				options.params && Object.keys(options.params).length > 0
					? options.to.replace(/\[([^\]]+)\]/g, (_: string, key: string) =>
							String(options.params?.[key] ?? key),
						)
					: options.to

			/* Clear dev errors on navigation (errors are page-specific) */
			if (import.meta.env.DEV) {
				devErrorStore.clear()
			}

			providerContext.setIsNavigating(true)

			try {
				/* Parallel: NDJSON data + JS chunks */
				/* Use clientRouter.navigate directly to avoid provider's updateMatchesFromCache */
				/* which would set render: () => null before buildMatches runs */
				const [, modules] = await Promise.all([
					clientRouter.navigate(options),
					loadRouteModules(resolvedUrl),
				])

				/* Build matches from cache + loaded modules (with proper render functions) */
				if (modules) {
					buildMatches(providerContext, modules)
				}

				/* Update location */
				providerContext.setLocation({
					hash: options.hash ?? "",
					pathname: resolvedUrl,
					search: "",
				})
			} finally {
				providerContext.setIsNavigating(false)
			}
		}
	}

	/* Mount dev error overlay IMMEDIATELY (before hydration can fail) */
	if (import.meta.env.DEV) {
		Promise.all([import("solid-js/web"), import("../components/dev-error-overlay")]).then(
			([{ render }, { DevErrorOverlay }]) => {
				const overlayContainer = document.createElement("div")
				overlayContainer.id = "__flare-dev-overlay__"
				document.body.appendChild(overlayContainer)
				render(() => <DevErrorOverlay />, overlayContainer)
			},
		)
	}

	/* Load initial route components then hydrate */
	loadRouteModules(flareState.r.pathname).then(async (initialModules) => {
		/*
		 * Wait for all lazy component preloads to complete.
		 * Lazy components start preloading when their module evaluates (during loadRouteModules).
		 * We must wait for them before hydration to prevent mismatch.
		 */
		await waitForLazyPreloads()

		/*
		 * Hydrate SSR content - reuses existing DOM.
		 * Must match SSR structure: #app contains {children} (Outlet renders page).
		 * SSR wraps content in <Hydration> boundary, client hydrates matching structure.
		 */
		const appRoot = document.getElementById("app")
		if (!appRoot) {
			console.error("[Flare] No #app element found for hydration")
			return
		}

		/*
		 * Hydrate SSR content using FlareProvider.
		 *
		 * FlareProvider creates signals INSIDE the component (reactive context).
		 * The onContextReady callback gives us access to set up the navigate override.
		 *
		 * Hydration alignment pattern:
		 * - SSR: Hydration > SSRAppWrapper > Outlet (7 zeros depth)
		 * - Client: Dummy > FlareProvider > Outlet (matches SSR depth)
		 *
		 * The Dummy wrapper matches the Hydration component's depth contribution.
		 */
		solidHydrate(
			() => (
				<Dummy>
					<FlareProvider
						client={client}
						onContextReady={(ctx) => {
							/* Set initial matches from pre-loaded modules */
							if (initialModules) {
								buildMatches(ctx, initialModules)
							}
							/* Set up navigate override for chunk loading */
							setupNavigateOverride(ctx)
						}}
						queryClient={queryClient}
					>
						<Outlet />
					</FlareProvider>
				</Dummy>
			),
			appRoot,
		)

		/* Signal hydration complete */
		document.documentElement.setAttribute("data-hydrated", "true")
		;(globalThis as Record<string, unknown>).__FLARE_HYDRATED__ = true
	})
}

export type { HydrateConfig }
