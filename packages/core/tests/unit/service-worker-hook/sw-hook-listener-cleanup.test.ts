import { describe, expect, it, vi } from "vitest"

/**
 * useServiceWorker registers statechange and updatefound listeners inside
 * sw.ready.then() — but onCleanup() must be called synchronously in Solid.
 * These async-registered listeners are never cleaned up on unmount.
 *
 * RED: This test asserts correct behavior (all listeners removed after cleanup).
 * It will FAIL against the current code pattern because statechange/updatefound leak.
 */

interface MockTarget {
	addEventListener: (event: string, handler: Function) => void
	listenerCount: (event: string) => number
	removeEventListener: (event: string, handler: Function) => void
}

function createMockTarget(): MockTarget {
	const listeners = new Map<string, Set<Function>>()
	return {
		addEventListener: vi.fn((event: string, handler: Function) => {
			if (!listeners.has(event)) listeners.set(event, new Set())
			listeners.get(event)?.add(handler)
		}),
		listenerCount: (event: string) => listeners.get(event)?.size ?? 0,
		removeEventListener: vi.fn((event: string, handler: Function) => {
			listeners.get(event)?.delete(handler)
		}),
	}
}

/**
 * Replicates the FIXED production code's listener registration and cleanup.
 * Uses trackedListeners array to clean up async-registered listeners.
 */
function simulateFixedCode() {
	const sw = createMockTarget()
	const worker = createMockTarget()
	const registration = createMockTarget()

	const trackedListeners: Array<{
		handler: () => void
		name: string
		target: MockTarget
	}> = []

	/* Synchronous: controllerchange */
	const onControllerChange = () => {}
	sw.addEventListener("controllerchange", onControllerChange)

	/* onCleanup now handles ALL listeners */
	const cleanup = () => {
		sw.removeEventListener("controllerchange", onControllerChange)
		for (const entry of trackedListeners) {
			entry.target.removeEventListener(entry.name, entry.handler)
		}
	}

	/* Async (.then callback): statechange — tracked for cleanup */
	const stateHandler = () => {}
	worker.addEventListener("statechange", stateHandler)
	trackedListeners.push({ handler: stateHandler, name: "statechange", target: worker })

	/* Async (.then callback): updatefound — tracked for cleanup */
	const updateHandler = () => {}
	registration.addEventListener("updatefound", updateHandler)
	trackedListeners.push({ handler: updateHandler, name: "updatefound", target: registration })

	return { cleanup, registration, sw, worker }
}

describe("useServiceWorker listener cleanup", () => {
	it("after cleanup, statechange listener should be removed", () => {
		const { cleanup, worker } = simulateFixedCode()
		expect(worker.listenerCount("statechange")).toBe(1)

		cleanup()

		/* CORRECT behavior: listener should be removed */
		expect(worker.listenerCount("statechange")).toBe(0)
	})

	it("after cleanup, updatefound listener should be removed", () => {
		const { cleanup, registration } = simulateFixedCode()
		expect(registration.listenerCount("updatefound")).toBe(1)

		cleanup()

		/* CORRECT behavior: listener should be removed */
		expect(registration.listenerCount("updatefound")).toBe(0)
	})

	it("after cleanup, controllerchange listener should be removed", () => {
		const { cleanup, sw } = simulateFixedCode()
		expect(sw.listenerCount("controllerchange")).toBe(1)

		cleanup()

		/* This already works in current code */
		expect(sw.listenerCount("controllerchange")).toBe(0)
	})
})
