import { broadcastEnabled } from "./enabled.ts"

// The cross-tab messages (dx/features.md Cross-tab). A receiver validates what it hears, because another app on the
// same origin shares the name.
export type SyncMessage =
	| { type: "theme"; value: string }
	| { type: "direction"; value: string | null }
	| { type: "locale"; tag: string }

const NAME = "flare.sync"

// Switched off, or a runtime without BroadcastChannel such as the server, opens nothing.
function open(): BroadcastChannel | undefined {
	if (!broadcastEnabled || typeof BroadcastChannel === "undefined") return undefined
	return new BroadcastChannel(NAME)
}

// One message on a channel of its own, closed once sent. The sending object never hears it. Every other subscriber
// on the name does, including one in this tab.
export function post(message: SyncMessage): void {
	const channel = open()
	if (channel === undefined) return
	channel.postMessage(message)
	channel.close()
}

// One channel for the listener, closed by the function returned. That function exists in the no-op case too.
export function subscribe(listener: (data: unknown) => void): () => void {
	const channel = open()
	if (channel === undefined) return () => undefined
	channel.onmessage = (event: MessageEvent<unknown>) => listener(event.data)
	return () => channel.close()
}
