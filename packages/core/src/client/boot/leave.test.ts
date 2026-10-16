import { afterEach, expect, it, vi } from "vitest"
import { createPage } from "../../shared/route-builder/page.ts"
import { createRootLayout } from "../../shared/route-builder/root-layout.ts"
import { createRouter } from "../../shared/router/create-router.ts"
import { useBlocker } from "../navigation/blocker.ts"
import { env, install, type Dom } from "./boot.fixture.ts"
import { bootClient, type ClientEnv } from "./create-client.ts"
import { createReady } from "./ready.ts"

afterEach(() => {
	delete (globalThis as Dom).flare
})

// A `beforeunload` the window hears: whether a listener cancelled it.
function leave(): boolean {
	const event = new Event("beforeunload", { cancelable: true })
	window.dispatchEvent(event)
	return event.defaultPrevented
}

// Leaving the document asks the last blocker: a page whose blocker refuses cancels `beforeunload`, and once the client
// is disposed nothing listens (plan 21 3.5).
it("blocker unload", async () => {
	const home = createPage("_root_/").render(() => {
		useBlocker(() => false)
		return "home"
	})
	const router = createRouter({
		layouts: { _root_: createRootLayout("_root_").render((props) => props.children) },
		routeTree: [{ id: "_root_/", path: "/", module: home }],
	})
	const stop = await bootClient(router, createReady(), env(install(), vi.fn<ClientEnv["fetch"]>()))
	const blocked = leave()
	stop()
	expect([blocked, leave()]).toEqual([true, false])
})
