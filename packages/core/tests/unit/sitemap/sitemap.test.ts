import { describe, expect, it } from "vitest"
import type { RouteDefinition } from "../../../src/generators/index.ts"
import {
	buildSitemapEntries,
	buildSitemapFromDefs,
	filterSitemapRoutes,
	generateRobotsTxt,
	generateSitemap,
	generateSitemapIndexXml,
	generateSitemapXml,
} from "../../../src/sitemap/index.ts"

/* ── Helpers ──────────────────────────────────────────────────────────── */

function makeDef(overrides: Partial<RouteDefinition> & { virtualPath: string }): RouteDefinition {
	return {
		authenticateMode: false,
		cache: {},
		exportName: "Page",
		filePath: "src/routes/page.tsx",
		hasInput: false,
		responseRoute: false,
		type: "page",
		...overrides,
	}
}

/* ── filterSitemapRoutes ──────────────────────────────────────────────── */

describe("filterSitemapRoutes", () => {
	it("keeps pages, filters layouts and root-layouts", () => {
		const defs = [
			makeDef({ type: "page", virtualPath: "_root_/" }),
			makeDef({ type: "layout", virtualPath: "_root_" }),
			makeDef({ type: "root-layout", virtualPath: "_root_" }),
		]
		const result = filterSitemapRoutes(defs)
		expect(result).toHaveLength(1)
		expect(result[0]?.type).toBe("page")
	})

	it("filters response routes", () => {
		const defs = [makeDef({ responseRoute: true, virtualPath: "_root_/api" })]
		expect(filterSitemapRoutes(defs)).toHaveLength(0)
	})

	it("filters authenticated routes (true) but keeps optional and false", () => {
		const defs = [
			makeDef({ authenticateMode: true, virtualPath: "_root_/admin" }),
			makeDef({ authenticateMode: "optional", virtualPath: "_root_/profile" }),
			makeDef({ authenticateMode: false, virtualPath: "_root_/public" }),
		]
		const result = filterSitemapRoutes(defs)
		expect(result).toHaveLength(2)
	})

	it("filters routes with dynamic params", () => {
		const defs = [
			makeDef({ virtualPath: "_root_/blog/[slug]" }),
			makeDef({ virtualPath: "_root_/docs/[...path]" }),
			makeDef({ virtualPath: "_root_/files/[[...path]]" }),
			makeDef({ virtualPath: "_root_/about" }),
		]
		const result = filterSitemapRoutes(defs)
		expect(result).toHaveLength(1)
		expect(result[0]?.virtualPath).toBe("_root_/about")
	})

	it("applies exclude patterns", () => {
		const defs = [
			makeDef({ virtualPath: "_root_/" }),
			makeDef({ virtualPath: "_root_/admin/dashboard" }),
			makeDef({ virtualPath: "_root_/admin/settings" }),
			makeDef({ virtualPath: "_root_/blog" }),
		]
		const result = filterSitemapRoutes(defs, ["/admin/*"])
		expect(result).toHaveLength(2)
		expect(result.map((d) => d.virtualPath)).toEqual(["_root_/", "_root_/blog"])
	})

	it("supports ** glob pattern", () => {
		const defs = [
			makeDef({ virtualPath: "_root_/" }),
			makeDef({ virtualPath: "_root_/admin/dashboard" }),
			makeDef({ virtualPath: "_root_/admin/users/list" }),
		]
		const result = filterSitemapRoutes(defs, ["/admin/**"])
		expect(result).toHaveLength(1)
	})
})

/* ── buildSitemapEntries ──────────────────────────────────────────────── */

describe("buildSitemapEntries", () => {
	it("builds entries with origin prefix", () => {
		const defs = [makeDef({ virtualPath: "_root_/about" })]
		const entries = buildSitemapEntries(defs, { origin: "https://example.com" })
		expect(entries).toHaveLength(1)
		expect(entries[0]?.loc).toBe("https://example.com/about")
	})

	it("handles trailing-slash route as /", () => {
		const defs = [makeDef({ virtualPath: "_root_/" })]
		const entries = buildSitemapEntries(defs, { origin: "https://example.com" })
		expect(entries[0]?.loc).toBe("https://example.com/")
	})

	it("applies scalar changefreq", () => {
		const defs = [makeDef({ virtualPath: "_root_/" })]
		const entries = buildSitemapEntries(defs, {
			changefreq: "daily",
			origin: "https://example.com",
		})
		expect(entries[0]?.changefreq).toBe("daily")
	})

	it("applies glob-based changefreq overrides", () => {
		const defs = [makeDef({ virtualPath: "_root_/" }), makeDef({ virtualPath: "_root_/blog" })]
		const entries = buildSitemapEntries(defs, {
			changefreq: { "/": "daily", "/blog": "weekly" },
			origin: "https://example.com",
		})
		expect(entries[0]?.changefreq).toBe("daily")
		expect(entries[1]?.changefreq).toBe("weekly")
	})

	it("applies priority overrides", () => {
		const defs = [makeDef({ virtualPath: "_root_/" })]
		const entries = buildSitemapEntries(defs, {
			origin: "https://example.com",
			priority: { "/": 1.0 },
		})
		expect(entries[0]?.priority).toBe(1.0)
	})

	it("appends additionalEntries", () => {
		const defs = [makeDef({ virtualPath: "_root_/" })]
		const entries = buildSitemapEntries(defs, {
			additionalEntries: [{ lastmod: "2025-01-01", loc: "https://example.com/custom" }],
			origin: "https://example.com",
		})
		expect(entries).toHaveLength(2)
		expect(entries[1]?.loc).toBe("https://example.com/custom")
		expect(entries[1]?.lastmod).toBe("2025-01-01")
	})

	it("strips group segments from URLs", () => {
		const defs = [makeDef({ virtualPath: "_root_/(marketing)/pricing" })]
		const entries = buildSitemapEntries(defs, { origin: "https://example.com" })
		expect(entries[0]?.loc).toBe("https://example.com/pricing")
	})
})

/* ── generateSitemapXml ───────────────────────────────────────────────── */

describe("generateSitemapXml", () => {
	it("generates valid XML", () => {
		const xml = generateSitemapXml([{ loc: "https://example.com/" }])
		expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>')
		expect(xml).toContain("<urlset")
		expect(xml).toContain("<loc>https://example.com/</loc>")
		expect(xml).toContain("</urlset>")
	})

	it("includes optional fields", () => {
		const xml = generateSitemapXml([
			{
				changefreq: "daily",
				lastmod: "2025-06-01",
				loc: "https://example.com/",
				priority: 1.0,
			},
		])
		expect(xml).toContain("<lastmod>2025-06-01</lastmod>")
		expect(xml).toContain("<changefreq>daily</changefreq>")
		expect(xml).toContain("<priority>1</priority>")
	})

	it("escapes XML special characters", () => {
		const xml = generateSitemapXml([{ loc: "https://example.com/?a=1&b=2" }])
		expect(xml).toContain("&amp;")
		expect(xml).not.toContain("&b=2")
	})

	it("handles empty entries", () => {
		const xml = generateSitemapXml([])
		expect(xml).toContain("<urlset")
		expect(xml).toContain("</urlset>")
		expect(xml).not.toContain("<url>")
	})
})

/* ── generateSitemapIndexXml ──────────────────────────────────────────── */

describe("generateSitemapIndexXml", () => {
	it("generates index pointing to numbered sitemaps", () => {
		const xml = generateSitemapIndexXml("https://example.com", 3)
		expect(xml).toContain("<sitemapindex")
		expect(xml).toContain("sitemap-0.xml")
		expect(xml).toContain("sitemap-1.xml")
		expect(xml).toContain("sitemap-2.xml")
		expect(xml).toContain("</sitemapindex>")
	})
})

/* ── generateSitemap ──────────────────────────────────────────────────── */

describe("generateSitemap", () => {
	it("produces single file for small sitemaps", () => {
		const entries = [{ loc: "https://example.com/" }]
		const result = generateSitemap({ origin: "https://example.com" }, entries)
		expect(result.files).toHaveLength(1)
		expect(result.files[0]?.path).toBe("sitemap.xml")
		expect(result.urls).toEqual(["https://example.com/"])
	})

	it("splits into index + parts for large sitemaps", () => {
		const entries = Array.from({ length: 50_001 }, (_, i) => ({
			loc: `https://example.com/page-${i}`,
		}))
		const result = generateSitemap({ origin: "https://example.com" }, entries)
		expect(result.files.length).toBe(3) /* 2 parts + 1 index */
		expect(result.files.some((f) => f.path === "sitemap.xml")).toBe(true)
		expect(result.files.some((f) => f.path === "sitemap-0.xml")).toBe(true)
		expect(result.files.some((f) => f.path === "sitemap-1.xml")).toBe(true)
		expect(result.urls).toHaveLength(50_001)
	})
})

/* ── generateRobotsTxt ────────────────────────────────────────────────── */

describe("generateRobotsTxt", () => {
	it("generates default rules with sitemap", () => {
		const txt = generateRobotsTxt("https://example.com/sitemap.xml")
		expect(txt).toContain("User-agent: *")
		expect(txt).toContain("Allow: /")
		expect(txt).toContain("Sitemap: https://example.com/sitemap.xml")
	})

	it("uses custom rules", () => {
		const txt = generateRobotsTxt(
			"https://example.com/sitemap.xml",
			"User-agent: *\nDisallow: /admin",
		)
		expect(txt).toContain("Disallow: /admin")
		expect(txt).toContain("Sitemap: https://example.com/sitemap.xml")
	})
})

/* ── buildSitemapFromDefs ─────────────────────────────────────────────── */

describe("buildSitemapFromDefs", () => {
	it("full pipeline: filter + build + generate", () => {
		const defs = [
			makeDef({ virtualPath: "_root_/" }),
			makeDef({ virtualPath: "_root_/about" }),
			makeDef({ authenticateMode: true, virtualPath: "_root_/admin" }),
			makeDef({ type: "layout", virtualPath: "_root_" }),
			makeDef({ virtualPath: "_root_/blog/[slug]" }),
		]
		const result = buildSitemapFromDefs(defs, {
			origin: "https://example.com",
		})
		expect(result.urls).toHaveLength(2)
		expect(result.urls).toContain("https://example.com/")
		expect(result.urls).toContain("https://example.com/about")
		expect(result.files).toHaveLength(1)
		expect(result.files[0]?.path).toBe("sitemap.xml")
	})
})
