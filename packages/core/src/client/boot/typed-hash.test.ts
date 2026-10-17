import { afterEach, expect, it, vi } from "vitest"
import { createPage } from "../../shared/route-builder/page.ts"
import { createRootLayout } from "../../shared/route-builder/root-layout.ts"
import { createRouter } from "../../shared/router/create-router.ts"
import { env, install, type Dom } from "./boot.fixture.ts"
import { bootClient, type ClientEnv } from "./create-client.ts"
import { createReady } from "./ready.ts"

afterEach(() => {
	delete (globalThis as Dom).flare
	history.replaceState(null, "", "/")
	sessionStorage.clear()
})

// The window's scroll position as the browser reports it, and the scroll event a frame sends.
function scrolled(y: number, event: boolean): void {
	Object.defineProperty(window, "scrollY", { configurable: true, value: y })
	if (event) window.dispatchEvent(new Event("scroll"))
}

// Firefox and Safari scroll to a hash the visitor typed before its popstate runs, with no scroll event yet: the entry
// left keeps the position its last frame showed, not the fragment's, and the browser's entry is stamped as the next
// (BUGS.md 318).
it("typed hash keeps the position left", async () => {
	const router = createRouter({
		layouts: { _root_: createRootLayout("_root_").render((props) => props.children) },
		routeTree: [{ id: "_root_/", path: "/", module: createPage("_root_/").render(() => "home") }],
	})
	sessionStorage.clear()
	const stop = await bootClient(router, createReady(), env(install(), vi.fn<ClientEnv["fetch"]>()))
	scrolled(120, true)
	scrolled(900, false)
	history.pushState(null, "", "/#typed")
	window.dispatchEvent(new PopStateEvent("popstate", { state: null }))
	await new Promise((resolve) => setTimeout(resolve, 0))
	stop()
	scrolled(0, true)
	expect([JSON.parse(sessionStorage.getItem("flare_scroll") ?? "[]"), history.state]).toEqual([
		[["0", { x: 0, y: 120 }]],
		{ index: 1, usr: undefined },
	])
})
