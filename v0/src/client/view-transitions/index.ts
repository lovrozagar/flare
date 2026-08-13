/**
 * View Transitions
 *
 * Wraps navigation updates in View Transitions API.
 * Handles direction detection, reduced motion, and typed transitions.
 *
 * Features:
 * - Direction detection (back/forward) via history index tracking
 * - Respects prefers-reduced-motion accessibility preference
 * - Supports typed view transitions (Chrome 125+)
 * - Fallback data attributes for CSS targeting in older browsers
 * - Works with both NDJSON and HTML navigation modes
 */

import type {
	LocationChangeInfo,
	ViewTransitionConfig,
	ViewTransitionDirection,
	ViewTransitionOptions,
} from "./types"

/* ============================================================================
 * History Index Tracking
 * ============================================================================
 * Track navigation history index to detect back/forward direction.
 * Index increments on forward navigation, stored in history state for popstate.
 */

let historyIndex = 0

/**
 * Get current history index.
 */
export function getHistoryIndex(): number {
	return historyIndex
}

/**
 * Set history index (used on popstate to restore from history state).
 */
export function setHistoryIndex(index: number): void {
	historyIndex = index
}

/**
 * Increment history index (called after forward navigation).
 */
export function incrementHistoryIndex(): void {
	historyIndex++
}

/**
 * Initialize history index from stored state (call on hydration).
 */
export function initHistoryIndex(storedIndex: number | undefined): void {
	historyIndex = storedIndex ?? 0
}

/* ============================================================================
 * Direction Detection
 * ============================================================================ */

/**
 * Detect navigation direction from history index change.
 *
 * @param fromIndex - History index before navigation
 * @param toIndex - History index after navigation
 * @returns Direction: "forward", "back", or "none"
 */
export function detectDirection(fromIndex: number, toIndex: number): ViewTransitionDirection {
	if (toIndex > fromIndex) return "forward"
	if (toIndex < fromIndex) return "back"
	return "none"
}

/* ============================================================================
 * Feature Detection
 * ============================================================================ */

/**
 * Check if browser supports View Transitions API.
 */
export function supportsViewTransitions(): boolean {
	return typeof document !== "undefined" && "startViewTransition" in document
}

/**
 * Check if browser supports typed view transitions (types parameter).
 * Feature added in Chrome 125 with the object-form startViewTransition API.
 */
export function supportsViewTransitionTypes(): boolean {
	if (!supportsViewTransitions()) return false
	// ViewTransition constructor was added alongside types support
	return typeof (globalThis as Record<string, unknown>).ViewTransition === "function"
}

/**
 * Check if user prefers reduced motion.
 * Respects the prefers-reduced-motion media query for accessibility.
 */
export function prefersReducedMotion(): boolean {
	if (typeof window === "undefined") return false
	return window.matchMedia("(prefers-reduced-motion: reduce)").matches
}

/* ============================================================================
 * Configuration Resolution
 * ============================================================================ */

/**
 * Determine if view transitions should be used based on config and environment.
 *
 * Returns false if:
 * - Config is falsy
 * - Browser doesn't support View Transitions API
 * - User prefers reduced motion
 */
export function shouldUseViewTransitions(config: ViewTransitionConfig | undefined): boolean {
	if (!config) return false
	if (!supportsViewTransitions()) return false
	if (prefersReducedMotion()) return false
	return true
}

/**
 * Resolve view transition types from config and location info.
 *
 * @param config - View transition configuration
 * @param info - Location change information
 * @returns Array of type strings, or false to skip transition
 */
export function resolveTransitionTypes(
	config: ViewTransitionConfig,
	info: LocationChangeInfo,
): string[] | false {
	// Boolean config: use direction as the type
	if (config === true) {
		return [info.direction]
	}

	// Object config with types
	if (typeof config === "object" && config.types) {
		if (typeof config.types === "function") {
			return config.types(info)
		}
		return config.types
	}

	return []
}

/* ============================================================================
 * View Transition Execution
 * ============================================================================ */

interface ViewTransitionResult {
	finished: Promise<void>
	ready: Promise<void>
	updateCallbackDone: Promise<void>
}

type StartViewTransitionSimple = (callback: () => void | Promise<void>) => ViewTransitionResult

type StartViewTransitionTyped = (params: {
	types?: string[]
	update: () => void | Promise<void>
}) => ViewTransitionResult

type StartViewTransitionFn = StartViewTransitionSimple & StartViewTransitionTyped

/**
 * Execute callback wrapped in View Transition.
 *
 * Sets data attributes on <html> for CSS targeting:
 * - `data-transition-direction`: "forward" | "back" | "none"
 * - `data-transition-types`: Space-separated list of type names
 *
 * @param callback - DOM update function to wrap in transition
 * @param config - View transition configuration (boolean or options)
 * @param info - Location change information for type resolution
 *
 * @example
 * ```typescript
 * await withViewTransition(
 *   () => updateDOM(),
 *   { types: ["fade"] },
 *   { direction: "forward", pathChanged: true, ... }
 * )
 * ```
 */
export async function withViewTransition(
	callback: () => void | Promise<void>,
	config: ViewTransitionConfig | undefined,
	info: LocationChangeInfo,
): Promise<void> {
	// Skip if transitions shouldn't be used
	if (!shouldUseViewTransitions(config)) {
		await callback()
		return
	}

	/* Resolve types from config - config is guaranteed non-null from shouldUseViewTransitions check */
	const types = resolveTransitionTypes(config as ViewTransitionConfig, info)

	// If types function returned false, skip transition
	if (types === false) {
		await callback()
		return
	}

	const doc = document as Document & { startViewTransition: StartViewTransitionFn }

	// Set direction attribute for CSS targeting
	document.documentElement.dataset.transitionDirection = info.direction

	// Set types as data attribute for CSS fallback (browsers without :active-view-transition-type)
	if (types.length > 0) {
		document.documentElement.dataset.transitionTypes = types.join(" ")
	}

	const cleanup = () => {
		delete document.documentElement.dataset.transitionDirection
		delete document.documentElement.dataset.transitionTypes
	}

	try {
		/* Try typed API first (Chrome 125+) */
		const transition =
			supportsViewTransitionTypes() && types.length > 0
				? doc.startViewTransition({ types, update: callback })
				: doc.startViewTransition(callback)

		/* Wait for DOM update, don't block on animation */
		await transition.updateCallbackDone

		/* Cleanup after animation (swallow rejection - transition may be skipped) */
		transition.finished.catch(() => {}).finally(cleanup)
	} catch {
		/* Callback threw - cleanup and re-run without transition */
		cleanup()
		await callback()
	}
}

/* ============================================================================
 * Exports
 * ============================================================================ */

export type {
	LocationChangeInfo,
	ViewTransitionConfig,
	ViewTransitionDirection,
	ViewTransitionOptions,
}
