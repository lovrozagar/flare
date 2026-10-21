import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { afterAll, beforeAll, expect, it } from "vitest"
import { createPage, createRootLayout, createRouter } from "../../src/exports/index.ts"
import { indexNow, sitemap } from "../../src/exports/seo.ts"
import { createServer } from "../../src/exports/server.ts"
import { flare } from "../../src/vite/plugin/flare.ts"
import { fixtureApps, page, rootLayout, viteBuild } from "./vite-app.ts"

// dx/seo.md's sitemap and key file through real apps (B96): each app is built by `vite build` with
// `flare({ prerender: { sitemap } })`, and its sitemap.xml and robots.txt are read from the client output, which the
// platform serves (docs-features `sitemap` and `robots` read them over HTTP). The key file is a middleware of the real
// `createServer(...).fetch`. The submitters are seo-submit.test.ts.

const apps = fixtureApps()

afterAll(() => apps.removeAll())

const SITE = "https://flare.test"

// A config whose flare() writes the sitemap with these options.
function config(options: string): string {
	return `import { flare } from "@lovrozagar/flare/vite";\nexport default { logLevel: "error", plugins: [flare({ prerender: { sitemap: ${options} } })] };\n`
}

// The server on `site`, with a sign-in that never knows anyone.
const SERVER = [
	'import { createServer } from "@lovrozagar/flare/server";',
	'import { router } from "./router.ts";',
	`export const server = createServer({ router, site: ${JSON.stringify(SITE)}, authenticate: () => null });`,
	"",
].join("\n")

// One page per inclusion rule.
const PAGES: Record<string, string> = {
	"src/routes/_root_/root.root-layout.tsx": rootLayout("_root_"),
	"src/routes/_root_/home.page.tsx": page("_root_/"),
	"src/routes/_root_/about/about.page.tsx": page("_root_/about"),
	"src/routes/_root_/account/account.page.tsx": page("_root_/account", ".authenticate()"),
	"src/routes/_root_/maybe/maybe.page.tsx": page("_root_/maybe", ".authenticateOptional()"),
	"src/routes/_root_/team/team.page.tsx": page("_root_/team", ".authenticateOptional().authorize(() => true)"),
	"src/routes/_root_/feed/feed.page.tsx":
		'import { createPage } from "@lovrozagar/flare";\nexport const route = createPage("_root_/feed").response(() => new Response("feed"));\n',
	"src/routes/_root_/posts/[slug]/post.page.tsx": page(
		"_root_/posts/[slug]",
		'.cache({ ssg: () => [{ slug: "a" }, { slug: "b" }] })',
	),
	"src/routes/_root_/users/[id]/user.page.tsx": page("_root_/users/[id]"),
	"src/routes/_root_/files/[[...rest]]/files.page.tsx": page("_root_/files/[[...rest]]"),
	"src/routes/_root_/hidden/hidden.page.tsx": page("_root_/hidden"),
}

const FULL = `{
	changefreq: { "_root_/": "daily", "_root_/posts/[slug]": "monthly" },
	priority: 0.5,
	exclude: ["_root_/hidden"],
	additionalEntries: [{ loc: "${SITE}/extra?a=1&b=2", lastmod: "2026-01-02T23:30:00-05:00", changefreq: "yearly", priority: 0.1 }],
	robotsTxt: "User-agent: *\\nSitemap: https://other.test/sitemap.xml\\nDisallow: /account\\n",
}`

const TWO_PAGES = {
	"src/routes/_root_/root.root-layout.tsx": rootLayout("_root_"),
	"src/routes/_root_/home.page.tsx": page("_root_/"),
	"src/routes/_root_/about/about.page.tsx": page("_root_/about"),
}

// dx/seo.md's sitemap clauses a page's shape decides (BUGS.md 470): a locale-optional page listed bare and per other
// tag, a literal-bracket folder at the URL it serves, an isr page's built param sets, and an extra entry that repeats
// a listed URL kept once.
const CLAUSES = {
	"src/router.ts":
		'import { createRouter } from "@lovrozagar/flare";\nimport { chunks, layouts, routeTree } from "./_gen/routes.gen.ts";\nexport const router = createRouter({ layouts, routeTree, chunks, locale: { locales: ["en", "hr"], defaultLocale: "en" } });\n',
	"src/routes/[[locale]]/_root_/root.root-layout.tsx": rootLayout("[[locale]]/_root_"),
	"src/routes/[[locale]]/_root_/search/search.page.tsx": page("[[locale]]/_root_/search"),
	"src/routes/_flat_/root.root-layout.tsx": rootLayout("_flat_"),
	"src/routes/_flat_/[_]flare]/flare.page.tsx": page("_flat_/[_]flare]"),
	"src/routes/_flat_/items/[id]/item.page.tsx": page(
		"_flat_/items/[id]",
		'.cache({ isr: { params: () => [{ id: "1" }, { id: "2" }] } })',
	),
	"vite.config.mjs": config(`{ additionalEntries: [{ loc: "${SITE}/search", priority: 0.2 }] }`),
	// The locale slot is the server's: its i18n middleware over the router's config (B73, B101).
	"src/server.ts": [
		'import { createServer } from "@lovrozagar/flare/server";',
		'import { i18n } from "@lovrozagar/flare/i18n/server";',
		'import { router } from "./router.ts";',
		`export const server = createServer({ router, site: ${JSON.stringify(SITE)}, locale: i18n({ locales: ["en", "hr"], defaultLocale: "en" }) });`,
		"",
	].join("\n"),
}

let full: string | undefined
let robots: string | undefined
let plain: string | undefined
let clauses: string | undefined

// The app's root once it built.
async function app(files: Record<string, string>): Promise<string> {
	const root = apps.make({ "src/server.ts": SERVER, ...files })
	const built = await viteBuild(root)
	if (built.status !== 0) throw new Error(built.output)
	return root
}

beforeAll(async () => {
	;[full, robots, plain, clauses] = await Promise.all([
		app({ ...PAGES, "vite.config.mjs": config(FULL) }),
		app({
			...TWO_PAGES,
			"vite.config.mjs": config('{ robotsTxt: true, changefreq: "weekly", priority: { "_root_/about": 0.9 } }'),
		}),
		app({ ...TWO_PAGES, "vite.config.mjs": config("{}") }),
		app(CLAUSES),
	])
})

// A file at the root of the app's client output, or undefined when the build wrote none.
function written(root: string | undefined, file: string): string | undefined {
	if (root === undefined) throw new Error("the app did not build")
	const path = join(root, "dist", "client", file)
	return existsSync(path) ? readFileSync(path, "utf8") : undefined
}

// Each `<url>` as its fields, by `loc`: dx/seo.md sets no order.
function entries(xml: string | undefined): Array<Record<string, string>> {
	return [...(xml ?? "").matchAll(/<url>(.*?)<\/url>/gs)]
		.map(([, body]) =>
			Object.fromEntries([...(body ?? "").matchAll(/<(\w+)>([^<]*)<\/\1>/g)].map(([, name, value]) => [name, value])),
		)
		.sort((left, right) => String(left["loc"]).localeCompare(String(right["loc"])))
}

// Public pages, optional auth without authorize, the bare optional catch-all, and each ssg slug are listed; required
// auth, authorize, a `.response()` page, an unbuilt dynamic page, and an excluded page are not. The extra entry is
// appended with its lastmod as written and its `&` escaped.
it("sitemap entries", async () => {
	const xml = written(full, "sitemap.xml")
	expect(xml).toMatch(
		/^<\?xml version="1\.0" encoding="UTF-8"\?>\n<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/,
	)
	expect(entries(xml)).toEqual([
		{ loc: `${SITE}/`, changefreq: "daily", priority: "0.5" },
		{ loc: `${SITE}/about`, priority: "0.5" },
		{ loc: `${SITE}/extra?a=1&amp;b=2`, lastmod: "2026-01-02T23:30:00-05:00", changefreq: "yearly", priority: "0.1" },
		{ loc: `${SITE}/files`, priority: "0.5" },
		{ loc: `${SITE}/maybe`, priority: "0.5" },
		{ loc: `${SITE}/posts/a`, changefreq: "monthly", priority: "0.5" },
		{ loc: `${SITE}/posts/b`, changefreq: "monthly", priority: "0.5" },
	])
})

// A string keeps its other lines, drops its own Sitemap line, and appends the one on `site`.
it("robots string", async () => {
	expect(written(full, "robots.txt")).toBe(`User-agent: *\nDisallow: /account\nSitemap: ${SITE}/sitemap.xml\n`)
})

// `true` writes the one line; one changefreq for every entry; a priority record for the ids it names.
it("robots true and records", async () => {
	expect(written(robots, "robots.txt")).toBe(`Sitemap: ${SITE}/sitemap.xml\n`)
	expect(entries(written(robots, "sitemap.xml"))).toEqual([
		{ loc: `${SITE}/`, changefreq: "weekly" },
		{ loc: `${SITE}/about`, changefreq: "weekly", priority: "0.9" },
	])
})

// No options: every public page, no changefreq or priority, and no robots.txt.
it("sitemap defaults", async () => {
	expect(entries(written(plain, "sitemap.xml"))).toEqual([{ loc: `${SITE}/` }, { loc: `${SITE}/about` }])
	expect(written(plain, "robots.txt")).toBeUndefined()
})

// A page whose every param is optional is one entry bare and one per other configured tag; a literal-bracket folder is
// the URL it serves; an isr page is one entry per param set its `params` built; and an extra entry that repeats a
// listed URL is dropped, the first kept (BUGS.md 470).
it("sitemap clauses", async () => {
	expect(entries(written(clauses, "sitemap.xml"))).toEqual([
		{ loc: `${SITE}/%5Bflare%5D` },
		{ loc: `${SITE}/hr/search` },
		{ loc: `${SITE}/items/1` },
		{ loc: `${SITE}/items/2` },
		{ loc: `${SITE}/search` },
	])
})

// The plugin checks the options when it is created, and `sitemap()` when it is called.
it("sitemap options checked", () => {
	expect(() => flare({ prerender: { sitemap: { priority: 1.1 } } })).toThrow(/priority/)
	expect(() => sitemap({ priority: 1.1 })).toThrow(/priority/)
	expect(() => sitemap({ changefreq: "often" as never })).toThrow(/changefreq/)
	expect(() => sitemap({ additionalEntries: [{ loc: `${SITE}/x`, lastmod: "not a date" }] })).toThrow(/lastmod/)
	expect(typeof sitemap({})).toBe("function")
})

// What only the app's routes and `site` decide fails the build: a record key that is no route id, an extra entry off
// `site`.
it("sitemap build errors", async () => {
	const unknown = await viteBuild(
		apps.make({
			...TWO_PAGES,
			"vite.config.mjs": config('{ changefreq: { "_root_/nope": "daily" } }'),
			"src/server.ts": SERVER,
		}),
	)
	expect(unknown.status).not.toBe(0)
	expect(unknown.output).toContain("_root_/nope")
	const offSite = await viteBuild(
		apps.make({
			...TWO_PAGES,
			"vite.config.mjs": config('{ additionalEntries: [{ loc: "https://other.test/x" }] }'),
			"src/server.ts": SERVER,
		}),
	)
	expect(offSite.status).not.toBe(0)
	expect(offSite.output).toContain("https://other.test/x")
	// A page that re-exports its route from another module is past what the codegen scan reads: the hint says public,
	// the loaded page requires auth, and the build fails rather than list it (B25).
	const hidden = await viteBuild(
		apps.make({
			...TWO_PAGES,
			"src/routes/_root_/gated/gated.page.tsx": 'export { route } from "../../../gated.tsx";\n',
			"src/gated.tsx": page("_root_/gated", ".authenticate()"),
			"vite.config.mjs": config("{}"),
			"src/server.ts": SERVER,
		}),
	)
	expect(hidden.status).not.toBe(0)
	expect(hidden.output).toContain("_root_/gated: the codegen auth hint says public, the loaded modules say requires")
})

// `GET /<key>.txt` answers the key as text/plain; any other request reaches the app.
it("indexnow key file", async () => {
	const key = "flare-key-0123"
	const root = createRootLayout("_root_").render((props) => props.children)
	const home = createPage("_root_/").render(() => "home")
	const router = createRouter({ layouts: { _root_: root }, routeTree: [{ id: "_root_/", path: "/", module: home }] })
	const server = createServer({ router, middleware: [indexNow.file(key)] })
	const file = await server.fetch(new Request(`${SITE}/${key}.txt`))
	expect(file.status).toBe(200)
	expect(file.headers.get("content-type")).toMatch(/^text\/plain/)
	expect(await file.text()).toBe(key)
	expect((await server.fetch(new Request(`${SITE}/other.txt`))).status).toBe(404)
	expect(await (await server.fetch(new Request(`${SITE}/`))).text()).toContain("home")
	expect(() => indexNow.file("short")).toThrow(/8 to 128/)
})
