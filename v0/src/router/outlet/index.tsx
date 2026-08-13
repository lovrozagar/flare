/**
 * Flare Outlet
 *
 * Renders child route components within layouts.
 * Each Outlet reads from router context and increments depth for nested outlets.
 *
 * ## Hydration Requirements
 *
 * 1. **hydratable: true** - Both SSR and client builds MUST use `solid: { hydratable: true }`.
 *    Without this, client creates new DOM instead of reusing SSR output.
 *    - vite-plugin-solid: `solid({ ssr: false, solid: { hydratable: true } })`
 *    - esbuild-plugin-solid: `solidPlugin({ solid: { generate: "dom", hydratable: true } })`
 *
 * 2. **Module identity** - OutletContext must be the SAME module instance between
 *    provider and outlet. If different, useContext returns undefined.
 *    - tsup: externalize `@flare/v0/router/outlet-context`
 *    - vite: alias to pre-built dist files for both SSR and client
 *
 * 3. **Reactive returns** - Use `memo()` wrapper so Solid tracks content changes.
 *    Without this, CSR navigation updates URL but doesn't re-render content.
 */

/*
 * Import from relative path - tsup bundles this correctly.
 * Module identity is maintained because both SSR and client builds
 * import from the same source file.
 */
import {
	createOutletContext,
	getChildMatch,
	isOutletContext,
	type MatchedRoute,
	OutletContext,
	type OutletContextValue,
	useOutletContext,
} from "@flare/v0/router/outlet-context"
import { type JSX, useContext, Show } from "solid-js"

interface OutletProps {
	children?: JSX.Element
	fallback?: JSX.Element
}

function Outlet(props: OutletProps): JSX.Element {
	const ctx = useContext(OutletContext)

	if (!ctx) {
		console.warn("[Outlet] Must be used within OutletContext.Provider")
		return null as unknown as JSX.Element
	}

	/*
	 * Create reactive match accessor.
	 * This must be called inside reactive context (JSX or effects) to track changes.
	 */
	const getMatch = () => ctx.matches()[ctx.depth + 1]

	/*
	 * Wrap in OutletContext.Provider to maintain context chain for child routes.
	 * The provider value uses a getter for matches to maintain reactivity.
	 */
	const childCtx = {
		depth: ctx.depth + 1,
		matches: ctx.matches,
	}

	/*
	 * Render content reactively. The function call inside JSX tracks dependencies.
	 * OutletContext.Provider ensures child components have proper context.
	 *
	 * Note: Root layouts are filtered out from OutletContext.matches in FlareProvider,
	 * so they never appear here. This matches SSR behavior.
	 */
	return (
		<OutletContext.Provider value={childCtx}>
			{(() => {
				const match = getMatch()
				if (!match) {
					return props.fallback ?? null
				}

				const isLayout = match._type === "layout"
				return (
					<Show when={isLayout} fallback={match.render({ loaderData: match.loaderData })}>
						{match.render({
							children: <Outlet fallback={props.fallback} />,
							loaderData: match.loaderData,
						})}
					</Show>
				)
			})()}
		</OutletContext.Provider>
	) as JSX.Element
}

export type { MatchedRoute, OutletContextValue, OutletProps }

export {
	createOutletContext,
	getChildMatch,
	isOutletContext,
	Outlet,
	OutletContext,
	useOutletContext,
}
