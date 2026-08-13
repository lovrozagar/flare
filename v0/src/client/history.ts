/**
 * History Integration
 *
 * Browser history API integration for client-side navigation.
 * Handles popstate, pushState, replaceState, and scroll restoration.
 */

import type { NavFormat } from "../server/handler/constants"

/**
 * History state stored with each navigation.
 */
interface HistoryState {
	hash: string
	/** History index for view transition direction detection */
	historyIndex: number
	key: string
	navFormat?: NavFormat
	params: Record<string, string | string[]>
	pathname: string
	search: string
}

/**
 * Scroll position for restoration.
 */
interface ScrollPosition {
	x: number
	y: number
}

/**
 * Navigation event from popstate.
 */
interface HistoryNavigateEvent {
	hash: string
	/** History index for view transition direction detection */
	historyIndex: number
	key: string
	navFormat?: NavFormat
	params: Record<string, string | string[]>
	pathname: string
	search: string
	type: "popstate"
}

let keyCounter = 0

/**
 * Generate unique key for history entry.
 */
function generateKey(): string {
	keyCounter++
	return `${Date.now().toString(36)}-${keyCounter.toString(36)}`
}

/**
 * Create history state object.
 */
function createHistoryState(
	pathname: string,
	params: Record<string, string | string[]> = {},
	search = "",
	hash = "",
	navFormat?: NavFormat,
	historyIndex = 0,
): HistoryState {
	return {
		hash,
		historyIndex,
		key: generateKey(),
		navFormat,
		params,
		pathname,
		search,
	}
}

/**
 * Parse and validate history state from popstate event.
 */
function parseHistoryState(state: unknown): HistoryState | null {
	if (state === null || state === undefined) return null
	if (typeof state !== "object") return null
	if (Array.isArray(state)) return null

	const obj = state as Record<string, unknown>

	if (typeof obj.pathname !== "string") return null
	if (typeof obj.key !== "string") return null

	return {
		hash: typeof obj.hash === "string" ? obj.hash : "",
		historyIndex: typeof obj.historyIndex === "number" ? obj.historyIndex : 0,
		key: obj.key,
		navFormat: obj.navFormat === "html" || obj.navFormat === "ndjson" ? obj.navFormat : undefined,
		params: (obj.params as Record<string, string | string[]>) ?? {},
		pathname: obj.pathname,
		search: typeof obj.search === "string" ? obj.search : "",
	}
}

/**
 * Create scroll position object.
 */
function createScrollPosition(x = 0, y = 0): ScrollPosition {
	return { x, y }
}

/**
 * Create scroll position store with LRU eviction.
 */
function createScrollStore(maxSize = 50) {
	const positions = new Map<string, ScrollPosition>()
	const keys: string[] = []

	return {
		get(key: string): ScrollPosition | null {
			return positions.get(key) ?? null
		},

		save(key: string, position: ScrollPosition): void {
			/* Remove if exists (will re-add at end) */
			const existingIdx = keys.indexOf(key)
			if (existingIdx > -1) {
				keys.splice(existingIdx, 1)
			}

			/* Add to end */
			keys.push(key)
			positions.set(key, position)

			/* Evict oldest if over limit */
			while (keys.length > maxSize) {
				const oldest = keys.shift()
				if (oldest) positions.delete(oldest)
			}
		},
	}
}

/**
 * Create popstate listener for browser back/forward navigation.
 * Safe for SSR - returns no-op cleanup if event APIs not available.
 */
function createHistoryListener(onNavigate: (event: HistoryNavigateEvent) => void): () => void {
	/* SSR safety check */
	if (typeof globalThis.addEventListener !== "function") {
		return () => {}
	}

	function handlePopstate(event: PopStateEvent): void {
		const state = parseHistoryState(event.state)
		if (!state) return

		onNavigate({
			hash: state.hash,
			historyIndex: state.historyIndex,
			key: state.key,
			navFormat: state.navFormat,
			params: state.params,
			pathname: state.pathname,
			search: state.search,
			type: "popstate",
		})
	}

	globalThis.addEventListener("popstate", handlePopstate)

	return () => {
		globalThis.removeEventListener("popstate", handlePopstate)
	}
}

/**
 * Push new history entry.
 * Safe for SSR - returns state without modifying history if not available.
 */
function pushHistoryState(
	pathname: string,
	params: Record<string, string | string[]> = {},
	search = "",
	hash = "",
	navFormat?: NavFormat,
	historyIndex = 0,
): HistoryState {
	const state = createHistoryState(pathname, params, search, hash, navFormat, historyIndex)
	const url = `${pathname}${search}${hash}`

	if (typeof globalThis.history !== "undefined" && globalThis.history.pushState) {
		globalThis.history.pushState(state, "", url)
	}

	return state
}

/**
 * Replace current history entry.
 * Safe for SSR - returns state without modifying history if not available.
 */
function replaceHistoryState(
	pathname: string,
	params: Record<string, string | string[]> = {},
	search = "",
	hash = "",
	navFormat?: NavFormat,
	historyIndex = 0,
): HistoryState {
	const state = createHistoryState(pathname, params, search, hash, navFormat, historyIndex)
	const url = `${pathname}${search}${hash}`

	if (typeof globalThis.history !== "undefined" && globalThis.history.replaceState) {
		globalThis.history.replaceState(state, "", url)
	}

	return state
}

/**
 * Get current scroll position.
 * Safe for SSR - returns 0,0 if scroll APIs not available.
 */
function getCurrentScroll(): ScrollPosition {
	if (typeof globalThis.scrollX === "undefined") {
		return { x: 0, y: 0 }
	}
	return {
		x: globalThis.scrollX,
		y: globalThis.scrollY,
	}
}

/**
 * Restore scroll position.
 * Safe for SSR - no-op if scroll APIs not available.
 */
function restoreScroll(position: ScrollPosition): void {
	if (typeof globalThis.scrollTo === "function") {
		globalThis.scrollTo(position.x, position.y)
	}
}

/**
 * Scroll to top of page.
 * Safe for SSR - no-op if scroll APIs not available.
 */
function scrollToTop(): void {
	if (typeof globalThis.scrollTo === "function") {
		globalThis.scrollTo(0, 0)
	}
}

export type { HistoryNavigateEvent, HistoryState, ScrollPosition }

export {
	createHistoryListener,
	createHistoryState,
	createScrollPosition,
	createScrollStore,
	getCurrentScroll,
	parseHistoryState,
	pushHistoryState,
	replaceHistoryState,
	restoreScroll,
	scrollToTop,
}
