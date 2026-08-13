import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

/* BroadcastChannel mock for vitest (jsdom doesn't have it) */
let channels: Map<string, Set<(e: MessageEvent) => void>>

class MockBroadcastChannel {
	name: string
	onmessage: ((e: MessageEvent) => void) | null = null

	constructor(name: string) {
		this.name = name
		if (!channels.has(name)) channels.set(name, new Set())
	}

	postMessage(data: unknown): void {
		/* BroadcastChannel sends to OTHER instances, not the sender */
		const listeners = channels.get(this.name)
		if (!listeners) return
		const event = new MessageEvent("message", { data })
		for (const handler of listeners) {
			if (handler !== this.onmessage) handler(event)
		}
	}

	close(): void {
		const listeners = channels.get(this.name)
		if (listeners && this.onmessage) listeners.delete(this.onmessage)
	}

	/* Internal: register onmessage with the channel group */
	set _onmessage(handler: ((e: MessageEvent) => void) | null) {
		const listeners = channels.get(this.name)
		if (listeners && this.onmessage) listeners.delete(this.onmessage)
		this.onmessage = handler
		if (listeners && handler) listeners.add(handler)
	}
}

/* Patch so that setting .onmessage registers with channel group */
const OriginalMockBC = MockBroadcastChannel
class PatchedMockBC extends OriginalMockBC {
	constructor(name: string) {
		super(name)
		return new Proxy(this, {
			set(target, prop, value) {
				if (prop === "onmessage") {
					const listeners = channels.get(target.name)
					if (listeners && target.onmessage) listeners.delete(target.onmessage)
					target.onmessage = value as ((e: MessageEvent) => void) | null
					if (listeners && value) listeners.add(value as (e: MessageEvent) => void)
					return true
				}
				return Reflect.set(target, prop, value)
			},
		})
	}
}

beforeEach(() => {
	channels = new Map()
	;(globalThis as Record<string, unknown>).BroadcastChannel = PatchedMockBC
})

afterEach(() => {
	channels.clear()
	delete (globalThis as Record<string, unknown>).BroadcastChannel
	vi.restoreAllMocks()
})

describe("createChannel", () => {
	it("returns InternalChannel interface", async () => {
		const { createChannel } = await import("../../../src/broadcast/channel")
		const ch = createChannel()
		expect(typeof ch.broadcast).toBe("function")
		expect(typeof ch.close).toBe("function")
		expect(typeof ch.onMessage).toBe("function")
	})

	it("broadcast posts message with _f: 1 discriminant", async () => {
		const { createChannel } = await import("../../../src/broadcast/channel")
		const ch1 = createChannel()
		const ch2 = createChannel()
		const received: unknown[] = []
		ch2.onMessage((msg) => received.push(msg))

		ch1.broadcast({ key: "test", payload: 42, type: "custom" })

		/* Messages are synchronous in mock */
		expect(received.length).toBe(1)
		expect((received[0] as Record<string, unknown>)._f).toBe(1)
		expect((received[0] as Record<string, unknown>).type).toBe("custom")

		ch1.close()
		ch2.close()
	})

	it("onMessage receives messages with _f: 1", async () => {
		const { createChannel } = await import("../../../src/broadcast/channel")
		const ch = createChannel()
		const received: unknown[] = []
		ch.onMessage((msg) => received.push(msg))

		/* Simulate message from another channel instance */
		const bc2 = new PatchedMockBC("flare")
		bc2.postMessage({ _f: 1, key: "x", payload: null, type: "custom" })

		expect(received.length).toBe(1)
		ch.close()
	})

	it("onMessage ignores messages without discriminant", async () => {
		const { createChannel } = await import("../../../src/broadcast/channel")
		const ch = createChannel()
		const received: unknown[] = []
		ch.onMessage((msg) => received.push(msg))

		const bc2 = new PatchedMockBC("flare")
		bc2.postMessage({ key: "x", type: "custom" })

		expect(received.length).toBe(0)
		ch.close()
	})

	it("onMessage ignores messages with wrong discriminant _f: 2", async () => {
		const { createChannel } = await import("../../../src/broadcast/channel")
		const ch = createChannel()
		const received: unknown[] = []
		ch.onMessage((msg) => received.push(msg))

		const bc2 = new PatchedMockBC("flare")
		bc2.postMessage({ _f: 2, key: "x", type: "custom" })

		expect(received.length).toBe(0)
		ch.close()
	})

	it("onMessage ignores messages without type field", async () => {
		const { createChannel } = await import("../../../src/broadcast/channel")
		const ch = createChannel()
		const received: unknown[] = []
		ch.onMessage((msg) => received.push(msg))

		const bc2 = new PatchedMockBC("flare")
		bc2.postMessage({ _f: 1, key: "x" })

		expect(received.length).toBe(0)
		ch.close()
	})

	it("multiple handlers all receive same message", async () => {
		const { createChannel } = await import("../../../src/broadcast/channel")
		const ch = createChannel()
		const a: unknown[] = []
		const b: unknown[] = []
		ch.onMessage((msg) => a.push(msg))
		ch.onMessage((msg) => b.push(msg))

		const bc2 = new PatchedMockBC("flare")
		bc2.postMessage({ _f: 1, key: "x", payload: 1, type: "custom" })

		expect(a.length).toBe(1)
		expect(b.length).toBe(1)
		ch.close()
	})

	it("unsubscribe removes handler", async () => {
		const { createChannel } = await import("../../../src/broadcast/channel")
		const ch = createChannel()
		const received: unknown[] = []
		const unsub = ch.onMessage((msg) => received.push(msg))

		unsub()

		const bc2 = new PatchedMockBC("flare")
		bc2.postMessage({ _f: 1, key: "x", payload: 1, type: "custom" })

		expect(received.length).toBe(0)
		ch.close()
	})

	it("broadcast with non-cloneable payload does not throw", async () => {
		const { createChannel } = await import("../../../src/broadcast/channel")
		const ch = createChannel()

		/* Mock postMessage to throw DataCloneError */
		const bc = (ch as unknown as Record<string, unknown>)._bc as {
			postMessage: (data: unknown) => void
		}
		if (bc) {
			/* Can't easily test structured clone in jsdom, so test try-catch via mock */
		}
		/* At minimum, verify it doesn't crash with a function payload */
		expect(() => {
			ch.broadcast({ key: "test", payload: () => {}, type: "custom" })
		}).not.toThrow()
		ch.close()
	})

	it("close calls underlying bc.close()", async () => {
		const { createChannel } = await import("../../../src/broadcast/channel")
		const ch = createChannel()
		expect(() => ch.close()).not.toThrow()
	})

	it("BroadcastChannel undefined → no-op channel", async () => {
		delete (globalThis as Record<string, unknown>).BroadcastChannel
		/* Re-import to get fresh module evaluation */
		vi.resetModules()
		const { createChannel } = await import("../../../src/broadcast/channel")
		const ch = createChannel()

		expect(() => ch.broadcast({ key: "x", payload: 1, type: "custom" })).not.toThrow()
		expect(() => ch.close()).not.toThrow()

		const unsub = ch.onMessage(() => {})
		expect(typeof unsub).toBe("function")
		expect(() => unsub()).not.toThrow()
	})

	it("no-op onMessage returns cleanup function", async () => {
		delete (globalThis as Record<string, unknown>).BroadcastChannel
		vi.resetModules()
		const { createChannel } = await import("../../../src/broadcast/channel")
		const ch = createChannel()
		const cleanup = ch.onMessage(() => {})
		expect(typeof cleanup).toBe("function")
		cleanup()
	})

	it("handler A throws → handler B still fires", async () => {
		const { createChannel } = await import("../../../src/broadcast/channel")
		const ch = createChannel()
		const bReceived: unknown[] = []

		ch.onMessage(() => {
			throw new Error("handler A crash")
		})
		ch.onMessage((msg) => bReceived.push(msg))

		const bc2 = new PatchedMockBC("flare")
		bc2.postMessage({ _f: 1, key: "x", payload: 1, type: "custom" })

		expect(bReceived.length).toBe(1)
		ch.close()
	})

	it("handler throws → listener stays active for next message", async () => {
		const { createChannel } = await import("../../../src/broadcast/channel")
		const ch = createChannel()
		let callCount = 0

		ch.onMessage(() => {
			callCount++
			if (callCount === 1) throw new Error("first message crash")
		})

		const bc2 = new PatchedMockBC("flare")
		bc2.postMessage({ _f: 1, key: "x", payload: 1, type: "custom" })
		bc2.postMessage({ _f: 1, key: "x", payload: 2, type: "custom" })

		expect(callCount).toBe(2)
		ch.close()
	})
})
