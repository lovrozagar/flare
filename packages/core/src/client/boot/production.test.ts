import { afterEach, expect, it, vi } from "vitest"
import { TAB_HEADER } from "../../shared/protocol/index.ts"
import { env, install, routerOf, stops, type Dom } from "./boot.fixture.ts"
import { bootClient, devSend, type ClientEnv } from "./create-client.ts"
import { createReady } from "./ready.ts"

// A production bundle has `import.meta.env.DEV` false: the dev tab, the hot channel's sender, and the overlay's report
// are left out, so a production client never names a tab on its requests or reports to a dev server (plan 21 3.17).
afterEach(() => {
	vi.unstubAllEnvs()
	for (const stop of stops.splice(0)) stop()
	delete (globalThis as Dom).flare
	document.head.replaceChildren()
})

it("production", async () => {
	vi.stubEnv("DEV", false)
	const hot = { send: vi.fn<(event: string, payload: unknown) => void>() }
	expect(devSend(hot)).toBeUndefined()
	const host = install()
	const meta = document.createElement("meta")
	meta.setAttribute("name", TAB_HEADER)
	meta.setAttribute("content", "tab-1")
	document.head.append(meta)
	const fetch = vi.fn<ClientEnv["fetch"]>(async () => new Response(""))
	stops.push(await bootClient(routerOf(), createReady(), { ...env(host, fetch), hot, dev: true }))
	expect(hot.send).not.toHaveBeenCalled()
})
