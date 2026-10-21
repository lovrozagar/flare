import { expect, it } from "vitest"
import type { PrerenderRoute, Prerenderer } from "../../../shared/protocol/prerender.ts"
import { runPrerender } from "../../../vite/prerender/run.ts"
import { sitemap, type SitemapInput, type SitemapOptions } from "./sitemap.ts"

const SITE = "https://example.com"

function route(id: string, path: string | undefined, auth: Partial<PrerenderRoute> = {}): PrerenderRoute {
	return { id, path, bare: [], response: false, auth: { requires: false, reads: false }, authorize: false, ...auth }
}

const open = route("_root_/about", "/about")
const locked = route("_root_/account", "/account", { auth: { requires: true, reads: true } })

// The runtime's own auth, which is what codegen would say unless a test says otherwise.
function truthful(routes: readonly PrerenderRoute[]): SitemapInput["hint"] {
	return (id) => {
		const found = routes.find((item) => item.id === id)
		if (found?.auth.requires) return "requires"
		return found?.auth.reads || found?.authorize ? "reads" : "public"
	}
}

function build(routes: PrerenderRoute[], options: SitemapOptions = {}, input: Partial<SitemapInput> = {}) {
	return sitemap(options)({ site: SITE, routes, rendered: [], hint: truthful(routes), ...input })
}

function locs(xml: string | undefined): string[] {
	return [...String(xml).matchAll(/<loc>([^<]*)<\/loc>/g)].map((match) => String(match[1]))
}

function xmlOf(result: ReturnType<typeof build>): string | undefined {
	return result.files.find((file) => file.name === "sitemap.xml")?.body
}

it("public only", () => {
	const result = build([open, locked])
	expect(result.errors).toEqual([])
	expect(locs(xmlOf(result))).toEqual(["https://example.com/about"])
})

it("optional included", () => {
	const optional = route("_root_/feed", "/feed", { auth: { requires: false, reads: true } })
	expect(locs(xmlOf(build([optional])))).toEqual(["https://example.com/feed"])
})

// `authorize` anywhere on the chain gates who may see the page, so a crawler could get 403. `authorize` here is the
// chain's: a layout's counts.
it("authorize omitted", () => {
	const gated = route("_root_/team/page", "/team/page", { auth: { requires: false, reads: true }, authorize: true })
	const optional = route("_root_/feed", "/feed", { auth: { requires: false, reads: true } })
	const result = build([gated, optional])
	expect(locs(xmlOf(result))).toEqual(["https://example.com/feed"])
	expect(result.errors).toEqual([])
})

it("param listed", () => {
	const blog = route("_root_/blog/[slug]", undefined)
	const docs = route("_root_/docs/[id]", undefined)
	const user = route("_root_/u/[id]", undefined)
	const result = build(
		[blog, docs, user],
		{ additionalEntries: [{ loc: "https://example.com/blog/a" }] },
		{
			rendered: [
				{ id: "_root_/blog/[slug]", path: "/blog/a" },
				{ id: "_root_/blog/[slug]", path: "/blog/b" },
				{ id: "_root_/docs/[id]", path: "/docs/1" },
			],
		},
	)
	expect(locs(xmlOf(result))).toEqual([
		"https://example.com/blog/a",
		"https://example.com/blog/b",
		"https://example.com/docs/1",
	])
})

it("response omitted", () => {
	const feed = route("_root_/rss", "/rss.xml", { response: true })
	expect(locs(xmlOf(build([feed, open])))).toEqual(["https://example.com/about"])
})

it("hint checked", () => {
	const result = build([open, locked], {}, { hint: () => "public" })
	expect(locs(xmlOf(result))).toEqual(["https://example.com/about"])
	expect(result.errors).toEqual([
		"_root_/account: the codegen auth hint says public, the loaded modules say requires (B25)",
	])
	// A route codegen does not know has no hint to disagree with.
	expect(build([locked, open], {}, { hint: () => undefined }).errors).toEqual([])
})

it("site", () => {
	const home = route("_root_", "/")
	const xml = xmlOf(build([home, open], {}, { site: "https://shop.example.org" }))
	expect(locs(xml)).toEqual(["https://shop.example.org/", "https://shop.example.org/about"])
})

// Through the prerender run: the files land only after every page rendered, and an error writes nothing.
function prerenderer(routes: PrerenderRoute[]): Prerenderer {
	return {
		site: SITE,
		pages: async () => [],
		routes: async () => routes,
		params: async () => [{}],
		render: async () => ({ status: 500, path: "/" }),
	}
}

async function runWith(pre: Prerenderer, options: SitemapOptions, hint: SitemapInput["hint"] = () => undefined) {
	const files: Array<[string, string]> = []
	const result = await runPrerender({
		prerenderer: pre,
		config: { sitemap: options },
		hint,
		write: async () => undefined,
		writeFile: async (name, body) => void files.push([name, body]),
	})
	return { ...result, files }
}

it("file", async () => {
	const done = await runWith(prerenderer([open]), {})
	expect(done.code).toBe(0)
	expect(done.files.map(([name]) => name)).toEqual(["sitemap.xml"])
	expect(done.files[0]?.[1]).toBe(
		'<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n<url><loc>https://example.com/about</loc></url>\n</urlset>\n',
	)
	expect(done.files[0]?.[1]).not.toContain("sitemapindex")
	const withRobots = await runWith(prerenderer([open]), { robotsTxt: true })
	expect(withRobots.files.map(([name]) => name)).toEqual(["sitemap.xml", "robots.txt"])
	// No `site`, and a hint error, fail the build with nothing written.
	const noSite = await runWith({ ...prerenderer([open]), site: undefined }, {})
	expect(noSite).toMatchObject({
		code: 1,
		stderr: ["[flare:prerender] prerender.sitemap reads createServer({ site })"],
	})
	expect(noSite.files).toEqual([])
	const mismatch = await runWith(prerenderer([open, locked]), {}, () => "public")
	expect(mismatch.code).toBe(1)
	expect(mismatch.stderr.join("\n")).toContain("_root_/account: the codegen auth hint says public")
	expect(mismatch.files).toEqual([])
})

it("escape", () => {
	const odd = route("_root_/odd", `/a&b<c>d"e'f`)
	expect(xmlOf(build([odd]))).toContain("<loc>https://example.com/a&amp;b&lt;c&gt;d&quot;e&apos;f</loc>")
})

it("extra loc", () => {
	const extra = build([], {
		additionalEntries: [{ loc: "https://example.com/x", changefreq: "daily", priority: 0.4 }],
	})
	expect(xmlOf(extra)).toContain(
		"<url><loc>https://example.com/x</loc><changefreq>daily</changefreq><priority>0.4</priority></url>",
	)
	// Another origin is known only once the build has `site`; a loc that is not absolute https fails sooner.
	expect(() => build([], { additionalEntries: [{ loc: "https://other.com/x" }] })).toThrow(
		`sitemap additionalEntries loc https://other.com/x is not https on ${SITE}`,
	)
})

it("changefreq", () => {
	expect(xmlOf(build([open], { changefreq: "weekly" }))).toContain("<changefreq>weekly</changefreq>")
	const docs = route("_root_/docs", "/docs")
	const xml = xmlOf(build([open, docs], { changefreq: { "_root_/docs": "monthly" } }))
	expect(xml).toContain("<url><loc>https://example.com/about</loc></url>")
	expect(xml).toContain("<url><loc>https://example.com/docs</loc><changefreq>monthly</changefreq></url>")
	expect(() => build([open], { changefreq: { "_root_/nope": "daily" } })).toThrow(
		"sitemap changefreq names _root_/nope, which is not a route id",
	)
	// @ts-expect-error a value outside the protocol's list
	expect(() => sitemap({ changefreq: "sometimes" })).toThrow('sitemap changefreq "sometimes" is not one of always')
})

it("priority", () => {
	expect(() => sitemap({ priority: 1.1 })).toThrow("sitemap priority 1.1 is not a number from 0 to 1")
	expect(() => sitemap({ priority: { "_root_/about": -0.1 } })).toThrow(
		"sitemap priority -0.1 is not a number from 0 to 1",
	)
	expect(() => sitemap({ additionalEntries: [{ loc: `${SITE}/x`, priority: Number.NaN }] })).toThrow(
		"sitemap priority NaN is not a number from 0 to 1",
	)
	expect(xmlOf(build([open], { priority: 0.8 }))).toContain("<priority>0.8</priority>")
	expect(xmlOf(build([open], { priority: { "_root_/about": 1 } }))).toContain("<priority>1</priority>")
	expect(() => build([open], { priority: { "_root_/nope": 0.5 } })).toThrow(
		"sitemap priority names _root_/nope, which is not a route id",
	)
})

it("exclude", () => {
	const docs = route("_root_/docs", "/docs")
	expect(locs(xmlOf(build([open, docs], { exclude: ["_root_/about"] })))).toEqual(["https://example.com/docs"])
})

function robotsOf(robotsTxt: SitemapOptions["robotsTxt"]): string | undefined {
	return build([open], robotsTxt === undefined ? {} : { robotsTxt }).files.find((file) => file.name === "robots.txt")
		?.body
}

it("robots host", () => {
	const given = [
		"User-agent: *",
		"Disallow: /admin",
		"Host: other.example.net",
		"Sitemap: https://other.example.net/sitemap.xml",
		"sitemap:https://other.example.net/b.xml",
		"",
		"",
	].join("\r\n")
	expect(robotsOf(given)).toBe(
		"User-agent: *\nDisallow: /admin\nHost: other.example.net\nSitemap: https://example.com/sitemap.xml\n",
	)
})

it("robots true", () => {
	expect(robotsOf(true)).toBe("Sitemap: https://example.com/sitemap.xml\n")
	expect(robotsOf("Sitemap: https://other.example.net/s.xml\n")).toBe("Sitemap: https://example.com/sitemap.xml\n")
	expect(robotsOf(false)).toBeUndefined()
	expect(robotsOf(undefined)).toBeUndefined()
})

it("lastmod", () => {
	const xml = xmlOf(build([], { additionalEntries: [{ loc: `${SITE}/x`, lastmod: "2026-10-13T23:30:00-02:00" }] }))
	expect(xml).toContain("<lastmod>2026-10-13T23:30:00-02:00</lastmod>")
	for (const lastmod of ["yesterday", "13/10/2026"]) {
		expect(() => sitemap({ additionalEntries: [{ loc: `${SITE}/x`, lastmod }] })).toThrow(
			`sitemap lastmod "${lastmod}" of ${SITE}/x is not a W3C datetime`,
		)
	}
})

// An absent optional param counts as resolved: a page whose dynamic segments are all optional is listed at its bare
// URL and once per other configured locale. A required param stays prerender-only, and a rendered path is listed once
// (B101, dx/seo.md, BUGS.md B10).
it("optional absent", () => {
	const search = route("[[locale]]/_root_/search", undefined, { bare: ["/search", "/hr/search", "/ar/search"] })
	const doc = route("[[locale]]/_root_/docs/[slug]", undefined)
	const home = route("[[locale]]/_root_/", undefined, { bare: ["/", "/hr", "/ar"] })
	const rendered = ["/", "/hr", "/ar"].map((path) => ({ id: home.id, path }))
	const result = build([search, doc, home], {}, { rendered })
	expect(result.errors).toEqual([])
	expect(locs(xmlOf(result))).toEqual([
		"https://example.com/search",
		"https://example.com/hr/search",
		"https://example.com/ar/search",
		"https://example.com/",
		"https://example.com/hr",
		"https://example.com/ar",
	])
})

// A `site` with trailing slashes names the same origin: no URL and no robots line gets `//` (BUGS.md 465).
it("site slash", () => {
	for (const site of [`${SITE}/`, `${SITE}//`]) {
		const result = build([open], { robotsTxt: true }, { site })
		expect(locs(xmlOf(result))).toEqual(["https://example.com/about"])
		expect(result.files.find((file) => file.name === "robots.txt")?.body).toBe(
			"Sitemap: https://example.com/sitemap.xml\n",
		)
	}
})

// `[` and `]` are not URL code points (RFC 3986): a literal-bracket folder's URL and an extra entry's path are written
// percent-encoded, so the two forms of one URL are one entry; a bracketed IPv6 host is left as it is (BUGS.md 465).
it("brackets encoded", () => {
	const flare = route("_root_/[_]flare]", "/[flare]")
	const extra = [{ loc: `${SITE}/[flare]` }, { loc: `${SITE}/a[1]?q=[x]#[y]` }, { loc: SITE }]
	const result = build([flare], { additionalEntries: extra })
	expect(locs(xmlOf(result))).toEqual([`${SITE}/%5Bflare%5D`, `${SITE}/a%5B1%5D?q=[x]#[y]`, SITE])
	const v6 = sitemap({ additionalEntries: [{ loc: "https://[::1]/[a]" }] })({
		site: "https://[::1]",
		routes: [],
		rendered: [],
		hint: () => undefined,
	})
	expect(locs(v6.files.find((file) => file.name === "sitemap.xml")?.body)).toEqual(["https://[::1]/%5Ba%5D"])
})

// A lastmod is a W3C Datetime, checked by its own grammar rather than an engine's Date.parse: a date, or a date and
// `hh:mm` with optional `:ss` and fraction, then `Z` or `±hh:mm`. A time needs its offset, an impossible date throws
// rather than rolling over, every error names the entry's loc, and a valid value is written as given, its offset and
// so its author's day kept (BUGS.md 466, 467).
const entry = (lastmod: string): SitemapOptions => ({ additionalEntries: [{ loc: `${SITE}/x`, lastmod }] })

it("lastmod checked", () => {
	expect(() => sitemap(entry("2026-01-02T00:30:00"))).toThrow(
		`sitemap lastmod "2026-01-02T00:30:00" of ${SITE}/x has a time but no offset`,
	)
	for (const day of ["2026-02-30", "2026-02-29", "2026-13-01", "2026-04-31T10:00:00Z"]) {
		expect(() => sitemap(entry(day))).toThrow(
			`sitemap lastmod ${JSON.stringify(day)} of ${SITE}/x is not a calendar date`,
		)
	}
	for (const time of [
		"2026-01-02T25:00:00Z",
		"2026-01-02T1:2Z",
		"2026-01-02T10:60Z",
		"2026-01-02T10:00:60Z",
		"2026-01-02T10Z",
		"2026-01-02T10:00:00.Z",
		"2026-01-02T10:00+24:00",
		"2026-01-02T10:00+05",
	]) {
		expect(() => sitemap(entry(time))).toThrow(
			`sitemap lastmod ${JSON.stringify(time)} of ${SITE}/x is not a W3C datetime`,
		)
	}
	for (const kept of [
		"2026-01-02T00:30:00+14:00",
		"2026-01-02T10:00Z",
		"2026-01-02T10:00:00.123-03:30",
		"2028-02-29",
	]) {
		expect(xmlOf(build([], entry(kept)))).toContain(`<lastmod>${kept}</lastmod>`)
	}
})

// A priority is written as a decimal the sitemap schema reads, never in exponent form (BUGS.md 468).
it("priority decimal", () => {
	expect(xmlOf(build([open], { priority: 1e-7 }))).toContain("<priority>0</priority>")
	expect(xmlOf(build([open], { priority: 0.85 }))).toContain("<priority>0.85</priority>")
})

// An extra entry's loc and robotsTxt are checked when the plugin is made, not after every page rendered (BUGS.md 469).
it("options checked early", () => {
	for (const loc of ["http://example.com/x", "/x"]) {
		expect(() => sitemap({ additionalEntries: [{ loc }] })).toThrow(
			`sitemap additionalEntries loc ${loc} is not an absolute https URL`,
		)
	}
	expect(() => sitemap({ robotsTxt: 1 as unknown as string })).toThrow(
		"sitemap robotsTxt is true, false, or the file's text",
	)
})
