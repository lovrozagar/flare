import { flush } from "solid-js"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { encodeFrame, type Frame } from "../../shared/protocol/index.ts"
import { createPage } from "../../shared/route-builder/page.ts"
import { createRootLayout } from "../../shared/route-builder/root-layout.ts"
import { createRouter } from "../../shared/router/create-router.ts"
import { mountNavigator, unmountAll, type Fetch } from "./navigate.fixture.ts"

// A redirect a navigation meets takes the history entry the navigation would have taken, and a loop of redirects
// stops (plan 21 3.10).
const root = createRootLayout("_root_").render((props) => ["root[", props.children, "]"])
const page = (id: string) => createPage(id).render((props) => `${id.slice(7)}:${String(props.loaderData)}`)
const routeTree = ["_root_/", "_root_/a", "_root_/b"].map((id) => ({ id, path: `/${id.slice(7)}`, module: page(id) }))
const router = createRouter({ layouts: { _root_: root }, routeTree })

function ndjson(frames: readonly Frame[]): Response {
	return new Response(frames.map(encodeFrame).join(""), { headers: { "content-type": "application/x-ndjson" } })
}

const landedB = (): Response =>
	ndjson([{ t: "l", m: "_root_", d: null }, { t: "l", m: "_root_/b", d: "b" }, { t: "r" }, { t: "d" }])

// `/a` redirects to `/b` with the frame's `replace`, and `/b` lands.
function redirecting(replace: boolean): Fetch {
	return async (url) => (url.startsWith("/a") ? ndjson([{ t: "x", s: 303, u: "/b", r: replace }]) : landedB())
}

beforeEach(() => {
	history.replaceState(null, "", "/")
	sessionStorage.clear()
})

afterEach(unmountAll)

// A push to `/a` that redirects to `/b` pushes `/b`: Back returns to the page the navigation left, as a browser does for
// a document redirect. The frame's `replace`, `redirect()`'s default `true`, does not overwrite that page.
it("redirect keeps the push", async () => {
	for (const replace of [true, false]) {
		const app = await mountNavigator(router, vi.fn<Fetch>(redirecting(replace)))
		const length = history.length
		await app.navigator.navigate({ to: "_root_/a" })
		flush()
		expect([replace, location.pathname, history.length - length, app.text()]).toEqual([replace, "/b", 1, "root[b:b]"])
		unmountAll()
		history.replaceState(null, "", "/")
	}
})

// A navigation that replaces, and a Back or Forward step, which the browser already took, replace with the target, even
// when the target is the page on screen: the bar shows the stepped-to URL until the target is written.
it("redirect keeps the replace", async () => {
	const app = await mountNavigator(router, vi.fn<Fetch>(redirecting(false)))
	const length = history.length
	await app.navigator.navigate({ to: "_root_/a", replace: true })
	flush()
	expect([location.pathname, history.length - length]).toEqual(["/b", 0])
	history.pushState(history.state, "", "/a")
	const pushed = history.length
	await app.navigator.restore("/a", app.deps.history.index())
	flush()
	expect([location.pathname, history.length - pushed, app.text()]).toEqual(["/b", 0, "root[b:b]"])
})

// A redirect loop stops after 10 follows: the 11th redirect, to `/b`, loads its URL as a document, where the browser's
// own limit and error page take over.
it("redirect loop", async () => {
	let calls = 0
	const looping = vi.fn<Fetch>(async (url) => {
		calls += 1
		if (calls > 50) throw new Error("the loop did not stop")
		return ndjson([{ t: "x", s: 302, u: url.startsWith("/a") ? "/b" : "/a", r: true }])
	})
	const app = await mountNavigator(router, looping)
	await app.navigator.navigate({ to: "_root_/a" })
	expect(looping).toHaveBeenCalledTimes(11)
	expect(app.deps.assign).toHaveBeenCalledExactlyOnceWith("/b")
	expect(location.pathname).toBe("/")
})

// A navigation a newer one replaced while its route code still loaded follows no redirect its data carried: the newer
// page stays, and the redirect's target is never asked for (plan 21 10.5).
it("superseded follows no redirect", async () => {
	const chunk = Promise.withResolvers<void>()
	const slow = createPage("_root_/slow").render(() => "slow")
	const tree = [...routeTree, { id: "_root_/slow", path: "/slow", module: () => chunk.promise.then(() => slow) }]
	const lazy = createRouter({ layouts: { _root_: root }, routeTree: tree })
	const landedA = [{ t: "l", m: "_root_", d: null }, { t: "l", m: "_root_/a", d: "a" }, { t: "r" }, { t: "d" }] as const
	const fetch = vi.fn<Fetch>(async (url) =>
		url.startsWith("/slow") ? ndjson([{ t: "x", s: 303, u: "/b", r: true }]) : ndjson(landedA),
	)
	const app = await mountNavigator(lazy, fetch)
	const first = app.navigator.navigate({ to: "_root_/slow" } as never)
	await new Promise((resolve) => setTimeout(resolve, 0))
	await app.navigator.navigate({ to: "_root_/a" })
	chunk.resolve()
	await first
	flush()
	expect(location.pathname).toBe("/a")
	expect(fetch.mock.calls.map(([url]) => url).filter((url) => url.startsWith("/b"))).toEqual([])
})
