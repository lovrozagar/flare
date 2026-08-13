import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

describe("onceIdle", () => {
	let onceIdle: (fn: () => void) => void

	beforeEach(async () => {
		vi.stubGlobal(
			"requestIdleCallback",
			vi.fn((cb: () => void) => {
				setTimeout(cb, 0)
				return 1
			}),
		)
		vi.stubGlobal("addEventListener", vi.fn())
		vi.stubGlobal("removeEventListener", vi.fn())

		const mod = await import("../../../src/internal/once-idle")
		onceIdle = mod.onceIdle
	})

	afterEach(() => {
		vi.restoreAllMocks()
		vi.resetModules()
	})

	it("calls fn via requestIdleCallback when available", async () => {
		const fn = vi.fn()
		onceIdle(fn)

		await new Promise((r) => setTimeout(r, 10))
		expect(fn).toHaveBeenCalledOnce()
	})

	it("registers interaction listeners", () => {
		const fn = vi.fn()
		onceIdle(fn)

		const calls = (addEventListener as ReturnType<typeof vi.fn>).mock.calls
		const events = calls.map((c: unknown[]) => c[0])
		expect(events).toContain("mousemove")
		expect(events).toContain("touchstart")
		expect(events).toContain("scroll")
		expect(events).toContain("keydown")
	})

	it("fires at most once even if multiple triggers occur", async () => {
		const fn = vi.fn()
		const listeners = new Map<string, (...args: unknown[]) => void>()

		vi.stubGlobal(
			"addEventListener",
			vi.fn((event: string, handler: (...args: unknown[]) => void) => {
				listeners.set(event, handler)
			}),
		)

		vi.resetModules()
		const mod = await import("../../../src/internal/once-idle")
		mod.onceIdle(fn)

		/* Simulate mousemove */
		listeners.get("mousemove")?.()
		listeners.get("keydown")?.()

		await new Promise((r) => setTimeout(r, 10))
		expect(fn).toHaveBeenCalledOnce()
	})

	it("cleans up listeners after firing", async () => {
		const removeSpy = vi.fn()
		vi.stubGlobal("removeEventListener", removeSpy)
		const listeners = new Map<string, (...args: unknown[]) => void>()

		vi.stubGlobal(
			"addEventListener",
			vi.fn((event: string, handler: (...args: unknown[]) => void) => {
				listeners.set(event, handler)
			}),
		)

		vi.resetModules()
		const mod = await import("../../../src/internal/once-idle")
		mod.onceIdle(vi.fn())

		listeners.get("scroll")?.()

		expect(removeSpy).toHaveBeenCalled()
		const removedEvents = removeSpy.mock.calls.map((c: unknown[]) => c[0])
		expect(removedEvents).toContain("mousemove")
		expect(removedEvents).toContain("touchstart")
		expect(removedEvents).toContain("scroll")
		expect(removedEvents).toContain("keydown")
	})

	it("registers listeners with capture: true and passive: true", () => {
		const fn = vi.fn()
		onceIdle(fn)

		const calls = (addEventListener as ReturnType<typeof vi.fn>).mock.calls
		for (const call of calls) {
			const opts = call[2] as { capture?: boolean; passive?: boolean }
			expect(opts.capture).toBe(true)
			expect(opts.passive).toBe(true)
		}
	})

	it("registers listeners with once: true", () => {
		const fn = vi.fn()
		onceIdle(fn)

		const calls = (addEventListener as ReturnType<typeof vi.fn>).mock.calls
		for (const call of calls) {
			const opts = call[2] as { once?: boolean }
			expect(opts.once).toBe(true)
		}
	})

	it("removes listeners with capture: true option", async () => {
		const removeSpy = vi.fn()
		vi.stubGlobal("removeEventListener", removeSpy)
		const listeners = new Map<string, (...args: unknown[]) => void>()

		vi.stubGlobal(
			"addEventListener",
			vi.fn((event: string, handler: (...args: unknown[]) => void) => {
				listeners.set(event, handler)
			}),
		)

		vi.resetModules()
		const mod = await import("../../../src/internal/once-idle")
		mod.onceIdle(vi.fn())

		listeners.get("mousemove")?.()

		for (const call of removeSpy.mock.calls) {
			const opts = call[2] as { capture?: boolean }
			expect(opts.capture).toBe(true)
		}
	})

	it("multiple onceIdle calls are independent", async () => {
		const fn1 = vi.fn()
		const fn2 = vi.fn()

		onceIdle(fn1)
		onceIdle(fn2)

		await new Promise((r) => setTimeout(r, 10))
		expect(fn1).toHaveBeenCalledOnce()
		expect(fn2).toHaveBeenCalledOnce()
	})

	it("works without requestIdleCallback", async () => {
		vi.stubGlobal("requestIdleCallback", undefined)
		const listeners = new Map<string, (...args: unknown[]) => void>()

		vi.stubGlobal(
			"addEventListener",
			vi.fn((event: string, handler: (...args: unknown[]) => void) => {
				listeners.set(event, handler)
			}),
		)

		vi.resetModules()
		const mod = await import("../../../src/internal/once-idle")
		const fn = vi.fn()
		mod.onceIdle(fn)

		/* Without rIC, only interaction should trigger */
		await new Promise((r) => setTimeout(r, 10))
		expect(fn).not.toHaveBeenCalled()

		listeners.get("touchstart")?.()
		expect(fn).toHaveBeenCalledOnce()
	})
})
