import { createComponent, createContext, createEffect, createMemo, untrack, useContext, type Context } from "solid-js"
import type { JSX } from "@solidjs/web"
import type { ChainRecord } from "../route-builder/chain.ts"
import type { Located } from "../route-builder/index.ts"
import type { Location } from "../url/index.ts"
import { ownerGuard, type OutletMatch, type OutletState } from "./outlet.tsx"
import { MatchesContext } from "./outlet-nodes.ts"
import { defined } from "../errors/defined.ts"
import { trapFocus } from "./overlay-focus.ts"

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
// calls `state.match.render`, and the target's layouts are not mounted here. The child is built once per overlay route:
// a revalidation, or a navigation inside the open overlay, refreshes its values in place, as a page on screen is, so
// focus and a caret stay put (BUGS.md 315).
export function InterceptOutlet(props: { children: (state: InterceptState) => JSX.Element }): JSX.Element {
	const overlay = useContext(OverlayContext)
	// Read only while the child is on screen, which is only while an overlay is open.
	const latest = (): Overlay => defined(overlay(), "the open overlay")
	const key = createMemo(() => {
		const current = overlay()
		return current === undefined ? undefined : JSON.stringify([current.label, current.route])
	})
	const view = createMemo(() => {
		if (key() === undefined) return undefined
		const shown = withOverlay(useContext(MatchesContext), latest)
		// Each overlay gets its own boundary, so a throw paints in the outlet and closing the overlay clears it (B41).
		return untrack(() => ownerGuard(() => trapped(stateOf(latest, shown), props.children)))
	})
	// JSX.Element types a reactive child only inside an array, the shape compiled JSX gives a fragment.
	return [view]
}

// The overlay's own elements hold focus while it is open (overlay-focus.ts, B142). The child renders as it always did;
// the trap goes up once its output is on screen, in an effect a server render never runs, and comes down with it. It
// reads the output's elements when it needs them, through the accessors compiled JSX leaves, so it never calls the child
// again and never rebuilds what the overlay shows.
function trapped(state: InterceptState, child: (state: InterceptState) => JSX.Element): JSX.Element {
	const output = child(state)
	createEffect(
		() => output,
		(value) => trapFocus(() => elementsOf(value), state.dismiss),
	)
	return output
}

function elementsOf(value: unknown): Element[] {
	if (typeof value === "function") return elementsOf(untrack(() => (value as () => unknown)()))
	if (Array.isArray(value)) return value.flatMap(elementsOf)
	return value instanceof Element ? [value] : []
}

// The page's own hooks read the overlay as a match on screen, after the background chain. The target's layouts are
// not mounted, so they are not added, and a hook naming one still throws (dx/navigate.md, BUGS.md B16).
function withOverlay(outer: () => OutletState, overlay: () => Overlay): () => OutletState {
	return () => {
		const state = outer()
		const current = overlay()
		const match: OutletMatch = {
			id: current.route,
			kind: "page",
			module: {},
			params: current.params,
			search: current.search,
			data: current.data,
			preloader: current.preloader,
			location: current.location,
		}
		return { ...state, matches: [...state.matches, match] }
	}
}

// Every value reads the overlay on screen now, so a refresh reaches the child and the page without building them again.
function stateOf(overlay: () => Overlay, shown: () => OutletState): InterceptState {
	const page = {
		get loaderData() {
			return overlay().data
		},
		get params() {
			return overlay().params
		},
		get search() {
			return overlay().search
		},
		get preloaderContext() {
			return overlay().preloader
		},
	}
	return {
		get render() {
			return overlay().label
		},
		match: {
			get loaderData() {
				return overlay().data
			},
			render: () => {
				const render = untrack(overlay).render
				return render === undefined
					? undefined
					: createComponent(MatchesContext, {
							value: shown,
							get children() {
								return createComponent(render, page)
							},
						})
			},
		},
		get params() {
			return overlay().params
		},
		get search() {
			return overlay().search
		},
		get backgroundLocation() {
			return overlay().background
		},
		dismiss: () => history.back(),
	}
}
