import { flush } from "solid-js"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { encodeFrame, type Frame } from "../../shared/protocol/index.ts"
import { createPage } from "../../shared/route-builder/page.ts"
import { createRootLayout } from "../../shared/route-builder/root-layout.ts"
import { createRouter } from "../../shared/router/create-router.ts"
import { mountNavigator, unmountAll, type Fetch } from "./navigate.fixture.ts"
import type { NavigatorDeps } from "./navigate.ts"

// A page leaving after a document load the navigator began (leaving.ts, BUGS.md 129).
const root = createRootLayout("_root_").render((props) => ["root[", props.children, "]"])
const home = createPage("_root_/").render((props) => [() => `home:${String(props.loaderData)}`])
const about = createPage("_root_/about").render((props) => `about:${String(props.loaderData)}`)
const tabs = createPage("_root_/tabs/[[tab]]").render((props) => `tabs:${String(props.loaderData)}`)
const router = createRouter({
	layouts: { _root_: root },
	routeTree: [
		{ id: "_root_/", path: "/", module: home },
		{ id: "_root_/about", path: "/about", module: about },
		{ id: "_root_/tabs/[[tab]]", path: "/tabs/[[tab]]", module: tabs },
		{
			id: "_root_/lazy",
			path: "/lazy",
			module: () => Promise.reject(new TypeError("Failed to fetch dynamically imported module")),
		},
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

const fetchAbout: Fetch = async () => new Response(aboutFrames.map(encodeFrame).join(""))

function setup(extra: Partial<NavigatorDeps> = {}) {
	return mountNavigator(router, fetchAbout, { extra })
}

// Once a navigation has begun a document load, the page is leaving: a later navigation loads its own page as a document
// and fetches nothing, so the latest click's load is the last one, and a revalidation of the page on screen does
// nothing. Before, it started a client navigation that the unload then cancelled, and that failure loaded its page over
// the user's latest click.
it("leaving", async () => {
	const app = await setup()
	await app.navigator.navigate({ to: "_root_/lazy" })
	expect(app.deps.reload).toHaveBeenCalledExactlyOnceWith("/lazy")
	await app.navigator.navigate({ to: "_root_/about" })
	await app.navigator.navigate({ to: "_root_/tabs/[[tab]]" })
	await app.navigator.navigate({ to: "_root_/", revalidate: true })
	flush()
	expect(vi.mocked(app.deps.assign).mock.calls).toEqual([["/about"], ["/tabs"]])
	expect(app.deps.fetch).toHaveBeenCalledOnce()
	expect(location.pathname).toBe("/")
})

// A document load the reload guard refused leaves the page where it is, so the next navigation is a client one.
it("leaving refused", async () => {
	const app = await setup({ reload: vi.fn<(href: string) => boolean>(() => false) })
	await app.navigator.navigate({ to: "_root_/lazy" })
	await app.navigator.navigate({ to: "_root_/about" })
	flush()
	expect(app.deps.assign).not.toHaveBeenCalled()
	expect(app.text()).toBe("root[about:fresh]")
})

// A page the back-forward cache restores (`pageshow` with `persisted`) is no longer leaving; any other pageshow keeps it.
it("leaving restored", async () => {
	const app = await setup()
	await app.navigator.navigate({ to: "_root_/lazy" })
	app.navigator.pageshow(false)
	await app.navigator.navigate({ to: "_root_/tabs/[[tab]]" })
	expect(vi.mocked(app.deps.assign).mock.calls).toEqual([["/tabs"]])
	app.navigator.pageshow(true)
	await app.navigator.navigate({ to: "_root_/about" })
	flush()
	expect(app.text()).toBe("root[about:fresh]")
	expect(location.pathname).toBe("/about")
})
