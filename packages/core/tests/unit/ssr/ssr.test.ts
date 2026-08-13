import { describe, expect, it } from "vitest"
import { NotFoundError, UnauthenticatedError, UnauthorizedError } from "../../../src/errors/index.ts"
import type { FlareState } from "../../../src/ssr/index.tsx"
import {
	buildFlareStateScript,
	deriveStatus,
	mergeHeadConfigs,
	mergeResponseHeaders,
	renderHeadToHtml,
	serializeFlareState,
} from "../../../src/ssr/index.tsx"

function makeState(overrides?: Partial<FlareState>): FlareState {
	return {
		c: {},
		m: [],
		p: "/",
		r: {},
		s: {},
		...overrides,
	}
}

describe("serializeFlareState", () => {
	it("serializes to JSON string", () => {
		const state = makeState({ p: "/about" })
		const result = serializeFlareState(state)
		const parsed = JSON.parse(result) as unknown
		expect(parsed).toEqual(state)
	})

	it("escapes </script> via \\u003c", () => {
		const state = makeState({
			m: [
				{
					d: "</script><script>alert(1)</script>",
					h: undefined,
					i: "m1",
					p: undefined,
					v: "_root_",
				},
			],
		})
		const result = serializeFlareState(state)
		expect(result).not.toContain("</script>")
		expect(result).not.toContain("<")
		expect(result).toContain("\\u003c")
	})

	it("escapes all < chars including <!-- and </style>", () => {
		const state = makeState({
			m: [
				{ d: "<!-- comment --> </style> <img>", h: undefined, i: "m1", p: undefined, v: "_root_" },
			],
		})
		const result = serializeFlareState(state)
		expect(result).not.toContain("<")
		expect(result).toContain("\\u003c")
		/* Still parseable as JSON after unescaping */
		const parsed = JSON.parse(result) as FlareState
		expect(parsed.m[0]?.d as string).toContain("<!-- comment -->")
	})

	it("preserves deferred markers: { __deferred: true, key }", () => {
		const state = makeState({
			m: [
				{
					d: { __deferred: true, key: "d0", promise: Promise.resolve("data") },
					h: undefined,
					i: "m1",
					p: undefined,
					v: "_root_",
				},
			],
		})
		const result = serializeFlareState(state)
		const parsed = JSON.parse(result) as Record<string, unknown>
		const matches = parsed.m as Array<Record<string, unknown>>
		const loaderData = matches[0]?.d as Record<string, unknown>
		expect(loaderData.__deferred).toBe(true)
		expect(loaderData.key).toBe("d0")
	})

	it("strips promise field from deferred values", () => {
		const state = makeState({
			m: [
				{
					d: { __deferred: true, key: "d0", promise: Promise.resolve("data") },
					h: undefined,
					i: "m1",
					p: undefined,
					v: "_root_",
				},
			],
		})
		const result = serializeFlareState(state)
		const parsed = JSON.parse(result) as Record<string, unknown>
		const matches = parsed.m as Array<Record<string, unknown>>
		const loaderData = matches[0]?.d as Record<string, unknown>
		expect(loaderData.promise).toBeUndefined()
	})

	it("handles nested deferred: { a: { b: Deferred } }", () => {
		const state = makeState({
			m: [
				{
					d: { a: { b: { __deferred: true, key: "nested", promise: Promise.resolve(42) } } },
					h: undefined,
					i: "m1",
					p: undefined,
					v: "_root_",
				},
			],
		})
		const result = serializeFlareState(state)
		const parsed = JSON.parse(result) as Record<string, unknown>
		const matches = parsed.m as Array<Record<string, unknown>>
		const d = matches[0]?.d as Record<string, Record<string, Record<string, unknown>>>
		expect(d.a.b.__deferred).toBe(true)
		expect(d.a.b.key).toBe("nested")
		expect(d.a.b.promise).toBeUndefined()
	})

	it("empty state → valid JSON", () => {
		const state = makeState()
		const result = serializeFlareState(state)
		expect(() => JSON.parse(result)).not.toThrow()
	})

	it("handles circular references in loader data → null", () => {
		const a: Record<string, unknown> = { name: "a" }
		const b: Record<string, unknown> = { name: "b", ref: a }
		a.ref = b

		const state = makeState({
			m: [{ d: a, h: undefined, i: "m1", p: undefined, v: "_root_" }],
		})
		const result = serializeFlareState(state)
		expect(() => JSON.parse(result)).not.toThrow()
		const parsed = JSON.parse(result) as Record<string, unknown>
		const matches = parsed.m as Array<Record<string, unknown>>
		const d = matches[0]?.d as Record<string, unknown>
		expect(d.name).toBe("a")
		const ref = d.ref as Record<string, unknown>
		expect(ref.name).toBe("b")
		/* circular back-ref → null */
		expect(ref.ref).toBeNull()
	})

	it("handles self-referencing object → null", () => {
		const obj: Record<string, unknown> = { x: 1 }
		obj.self = obj

		const state = makeState({
			m: [{ d: obj, h: undefined, i: "m1", p: undefined, v: "_root_" }],
		})
		const result = serializeFlareState(state)
		expect(() => JSON.parse(result)).not.toThrow()
		const parsed = JSON.parse(result) as Record<string, unknown>
		const matches = parsed.m as Array<Record<string, unknown>>
		const d = matches[0]?.d as Record<string, unknown>
		expect(d.x).toBe(1)
		expect(d.self).toBeNull()
	})

	it("allows shared references (diamond) without nulling", () => {
		const shared = { value: 42 }
		const data = { a: shared, b: shared }

		const state = makeState({
			m: [{ d: data, h: undefined, i: "m1", p: undefined, v: "_root_" }],
		})
		const result = serializeFlareState(state)
		const parsed = JSON.parse(result) as Record<string, unknown>
		const matches = parsed.m as Array<Record<string, unknown>>
		const d = matches[0]?.d as Record<string, Record<string, unknown>>
		/* Both references should be preserved (not nulled) */
		expect(d.a.value).toBe(42)
		expect(d.b.value).toBe(42)
	})

	it("circular in array → null", () => {
		const arr: unknown[] = [1, 2]
		arr.push(arr)

		const state = makeState({
			m: [{ d: arr, h: undefined, i: "m1", p: undefined, v: "_root_" }],
		})
		const result = serializeFlareState(state)
		expect(() => JSON.parse(result)).not.toThrow()
		const parsed = JSON.parse(result) as Record<string, unknown>
		const matches = parsed.m as Array<Record<string, unknown>>
		const d = matches[0]?.d as unknown[]
		expect(d[0]).toBe(1)
		expect(d[1]).toBe(2)
		expect(d[2]).toBeNull()
	})
})

describe("buildFlareStateScript", () => {
	it("returns <script> with nonce attribute", () => {
		const state = makeState()
		const result = buildFlareStateScript(state, "abc123")
		expect(result).toContain('nonce="abc123"')
		expect(result).toMatch(/^<script /)
		expect(result).toMatch(/<\/script>$/)
	})

	it("contains self.flare = ...", () => {
		const state = makeState({ p: "/test" })
		const result = buildFlareStateScript(state, "n1")
		expect(result).toContain("self.flare=")
	})

	it("state is serialized inside script", () => {
		const state = makeState({ p: "/hello" })
		const result = buildFlareStateScript(state, "n1")
		expect(result).toContain('"/hello"')
	})

	it("includes data-flare-state marker attribute", () => {
		const state = makeState()
		const result = buildFlareStateScript(state, "n1")
		expect(result).toContain("data-flare-state")
	})
})

describe("mergeHeadConfigs", () => {
	it("undefined + child → child", () => {
		const child = { title: "Page" }
		expect(mergeHeadConfigs(undefined, child)).toEqual(child)
	})

	it("parent + undefined → parent", () => {
		const parent = { title: "App" }
		expect(mergeHeadConfigs(parent, undefined)).toEqual(parent)
	})

	it("undefined + undefined → {}", () => {
		expect(mergeHeadConfigs(undefined, undefined)).toEqual({})
	})

	it("scalar override: title", () => {
		expect(mergeHeadConfigs({ title: "App" }, { title: "Page" })).toEqual({ title: "Page" })
	})

	it("object merge: meta keys", () => {
		const parent = { meta: { author: "Alice" } }
		const child = { meta: { viewport: "width=device-width" } }
		const result = mergeHeadConfigs(parent, child)
		expect(result.meta).toEqual({ author: "Alice", viewport: "width=device-width" })
	})

	it("object override: same meta key → child wins", () => {
		const parent = { meta: { author: "Alice" } }
		const child = { meta: { author: "Bob" } }
		expect(mergeHeadConfigs(parent, child)?.meta).toEqual({ author: "Bob" })
	})

	it("array concat: images", () => {
		const a = { url: "/a.png" }
		const b = { url: "/b.png" }
		const result = mergeHeadConfigs({ images: [a] }, { images: [b] })
		expect(result.images).toEqual([a, b])
	})

	it("jsonLd concat", () => {
		const result = mergeHeadConfigs(
			{ jsonLd: [{ "@type": "WebSite" }] },
			{ jsonLd: [{ "@type": "Article" }] },
		)
		expect(result.jsonLd).toEqual([{ "@type": "WebSite" }, { "@type": "Article" }])
	})

	it("custom concat: links", () => {
		const l1 = { href: "/a.css", rel: "stylesheet" }
		const l2 = { href: "/b.css", rel: "stylesheet" }
		const result = mergeHeadConfigs({ custom: { links: [l1] } }, { custom: { links: [l2] } })
		expect(result.custom?.links).toEqual([l1, l2])
	})

	it("robots merge: per-key", () => {
		const result = mergeHeadConfigs({ robots: { index: true } }, { robots: { follow: false } })
		expect(result.robots).toEqual({ follow: false, index: true })
	})

	it("partial child: preserves parent fields", () => {
		const result = mergeHeadConfigs({ description: "B", title: "A" }, { title: "C" })
		expect(result).toEqual({ description: "B", title: "C" })
	})
})

describe("mergeResponseHeaders", () => {
	it("undefined + child → child", () => {
		expect(mergeResponseHeaders(undefined, { "X-A": "1" })).toEqual({ "X-A": "1" })
	})

	it("parent + undefined → parent", () => {
		expect(mergeResponseHeaders({ "X-A": "1" }, undefined)).toEqual({ "X-A": "1" })
	})

	it("same key → child overrides", () => {
		expect(mergeResponseHeaders({ "X-A": "1" }, { "X-A": "2" })).toEqual({ "X-A": "2" })
	})

	it("different keys → both kept", () => {
		expect(mergeResponseHeaders({ "X-A": "1" }, { "X-B": "2" })).toEqual({ "X-A": "1", "X-B": "2" })
	})

	it("case-sensitive: Content-Type and content-type are different keys", () => {
		const result = mergeResponseHeaders(
			{ "Content-Type": "text/html" },
			{ "content-type": "text/plain" },
		)
		expect(result["Content-Type"]).toBe("text/html")
		expect(result["content-type"]).toBe("text/plain")
	})
})

describe("renderHeadToHtml", () => {
	it("title → <title>text</title>", () => {
		expect(renderHeadToHtml({ title: "Hello" }, "n")).toContain("<title>Hello</title>")
	})

	it('description → <meta name="description">', () => {
		const html = renderHeadToHtml({ description: "A page" }, "n")
		expect(html).toContain('<meta name="description" content="A page">')
	})

	it("robots { index: true, follow: false } → index,nofollow", () => {
		const html = renderHeadToHtml({ robots: { follow: false, index: true } }, "n")
		expect(html).toContain("index")
		expect(html).toContain("nofollow")
	})

	it("robots { index: false } → noindex", () => {
		const html = renderHeadToHtml({ robots: { index: false } }, "n")
		expect(html).toContain("noindex")
	})

	it("robots { noarchive: true } → noarchive", () => {
		const html = renderHeadToHtml({ robots: { noarchive: true } }, "n")
		expect(html).toContain("noarchive")
	})

	it("robots { noimageindex: true } → noimageindex", () => {
		const html = renderHeadToHtml({ robots: { noimageindex: true } }, "n")
		expect(html).toContain("noimageindex")
	})

	it('robots { "max-snippet": 150 } → max-snippet:150', () => {
		const html = renderHeadToHtml({ robots: { "max-snippet": 150 } }, "n")
		expect(html).toContain("max-snippet:150")
	})

	it('robots { "max-image-preview": "large" } → max-image-preview:large', () => {
		const html = renderHeadToHtml({ robots: { "max-image-preview": "large" } }, "n")
		expect(html).toContain("max-image-preview:large")
	})

	it("meta.viewport: false → no viewport meta emitted", () => {
		const html = renderHeadToHtml({ meta: { viewport: false } }, "n")
		expect(html).not.toContain("viewport")
	})

	it("openGraph.title → og:title", () => {
		const html = renderHeadToHtml({ openGraph: { title: "OG Title" } }, "n")
		expect(html).toContain('<meta property="og:title" content="OG Title">')
	})

	it("twitter.card → twitter:card", () => {
		const html = renderHeadToHtml({ twitter: { card: "summary" } }, "n")
		expect(html).toContain('<meta name="twitter:card" content="summary">')
	})

	it('jsonLd single → <script type="application/ld+json">', () => {
		const html = renderHeadToHtml({ jsonLd: [{ "@type": "WebSite" }] }, "abc")
		expect(html).toContain('<script type="application/ld+json" nonce="abc">')
		expect(html).toContain('"@type":"WebSite"')
	})

	it("jsonLd array → multiple <script> tags", () => {
		const html = renderHeadToHtml({ jsonLd: [{ "@type": "A" }, { "@type": "B" }] }, "n")
		const matches = html.match(/<script type="application\/ld\+json"/g)
		expect(matches).toHaveLength(2)
	})

	it('favicons.svg → <link rel="icon" type="image/svg+xml">', () => {
		const html = renderHeadToHtml({ favicons: { svg: "/icon.svg" } }, "n")
		expect(html).toContain('<link rel="icon" type="image/svg+xml" href="/icon.svg">')
	})

	it('favicons.ico → <link rel="icon" sizes="any">', () => {
		const html = renderHeadToHtml({ favicons: { ico: "/favicon.ico" } }, "n")
		expect(html).toContain('<link rel="icon" href="/favicon.ico" sizes="any">')
	})

	it('languages → <link rel="alternate" hreflang>', () => {
		const html = renderHeadToHtml({ languages: { en: "/en", fr: "/fr" } }, "n")
		expect(html).toContain('<link rel="alternate" hreflang="en" href="/en">')
		expect(html).toContain('<link rel="alternate" hreflang="fr" href="/fr">')
	})

	it('css string → <link rel="stylesheet">', () => {
		const html = renderHeadToHtml({ css: "/styles.css" }, "n")
		expect(html).toContain('<link rel="stylesheet" href="/styles.css">')
	})

	it("css array → multiple stylesheet links", () => {
		const html = renderHeadToHtml({ css: ["/a.css", "/b.css"] }, "n")
		expect(html).toContain('<link rel="stylesheet" href="/a.css">')
		expect(html).toContain('<link rel="stylesheet" href="/b.css">')
	})

	it("custom.links → <link> with all attributes", () => {
		const html = renderHeadToHtml(
			{ custom: { links: [{ href: "/feed.xml", rel: "alternate", type: "application/rss+xml" }] } },
			"n",
		)
		expect(html).toContain('rel="alternate"')
		expect(html).toContain('href="/feed.xml"')
		expect(html).toContain('type="application/rss+xml"')
		expect(html).toMatch(/^<link /)
	})

	it("custom.scripts → <script nonce> with attributes and children", () => {
		const html = renderHeadToHtml(
			{ custom: { scripts: [{ children: "console.log(1)", type: "module" }] } },
			"abc",
		)
		expect(html).toContain('nonce="abc"')
		expect(html).toContain('type="module"')
		expect(html).toContain("console.log(1)")
	})

	it("custom.styles → <style nonce>children</style>", () => {
		const html = renderHeadToHtml({ custom: { styles: [{ children: "body{margin:0}" }] } }, "abc")
		expect(html).toContain('<style nonce="abc">body{margin:0}</style>')
	})

	it("empty head → empty string", () => {
		expect(renderHeadToHtml({}, "n")).toBe("")
	})

	it("all tags properly escaped (no XSS via attribute injection)", () => {
		const html = renderHeadToHtml({ title: '<script>alert("xss")</script>' }, "n")
		expect(html).not.toContain("<script>alert")
		expect(html).toContain("&lt;script&gt;")
	})

	it('canonical → <link rel="canonical">', () => {
		const html = renderHeadToHtml({ canonical: "https://example.com/page" }, "n")
		expect(html).toContain('<link rel="canonical" href="https://example.com/page">')
	})

	it('keywords → <meta name="keywords">', () => {
		const html = renderHeadToHtml({ keywords: "a,b,c" }, "n")
		expect(html).toContain('<meta name="keywords" content="a,b,c">')
	})

	it('favicons.appleTouchIcon → <link rel="apple-touch-icon">', () => {
		const html = renderHeadToHtml({ favicons: { appleTouchIcon: "/apple.png" } }, "n")
		expect(html).toContain('<link rel="apple-touch-icon" href="/apple.png">')
	})

	it('favicons sized → <link rel="icon" type="image/png" sizes>', () => {
		const html = renderHeadToHtml({ favicons: { "96x96": "/96.png" } }, "n")
		expect(html).toContain('<link rel="icon" type="image/png" sizes="96x96" href="/96.png">')
	})

	it('images → <meta property="og:image">', () => {
		const html = renderHeadToHtml({ images: [{ url: "/img.png" }] }, "n")
		expect(html).toContain('<meta property="og:image" content="/img.png">')
	})

	it("openGraph full → og: meta tags", () => {
		const html = renderHeadToHtml(
			{
				openGraph: {
					description: "desc",
					locale: "en_US",
					siteName: "MySite",
					title: "OG",
					type: "website",
					url: "https://example.com",
				},
			},
			"n",
		)
		expect(html).toContain('<meta property="og:description" content="desc">')
		expect(html).toContain('<meta property="og:type" content="website">')
		expect(html).toContain('<meta property="og:url" content="https://example.com">')
		expect(html).toContain('<meta property="og:site_name" content="MySite">')
		expect(html).toContain('<meta property="og:locale" content="en_US">')
	})

	it("twitter full → twitter: meta tags", () => {
		const html = renderHeadToHtml(
			{
				twitter: {
					card: "summary_large_image",
					creator: "@author",
					description: "desc",
					site: "@site",
					title: "Title",
				},
			},
			"n",
		)
		expect(html).toContain('<meta name="twitter:card" content="summary_large_image">')
		expect(html).toContain('<meta name="twitter:site" content="@site">')
		expect(html).toContain('<meta name="twitter:creator" content="@author">')
		expect(html).toContain('<meta name="twitter:title" content="Title">')
		expect(html).toContain('<meta name="twitter:description" content="desc">')
	})

	it("meta generic entries → <meta name=... content=...>", () => {
		const html = renderHeadToHtml({ meta: { author: "Alice", charset: "utf-8" } }, "n")
		expect(html).toContain('<meta charset="utf-8">')
		expect(html).toContain('<meta name="author" content="Alice">')
	})

	it('meta.manifest → <link rel="manifest">', () => {
		const html = renderHeadToHtml({ meta: { manifest: "/manifest.json" } }, "n")
		expect(html).toContain('<link rel="manifest" href="/manifest.json">')
	})

	it("meta.appleMobileWebAppCapable → correct meta tag", () => {
		const html = renderHeadToHtml({ meta: { appleMobileWebAppCapable: "yes" } }, "n")
		expect(html).toContain('<meta name="apple-mobile-web-app-capable" content="yes">')
	})
})

describe("deriveStatus", () => {
	it("all success → 200", () => {
		expect(deriveStatus([])).toBe(200)
		expect(deriveStatus([{ error: undefined }])).toBe(200)
	})

	it("NotFoundError → 404", () => {
		expect(deriveStatus([{ error: new NotFoundError() }])).toBe(404)
	})

	it("UnauthenticatedError → 401", () => {
		expect(deriveStatus([{ error: new UnauthenticatedError() }])).toBe(401)
	})

	it("UnauthorizedError → 403", () => {
		expect(deriveStatus([{ error: new UnauthorizedError() }])).toBe(403)
	})

	it("mixed errors → highest priority wins (401 > 403 > 404 > 500)", () => {
		expect(deriveStatus([{ error: new NotFoundError() }, { error: new UnauthorizedError() }])).toBe(
			403,
		)
	})

	it("generic error → 500", () => {
		expect(deriveStatus([{ error: new Error("boom") }])).toBe(500)
	})

	it("401 beats all other errors", () => {
		expect(
			deriveStatus([
				{ error: new NotFoundError() },
				{ error: new UnauthorizedError() },
				{ error: new UnauthenticatedError() },
				{ error: new Error("generic") },
			]),
		).toBe(401)
	})
})
