import { flush } from "solid-js"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { encodeFrame, type Frame } from "../../shared/protocol/index.ts"
import { createPage } from "../../shared/route-builder/page.ts"
import { createRootLayout } from "../../shared/route-builder/root-layout.ts"
import { createRouter } from "../../shared/router/create-router.ts"
import { createMatchCache } from "../router/match-cache.ts"
import { mountNavigator, unmountAll, type Fetch } from "./navigate.fixture.ts"

// How a client navigation paints a data answer that is a bare status: a named status walks its boundary at the match
// the server names in `flare-failed`, else at the page; a failed root loads as a document; anything else is a 500
// (dx/builder.md, BUGS.md 134). Split from navigate.test.ts at its 500-line limit.

const root = createRootLayout("_root_").render((props) => ["root[", props.children, "]"])
const home = createPage("_root_/").render(() => "home")
const about = createPage("_root_/about").render((props) => `about:${String(props.loaderData)}`)
const tabs = createPage("_root_/tabs/[[tab]]").render((props) => `tabs:${String(props.loaderData)}`)
const router = createRouter({
	layouts: { _root_: root },
	routeTree: [
		{ id: "_root_/", path: "/", module: home },
		{ id: "_root_/about", path: "/about", module: about },
		{ id: "_root_/tabs/[[tab]]", path: "/tabs/[[tab]]", module: tabs },
	],
})

beforeEach(() => {
	history.replaceState(null, "", "/")
	sessionStorage.clear()
})

afterEach(unmountAll)

const aboutFrames: Frame[] = [
	{ t: "l", m: "_root_", d: null },
	{ t: "l", m: "_root_/about", d: "fresh" },
	{ t: "r" },
	{ t: "d" },
]

function ndjson(frames: readonly Frame[]): Response {
	return new Response(frames.map(encodeFrame).join(""), { headers: { "content-type": "application/x-ndjson" } })
}

function setup(fetch: Fetch) {
	return mountNavigator(router, fetch)
}

// A response held until released, so a newer navigation can supersede the one waiting on it.
function held(response: () => Response): { fetch: () => Promise<Response>; release: () => void } {
	const gate = Promise.withResolvers<void>()
	return { fetch: async () => (await gate.promise, response()), release: () => gate.resolve() }
}

// A 404 answer naming `failed` in `flare-failed`, or naming nothing.
function failing(failed?: string): () => Promise<Response> {
	return async () =>
		new Response(null, { status: 404, headers: failed === undefined ? {} : { "flare-failed": failed } })
}

it("auth error", async () => {
	for (const [status, text] of [
		[401, "Please log in"],
		[403, "Access denied"],
		[404, "Page not found"],
	] as const) {
		history.replaceState(null, "", "/")
		const app = await setup(async () => new Response(null, { status }))
		await app.navigator.navigate({ to: "_root_/about" })
		flush()
		expect(app.host.innerHTML).toContain(`<div>${text}</div>`)
		expect(app.text()).toBe(`root[${text}]`)
		expect(location.pathname).toBe("/about")
	}
})

// A bare named status paints at the match `flare-failed` names, else at the page; a failed root loads the URL as a
// document, which only the server can render (BUGS.md 134).
it("failed match", async () => {
	const rooted = await setup(failing("_root_"))
	await rooted.navigator.navigate({ to: "_root_/about" })
	expect(rooted.deps.assign).toHaveBeenCalledExactlyOnceWith("/about")
	expect(rooted.store.snapshot().failure).toBeUndefined()
	for (const failed of ["_root_/about", "_root_/elsewhere", undefined]) {
		history.replaceState(null, "", "/")
		const app = await setup(failing(failed))
		await app.navigator.navigate({ to: "_root_/about" })
		flush()
		expect(app.store.snapshot().failure).toMatchObject({ index: 1, status: 404 })
		expect(app.text()).toBe("root[Page not found]")
	}
})

// A named failure's answer carries the frames of the matches above it: the root paints what its loader returned for
// this URL over the not-found. A bare status keeps what the root had, and a body that cannot land loads the URL
// (plan 21 12.5, B132).
it("frames above failure", async () => {
	const shown = createRootLayout("_root_").render((props) => [
		"root:",
		() => String(Reflect.get(Object(props.loaderData), "n")),
		"[",
		props.children,
		"]",
	])
	const routeTree = [
		{ id: "_root_/", path: "/", module: home },
		{ id: "_root_/about", path: "/about", module: about },
	]
	const pages = createRouter({ layouts: { _root_: shown }, routeTree })
	const named = { "flare-failed": "_root_/about", "content-type": "application/x-ndjson" }
	const above = [{ t: "l", m: "_root_", d: { n: 2 } }, { t: "r" }, { t: "d" }] as const
	for (const [answer, text] of [
		[
			() => new Response(above.map((frame) => encodeFrame(frame)).join(""), { status: 404, headers: named }),
			"root:2[Page not found]",
		],
		[
			() => new Response(null, { status: 404, headers: { "flare-failed": "_root_/about" } }),
			"root:undefined[Page not found]",
		],
		[() => new Response(new Uint8Array([1]), { status: 404 }), "root:undefined[Page not found]"],
	] as const) {
		history.replaceState(null, "", "/")
		const app = await mountNavigator(pages, async () => answer())
		await app.navigator.navigate({ to: "_root_/about" })
		flush()
		expect(app.text()).toBe(text)
		unmountAll()
	}
	const broken = await mountNavigator(pages, async () => new Response("not json\n", { status: 404, headers: named }))
	const logged = vi.spyOn(console, "error").mockImplementation(() => undefined)
	await broken.navigator.navigate({ to: "_root_/about" })
	expect(broken.deps.reload).toHaveBeenCalledWith("/about")
	logged.mockRestore()
})

// A failed root of a navigation a newer one replaced loads nothing.
it("superseded failed root", async () => {
	const older = held(() => new Response(null, { status: 404, headers: { "flare-failed": "_root_" } }))
	const app = await setup((url) => (url.startsWith("/about") ? older.fetch() : Promise.resolve(ndjson(aboutFrames))))
	const first = app.navigator.navigate({ to: "_root_/about" })
	await app.navigator.navigate({ to: "_root_/tabs/[[tab]]" })
	older.release()
	await first
	expect(app.deps.assign).not.toHaveBeenCalled()
})

it("request failed", async () => {
	const app = await setup(async () => new Response(null, { status: 500 }))
	await app.navigator.navigate({ to: "_root_/about" })
	flush()
	expect(app.store.snapshot().failure?.error.message).toBe("Request failed")
	expect(app.text()).toBe("root[Something went wrong]")
	expect(location.pathname).toBe("/about")
})

// A Back step the browser already took, whose data request fails with no status or as a bad input, commits nothing, so
// the URL would name one page while another stays on screen, and a Link to the page on screen would count as current
// and do nothing: the step loads its URL as a document instead (plan 21 12.4, BUGS.md 242). A pushed navigation that
// fails leaves the screen and the history as they were.
it("failed back loads document", async () => {
	for (const failing of [
		() => Promise.reject(new TypeError("offline")),
		() => Promise.resolve(new Response(null, { status: 400 })),
	]) {
		let fail = false
		// A cache that keeps nothing, so the step must ask the server (B137).
		const cache = createMatchCache({ staleTime: 0, gcTime: 0, max: 0 })
		const app = await mountNavigator(router, async () => (fail ? failing() : ndjson(aboutFrames)), { extra: { cache } })
		await app.navigator.navigate({ to: "_root_/about" })
		await app.navigator.navigate({ to: "_root_/" })
		flush()
		fail = true
		const popped = new Promise((resolve) => addEventListener("popstate", resolve, { once: true }))
		history.back()
		await popped
		await app.navigator.restore(`${location.pathname}${location.search}`, app.deps.history.index())
		expect(app.deps.assign).toHaveBeenCalledExactlyOnceWith("/about")
		unmountAll()
		history.replaceState(null, "", "/")
	}
})

// A `state` that cannot be structured-cloned, a function say, throws before anything happens: no request, no commit,
// and no history write, where the browser's own throw would come after the page had changed (BUGS.md 314).
it("state not cloneable", async () => {
	const app = await setup(async () => ndjson(aboutFrames))
	const length = history.length
	for (const move of [{ to: "_root_/about" }, { to: "_root_/", hash: "x" }] as const) {
		// The engine's own DataCloneError: V8 and JSC word its message differently.
		await expect((async () => app.navigator.navigate({ ...move, state: () => 1 }))()).rejects.toMatchObject({
			name: "DataCloneError",
		})
	}
	flush()
	expect([app.text(), location.href.slice(location.origin.length), history.length]).toEqual(["root[home]", "/", length])
	expect(app.deps.fetch).not.toHaveBeenCalled()
})

// A 2xx that is not a 200 data body, a proxy's 204 or 201 say, is no answer the client can paint and no failure: the
// URL loads as a document, under the reload guard, and nothing commits (dx/navigate.md, BUGS.md 320).
it("other 2xx loads document", async () => {
	for (const status of [201, 204]) {
		const app = await setup(async () => new Response(status === 204 ? null : "created", { status }))
		const length = history.length
		await app.navigator.navigate({ to: "_root_/about" })
		flush()
		expect([app.text(), location.pathname, history.length]).toEqual(["root[home]", "/", length])
		expect(app.deps.reload).toHaveBeenCalledExactlyOnceWith("/about")
		unmountAll()
	}
	// One a newer navigation superseded loads nothing.
	const slow = held(() => new Response(null, { status: 204 }))
	const answers = [slow.fetch, async () => ndjson(aboutFrames)]
	const app = await setup(async () => (answers.shift() ?? slow.fetch)())
	const first = app.navigator.navigate({ to: "_root_/about" })
	await new Promise((resolve) => setTimeout(resolve, 0))
	await app.navigator.navigate({ to: "_root_/about", revalidate: true })
	slow.release()
	await first
	expect(app.deps.reload).not.toHaveBeenCalled()
})
