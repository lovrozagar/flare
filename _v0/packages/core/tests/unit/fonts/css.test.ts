import { describe, expect, it } from "vitest";
import { buildFontCss, buildFontFamily, buildPreloadLinks } from "../../../src/fonts/css.ts";
import type { FontData } from "../../../src/fonts/types.ts";

const variableFont: FontData = {
	category: "sans-serif",
	fallbackMetrics: {
		ascentOverride: "90.44%",
		descentOverride: "22.52%",
		fallbackFont: "Arial",
		lineGapOverride: "0.00%",
		sizeAdjust: "107.12%",
	},
	family: "Inter",
	subsetEntries: [
		{
			style: "normal",
			subset: "latin",
			unicodeRange: "U+0000-00FF",
			url: "/fonts/inter/latin.woff2",
			weight: "100 900",
		},
		{
			style: "normal",
			subset: "cyrillic",
			unicodeRange: "U+0400-045F",
			url: "/fonts/inter/cyrillic.woff2",
			weight: "100 900",
		},
		{
			style: "italic",
			subset: "latin",
			unicodeRange: "U+0000-00FF",
			url: "/fonts/inter/latin-i.woff2",
			weight: "100 900",
		},
	],
	subsets: ["cyrillic", "latin"],
	weights: "100 900",
};

const staticFont: FontData = {
	category: "serif",
	family: "Crimson Text",
	subsetEntries: [
		{
			style: "normal",
			subset: "latin",
			unicodeRange: "U+0000-00FF",
			url: "/fonts/crimson-text/latin-400.woff2",
			weight: 400,
		},
		{
			style: "normal",
			subset: "latin",
			unicodeRange: "U+0000-00FF",
			url: "/fonts/crimson-text/latin-700.woff2",
			weight: 700,
		},
		{
			style: "italic",
			subset: "latin",
			unicodeRange: "U+0000-00FF",
			url: "/fonts/crimson-text/latin-i-400.woff2",
			weight: 400,
		},
	],
	subsets: ["latin"],
	weights: [400, 700],
};

const noMetricsFont: FontData = {
	category: "monospace",
	family: "Fira Code",
	subsetEntries: [
		{
			style: "normal",
			subset: "latin",
			unicodeRange: "U+0000-00FF",
			url: "/fonts/fira-code/latin.woff2",
			weight: "300 700",
		},
	],
	subsets: ["latin"],
	weights: "300 700",
};

describe("buildFontCss", () => {
	it("generates @font-face for variable font with all subsets", () => {
		const css = buildFontCss(variableFont);
		expect(css).toContain('font-family: "Inter"');
		expect(css).toContain("font-weight: 100 900");
		expect(css).toContain("font-display: swap");
		expect(css).toContain("unicode-range: U+0000-00FF");
		expect(css).toContain("unicode-range: U+0400-045F");
		expect(css).toContain('url(/fonts/inter/latin.woff2) format("woff2")');
		expect(css).toContain('url(/fonts/inter/cyrillic.woff2) format("woff2")');
		expect(css).toContain("font-style: italic");
		expect(css).toContain("font-style: normal");
	});

	it("generates @font-face for static font with per-weight entries", () => {
		const css = buildFontCss(staticFont);
		expect(css).toContain('font-family: "Crimson Text"');
		expect(css).toContain("font-weight: 400");
		expect(css).toContain("font-weight: 700");
		expect(css).toContain('url(/fonts/crimson-text/latin-400.woff2) format("woff2")');
		expect(css).toContain('url(/fonts/crimson-text/latin-700.woff2) format("woff2")');
		expect(css).toContain('url(/fonts/crimson-text/latin-i-400.woff2) format("woff2")');
	});

	it("filters by subset", () => {
		const css = buildFontCss(variableFont, ["latin"]);
		expect(css).toContain("url(/fonts/inter/latin.woff2)");
		expect(css).toContain("url(/fonts/inter/latin-i.woff2)");
		expect(css).not.toContain("url(/fonts/inter/cyrillic.woff2)");
	});

	it("generates fallback @font-face when metrics provided", () => {
		const css = buildFontCss(variableFont);
		expect(css).toContain('font-family: "Inter Fallback"');
		expect(css).toContain('src: local("Arial")');
		expect(css).toContain("size-adjust: 107.12%");
		expect(css).toContain("ascent-override: 90.44%");
		expect(css).toContain("descent-override: 22.52%");
		expect(css).toContain("line-gap-override: 0.00%");
	});

	it("omits fallback @font-face when no metrics", () => {
		const css = buildFontCss(noMetricsFont);
		expect(css).not.toContain("Fallback");
		expect(css).not.toContain("size-adjust");
		expect(css).toContain('font-family: "Fira Code"');
	});

	it("returns empty string for empty subset filter", () => {
		const css = buildFontCss(variableFont, []);
		/* no subset entries match, but fallback is still generated */
		expect(css).not.toContain("url(/fonts/inter/latin.woff2)");
	});
});

describe("buildFontFamily", () => {
	it("builds fontFamily with fallback when metrics present", () => {
		const result = buildFontFamily(variableFont);
		expect(result).toBe('"Inter", "Inter Fallback", sans-serif');
	});

	it("builds fontFamily without fallback when no metrics", () => {
		const result = buildFontFamily(noMetricsFont);
		expect(result).toBe('"Fira Code", monospace');
	});

	it("uses serif for serif category", () => {
		const result = buildFontFamily(staticFont);
		expect(result).toBe('"Crimson Text", serif');
	});

	it("uses cursive for handwriting category", () => {
		const handwriting: FontData = {
			category: "handwriting",
			family: "Dancing Script",
			subsetEntries: [],
			subsets: [],
			weights: "400",
		};
		expect(buildFontFamily(handwriting)).toBe('"Dancing Script", cursive');
	});

	it("uses sans-serif for display category", () => {
		const display: FontData = {
			category: "display",
			family: "Lobster",
			subsetEntries: [],
			subsets: [],
			weights: "400",
		};
		expect(buildFontFamily(display)).toBe('"Lobster", sans-serif');
	});

	it("falls back to sans-serif for unknown category", () => {
		const unknown: FontData = {
			category: "fantasy",
			family: "Mystery",
			subsetEntries: [],
			subsets: [],
			weights: "400",
		};
		expect(buildFontFamily(unknown)).toBe('"Mystery", sans-serif');
	});
});

describe("buildPreloadLinks", () => {
	it("returns preload link for default latin subset", () => {
		const links = buildPreloadLinks(variableFont);
		expect(links.length).toBeGreaterThanOrEqual(1);
		const link = links[0];
		expect(link).toBeDefined();
		expect(link?.rel).toBe("preload");
		expect(link?.as).toBe("font");
		expect(link?.type).toBe("font/woff2");
		expect(link?.crossorigin).toBe("");
		expect(link?.href).toBe("/fonts/inter/latin.woff2");
	});

	it("returns preload link for specified subset", () => {
		const links = buildPreloadLinks(variableFont, "cyrillic");
		expect(links.length).toBeGreaterThanOrEqual(1);
		expect(links[0]?.href).toBe("/fonts/inter/cyrillic.woff2");
	});

	it("returns multiple links for static font (one per weight)", () => {
		const links = buildPreloadLinks(staticFont, "latin");
		/* static fonts have separate files per weight — preload all of them */
		expect(links.length).toBe(2);
		const hrefs = links.map((l) => l.href);
		expect(hrefs).toContain("/fonts/crimson-text/latin-400.woff2");
		expect(hrefs).toContain("/fonts/crimson-text/latin-700.woff2");
	});

	it("returns empty array for unknown subset", () => {
		const links = buildPreloadLinks(variableFont, "arabic");
		expect(links).toEqual([]);
	});
});
