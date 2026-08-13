import { type JSX, Show, useContext } from "solid-js"
import { RouterContext } from "../outlet/index.tsx"
import type { InterceptedState } from "../outlet/types.ts"

export type { InterceptedState } from "../outlet/types.ts"

export interface InterceptOutletProps {
	children: (state: InterceptedState) => JSX.Element
}

/**
 * Renders intercepted route content. SSR-safe — returns null when outside
 * FlareProvider (root layout renders in NoHydration during SSR).
 */
export function InterceptOutlet(props: InterceptOutletProps): JSX.Element {
	const ctx = useContext(RouterContext)
	return (
		<Show when={ctx?.intercepted()}>{(state) => props.children(state())}</Show>
	) as JSX.Element
}
