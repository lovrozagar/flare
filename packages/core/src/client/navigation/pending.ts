import { createSignal, useContext } from "solid-js"
import { NavigationContext, type NavigationState } from "../../shared/router/context.ts"

export { NavigationContext, type NavigationState }

export function createNavigationState(): NavigationState {
	const [inFlight, setInFlight] = createSignal(0)
	return {
		pending: () => inFlight() > 0,
		begin() {
			setInFlight((count) => count + 1)
			let ended = false
			return () => {
				if (ended) return
				ended = true
				setInFlight((count) => count - 1)
			}
		},
	}
}

export function useNavigation(): { readonly pending: boolean } {
	const state = useContext(NavigationContext)
	return {
		get pending() {
			return state.pending()
		},
	}
}
