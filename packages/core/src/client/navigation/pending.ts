import { createSignal, useContext } from "solid-js";
import { NavigationContext, type NavigationState } from "../../shared/router/context.ts";

export { NavigationContext, type NavigationState };

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
