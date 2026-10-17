import { expect, it } from "vitest"
import { createRouter, notFoundRenderOf, type Match } from "./create-router.ts"
import { loadChain, loadedModule } from "./load-chain.ts"
import { cachedMatches } from "../../client/router/match-cache.ts"
import { boundaryAt } from "../components/boundary.ts"
import { createPathSegment } from "../route-builder/segment.ts"

async function notFoundOf(match: Match): Promise<unknown> {
	return notFoundRenderOf(await loadChain(match.chain))
}

const rootNotFound = () => "root"
const blogNotFound = () => "blog"
const localeNotFound = () => "locale"
const groupNotFound = () => "group"

const layouts = {
	_root_: { boundaries: { notFoundRender: rootNotFound } },
	"_root_/blog": { boundaries: { notFoundRender: blogNotFound } },
	"_root_/blog/drafts": {},
}

it("defaults", () => {
	const router = createRouter({ layouts: {}, routeTree: [] })
	expect(router).toMatchObject({
		basePath: "/",
		caseSensitive: false,
		trailingSlash: "preserve",
		notFoundMode: "root",
		scrollRestoration: true,
		scrollRestorationBehavior: "instant",
		scrollRestorationMaxEntries: 50,
		routeCacheMaxEntries: 100,
		prefetch: { modules: "all", data: false },
		cache: { client: { staleTime: 0, gcTime: "5m" } },
		viewTransitions: false,
	})
})

const post = { loader: () => ({ id: "post" }) }
const pages = [{ id: "_root_/blog/post", path: "/blog/post", module: post }]

it("not found root", async () => {
	const router = createRouter({ layouts, routeTree: pages })
	expect(await notFoundOf(router.match("/missing"))).toBe(rootNotFound)
})

it("not found fuzzy", async () => {
	const router = createRouter({ layouts, routeTree: pages, notFoundMode: "fuzzy" })
	expect(await notFoundOf(router.match("/blog/missing"))).toBe(blogNotFound)
	expect(await notFoundOf(router.match("/blog"))).toBe(blogNotFound)
	expect(await notFoundOf(router.match("/blog/drafts/missing"))).toBe(rootNotFound)
	expect(await notFoundOf(router.match("/missing"))).toBe(rootNotFound)
})

it("cache client only", () => {
	const router = createRouter({ layouts: {}, routeTree: [] })
	// @ts-expect-error the router cache has no ssr
	const rejected = createRouter({ layouts: {}, routeTree: [], cache: { ssr: { ttl: "1m" } } })
	expect(router.cache.client).toEqual({ staleTime: 0, gcTime: "5m" })
	expect(rejected.cache).not.toHaveProperty("ssr")
})

it("base path is a route", () => {
	const router = createRouter({
		layouts: { _root_: {} },
		routeTree: [{ id: "_root_/", path: "/", module: {} }],
		basePath: "/app",
	})
	expect(router.match("/app").id).toBe("_root_/")
	expect(router.match("/app/").id).toBe("_root_/")
	expect(router.match("/").id).toBeUndefined()
})

it("theme absent", () => {
	const router = createRouter({ layouts: {}, routeTree: [] })
	expect(router).not.toHaveProperty("theme")
})

it("direction absent", () => {
	const router = createRouter({ layouts: {}, routeTree: [] })
	expect(router).not.toHaveProperty("direction")
})

const bare = { layouts: {}, routeTree: [] }

it("theme stored", () => {
	expect(createRouter({ ...bare, theme: {} }).theme).toEqual({
		defaultTheme: "system",
		attribute: "data-theme",
		storageKey: "flare.theme",
		themes: ["light", "dark", "system"],
		disableTransitionOnChange: true,
	})
	const custom = { defaultTheme: "dark", attribute: "data-mode", storageKey: "k", themes: ["dark", "light"] } as const
	expect(createRouter({ ...bare, theme: { ...custom, disableTransitionOnChange: false } }).theme).toEqual({
		...custom,
		disableTransitionOnChange: false,
	})
})

it("theme themes", () => {
	expect(() => createRouter({ ...bare, theme: { themes: [] } })).toThrow(/themes/)
	expect(() => createRouter({ ...bare, theme: { themes: ["light", "light"] } })).toThrow(/themes/)
	// @ts-expect-error a theme outside the three
	expect(() => createRouter({ ...bare, theme: { themes: ["light", "blue"] } })).toThrow(/themes/)
	expect(() => createRouter({ ...bare, theme: { themes: ["light", "dark"] } })).toThrow(/defaultTheme/)
	// @ts-expect-error a default outside the three
	expect(() => createRouter({ ...bare, theme: { defaultTheme: "blue" } })).toThrow(/defaultTheme/)
})

it("theme attribute", () => {
	for (const attribute of ["class", "style", "id", "dir", "data-", "Data-Theme"])
		// @ts-expect-error only a data-* name
		expect(() => createRouter({ ...bare, theme: { attribute } })).toThrow(/attribute/)
	expect(createRouter({ ...bare, theme: { attribute: "data-scheme" } }).theme?.attribute).toBe("data-scheme")
})

it("theme storage", () => {
	expect(() => createRouter({ ...bare, theme: { storageKey: "" } })).toThrow(/storageKey/)
})

it("direction stored", () => {
	expect(createRouter({ ...bare, direction: {} }).direction).toEqual({
		defaultDir: "ltr",
		attribute: "dir",
		storageKey: "flare.dir",
	})
	const custom = { defaultDir: "rtl", attribute: "data-dir", storageKey: "d" } as const
	expect(createRouter({ ...bare, direction: custom }).direction).toEqual(custom)
	// @ts-expect-error a dir outside ltr and rtl
	expect(() => createRouter({ ...bare, direction: { defaultDir: "auto" } })).toThrow(/defaultDir/)
})

it("direction attribute", () => {
	for (const attribute of ["class", "style", "id", "lang"])
		// @ts-expect-error `dir` or a data-* name
		expect(() => createRouter({ ...bare, direction: { attribute } })).toThrow(/attribute/)
})

it("direction storage", () => {
	expect(() => createRouter({ ...bare, direction: { storageKey: "" } })).toThrow(/storageKey/)
})

it("locale types", () => {
	const locale = { locales: ["en", "hr"], defaultLocale: "en" }
	expect(createRouter({ ...bare, locale }).locale).toEqual({
		...locale,
		paramName: "locale",
		cookieName: "flare.locale",
	})
	const named = { ...locale, paramName: "lang", cookieName: "c" }
	expect(createRouter({ ...bare, locale: named }).locale).toEqual(named)
	expect(createRouter(bare)).not.toHaveProperty("locale")
	// @ts-expect-error bot detection is the server's
	createRouter({ ...bare, locale: { ...locale, botDetection: false } })
})

const withLocales =
	(locales: string[], defaultLocale = "en") =>
	() =>
		createRouter({ ...bare, locale: { locales, defaultLocale } })

it("locale invalid", () => {
	expect(withLocales([])).toThrow("locale.locales")
	expect(withLocales(["en", "en"])).toThrow("locale.locales")
	expect(withLocales(["en", "en-us"])).toThrow("locale.locales en-us")
	expect(withLocales(["en", "en_US"])).toThrow("locale.locales en_US")
	expect(withLocales(["hr"])).toThrow("locale.defaultLocale")
	expect(withLocales(["en", "en-US", "zh-Hant-TW", "sr-Latn"])).not.toThrow()
})

it("matched chain", () => {
	const router = createRouter({ layouts, routeTree: pages })
	expect(router.match("/blog/post").chain).toEqual([
		{ id: "_root_", kind: "layout", module: layouts._root_ },
		{ id: "_root_/blog", kind: "layout", module: layouts["_root_/blog"] },
		{ id: "_root_/blog/post", kind: "page", module: post },
	])
	const home = createRouter({ layouts: { _root_: {} }, routeTree: [{ id: "_root_/", path: "/", module: post }] })
	expect(home.match("/").chain.map((entry) => [entry.id, entry.kind])).toEqual([
		["_root_", "layout"],
		["_root_/", "page"],
	])
})

it("not found chain", () => {
	const root = createRouter({ layouts, routeTree: pages })
	expect(root.match("/blog/missing").chain.map((entry) => entry.id)).toEqual(["_root_"])
	const fuzzy = createRouter({ layouts, routeTree: pages, notFoundMode: "fuzzy" })
	expect(fuzzy.match("/blog/missing").chain.map((entry) => entry.id)).toEqual(["_root_", "_root_/blog"])
	expect(fuzzy.match("/blog/drafts/missing").chain.map((entry) => entry.id)).toEqual([
		"_root_",
		"_root_/blog",
		"_root_/blog/drafts",
	])
	expect(fuzzy.match("/missing").chain.map((entry) => entry.kind)).toEqual(["layout"])
})

it("params and base path", () => {
	const user = { loader: () => ({ id: "user" }) }
	const fresh = { loader: () => ({ id: "new" }) }
	const router = createRouter({
		layouts: { _root_: {} },
		routeTree: [
			{ id: "_root_/users/[id]", path: "/users/[id]", module: user },
			{ id: "_root_/users/new", path: "/users/new", module: fresh },
			{ id: "_root_/about", path: "/about", module: {} },
		],
		basePath: "/app",
	})
	expect(router.match("/app/users/42")).toMatchObject({ id: "_root_/users/[id]", params: { id: "42" } })
	expect(router.match("/app/users/new").id).toBe("_root_/users/new")
	expect(router.match("/app/about").id).toBe("_root_/about")
	expect(router.match("/about").id).toBeUndefined()
	expect(router.match("/application/about").id).toBeUndefined()
})

it("not found roots", async () => {
	const locale = createRouter({
		layouts: { "[locale]/_root_": { boundaries: { notFoundRender: localeNotFound } } },
		routeTree: [{ id: "[locale]/_root_/about", path: "/[locale]/about", module: {} }],
	})
	expect(locale.match("/en/about").chain.map((entry) => entry.id)).toEqual(["[locale]/_root_", "[locale]/_root_/about"])
	const missing = locale.match("/en/missing")
	expect(missing.chain.map((entry) => entry.id)).toEqual(["[locale]/_root_"])
	expect(await notFoundOf(missing)).toBe(localeNotFound)
	expect(locale.match("/").chain).toEqual([])
	expect(await notFoundOf(locale.match("/"))).toBeUndefined()
	const admin = createRouter({ layouts: { _admin_: {} }, routeTree: [], notFoundMode: "fuzzy" })
	expect(admin.match("/x").chain.map((entry) => entry.id)).toEqual(["_admin_"])
	const both = createRouter({
		layouts: { _admin_: {}, _root_: { boundaries: { notFoundRender: rootNotFound } } },
		routeTree: [],
	})
	expect(both.match("/x").chain.map((entry) => entry.id)).toEqual(["_root_"])
})

it("fuzzy group", async () => {
	const router = createRouter({
		layouts: {
			_root_: { boundaries: { notFoundRender: rootNotFound } },
			"_root_/(blog)": { boundaries: { notFoundRender: groupNotFound } },
		},
		routeTree: [{ id: "_root_/(blog)/post", path: "/post", module: {} }],
		notFoundMode: "fuzzy",
	})
	expect(router.match("/post").chain.map((entry) => entry.id)).toEqual([
		"_root_",
		"_root_/(blog)",
		"_root_/(blog)/post",
	])
	const missing = router.match("/post/missing")
	expect(missing.chain.map((entry) => entry.id)).toEqual(["_root_", "_root_/(blog)"])
	expect(await notFoundOf(missing)).toBe(groupNotFound)
})

it("prefixed root", async () => {
	const router = createRouter({
		layouts: { "site/_root_": { boundaries: { notFoundRender: rootNotFound } } },
		routeTree: [{ id: "site/_root_/about", path: "/about", module: {} }],
	})
	const missing = router.match("/missing")
	expect(missing.chain.map((entry) => entry.id)).toEqual(["site/_root_"])
	expect(await notFoundOf(missing)).toBe(rootNotFound)
})

it("lazy chain", async () => {
	const root = { boundaries: { notFoundRender: rootNotFound } }
	const page = { loader: () => ({ id: "page" }) }
	const router = createRouter({
		layouts: { _root_: () => Promise.resolve(root) },
		routeTree: [{ id: "_root_/a", path: "/a", module: () => Promise.resolve(page) }],
		chunks: { _root_: "/src/routes/_root_/root.root-layout.tsx" },
	})
	const match = router.match("/a")
	expect(match.chain.map((entry) => typeof entry.module)).toEqual(["function", "function"])
	expect(match.chain.map((entry) => loadedModule(entry.module))).toEqual([undefined, undefined])
	expect((await loadChain(match.chain)).map((entry) => entry.module)).toEqual([root, page])
	expect(match.chain.map((entry) => loadedModule(entry.module))).toEqual([root, page])
	expect(loadedModule(page)).toBe(page)
	expect(await notFoundOf(router.match("/nope"))).toBe(rootNotFound)
	expect(router.chunks).toEqual({ _root_: "/src/routes/_root_/root.root-layout.tsx" })
	expect(createRouter({ layouts: {}, routeTree: [] }).chunks).toEqual({})
	const broken = createRouter({
		layouts: { _root_: () => Promise.reject(new Error("Failed to fetch dynamically imported module")) },
		routeTree: [],
	})
	await expect(loadChain(broken.match("/x").chain)).rejects.toThrow(/dynamically imported/)
})

it("prefetch option", () => {
	const tree = { layouts: {}, routeTree: [] }
	expect(createRouter({ ...tree, prefetch: "intent" }).prefetch).toEqual({ modules: "intent", data: "intent" })
	expect(createRouter({ ...tree, prefetch: { data: "viewport" } }).prefetch).toEqual({
		modules: "all",
		data: "viewport",
	})
	expect(createRouter({ ...tree, prefetch: false }).prefetch).toEqual({ modules: false, data: false })
	const page = { cache: { client: { prefetch: "render" as const } } }
	const router = createRouter({
		layouts: { _root_: {} },
		routeTree: [
			{ id: "_root_/a", path: "/a", module: page },
			{ id: "_root_/b", path: "/b", client: { prefetch: "intent" }, module: () => Promise.resolve(page) },
			{ id: "_root_/c", path: "/c", module: {} },
		],
	})
	expect(router.match("/a").client).toEqual({ prefetch: "render" })
	expect(router.match("/b").client).toEqual({ prefetch: "intent" })
	expect(router.match("/c")).not.toHaveProperty("client")
})

it("view transitions option", () => {
	const tree = { layouts: {}, routeTree: [] }
	expect(createRouter({ ...tree, viewTransitions: true }).viewTransitions).toEqual({})
	expect(createRouter({ ...tree, viewTransitions: { types: ["fade"] } }).viewTransitions).toEqual({ types: ["fade"] })
	expect(createRouter({ ...tree, viewTransitions: false }).viewTransitions).toBe(false)
})

// With a locale config, the locale param holds only a locale-like segment. Anything else is not a tag, so the
// optional param stays empty and the segment goes to the next one, or no route matches (B73).
it("locale param", () => {
	const routeTree = [
		{ id: "_root_/[[locale]]", path: "/[[locale]]", module: {} },
		{ id: "_root_/[[locale]]/[[slug]]", path: "/[[locale]]/[[slug]]", module: {} },
		{ id: "_root_/[locale]/docs", path: "/[locale]/docs", module: {} },
	]
	const locale = { locales: ["en", "hr"], defaultLocale: "en" }
	const routed = createRouter({ layouts: {}, routeTree, locale })
	expect(routed.match("/favicon.ico")).toMatchObject({
		id: "_root_/[[locale]]/[[slug]]",
		params: { locale: undefined, slug: "favicon.ico" },
	})
	expect(routed.match("/hr").params).toEqual({ locale: "hr" })
	// Only a configured tag, in any case, is a locale; any other segment is an ordinary one (plan 21 3.8).
	expect(routed.match("/fr").params).toEqual({ locale: undefined, slug: "fr" })
	expect(routed.match("/HR").params).toEqual({ locale: "HR" })
	expect(routed.match("/hr/x").params).toEqual({ locale: "hr", slug: "x" })
	expect(routed.match("/x.y/docs").id).toBeUndefined()
	expect(routed.match("/fr/docs").id).toBeUndefined()
	expect(routed.match("/hr/docs").params).toEqual({ locale: "hr" })
	// Without a locale config the param is an ordinary one.
	expect(createRouter({ layouts: {}, routeTree }).match("/x.y/docs").params).toEqual({ locale: "x.y" })
})

// A path segment is a chain entry of kind "segment" once loaded. The boundary walk skips it, and the match cache keys
// it as a layout, never a page (BUGS.md B22).
it("segment chain", async () => {
	const segment = createPathSegment("_root_/docs").cache({ cdn: { maxAge: "1m" } })
	const shown = { ...segment, boundaries: { errorRender: () => "segment error" } }
	const router = createRouter({
		layouts: {
			_root_: { boundaries: { errorRender: () => "root error" } },
			"_root_/docs": () => Promise.resolve(shown),
		},
		routeTree: [{ id: "_root_/docs/[slug]", path: "/docs/[slug]", module: { render: () => "doc" } }],
	})
	const match = router.match("/docs/a")
	const chain = await loadChain(match.chain)
	expect(chain.map((entry) => [entry.id, entry.kind])).toEqual([
		["_root_", "layout"],
		["_root_/docs", "segment"],
		["_root_/docs/[slug]", "page"],
	])
	const slots = chain.map((entry) => ({ kind: entry.kind, module: entry.module.boundaries ?? {} }))
	expect(boundaryAt(slots, 2, 500)).toBe(0)
	const cached = cachedMatches(match, { pathname: "/docs/a", search: "", hash: "" })
	expect(cached.map((entry) => entry.layout)).toEqual([true, true, false])
})

// Every dx/router.md option reaches the router: the case rule, the trailing slash, scroll restoration and its key, the
// match cache's size, and the client cache, `false` included. An out-of-range count throws at the call (BUGS.md 106).

// A match depends on the path alone, so the router keeps the 256 latest: a page's params hooks and the request's own
// lookup read one match, and the oldest path goes first (plan 21 15.4).
it("match kept", () => {
	const page = { id: "_root_/users/[id]", path: "/users/[id]", module: {} }
	const router = createRouter({ layouts: {}, routeTree: [page] })
	const first = router.match("/users/1")
	expect(router.match("/users/1")).toBe(first)
	for (let index = 2; index <= 257; index++) router.match(`/users/${index}`)
	expect(router.match("/users/1")).not.toBe(first)
	expect(router.match("/users/1")).toEqual(first)
})
