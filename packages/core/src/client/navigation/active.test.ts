import { afterEach, expect, it, vi } from "vitest"
import { invalidate, navigate, setActiveClient } from "./active.ts"

afterEach(() => setActiveClient(undefined))

// The root `navigate` reaches the booted client's navigation from anywhere. With no client booted it rejects, naming
// why, and once the client is disposed it rejects again (BUGS.md 105).
it("active navigate", async () => {
	await expect(navigate({ to: "_root_/" })).rejects.toThrow(
		"navigate runs in the browser, once createClient has booted",
	)
	const go = vi.fn<(options: unknown) => Promise<void>>(async () => undefined)
	setActiveClient({ navigate: go, invalidate: async () => undefined })
	await navigate({ to: "_root_/about", replace: true })
	expect(go).toHaveBeenCalledWith({ to: "_root_/about", replace: true })
	setActiveClient(undefined)
	await expect(navigate({ to: "_root_/" })).rejects.toThrow("once createClient has booted")
})

// The root `invalidate` reaches the booted client's: it forgets every cached match and query and refetches the page
// on screen. With no client booted it rejects, as `navigate` does (B133).
it("active invalidate", async () => {
	await expect(invalidate()).rejects.toThrow("invalidate runs in the browser, once createClient has booted")
	const again = vi.fn<() => Promise<void>>(async () => undefined)
	setActiveClient({ navigate: async () => undefined, invalidate: again })
	await invalidate()
	expect(again).toHaveBeenCalledOnce()
})
