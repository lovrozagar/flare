import type { Pending } from "./frames.ts"
import { defined } from "../../shared/errors/index.ts"
import { flush } from "solid-js"
import type { Overlay } from "../../shared/components/index.ts"
import type { Intercept } from "../../shared/route-builder/chain.ts"
import type { LoadedEntry, Match } from "../../shared/router/create-router.ts"
import type { Location } from "../../shared/url/index.ts"
import type { FlareHistory } from "../history/index.ts"
import { cachedMatches, remember, type CachePlan, type MatchCache } from "../router/match-cache.ts"
import type { RouterStore, StoreSnapshot } from "../router/store.ts"
import type { Landed } from "./frames.ts"
import type { ScrollStore } from "./scroll.ts"

// `pop` is a popstate step, `index` its history index. `overlay` marks the overlay entry it moved onto.
// `fill` is a same-URL revalidation that asks for a stored page's `"stream"` values and settles the slots its holes
// left (dx/defer.md).
// `initial` is hydrate's own cache plan, which asked to refetch the page on screen (BUGS.md 139).
export type Mode = { pop?: boolean; overlay?: boolean; index?: number; fill?: Pending; initial?: CachePlan }

type Trigger = "initial" | "navigation" | "revalidation"

type OverlayTarget = { url: string; location: Location; match: Match }

export type OverlayDeps = { cache: MatchCache; store: RouterStore; history: FlareHistory; scroll: ScrollStore }

export type Shown = {
	target: OverlayTarget
	chain: readonly LoadedEntry[]
	landing: Landed
	previous: StoreSnapshot
	intercept: Intercept
	write: boolean
	state: unknown
}

// A navigation from a page the target lists in `from` opens the target over it. A revalidation refreshes the open
// overlay and never opens a second one. A popstate opens one only onto an overlay entry (B84).
export function overlayFor(
	target: OverlayTarget,
	snapshot: StoreSnapshot,
	mode: Mode & { trigger: Trigger },
): Intercept | undefined {
	const intercept = target.match.intercept
	if (intercept === undefined) return undefined
	if (mode.pop === true) return mode.overlay === true ? intercept : undefined
	if (mode.trigger !== "navigation") return snapshot.overlay === undefined ? undefined : intercept
	const page = defined(snapshot.matches.at(-1), "the page on screen")
	return intercept.from.includes(page.id) ? intercept : undefined
}

// The background keeps its matches, its head, and its scroll. The overlay entry is always a push, saved as
// `{ index, intercepted: true }`, even when `replace` is set. A page skipped as stale reads its cached data.
export function showOverlay(deps: OverlayDeps, shown: Shown): void {
	const { target, previous, landing } = shown
	const cached = cachedMatches(target.match, target.location)
	remember(deps.cache, cached, landing)
	const page = defined(shown.chain.at(-1), "the overlay page")
	const pageMatch = defined(cached.at(-1), "the overlay page match")
	const owner = defined(previous.matches.at(-1), "the background page")
	const landed = page.id in landing.data
	const stored = landed ? undefined : deps.cache.read(pageMatch)
	const values = (landed ? landing.values?.[page.id] : stored?.values) ?? pageMatch
	const overlay: Overlay = {
		route: page.id,
		label: shown.intercept.render,
		data: landed ? landing.data[page.id] : stored?.data,
		params: values.params,
		search: values.search,
		preloader: landing.preloaders?.[page.id] ?? {},
		location: target.location,
		background: previous.overlay?.background ?? { ...previous.location, params: owner.params },
	}
	if (page.module.render !== undefined) overlay.render = page.module.render
	void deps.store.commit({ ...previous, overlay })
	flush()
	if (!shown.write) return
	deps.scroll.save(deps.history.index(), previous.location)
	deps.history.push(target.url, shown.state, true)
}

// Back onto the background entry: the overlay clears, with no fetch and no scroll.
export function closesOverlay(snapshot: StoreSnapshot, url: string): StoreSnapshot | undefined {
	const background = snapshot.overlay?.background
	if (background === undefined || url !== `${background.pathname}${background.search}${background.hash}`) {
		return undefined
	}
	const next = { ...snapshot }
	delete next.overlay
	return next
}
