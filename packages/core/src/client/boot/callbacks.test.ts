import { afterEach, expect, it, vi } from "vitest"
import { env, install, routerOf, stops, type Dom } from "./boot.fixture.ts"
import { bootClient, type ClientEnv } from "./create-client.ts"
import { createReady } from "./ready.ts"

afterEach(() => {
	for (const stop of stops.splice(0)) stop()
	delete (globalThis as Dom).flare
	vi.restoreAllMocks()
})

// A createClient callback that throws is logged and, in dev, sent to the overlay; the boot goes on, so the page still
// hydrates and the next callback runs. In production nothing is sent (plan 21 9.3, BUGS.md 203).
it("callback report", async () => {
	const logged = vi.spyOn(console, "error").mockImplementation(() => undefined)
	for (const dev of [true, false]) {
		const send = vi.fn<NonNullable<ClientEnv["send"]>>()
		const ready = createReady()
		const after: string[] = []
		ready.api
			.onHydrated(() => {
				throw new Error("hydrated boom")
			})
			.onHydrated(() => after.push("hydrated"))
		ready.close()
		stops.push(await bootClient(routerOf(), ready, { ...env(install()), dev, send }))
		expect(document.documentElement.hasAttribute("data-flare-hydrated")).toBe(true)
		expect(after).toEqual(["hydrated"])
		expect(send.mock.calls.map(([payload]) => payload.err.message)).toEqual(dev ? ["hydrated boom"] : [])
	}
	expect(logged).toHaveBeenCalledTimes(2)
	expect(logged).toHaveBeenCalledWith(
		"[flare] an app callback threw",
		expect.objectContaining({ message: "hydrated boom" }),
	)
})
