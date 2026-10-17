import { createComponent, createSignal } from "solid-js"
import type { JSX } from "@solidjs/web"
import { appTree, Matches } from "../../shared/components/index.ts"
import type { LinkPrefetch, NavigateTo } from "../../shared/router/context.ts"
import type { Router } from "../../shared/router/create-router.ts"
import { applyHeads } from "../head/index.ts"
import type { Blockers } from "../navigation/blocker.ts"
import type { NavigationState } from "../navigation/pending.ts"
import type { RouterStore, ScriptMatch } from "../router/store.ts"
import type { Location } from "../../shared/url/index.ts"
import { matchFromWire } from "../../shared/protocol/value.ts"

// `build` is the deploy's id, written by the server once bit 12 lands. Until then it is absent, and an empty id
// disables the mismatch check on both sides (B7, B84).
// `fill` marks a stored document that left a `"stream"` hole: one fill follows hydrate (dx/defer.md). `head` is the
// server's `<head>` sequence the guard matches (B120); a state written before it has none. `at` is the render's time,
// which a stored or CDN copy replays (BUGS.md 139); a state written before it has none.
export type ClientState = {
	matches: ScriptMatch[]
	nonce: string
	build?: string
	at?: number
	fill?: boolean
	head?: string[]
	search?: string
}

// Solid's hydrate in the browser. A test passes a client render instead.
export type Mount = (code: () => JSX.Element, root: Document) => () => void

export type App = {
	router: Router
	store: RouterStore
	navigation: NavigationState
	blockers: Blockers
	prefetcher: LinkPrefetch
	navigate: (options: NavigateTo) => Promise<void>
	mount: Mount
	// The location the server rendered, which the document mounts on (renderedLocation).
	rendered?: Location | undefined
}

// The location the server rendered: its search, none for a shared or stored render, and no hash, which it never sees.
// Hydrate mounts on it, so the DOM matches, and the browser's own URL follows once it is mounted, so a binding that
// reads the search or the hash, a Link's current state among them, shows the URL on screen (plan 21 13.8, 13.9).
export function renderedLocation(state: ClientState, location: Location): Location {
	return { pathname: location.pathname, search: state.search ?? "", hash: "" }
}

export function readState(): ClientState {
	// The last script with the state id: the server writes it after the page's content (BUGS.md 167).
	const script = [...document.querySelectorAll("script#flare-state")].at(-1)
	if (script === undefined) throw new Error("The document has no self.flare state script")
	const text = script.textContent
	const state: ClientState = JSON.parse(text.slice(text.indexOf("=") + 1))
	// Each match's app values arrive as wire values (B145).
	return { ...state, matches: state.matches.map(matchFromWire) }
}

// The tree the server rendered, over the whole document: the same providers, then the matches, then the head
// (B91). The server's `_$HY` capture object stays as it is: hydrate reads it and replays the events it stored.
export function mountApp(app: App): () => void {
	const [shown, setShown] = createSignal<Location | undefined>(app.rendered)
	const values = {
		router: app.router,
		location: () => shown() ?? app.store.snapshot().location,
		navigate: app.navigate,
		navigation: app.navigation,
		blockers: app.blockers,
		prefetcher: app.prefetcher,
		overlay: () => app.store.snapshot().overlay,
	}
	const unmount = app.mount(
		() =>
			appTree(values, () => [
				createComponent(Matches, { state: app.store.outlet }),
				createComponent(Heads, { store: app.store }),
			]),
		document,
	)
	// Mounted: the location readers, a Link's current state among them, show the browser's own URL (plan 21 13.8).
	setShown(undefined)
	return unmount
}

function Heads(props: { store: RouterStore }): JSX.Element {
	applyHeads(() => props.store.snapshot().heads)
	return undefined
}
