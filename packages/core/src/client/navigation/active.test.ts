import { afterEach, expect, it, vi } from "vitest"
import { navigate, setActiveNavigate } from "./active.ts"

afterEach(() => setActiveNavigate(undefined))

// The root `navigate` reaches the booted client's navigation from anywhere. With no client booted it rejects, naming
// why, and once the client is disposed it rejects again (BUGS.md 105).
it("active navigate", async () => {
	await expect(navigate({ to: "_root_/" })).rejects.toThrow(
		"navigate runs in the browser, once createClient has booted",
	)
	const go = vi.fn<(options: unknown) => Promise<void>>(async () => undefined)
	setActiveNavigate(go)
	await navigate({ to: "_root_/about", replace: true })
	expect(go).toHaveBeenCalledWith({ to: "_root_/about", replace: true })
	setActiveNavigate(undefined)
	await expect(navigate({ to: "_root_/" })).rejects.toThrow("once createClient has booted")
})
