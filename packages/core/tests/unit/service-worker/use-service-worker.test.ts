import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

function createMockRegistration(overrides?: { installing?: unknown; waiting?: unknown }) {
	return {
		active: null,
		addEventListener: vi.fn(),
		installing: overrides?.installing ?? null,
		removeEventListener: vi.fn(),
		waiting: overrides?.waiting ?? null,
	}
}

describe("useServiceWorker", () => {
	beforeEach(() => {
		vi.stubGlobal("navigator", {
			serviceWorker: {
				addEventListener: vi.fn(),
				controller: null,
				getRegistrations: vi.fn().mockResolvedValue([]),
				ready: Promise.resolve(createMockRegistration()),
				register: vi.fn().mockResolvedValue(createMockRegistration()),
				removeEventListener: vi.fn(),
			},
		})

		vi.stubGlobal("window", {
			location: { reload: vi.fn() },
		})
	})

	afterEach(() => {
		vi.restoreAllMocks()
		vi.resetModules()
	})

	it("exports useServiceWorker function", async () => {
		const mod = await import("../../../src/service-worker-hook")
		expect(typeof mod.useServiceWorker).toBe("function")
	})

	it("returns an object with updateAvailable and update", async () => {
		const { createRoot } = await import("solid-js")
		const mod = await import("../../../src/service-worker-hook")

		let result: ReturnType<typeof mod.useServiceWorker> | undefined

		createRoot(() => {
			result = mod.useServiceWorker()
		})

		expect(result).toBeDefined()
		expect(typeof result?.updateAvailable).toBe("function")
		expect(typeof result?.update).toBe("function")
	})

	it("updateAvailable initially returns false", async () => {
		const { createRoot } = await import("solid-js")
		const mod = await import("../../../src/service-worker-hook")

		let available = true

		createRoot(() => {
			const sw = mod.useServiceWorker()
			available = sw.updateAvailable()
		})

		expect(available).toBe(false)
	})

	it("listens for controllerchange on navigator.serviceWorker", async () => {
		const addSpy = vi.fn()
		vi.stubGlobal("navigator", {
			serviceWorker: {
				addEventListener: addSpy,
				controller: null,
				ready: Promise.resolve(createMockRegistration()),
				removeEventListener: vi.fn(),
			},
		})

		vi.resetModules()
		const { createRoot } = await import("solid-js")
		const mod = await import("../../../src/service-worker-hook")

		createRoot(() => {
			mod.useServiceWorker()
		})

		const events = addSpy.mock.calls.map((c: unknown[]) => c[0])
		expect(events).toContain("controllerchange")
	})

	it("update() posts SKIP_WAITING to waiting worker", async () => {
		const postMessageSpy = vi.fn()
		const waitingWorker = {
			addEventListener: vi.fn(),
			postMessage: postMessageSpy,
			state: "installed",
		}

		vi.stubGlobal("navigator", {
			serviceWorker: {
				addEventListener: vi.fn(),
				controller: null,
				ready: Promise.resolve(createMockRegistration({ waiting: waitingWorker })),
				removeEventListener: vi.fn(),
			},
		})

		vi.resetModules()
		const { createRoot } = await import("solid-js")
		const mod = await import("../../../src/service-worker-hook")

		let sw: ReturnType<typeof mod.useServiceWorker> | undefined

		createRoot(() => {
			sw = mod.useServiceWorker()
		})

		/* Let ready promise resolve */
		await new Promise((r) => setTimeout(r, 10))

		sw?.update()
		expect(postMessageSpy).toHaveBeenCalledWith({ type: "SKIP_WAITING" })
	})

	it("updateAvailable becomes true when waiting worker is in installed state", async () => {
		const waitingWorker = {
			addEventListener: vi.fn(),
			postMessage: vi.fn(),
			state: "installed",
		}

		vi.stubGlobal("navigator", {
			serviceWorker: {
				addEventListener: vi.fn(),
				controller: null,
				ready: Promise.resolve(createMockRegistration({ waiting: waitingWorker })),
				removeEventListener: vi.fn(),
			},
		})

		vi.resetModules()
		const { createRoot } = await import("solid-js")
		const mod = await import("../../../src/service-worker-hook")

		let available = false

		createRoot(() => {
			const sw = mod.useServiceWorker()
			/* Check after ready resolves */
			setTimeout(() => {
				available = sw.updateAvailable()
			}, 10)
		})

		await new Promise((r) => setTimeout(r, 20))
		expect(available).toBe(true)
	})

	it("update() is no-op when no waiting worker", async () => {
		const { createRoot } = await import("solid-js")
		const mod = await import("../../../src/service-worker-hook")

		let sw: ReturnType<typeof mod.useServiceWorker> | undefined

		createRoot(() => {
			sw = mod.useServiceWorker()
		})

		/* Should not throw */
		expect(() => sw?.update()).not.toThrow()
	})

	it("listens for statechange on installing worker", async () => {
		const stateChangeSpy = vi.fn()
		const installingWorker = {
			addEventListener: stateChangeSpy,
			postMessage: vi.fn(),
			state: "installing",
		}

		vi.stubGlobal("navigator", {
			serviceWorker: {
				addEventListener: vi.fn(),
				controller: null,
				ready: Promise.resolve(createMockRegistration({ installing: installingWorker })),
				removeEventListener: vi.fn(),
			},
		})

		vi.resetModules()
		const { createRoot } = await import("solid-js")
		const mod = await import("../../../src/service-worker-hook")

		createRoot(() => {
			mod.useServiceWorker()
		})

		await new Promise((r) => setTimeout(r, 10))

		const events = stateChangeSpy.mock.calls.map((c: unknown[]) => c[0])
		expect(events).toContain("statechange")
	})

	it("listens for updatefound on registration", async () => {
		const regAddSpy = vi.fn()
		const reg = {
			active: null,
			addEventListener: regAddSpy,
			installing: null,
			removeEventListener: vi.fn(),
			waiting: null,
		}

		vi.stubGlobal("navigator", {
			serviceWorker: {
				addEventListener: vi.fn(),
				controller: null,
				ready: Promise.resolve(reg),
				removeEventListener: vi.fn(),
			},
		})

		vi.resetModules()
		const { createRoot } = await import("solid-js")
		const mod = await import("../../../src/service-worker-hook")

		createRoot(() => {
			mod.useServiceWorker()
		})

		await new Promise((r) => setTimeout(r, 10))

		const events = regAddSpy.mock.calls.map((c: unknown[]) => c[0])
		expect(events).toContain("updatefound")
	})

	it("cleans up controllerchange listener on disposal", async () => {
		const removeSpy = vi.fn()
		vi.stubGlobal("navigator", {
			serviceWorker: {
				addEventListener: vi.fn(),
				controller: null,
				ready: Promise.resolve(createMockRegistration()),
				removeEventListener: removeSpy,
			},
		})

		vi.resetModules()
		const { createRoot } = await import("solid-js")
		const mod = await import("../../../src/service-worker-hook")

		let dispose: (() => void) | undefined

		createRoot((d) => {
			dispose = d
			mod.useServiceWorker()
		})

		dispose?.()

		const events = removeSpy.mock.calls.map((c: unknown[]) => c[0])
		expect(events).toContain("controllerchange")
	})

	it("handles missing serviceWorker in navigator gracefully", async () => {
		vi.stubGlobal("navigator", {})

		vi.resetModules()
		const { createRoot } = await import("solid-js")
		const mod = await import("../../../src/service-worker-hook")

		let sw: ReturnType<typeof mod.useServiceWorker> | undefined

		createRoot(() => {
			sw = mod.useServiceWorker()
		})

		expect(sw?.updateAvailable()).toBe(false)
		expect(() => sw?.update()).not.toThrow()
	})
})
