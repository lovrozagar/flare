export type ChannelMessage =
	| { key: string; payload: unknown; type: "custom" }
	| { options?: SerializedInvalidateOptions; type: "invalidate" }
	| { replace?: boolean; to: string; type: "navigate" }
	| { type: "locale"; value: string }

export interface SerializedInvalidateOptions {
	matchId?: string
	routeId?: string
	tags?: string[]
}

export interface InternalChannel {
	broadcast(msg: ChannelMessage): void
	close(): void
	onMessage(handler: (msg: ChannelMessage) => void): () => void
}

const DISCRIMINANT = "_f"

const noopChannel: InternalChannel = {
	broadcast() {},
	close() {},
	onMessage() {
		return () => {}
	},
}

export function createChannel(): InternalChannel {
	if (typeof BroadcastChannel === "undefined") {
		return noopChannel
	}

	const bc = new BroadcastChannel("flare")
	const handlers = new Set<(msg: ChannelMessage) => void>()

	bc.onmessage = (e: MessageEvent) => {
		const msg = e.data
		if (!msg || msg[DISCRIMINANT] !== 1 || !msg.type) return
		for (const fn of handlers) {
			try {
				fn(msg as ChannelMessage)
			} catch {
				/* handler error must not kill listener or block other handlers */
			}
		}
	}

	return {
		broadcast(msg) {
			try {
				bc.postMessage({ ...msg, [DISCRIMINANT]: 1 })
			} catch {
				/* non-structuredClone-able payload — swallow */
			}
		},
		close() {
			bc.close()
		},
		onMessage(handler) {
			handlers.add(handler)
			return () => handlers.delete(handler)
		},
	}
}
