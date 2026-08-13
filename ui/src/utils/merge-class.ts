import { cn } from "./cn.ts"

type StateClass<S> = string | ((state: S) => string | undefined) | undefined

/**
 * Merge default class string with a Base UI consumer-supplied class.
 * Returns a string when both inputs are static; returns a function when the
 * consumer passed a state callback so Base UI invokes it at render with state.
 */
export function mergeClass<S>(
	defaults: string,
	userClass: StateClass<S>,
): string | ((state: S) => string) {
	if (typeof userClass === "function") {
		return (state) => cn(defaults, userClass(state))
	}
	return cn(defaults, userClass)
}
