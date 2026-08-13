/**
 * View Transition Types
 *
 * Type definitions for View Transitions API integration.
 * Supports both simple boolean config and advanced typed transitions.
 */

/**
 * Navigation direction detected from history index change.
 * Used for direction-aware CSS animations.
 */
export type ViewTransitionDirection = "back" | "forward" | "none"

/**
 * Information about the location change during navigation.
 * Passed to dynamic types function for context-aware transitions.
 */
export interface LocationChangeInfo {
	/** Previous location (null on initial load or popstate without prior state) */
	fromLocation: {
		hash: string
		pathname: string
		search: string
	} | null
	/** Target location */
	toLocation: {
		hash: string
		pathname: string
		search: string
	}
	/** Whether the pathname changed (excludes hash/search-only changes) */
	pathChanged: boolean
	/** Detected navigation direction */
	direction: ViewTransitionDirection
}

/**
 * Advanced view transition configuration with typed animations.
 *
 * Types are CSS view-transition-type values that can be targeted with
 * :active-view-transition-type() selector (Chrome 125+).
 */
export interface ViewTransitionOptions {
	/**
	 * CSS view-transition-type values.
	 *
	 * - String array: static types applied to all transitions
	 * - Function: compute types dynamically from location info
	 *   - Return string[] to apply those types
	 *   - Return false to skip view transition entirely
	 *
	 * @example Static types
	 * { types: ["fade", "slide-left"] }
	 *
	 * @example Dynamic types based on direction
	 * { types: ({ direction }) => [`slide-${direction}`] }
	 *
	 * @example Conditional skip
	 * { types: ({ pathChanged }) => pathChanged ? ["fade"] : false }
	 */
	types: string[] | ((info: LocationChangeInfo) => string[] | false)
}

/**
 * View transition configuration.
 *
 * - `true`: Enable with direction-based types (forward/back/none)
 * - `false` or `undefined`: Disabled
 * - `ViewTransitionOptions`: Advanced configuration with custom types
 */
export type ViewTransitionConfig = boolean | ViewTransitionOptions
