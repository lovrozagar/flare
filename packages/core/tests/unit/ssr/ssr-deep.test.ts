/** @vitest-environment node */
import { describe, expect, it } from "vitest"
import { createDeferContext } from "../../../src/defer/index.ts"
import { NotFoundError, UnauthenticatedError, UnauthorizedError } from "../../../src/errors/index.ts"
import type { PipelineMatch, ResolvedRoute } from "../../../src/loader-pipeline/index.ts"
import type { FlareState } from "../../../src/ssr/index.tsx"
import {
	deriveStatus,
	mergeHeadConfigs,
	mergeResponseHeaders,
	serializeFlareState,
} from "../../../src/ssr/index.tsx"
import { renderHeadToHtml } from "../../../src/ssr/head.ts"

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

function makeRoute(overrides?: Partial<ResolvedRoute>): ResolvedRoute {
	return { _type: "render", variablePath: "/", virtualPath: "_root_/page", ...overrides }
}

function _makeMatch(overrides?: Partial<PipelineMatch>): PipelineMatch {
	return {
		deferContext: createDeferContext("test"),
		loaderData: null,
		matchId: "test:{}",
		preloaderContext: {},
		route: makeRoute(),
		status: "success",
		...overrides,
	}
}

/* ── serializeFlareState edge cases ──────────────────────────────── */

describe("serializeFlareState edge cases", () => {
	it("deeply nested deferred (3 levels) strips promise", () => {
		const state = makeState({
			m: [
				{
					d: {
						a: {
							b: {
								__deferred: true,
								key: "deep-k",
								promise: Promise.resolve("should-be-gone"),
							},
						},
					},
					i: "m1",
					v: "_root_/page",
				},
			],
		})
		const result = serializeFlareState(state)
		const parsed = JSON.parse(result) as Record<string, unknown>
		const matches = parsed.m as Array<Record<string, unknown>>
		const d = matches[0]?.d as Record<string, Record<string, Record<string, unknown>>>
		expect(d.a.b.__deferred).toBe(true)
		expect(d.a.b.key).toBe("deep-k")
		expect(d.a.b.promise).toBeUndefined()
	})

	it("array with deferred markers strips promises correctly", () => {
		const state = makeState({
			m: [
				{
					d: [
						{ __deferred: true, key: "arr0", promise: Promise.resolve("a") },
						"plain-value",
						{ __deferred: true, key: "arr1", promise: Promise.resolve("b") },
					],
					i: "m1",
					v: "_root_/page",
				},
			],
		})
		const result = serializeFlareState(state)
		const parsed = JSON.parse(result) as Record<string, unknown>
		const matches = parsed.m as Array<Record<string, unknown>>
		const d = matches[0]?.d as Array<unknown>
		expect(d).toHaveLength(3)

		const first = d[0] as Record<string, unknown>
		expect(first.__deferred).toBe(true)
		expect(first.key).toBe("arr0")
		expect(first.promise).toBeUndefined()

		expect(d[1]).toBe("plain-value")

		const third = d[2] as Record<string, unknown>
		expect(third.__deferred).toBe(true)
		expect(third.key).toBe("arr1")
		expect(third.promise).toBeUndefined()
	})

	it("multiple </script> occurrences all escaped via \\u003c", () => {
		const state = makeState({
			m: [
				{
					d: "</script>first</script>second</SCRIPT>case-insensitive",
					i: "m1",
					v: "_root_/page",
				},
			],
		})
		const result = serializeFlareState(state)
		expect(result).not.toMatch(/<\/script>/i)
		expect(result).not.toContain("<")
		/* all < chars escaped to \u003c */
		const escaped = result.match(/\\u003c/gi)
		expect(escaped).not.toBeNull()
		expect(escaped?.length).toBeGreaterThanOrEqual(3)
	})

	it("null and undefined values preserved through serialization", () => {
		const state = makeState({
			m: [
				{
					d: { explicit_null: null, nested: { also_null: null } },
					i: "m1",
					v: "_root_/page",
				},
			],
		})
		const result = serializeFlareState(state)
		const parsed = JSON.parse(result) as Record<string, unknown>
		const matches = parsed.m as Array<Record<string, unknown>>
		const d = matches[0]?.d as Record<string, unknown>
		expect(d.explicit_null).toBeNull()
		const nested = d.nested as Record<string, unknown>
		expect(nested.also_null).toBeNull()
		/* undefined values are dropped by JSON.stringify (standard behavior) */
		expect(Object.keys(d)).not.toContain("undef_val")
	})
})

/* ── mergeHeadConfigs deep ───────────────────────────────────────── */

describe("mergeHeadConfigs deep", () => {
	it("images array concatenation: parent 1 + child 2 = 3", () => {
		const parent = { images: [{ url: "/p.png" }] }
		const child = { images: [{ url: "/c1.png" }, { url: "/c2.png" }] }
		const result = mergeHeadConfigs(parent, child)
		expect(result.images).toHaveLength(3)
		expect(result.images).toEqual([{ url: "/p.png" }, { url: "/c1.png" }, { url: "/c2.png" }])
	})

	it("jsonLd array concatenation preserves all entries", () => {
		const parent = {
			jsonLd: [
				{ "@context": "https://schema.org", "@type": "WebSite" },
				{ "@context": "https://schema.org", "@type": "Organization" },
			],
		}
		const child = {
			jsonLd: [{ "@context": "https://schema.org", "@type": "BreadcrumbList" }],
		}
		const result = mergeHeadConfigs(parent, child)
		expect(result.jsonLd).toHaveLength(3)
		expect(result.jsonLd?.[0]).toEqual({ "@context": "https://schema.org", "@type": "WebSite" })
		expect(result.jsonLd?.[2]).toEqual({
			"@context": "https://schema.org",
			"@type": "BreadcrumbList",
		})
	})

	it("custom field merging: links + scripts concatenated", () => {
		const parent = {
			custom: {
				links: [{ href: "/feed.xml", rel: "alternate" }],
				scripts: [{ src: "/analytics.js" }],
			},
		}
		const child = {
			custom: {
				links: [{ href: "/sitemap.xml", rel: "sitemap" }],
				scripts: [{ src: "/tracking.js" }],
				styles: [{ children: "body{color:red}" }],
			},
		}
		const result = mergeHeadConfigs(parent, child)
		expect(result.custom?.links).toHaveLength(2)
		expect(result.custom?.scripts).toHaveLength(2)
		expect(result.custom?.styles).toHaveLength(1)
	})

	it("robots merge: parent { index: true } + child { follow: false } merged per-key", () => {
		const result = mergeHeadConfigs({ robots: { index: true } }, { robots: { follow: false } })
		expect(result.robots).toEqual({ follow: false, index: true })
	})
})

/* ── mergeResponseHeaders ────────────────────────────────────────── */

describe("mergeResponseHeaders deep", () => {
	it("same key: child wins", () => {
		const result = mergeResponseHeaders(
			{ "Cache-Control": "no-cache", "X-Custom": "parent" },
			{ "X-Custom": "child" },
		)
		expect(result["X-Custom"]).toBe("child")
		expect(result["Cache-Control"]).toBe("no-cache")
	})

	it("different keys: both preserved", () => {
		const result = mergeResponseHeaders({ "X-Parent": "p" }, { "X-Child": "c" })
		expect(result).toEqual({ "X-Child": "c", "X-Parent": "p" })
	})

	it("undefined parent: child returned as-is", () => {
		const child = { "Content-Language": "en", "X-Request-Id": "abc" }
		const result = mergeResponseHeaders(undefined, child)
		expect(result).toEqual(child)
	})
})

/* ── deriveStatus priority ───────────────────────────────────────── */

describe("deriveStatus priority", () => {
	it("UnauthenticatedError always returns 401", () => {
		expect(deriveStatus([{ error: new UnauthenticatedError() }])).toBe(401)
	})

	it("UnauthorizedError + NotFoundError: 403 wins over 404", () => {
		expect(deriveStatus([{ error: new NotFoundError() }, { error: new UnauthorizedError() }])).toBe(
			403,
		)
	})

	it("NotFoundError alone returns 404", () => {
		expect(deriveStatus([{ error: new NotFoundError() }])).toBe(404)
	})

	it("generic Error returns 500", () => {
		expect(deriveStatus([{ error: new Error("kaboom") }])).toBe(500)
	})

	it("mixed: 1 success + 1 NotFoundError returns 404", () => {
		expect(deriveStatus([{ error: undefined }, { error: new NotFoundError() }])).toBe(404)
	})

	it("empty matches returns 200", () => {
		expect(deriveStatus([])).toBe(200)
	})
})

/* ── renderHeadToHtml edge cases ─────────────────────────────────── */

describe("renderHeadToHtml edge cases", () => {
	it("empty config returns empty string", () => {
		expect(renderHeadToHtml({}, "nonce")).toBe("")
	})

	it("full robots with all directives", () => {
		const html = renderHeadToHtml(
			{
				robots: {
					follow: true,
					index: false,
					"max-image-preview": "large",
					"max-snippet": 160,
					"max-video-preview": 30,
					noarchive: true,
					noimageindex: true,
				},
			},
			"n",
		)
		expect(html).toContain("noindex")
		expect(html).toContain("follow")
		expect(html).toContain("noarchive")
		expect(html).toContain("noimageindex")
		expect(html).toContain("max-snippet:160")
		expect(html).toContain("max-image-preview:large")
		expect(html).toContain("max-video-preview:30")
		/* all in a single robots meta tag */
		const robotsMatch = html.match(/<meta name="robots" content="([^"]+)">/)
		expect(robotsMatch).not.toBeNull()
		const directives = robotsMatch?.[1]?.split(",") ?? []
		expect(directives).toHaveLength(7)
	})

	it("languages produce hreflang link tags", () => {
		const html = renderHeadToHtml(
			{
				languages: { de: "/de", en: "/en", fr: "/fr" },
			},
			"n",
		)
		expect(html).toContain('<link rel="alternate" hreflang="en" href="/en">')
		expect(html).toContain('<link rel="alternate" hreflang="fr" href="/fr">')
		expect(html).toContain('<link rel="alternate" hreflang="de" href="/de">')
		/* 3 hreflang links total */
		const hreflangMatches = html.match(/hreflang="/g)
		expect(hreflangMatches).toHaveLength(3)
	})

	it("custom head: scripts with nonce, styles, links, meta", () => {
		const html = renderHeadToHtml(
			{
				custom: {
					links: [{ href: "/feed.xml", rel: "alternate", type: "application/rss+xml" }],
					meta: [{ content: "custom-value", name: "custom-meta" }],
					scripts: [{ children: "window.__init=true", type: "module" }, { src: "/vendor.js" }],
					styles: [{ children: ".app{display:flex}" }],
				},
			},
			"test-nonce",
		)

		/* links */
		expect(html).toContain('rel="alternate"')
		expect(html).toContain('href="/feed.xml"')

		/* meta */
		expect(html).toContain('name="custom-meta"')
		expect(html).toContain('content="custom-value"')

		/* scripts get nonce */
		expect(html).toContain('nonce="test-nonce"')
		expect(html).toContain('type="module"')
		expect(html).toContain("window.__init=true")
		expect(html).toContain('src="/vendor.js"')

		/* styles get nonce */
		expect(html).toContain('<style nonce="test-nonce">.app{display:flex}</style>')
	})
})
