import { createContext } from "solid-js"
import type { InternalChannel } from "./channel.ts"

export const noopChannel: InternalChannel = {
	broadcast() {},
	close() {},
	onMessage() {
		return () => {}
	},
}

export const BroadcastCtx = createContext<InternalChannel>(noopChannel)
