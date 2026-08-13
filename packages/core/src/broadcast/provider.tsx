import type { JSX } from "solid-js"
import type { InternalChannel } from "./channel.ts"
import { BroadcastCtx, noopChannel } from "./context.ts"

export function BroadcastProvider(props: {
	children: JSX.Element
	value?: InternalChannel
}): JSX.Element {
	return (
		<BroadcastCtx.Provider value={props.value ?? noopChannel}>
			{props.children}
		</BroadcastCtx.Provider>
	)
}
