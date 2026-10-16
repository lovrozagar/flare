import { flush } from "solid-js"
import { afterEach, beforeEach, expect, it } from "vitest"
import { encodeFrame, type Frame } from "../../shared/protocol/index.ts"
import { createPage } from "../../shared/route-builder/page.ts"
import { createRootLayout } from "../../shared/route-builder/root-layout.ts"
import { createRouter } from "../../shared/router/create-router.ts"
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
