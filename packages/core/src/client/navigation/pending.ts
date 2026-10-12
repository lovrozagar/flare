import { createContext, createSignal, useContext, type Context } from "solid-js";

// One per client. `track` wraps a navigation's fetch: pending stays true while any tracked fetch is in flight.
// A prefetch is never tracked (dx/navigate.md).
export type NavigationState = {
	pending: () => boolean;
	track: <T>(work: Promise<T>) => Promise<T>;
};

export const NavigationContext: Context<NavigationState> = createContext<NavigationState>();

export function createNavigationState(): NavigationState {
	const [inFlight, setInFlight] = createSignal(0);
	return {
		pending: () => inFlight() > 0,
		async track(work) {
			setInFlight((count) => count + 1);
			try {
				return await work;
			} finally {
				setInFlight((count) => count - 1);
			}
		},
	};
}

export function useNavigation(): { readonly pending: boolean } {
	const state = useContext(NavigationContext);
	return {
		get pending() {
			return state.pending();
		},
	};
}
