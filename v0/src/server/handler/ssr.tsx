/**
 * SSR Rendering
 *
 * Builds component tree and renders with Solid's renderToStringAsync.
 * Uses Outlet component for consistent hydration with client.
 * Uses Hydration/NoHydration boundaries for proper client hydration.
 *
 * CSS injection:
 * - Scoped styles: collected during render, injected into head post-render
 * - Reset CSS: use <ResetCSS /> component in root layout
 */

import {
	clearGlobalFlareContext,
	FlareContext,
	setGlobalFlareContext,
} from "@flare/v0/client/flare-context"
import { type MatchedRoute, OutletContext } from "@flare/v0/router/outlet-context"
import type { QueryClient } from "@tanstack/query-core"
import { type JSX, sharedConfig } from "solid-js"
import { Hydration, NoHydration } from "solid-js/web"
import { setSSRContext } from "../../components/ssr-context"
import { QueryClientProvider } from "../../query-client/query-client-provider"
import type { HeadConfig, LoaderCause, RouteType } from "../../router/_internal/types"
import { Outlet } from "../../router/outlet"
import { clearScopedStyles, getScopedStyles, STYLE_TAG_ID } from "../../styles/registry"

interface SSRMatch {
	_type: RouteType
	loaderData: unknown
	preloaderContext: unknown
	render: (props: unknown) => JSX.Element | null
	virtualPath: string
}

interface SSRContext {
	cause: LoaderCause
	entryScript?: string
	flareStateScript: string
	location: {
		params: Record<string, string | string[]>
		pathname: string
		search: Record<string, unknown>
	}
	nonce: string
	prefetch: boolean
	preloaderContext: Record<string, unknown>
	queryClient?: unknown
	resolvedHead?: HeadConfig
}

interface RootLayoutRenderProps {
	cause: LoaderCause
	children: JSX.Element
	loaderData: unknown
	location: unknown
	prefetch: boolean
	preloaderContext: unknown
	queryClient: unknown
}

/**
 * Build a factory that creates the component tree from matched routes.
 * Returns a function to defer JSX creation until inside renderToStringAsync.
 * Uses Outlet for consistent component structure with client hydration.
 * Root layout renders HTML shell, non-root matches render through Outlet.
 *
 * Hydration boundaries:
 * - NoHydration wraps the entire document (html/head/body)
 * - Hydration wraps the body content that will be hydrated on client
 */
function createComponentTreeFactory(
	matches: SSRMatch[],
	ctx: SSRContext,
): (() => JSX.Element) | null {
	if (matches.length === 0) return null

	/* Separate root layout from other matches */
	const rootLayout = matches.find((m) => m._type === "root-layout")
	const nonRootMatches = matches.filter((m) => m._type !== "root-layout")

	/* Convert to MatchedRoute format for Outlet */
	const outletMatches: MatchedRoute[] = nonRootMatches.map((m) => ({
		_type: m._type,
		loaderData: m.loaderData,
		preloaderContext: m.preloaderContext,
		render: (props: unknown) => {
			const p = props as { children?: JSX.Element; loaderData: unknown }
			const fullProps = {
				cause: ctx.cause,
				children: p.children,
				loaderData: p.loaderData,
				location: ctx.location,
				prefetch: ctx.prefetch,
				preloaderContext: m.preloaderContext,
				queryClient: ctx.queryClient,
			}
			return m.render(fullProps)
		},
		virtualPath: m.virtualPath,
	}))

	/* Build all matches for FlareContext (hooks need access to all routes) */
	const allMatches: MatchedRoute[] = matches.map((m) => ({
		_type: m._type,
		loaderData: m.loaderData,
		preloaderContext: m.preloaderContext,
		render: m.render,
		virtualPath: m.virtualPath,
	}))

	/* Build Outlet-based content for body */
	const outletContext = {
		depth: -1,
		matches: () => outletMatches,
	}

	/*
	 * Return factory function that creates JSX inside render context.
	 * This ensures Hydration/NoHydration components have access to SSR context.
	 *
	 * Pattern from SolidStart:
	 * - NoHydration wraps entire document (prevents markers on html/head/body)
	 * - Hydration wraps app content (enables markers for hydratable region)
	 */
	return () => {
		/* Set SSR context on sharedConfig (replaces SSRContextProvider) */
		setSSRContext({
			entryScript: ctx.entryScript,
			flareStateScript: ctx.flareStateScript,
			isServer: true,
			nonce: ctx.nonce,
			resolvedHead: ctx.resolvedHead,
		})

		/* Create SSR FlareContext value for hooks (useLoaderData, usePreloaderContext, useLocation, etc.) */
		const ssrFlareContext = {
			location: () => ({
				hash: "",
				pathname: ctx.location.pathname,
				search: new URLSearchParams(
					Object.entries(ctx.location.search).map(([k, v]) => [k, String(v)]),
				).toString(),
			}),
			matches: () => allMatches,
			params: () => ctx.location.params,
		}

		/*
		 * Set SSR global value for hooks fallback.
		 * This bypasses solid-js context when module identity causes useContext to fail.
		 */
		setGlobalFlareContext(ssrFlareContext)

		/*
		 * CRITICAL: Set FlareContext directly on sharedConfig.context.
		 *
		 * In Solid SSR, children are evaluated before parent components run.
		 * JSX like <FlareContext.Provider><Child/></FlareContext.Provider> evaluates
		 * <Child/> BEFORE the Provider sets context[FlareContext.id].
		 *
		 * Solution: Set context value directly on sharedConfig.context using FlareContext.id.
		 * This mirrors what the Provider would do, but happens before children evaluate.
		 */
		const flareContextId = (FlareContext as { id: symbol }).id
		const outletContextId = (OutletContext as { id: symbol }).id
		if (sharedConfig.context) {
			;(sharedConfig.context as Record<symbol, unknown>)[flareContextId] = ssrFlareContext
			;(sharedConfig.context as Record<symbol, unknown>)[outletContextId] = outletContext
		}

		function SSRAppWrapper(props: { children: JSX.Element }): JSX.Element {
			const outletContent = (
				<OutletContext.Provider value={outletContext}>{props.children}</OutletContext.Provider>
			)
			const maybeQueryWrapped = ctx.queryClient ? (
				<QueryClientProvider client={ctx.queryClient as QueryClient}>
					{outletContent}
				</QueryClientProvider>
			) : (
				outletContent
			)
			return (
				<FlareContext.Provider value={ssrFlareContext as any}>
					{maybeQueryWrapped}
				</FlareContext.Provider>
			)
		}

		const bodyContent = (
			<Hydration>
				<SSRAppWrapper>
					<Outlet />
				</SSRAppWrapper>
			</Hydration>
		)

		/* If no root layout, return hydration-wrapped body directly */
		if (!rootLayout) {
			return bodyContent
		}

		/* Capture narrowed type for closure */
		const layout: SSRMatch = rootLayout

		/* Render root layout with hydration-wrapped children */
		const rootProps: RootLayoutRenderProps = {
			cause: ctx.cause,
			children: bodyContent,
			loaderData: layout.loaderData,
			location: ctx.location,
			prefetch: ctx.prefetch,
			preloaderContext: ctx.preloaderContext,
			queryClient: ctx.queryClient,
		}

		/*
		 * Wrap entire document in NoHydration (like SolidStart pattern).
		 * This prevents hydration markers on html/head/body elements.
		 * The Hydration boundary inside {children} re-enables markers for app content.
		 *
		 * FlareContext wraps the entire tree so hooks work in root layout too.
		 * RootLayoutWrapper defers render() call so context is available.
		 */
		function RootLayoutWrapper(): JSX.Element {
			return <NoHydration>{layout.render(rootProps)}</NoHydration>
		}

		return (
			<FlareContext.Provider value={ssrFlareContext as any}>
				<RootLayoutWrapper />
			</FlareContext.Provider>
		)
	}
}

/**
 * Inject scoped CSS styles into HTML head.
 * Finds </head> and inserts styles before it.
 */
function injectCssIntoHead(html: string, nonce: string): string {
	const scopedStyles = getScopedStyles()

	if (!scopedStyles) {
		return html
	}

	const styleTag = `<style data-testid="page-scoped-css" id="${STYLE_TAG_ID}" nonce="${nonce}">${scopedStyles}</style>`

	const headEndIdx = html.indexOf("</head>")
	if (headEndIdx === -1) {
		return html
	}

	return html.slice(0, headEndIdx) + styleTag + html.slice(headEndIdx)
}

/**
 * Render matches to HTML string using Solid SSR.
 * Uses sharedConfig.context for SSR data (no provider wrapper needed).
 * Returns null if SSR produces empty output (caller should fallback).
 *
 * CSS handling:
 * 1. Clears scoped styles before render
 * 2. Components register CSS during render via css= prop
 * 3. After render, injects scoped styles into head
 */
async function renderToHTML(matches: MatchedRoute[], ctx: SSRContext): Promise<string | null> {
	const { renderToStringAsync } = await import("solid-js/web")

	/* Clear scoped styles from previous render */
	clearScopedStyles()

	const ssrMatches: SSRMatch[] = matches.map((m) => ({
		_type: (m as unknown as { _type?: RouteType })._type ?? "render",
		loaderData: m.loaderData,
		preloaderContext: m.preloaderContext,
		render: m.render,
		virtualPath: m.virtualPath,
	}))

	const treeFactory = createComponentTreeFactory(ssrMatches, ctx)

	if (!treeFactory) {
		return null
	}

	/*
	 * Render inside renderToStringAsync callback.
	 * This ensures Hydration/NoHydration have access to SSR context.
	 * setSSRContext is called in treeFactory to set context on sharedConfig.
	 * During render, components call registerCSS() which populates the style registry.
	 */
	const html = await renderToStringAsync(() => treeFactory())

	/* Clear SSR global after render completes */
	clearGlobalFlareContext()

	/* If render produced empty/minimal output, signal fallback needed */
	if (!html || html.trim().length < 10) {
		return null
	}

	/* Inject scoped styles into head */
	const htmlWithCss = injectCssIntoHead(html, ctx.nonce)

	/* Prepend DOCTYPE - Solid doesn't output it by default */
	return `<!DOCTYPE html>${htmlWithCss}`
}

export type { SSRContext, SSRMatch }
export { createComponentTreeFactory, renderToHTML }
