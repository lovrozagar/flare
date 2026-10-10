import { describe, expect, it } from "vitest";
import type { RouteDefinition } from "../../../src/generators/index.ts";
import {
	buildSitemapEntries,
	buildSitemapFromDefs,
	filterSitemapRoutes,
	generateSitemap,
	generateSitemapXml,
} from "../../../src/sitemap/index.ts";

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
	};
}

/* ── Origin trailing slash ────────────────────────────────────────────── */

describe("buildSitemapEntries — origin trailing slash", () => {
	it("strips trailing slash from origin to avoid double slash", () => {
		const defs = [makeDef({ virtualPath: "_root_/about" })];
		const entries = buildSitemapEntries(defs, { origin: "https://example.com/" });
		expect(entries[0]?.loc).toBe("https://example.com/about");
	});

	it("handles origin with trailing slash + root route", () => {
		const defs = [makeDef({ virtualPath: "_root_/" })];
		const entries = buildSitemapEntries(defs, { origin: "https://example.com/" });
		expect(entries[0]?.loc).toBe("https://example.com/");
	});

	it("works normally without trailing slash", () => {
		const defs = [makeDef({ virtualPath: "_root_/about" })];
		const entries = buildSitemapEntries(defs, { origin: "https://example.com" });
		expect(entries[0]?.loc).toBe("https://example.com/about");
	});
});

/* ── XML escaping completeness ────────────────────────────────────────── */

describe("generateSitemapXml — XML escaping", () => {
	it("escapes all 5 XML entities", () => {
		const xml = generateSitemapXml([{ loc: "https://example.com/?a=1&b=2" }]);
		expect(xml).toContain("&amp;");
	});

	it("escapes angle brackets in URLs", () => {
		const xml = generateSitemapXml([{ loc: "https://example.com/<test>" }]);
		expect(xml).toContain("&lt;test&gt;");
	});

	it("escapes quotes in URLs", () => {
		const xml = generateSitemapXml([{ loc: 'https://example.com/?q="hello"' }]);
		expect(xml).toContain("&quot;hello&quot;");
	});

	it("escapes apostrophes in URLs", () => {
		const xml = generateSitemapXml([{ loc: "https://example.com/?q='hello'" }]);
		expect(xml).toContain("&apos;hello&apos;");
	});
});

/* ── Glob pattern edge cases ──────────────────────────────────────────── */

describe("filterSitemapRoutes — glob edge cases", () => {
	it("exact slash pattern excludes only root", () => {
		const defs = [makeDef({ virtualPath: "_root_/" }), makeDef({ virtualPath: "_root_/about" })];
		const result = filterSitemapRoutes(defs, ["/"]);
		expect(result).toHaveLength(1);
		expect(result[0]?.virtualPath).toBe("_root_/about");
	});

	it("empty exclude array filters nothing", () => {
		const defs = [makeDef({ virtualPath: "_root_/" }), makeDef({ virtualPath: "_root_/about" })];
		const result = filterSitemapRoutes(defs, []);
		expect(result).toHaveLength(2);
	});

	it("dot in pattern matches literal dot", () => {
		const defs = [makeDef({ virtualPath: "_root_/file.html" }), makeDef({ virtualPath: "_root_/fileXhtml" })];
		/* /file.html should NOT match /fileXhtml */
		const result = filterSitemapRoutes(defs, ["/file.html"]);
		expect(result).toHaveLength(1);
		expect(result[0]?.virtualPath).toBe("_root_/fileXhtml");
	});
});

/* ── Boundary split conditions ────────────────────────────────────────── */

describe("generateSitemap — boundary splits", () => {
	it("exactly 50,000 entries: single sitemap file", () => {
		const entries = Array.from({ length: 50_000 }, (_, i) => ({
			loc: `https://example.com/p-${i}`,
		}));
		const result = generateSitemap({ origin: "https://example.com" }, entries);
		expect(result.files).toHaveLength(1);
		expect(result.files[0]?.path).toBe("sitemap.xml");
	});

	it("50,001 entries: splits into 2 parts + index", () => {
		const entries = Array.from({ length: 50_001 }, (_, i) => ({
			loc: `https://example.com/p-${i}`,
		}));
		const result = generateSitemap({ origin: "https://example.com" }, entries);
		expect(result.files).toHaveLength(3);
		expect(result.files.map((f) => f.path).sort()).toEqual(["sitemap-0.xml", "sitemap-1.xml", "sitemap.xml"]);
	});

	it("100,000 entries: splits into 2 parts + index", () => {
		const entries = Array.from({ length: 100_000 }, (_, i) => ({
			loc: `https://example.com/p-${i}`,
		}));
		const result = generateSitemap({ origin: "https://example.com" }, entries);
		expect(result.files).toHaveLength(3);
	});

	it("100,001 entries: splits into 3 parts + index", () => {
		const entries = Array.from({ length: 100_001 }, (_, i) => ({
			loc: `https://example.com/p-${i}`,
		}));
		const result = generateSitemap({ origin: "https://example.com" }, entries);
		expect(result.files).toHaveLength(4);
	});

	it("preserves all URLs across splits", () => {
		const entries = Array.from({ length: 50_001 }, (_, i) => ({
			loc: `https://example.com/p-${i}`,
		}));
		const result = generateSitemap({ origin: "https://example.com" }, entries);
		expect(result.urls).toHaveLength(50_001);
	});
});

/* ── Empty routes ─────────────────────────────────────────────────────── */

describe("sitemap — empty inputs", () => {
	it("filterSitemapRoutes with empty defs returns empty array", () => {
		expect(filterSitemapRoutes([])).toEqual([]);
	});

	it("buildSitemapEntries with empty defs returns empty array", () => {
		const entries = buildSitemapEntries([], { origin: "https://example.com" });
		expect(entries).toEqual([]);
	});

	it("buildSitemapFromDefs with all filtered defs produces valid empty sitemap", () => {
		const defs = [
			makeDef({ authenticateMode: true, virtualPath: "_root_/admin" }),
			makeDef({ type: "layout", virtualPath: "_root_" }),
		];
		const result = buildSitemapFromDefs(defs, { origin: "https://example.com" });
		expect(result.urls).toHaveLength(0);
		expect(result.files).toHaveLength(1);
		expect(result.files[0]?.content).toContain("<urlset");
		expect(result.files[0]?.content).not.toContain("<url>");
	});
});
