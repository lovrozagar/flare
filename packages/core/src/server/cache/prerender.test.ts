import { createComponent, type Element } from "solid-js"
import { Dynamic } from "@solidjs/web"
import { expect, it } from "vitest"
import { prerendererOf, type Prerenderer } from "../../shared/protocol/prerender.ts"
import { createLayout } from "../../shared/route-builder/layout.ts"
import { createPage } from "../../shared/route-builder/page.ts"
import { createRootLayout } from "../../shared/route-builder/root-layout.ts"
import { createRouter, type RouteNode } from "../../shared/router/create-router.ts"
import { createMiddleware } from "../middleware/index.ts"
import { serveWith } from "../lifecycle/create.ts"
import type { Logger } from "../lifecycle/logger.ts"
import { LOCALE_SLOT } from "../lifecycle/locale-slot.ts"
import { fromSentinel } from "./nonce.ts"
import type { StoredPage } from "./write.ts"

const SITE = "https://example.com"

function noop(): void {}

const quiet: Logger = { level: "error", error: noop, warn: noop, log: noop }

function documentOf(children: Element): Element {
	return createComponent(Dynamic, {
		component: "html",
		get children() {
			return [
				createComponent(Dynamic, { component: "head" }),
				createComponent(Dynamic, { component: "body", children }),
			]
		},
	})
}

const root = createRootLayout("_root_").render((props) => documentOf(props.children))
const node = (id: string, path: string, module: RouteNode["module"]): RouteNode => ({ id, path, module })

// Pages in every mode: ssg static and listed, isr with and without params, live ssr, a .response() page, a chain that
// requires auth, one with authorize, and one under a layout that requires auth.
const TREE: RouteNode[] = [
	node(
		"_root_/",
		"/",
		createPage("_root_/")
			.cache({ ssg: true })
			.render(() => "home"),
	),
	node(
		"_root_/s",
		"/s",
		createPage("_root_/s")
			.cache({ ssg: true })
			.render(() => "static page"),
	),
	node(
		"_root_/p/[slug]",
		"/p/[slug]",
		createPage("_root_/p/[slug]")
			.cache({ ssg: ({ params }) => [{ slug: "a" }, { slug: `b${Object.keys(params).length}` }] })
			.loader(({ params }) => ({ slug: params.slug }))
			.render((props) => `post ${props.loaderData.slug}`),
	),
	node(
		"_root_/i/[id]",
		"/i/[id]",
		createPage("_root_/i/[id]")
			.cache({ isr: { params: () => [{ id: "1" }] } })
			.render(() => "isr page"),
	),
	node(
		"_root_/open",
		"/open",
		createPage("_root_/open")
			.cache({ isr: true })
			.render(() => "open"),
	),
	node(
		"_root_/doc/[name]",
		"/doc/[name]",
		createPage("_root_/doc/[name]")
			.cache({ ssg: { params: () => [{ name: "intro" }] } })
			.render(() => "doc"),
	),
	node(
		"_root_/broken",
		"/broken",
		createPage("_root_/broken")
			.cache({ ssg: true })
			.render(() => {
				throw new Error("broken")
			}),
	),
	node(
		"_root_/live",
		"/live",
		createPage("_root_/live").render(() => "live"),
	),
	node(
		"_root_/private",
		"/private",
		createPage("_root_/private")
			.cache({ ssg: true })
			.authenticate()
			.render(() => "x"),
	),
	node(
		"_root_/guarded",
		"/guarded",
		createPage("_root_/guarded")
			.cache({ ssg: true })
			.authorize(() => true)
			.render(() => "guarded"),
	),
	node(
		"_root_/team/home",
		"/team/home",
		createPage("_root_/team/home")
			.cache({ ssg: true })
			.render(() => "team"),
	),
	node(
		"_root_/late",
		"/late",
		createPage("_root_/late")
			.cache({ ssg: { defer: "resolve" } })
			.loader(({ defer }) => ({ late: defer(() => Promise.reject(new Error("late"))) }))
			.render(() => "late"),
	),
]

type Extra = {
	middleware?: ReturnType<typeof createMiddleware>[]
	basePath?: string
	site?: string | undefined
	trailingSlash?: "always" | "never" | "preserve"
}

function prerenderer(extra: Extra = {}): Prerenderer {
	const router = createRouter({
		layouts: {
			_root_: root,
			"_root_/team": createLayout("_root_/team")
				.authenticate()
				.render((props) => props.children),
		},
		routeTree: TREE,
		basePath: extra.basePath ?? "/",
		trailingSlash: extra.trailingSlash ?? "preserve",
	})
	const middleware = extra.middleware ?? []
	const site = "site" in extra ? extra.site : SITE
	const server = serveWith({ router, site, middleware }, { dev: false, log: quiet })
	const found = prerendererOf(server)
	if (found === undefined) throw new Error("no prerenderer")
	return found
}

// Every ssg page and every isr page, with what prerender checks before it renders. A live page, an isr page without
// params, and a .response() page are not listed.
it("pages", async () => {
	const pages = await prerenderer().pages()
	expect(pages.map((page) => page.id)).toEqual([
		"_root_/",
		"_root_/s",
		"_root_/p/[slug]",
		"_root_/i/[id]",
		"_root_/open",
		"_root_/doc/[name]",
		"_root_/broken",
		"_root_/private",
		"_root_/guarded",
		"_root_/team/home",
		"_root_/late",
	])
	expect(pages[1]).toEqual({
		id: "_root_/s",
		mode: "ssg",
		dynamic: false,
		listed: false,
		auth: { requires: false, reads: false },
		authorize: false,
	})
	expect(pages[2]).toMatchObject({ mode: "ssg", dynamic: true, listed: true })
	expect(pages[3]).toMatchObject({ mode: "isr", dynamic: true, listed: true })
	expect(pages[4]).toMatchObject({ mode: "isr", dynamic: false, listed: false })
	expect(pages[5]).toMatchObject({ mode: "ssg", dynamic: true, listed: true })
	expect(pages[7]?.auth).toEqual({ requires: true, reads: true })
	expect(pages[8]).toMatchObject({ authorize: true, auth: { requires: false, reads: true } })
	expect(pages[9]?.auth.requires).toBe(true)
})

// `params()` runs with `{ params: {} }`: no parent provides params (dx/cache.md). A page with no params function is
// one page.
it("params", async () => {
	const pages = prerenderer()
	expect(await pages.params("_root_/p/[slug]")).toEqual([{ slug: "a" }, { slug: "b0" }])
	expect(await pages.params("_root_/i/[id]")).toEqual([{ id: "1" }])
	expect(await pages.params("_root_/doc/[name]")).toEqual([{ name: "intro" }])
	expect(await pages.params("_root_/s")).toEqual([{}])
})

// The entry a stored miss writes: the shared render's HTML under the entry's sentinel, its NDJSON, the render mode,
// and the key of that slug in this build.
it("render", async () => {
	const pages = prerenderer()
	const result = await pages.render({ id: "_root_/p/[slug]", params: { slug: "a" }, env: {} })
	expect(result.status).toBe(200)
	expect(result.path).toBe("/p/a")
	expect(result.key).toBe("static:dev:_root_/p/[slug]:a")
	const page = result.entry?.data as StoredPage
	expect(page.render).toBe("ssg")
	expect(fromSentinel(page.html, page.sentinel, "n")).toContain("post a")
	expect(page.html).not.toContain('nonce="n"')
	expect(page.ndjson).toContain('"slug":"a"')
	expect(result.entry?.tags).toEqual([])
	expect(typeof result.entry?.storedAt).toBe("number")
	const isr = await pages.render({ id: "_root_/i/[id]", params: { id: "1" }, env: {} })
	const isrPage = isr.entry?.data as StoredPage | undefined
	expect(isrPage?.render).toBe("isr")
	// Under the router's base path: `/app` for the home page, `/app/s` for a page below it.
	const based = prerenderer({ basePath: "/app" })
	expect(await based.render({ id: "_root_/", params: {}, env: {} })).toMatchObject({
		path: "/app",
		key: "static:dev:_root_/",
	})
	expect(await based.render({ id: "_root_/s", params: {}, env: {} })).toMatchObject({ status: 200, path: "/app/s" })
	// With `trailingSlash: "always"` prerender asks for the canonical URL, so the page renders instead of a 301, and
	// the path it records, which the sitemap lists, carries the slash (plan 21 3.9).
	const slashed = prerenderer({ trailingSlash: "always" })
	expect(await slashed.render({ id: "_root_/p/[slug]", params: { slug: "a" }, env: {} })).toMatchObject({
		status: 200,
		path: "/p/a/",
	})
	expect(await slashed.render({ id: "_root_/", params: {}, env: {} })).toMatchObject({ status: 200, path: "/" })
	const both = prerenderer({ trailingSlash: "always", basePath: "/app" })
	expect(await both.render({ id: "_root_/", params: {}, env: {} })).toMatchObject({ status: 200, path: "/app/" })
})

// Only an ssg page, or an isr page with params, is prerendered. Anything else is refused by name.
it("refused", async () => {
	const pages = prerenderer()
	for (const id of ["_root_/live", "_root_/open", "_root_/missing"]) {
		await expect(pages.render({ id, params: {}, env: {} })).rejects.toThrow(id)
	}
	// Every shared render requests `site` plus the path, so a server without one cannot prerender.
	await expect(prerenderer({ site: undefined }).render({ id: "_root_/s", params: {}, env: {} })).rejects.toThrow(/site/)
})

// Nothing is captured when the shared render cannot be stored: a chain that requires auth answers 401, a middleware
// redirect answers its status, and a `resolve` value that rejects leaves the render unsettled.
it("not stored", async () => {
	const pages = prerenderer()
	const denied = await pages.render({ id: "_root_/private", params: {}, env: {} })
	expect(denied).toEqual({ status: 401, path: "/private" })
	expect(await pages.render({ id: "_root_/team/home", params: {}, env: {} })).toEqual({
		status: 401,
		path: "/team/home",
	})
	const late = await pages.render({ id: "_root_/late", params: {}, env: {} })
	expect(late.entry).toBeUndefined()
	expect(await pages.render({ id: "_root_/broken", params: {}, env: {} })).toEqual({ status: 500, path: "/broken" })
	const moved = createMiddleware(() => Response.redirect(`${SITE}/elsewhere`, 302))
	const redirected = await prerenderer({ middleware: [moved] }).render({ id: "_root_/s", params: {}, env: {} })
	expect(redirected.status).toBeGreaterThanOrEqual(300)
	expect(redirected.status).toBeLessThan(400)
	expect(redirected.entry).toBeUndefined()
})

// Every route node for the sitemap, in tree order: a static page's public path under the base, none for a param URL,
// the .response() flag, and the chain's auth. Describing a route renders nothing and runs no loader.
it("routes", async () => {
	const loaders: string[] = []
	const feed = createPage("_root_/feed.xml")
		.loader(() => void loaders.push("feed"))
		.render(() => "x")
	const tree = [...TREE, { ...node("_root_/feed.xml", "/feed.xml", feed), response: true }]
	const router = createRouter({ layouts: { _root_: root }, routeTree: tree, basePath: "/app" })
	const found = prerendererOf(serveWith({ router, site: SITE }, { dev: false, log: quiet }))
	expect(found?.site).toBe(SITE)
	const routes = (await found?.routes()) ?? []
	expect(routes.map((item) => item.id)).toEqual([...TREE.map((item) => item.id), "_root_/feed.xml"])
	expect(routes[0]).toEqual({
		id: "_root_/",
		path: "/app",
		bare: [],
		response: false,
		auth: { requires: false, reads: false },
		authorize: false,
	})
	expect(routes[1]?.path).toBe("/app/s")
	expect(routes[2]?.path).toBeUndefined()
	expect(routes.find((item) => item.id === "_root_/private")?.auth.requires).toBe(true)
	expect(routes.find((item) => item.id === "_root_/guarded")?.authorize).toBe(true)
	expect(routes.at(-1)).toMatchObject({ path: "/app/feed.xml", response: true })
	expect(loaders).toEqual([])
	expect((await prerenderer().routes())[0]?.path).toBe("/")
	expect(prerenderer({ site: undefined }).site).toBeUndefined()
})

function page(id: string) {
	return createPage(id).render(() => "x")
}

// A page whose dynamic segments are all optional has a bare URL with each of them absent, plus one per other locale
// when one of them is the locale param. A required param has none (B101, BUGS.md B10).
it("bare path", async () => {
	const tree = [
		node("[[locale]]/_root_/search", "/[[locale]]/search", page("[[locale]]/_root_/search")),
		node(
			"[[locale]]/_root_/examples/[[...rest]]",
			"/[[locale]]/examples/[[...rest]]",
			page("[[locale]]/_root_/examples/[[...rest]]"),
		),
		node("[[locale]]/_root_/docs/[slug]", "/[[locale]]/docs/[slug]", page("[[locale]]/_root_/docs/[slug]")),
		node("_root_/tags/[[tag]]", "/tags/[[tag]]", page("_root_/tags/[[tag]]")),
	]
	const layouts = { "[[locale]]/_root_": createRootLayout("[[locale]]/_root_").render(() => "x"), _root_: root }
	const router = createRouter({
		layouts,
		routeTree: tree,
		locale: { locales: ["en", "hr", "ar"], defaultLocale: "en" },
	})
	const locale = { [LOCALE_SLOT]: () => ({}) }
	const found = prerendererOf(serveWith({ router, site: SITE, locale }, { dev: false, log: quiet }))
	const bare = Object.fromEntries(((await found?.routes()) ?? []).map((item) => [item.id, item.bare]))
	expect(bare).toEqual({
		"[[locale]]/_root_/search": ["/search", "/hr/search", "/ar/search"],
		"[[locale]]/_root_/examples/[[...rest]]": ["/examples", "/hr/examples", "/ar/examples"],
		"[[locale]]/_root_/docs/[slug]": [],
		"_root_/tags/[[tag]]": ["/tags"],
	})
	// Without a locale slot the locale param is an ordinary optional one: one bare URL.
	const plain = prerendererOf(serveWith({ router, site: SITE }, { dev: false, log: quiet }))
	const routes = (await plain?.routes()) ?? []
	expect(routes.find((item) => item.id === "[[locale]]/_root_/search")?.bare).toEqual(["/search"])
})
