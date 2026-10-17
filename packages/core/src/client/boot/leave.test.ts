import { afterEach, expect, it, vi } from "vitest"
import { useNavigate } from "../../shared/components/outlet-nodes.ts"
import { createPage } from "../../shared/route-builder/page.ts"
import { createRootLayout } from "../../shared/route-builder/root-layout.ts"
import { createRouter } from "../../shared/router/create-router.ts"
import { useBlocker, type BlockerArgs } from "../navigation/blocker.ts"
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

// The blocker reads each side's params, raw: on beforeunload the page's own, and on a navigation the page left and the
// one asked for, a hash move keeping the page's (dx/navigate.md `useBlocker`, BUGS.md 313).
it("blocker params", async () => {
	const seen: BlockerArgs[] = []
	const held: { go?: ReturnType<typeof useNavigate> } = {}
	const post = createPage("_root_/posts/[id]").render(() => {
		held.go = useNavigate()
		useBlocker((args) => seen.push(args) < 0)
		return "post"
	})
	const router = createRouter({
		layouts: { _root_: createRootLayout("_root_").render((props) => props.children) },
		routeTree: [{ id: "_root_/posts/[id]", path: "/posts/[id]", module: post }],
	})
	history.replaceState(null, "", "/posts/7")
	const page = {
		id: "_root_/posts/[id]",
		params: { id: "7" },
		search: {},
		data: null,
		preloader: {},
		head: null,
		error: null,
	}
	const root = { ...page, id: "_root_", params: {} }
	const stop = await bootClient(router, createReady(), env(install(undefined, { matches: [root, page] })))
	leave()
	await held.go?.({ to: "_root_/posts/[id]", params: { id: "8" } } as never)
	await held.go?.({ to: "_root_/posts/[id]", params: { id: "7" }, hash: "x" } as never)
	stop()
	history.replaceState(null, "", "/")
	expect(seen.map(({ current, next }) => [current.params, next.params])).toEqual([
		[{ id: "7" }, { id: "7" }],
		[{ id: "7" }, { id: "8" }],
		[{ id: "7" }, { id: "7" }],
	])
})
