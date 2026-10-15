import { createComponent, createContext, createMemo, untrack, useContext, type Context } from "solid-js"
import type { JSX } from "@solidjs/web"
import type { ChainRecord } from "../route-builder/chain.ts"
import type { Located } from "../route-builder/index.ts"
import type { Location } from "../url/index.ts"
import { ownerGuard, type OutletMatch, type OutletState } from "./outlet.tsx"
import { MatchesContext } from "./outlet-nodes.ts"

// Raw, or what that file's `.input()` returned.
type Values = Located["params"]

// The page an intercepting navigation opened over the background (B84). `location` is the URL in the address
// bar. `background` is the page underneath, which stays mounted.
export type Overlay = {
	route: string
	label: string
	render?: ChainRecord["render"]
	data: unknown
	params: Values
	search: Values
	preloader: Record<string, unknown>
	location: Location
	background: Location & { params: Values }
}

// What the outlet child receives (dx/navigate.md).
export type InterceptState = {
	render: string
	match: { loaderData: unknown; render: () => JSX.Element }
	params: Values
	search: Values
	backgroundLocation: Location & { params: Values }
	dismiss: () => void
}

// The browser provides the store's overlay. The server and a document load have none.
export const NO_OVERLAY = (): Overlay | undefined => undefined

export const OverlayContext: Context<() => Overlay | undefined> = createContext<() => Overlay | undefined>(NO_OVERLAY)

// The layout owns it. With no overlay the child is not called. The page component runs only when the child
// calls `state.match.render`, and the target's layouts are not mounted here.
export function InterceptOutlet(props: { children: (state: InterceptState) => JSX.Element }): JSX.Element {
	const overlay = useContext(OverlayContext)
	const view = createMemo(() => {
		const current = overlay()
		if (current === undefined) return undefined
		const shown = withOverlay(useContext(MatchesContext), current)
		// Each overlay gets its own boundary, so a throw paints in the outlet and closing the overlay clears it (B41).
		return untrack(() => ownerGuard(() => props.children(stateOf(current, shown))))
	})
	// JSX.Element types a reactive child only inside an array, the shape compiled JSX gives a fragment.
	return [view]
}

// The page's own hooks read the overlay as a match on screen, after the background chain. The target's layouts are
// not mounted, so they are not added, and a hook naming one still throws (dx/navigate.md, BUGS.md B16).
function withOverlay(outer: () => OutletState, overlay: Overlay): () => OutletState {
	const match: OutletMatch = {
		id: overlay.route,
		kind: "page",
		module: {},
		params: overlay.params,
		search: overlay.search,
		data: overlay.data,
		preloader: overlay.preloader,
	}
	return () => {
		const state = outer()
		return { ...state, matches: [...state.matches, match] }
	}
}

function stateOf(overlay: Overlay, shown: () => OutletState): InterceptState {
	const render = overlay.render
	return {
		render: overlay.label,
		match: {
			loaderData: overlay.data,
			render: () =>
				render === undefined
					? undefined
					: createComponent(MatchesContext, {
							value: shown,
							get children() {
								return createComponent(render, {
									loaderData: overlay.data,
									params: overlay.params,
									search: overlay.search,
									preloaderContext: overlay.preloader,
								})
							},
						}),
		},
		params: overlay.params,
		search: overlay.search,
		backgroundLocation: overlay.background,
		dismiss: () => history.back(),
	}
}
