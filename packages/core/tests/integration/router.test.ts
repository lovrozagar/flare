import { createComponent, type Element } from "solid-js"
import { Dynamic } from "@solidjs/web"
import { expect, it } from "vitest"
import { DirectionScript } from "../../src/features/direction/shared/index.ts"
import { ThemeScript } from "../../src/features/theme/shared/index.ts"
import { createServer } from "../../src/server/lifecycle/create.ts"
import { createLayout } from "../../src/shared/route-builder/layout.ts"
import { createPage } from "../../src/shared/route-builder/page.ts"
import { createRootLayout } from "../../src/shared/route-builder/root-layout.ts"
import { createRouter, type RouteModule, type RouterOptions } from "../../src/shared/router/create-router.ts"

// dx/router.md's server-visible rows through the real createServer(...).fetch: the tree a router walks, its base path,
// case folding, trailing slashes, the not-found layout it picks, and the theme, direction, and locale it carries into
// the render (B96). The client-only rows run through the hydrate harness (router-client.test.ts).

const SITE = "https://example.com"

function documentOf(head: () => Element, children: Element): Element {
	return createComponent(Dynamic, {
		component: "html",
		get children() {
			return [
				createComponent(Dynamic, {
					component: "head",
					get children() {
						return head()
					},
				}),
				createComponent(Dynamic, { component: "body", children }),
			]
		},
	})
}

const root = createRootLayout("_root_")
	.render((props) => documentOf(() => [], props.children))
	.notFoundRender(() => "root missing")
const docs = createLayout("_root_/docs")
	.render((props) => ["docs[", props.children, "]"])
	.notFoundRender(() => "docs missing")
const page = (id: string, text: string): RouteModule => createPage(id).render(() => text) as RouteModule

// `/`, `/about`, and `/docs/a` under the docs layout, with whatever router options the case passes.
function serve(
	options: Partial<RouterOptions> = {},
	layouts: RouterOptions["layouts"] = { _root_: root, "_root_/docs": docs },
) {
	const router = createRouter({
		layouts,
		routeTree: [
			{ id: "_root_/", path: "/", module: page("_root_/", "home") },
			{ id: "_root_/about", path: "/about", module: page("_root_/about", "about") },
			{ id: "_root_/docs/a", path: "/docs/a", module: page("_root_/docs/a", "docs a") },
		],
		...options,
	})
	const app = createServer({ router, site: SITE })
	return async (path: string, init?: RequestInit) => {
		const response = await app.fetch(new Request(`${SITE}${path}`, { redirect: "manual", ...init }))
		return { status: response.status, location: response.headers.get("location"), text: await response.text() }
	}
}

// The codegen record and tree are what the router walks: each page under its layouts (router.md layouts, routeTree).
it("layouts and route tree", async () => {
	const get = serve()
	expect(await get("/")).toMatchObject({ status: 200, text: expect.stringContaining("home") })
	expect(await get("/docs/a")).toMatchObject({ status: 200, text: expect.stringContaining("docs[docs a]") })
})

// Every route is under the base, and the base itself is the index (router.md basePath).
it("base path", async () => {
	const get = serve({ basePath: "/app" })
	expect(await get("/app")).toMatchObject({ status: 200, text: expect.stringContaining("home") })
	expect(await get("/app/about")).toMatchObject({ status: 200, text: expect.stringContaining("about") })
	expect((await get("/about")).status).toBe(404)
})

// By default a static segment matches in any case and redirects to the route's spelling; `caseSensitive` turns that
// off (router.md caseSensitive).
it("case sensitive", async () => {
	expect(await serve()("/About")).toMatchObject({ status: 301, location: "/about" })
	expect((await serve({ caseSensitive: true })("/About")).status).toBe(404)
})

// `preserve` matches both forms; `never` strips the slash, `always` adds it, both except on `/`, and collapse empty
// segments in that redirect; a GET redirects 301 and a POST 308 (router.md trailingSlash).
it("trailing slash", async () => {
	const preserve = serve()
	expect((await preserve("/about")).status).toBe(200)
	expect((await preserve("/about/")).status).toBe(200)
	const never = serve({ trailingSlash: "never" })
	expect(await never("/about/")).toMatchObject({ status: 301, location: "/about" })
	expect(await never("/about/", { method: "POST" })).toMatchObject({ status: 308, location: "/about" })
	expect((await never("/")).status).toBe(200)
	const always = serve({ trailingSlash: "always" })
	expect(await always("/about")).toMatchObject({ status: 301, location: "/about/" })
	expect(await always("/docs//a")).toMatchObject({ status: 301, location: "/docs/a/" })
	expect((await always("/")).status).toBe(200)
})

// `root` renders the root's not-found; `fuzzy` the not-found of the longest layout prefix (router.md notFoundMode).
it("not found mode", async () => {
	expect(await serve()("/docs/zzz")).toMatchObject({ status: 404, text: expect.stringContaining("root missing") })
	const fuzzy = await serve({ notFoundMode: "fuzzy" })("/docs/zzz")
	expect(fuzzy).toMatchObject({ status: 404, text: expect.stringContaining("docs missing") })
	expect(fuzzy.text).not.toContain("root missing")
})

// The resolved theme and direction configs live on the router, and the render provides the router as context, so the
// scripts read them there with no prop (router.md theme, direction).
it("theme and direction", async () => {
	const themed = createRootLayout("_root_").render((props) =>
		documentOf(
			() => [createComponent(ThemeScript, {}), createComponent(DirectionScript, { locale: "ar" })],
			props.children,
		),
	)
	const get = serve({ theme: { storageKey: "app.theme" }, direction: {} }, { _root_: themed, "_root_/docs": docs })
	const { status, text } = await get("/")
	expect(status).toBe(200)
	expect(text).toContain("app.theme")
	expect(text).toContain("rtl")
})

// The locale field types the param and checks its tags; it does not redirect and reads no cookie (router.md locale).
it("locale", async () => {
	const localized = createPage("_root_/[[locale]]/x").render((props) => `x:${String(props.params.locale)}`)
	const router = createRouter({
		layouts: { _root_: root },
		routeTree: [{ id: "_root_/[[locale]]/x", path: "/[[locale]]/x", module: localized as RouteModule }],
		locale: { locales: ["en", "hr"], defaultLocale: "en" },
	})
	const app = createServer({ router, site: SITE })
	const plain = await app.fetch(new Request(`${SITE}/x`, { headers: { cookie: "flare.locale=hr" } }))
	expect(plain.status).toBe(200)
	expect(await plain.text()).toContain("x:undefined")
	expect(await (await app.fetch(new Request(`${SITE}/hr/x`))).text()).toContain("x:hr")
	for (const locales of [["en-us"], ["en", "en"], []]) {
		expect(() =>
			createRouter({ layouts: { _root_: root }, routeTree: [], locale: { locales, defaultLocale: "en" } }),
		).toThrow(/locale/)
	}
})
