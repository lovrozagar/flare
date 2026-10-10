import { describe, expect, it } from "vitest";
import { createRegistryFont } from "../../../src/fonts/create-registry-font.ts";

describe("createRegistryFont", () => {
	it("creates font with correct properties", () => {
		const font = createRegistryFont({
			category: "sans-serif",
			family: "Test Sans",
			subsetEntries: [
				{
					style: "normal",
					subset: "latin",
					unicodeRange: "U+0000-00FF",
					url: "/fonts/test/latin.woff2",
					weight: "100 900",
				},
			],
			subsets: ["latin"],
			weights: "100 900",
		});

		expect(font.family).toBe("Test Sans");
		expect(font.category).toBe("sans-serif");
		expect(font.subsets).toEqual(["latin"]);
		expect(font.weights).toBe("100 900");
		expect(font.fontFamily).toBe('"Test Sans", sans-serif');
	});

	it("css() filters by subset correctly", () => {
		const font = createRegistryFont({
			category: "sans-serif",
			family: "Multi",
			subsetEntries: [
				{
					style: "normal",
					subset: "latin",
					unicodeRange: "U+0000-00FF",
					url: "/fonts/multi/latin.woff2",
					weight: "400",
				},
				{
					style: "normal",
					subset: "cyrillic",
					unicodeRange: "U+0400-045F",
					url: "/fonts/multi/cyrillic.woff2",
					weight: "400",
				},
				{
					style: "normal",
					subset: "greek",
					unicodeRange: "U+0370-03FF",
					url: "/fonts/multi/greek.woff2",
					weight: "400",
				},
			],
			subsets: ["cyrillic", "greek", "latin"],
			weights: [400],
		});

		const latin = font.css(["latin"]);
		expect(latin).toContain("latin.woff2");
		expect(latin).not.toContain("cyrillic.woff2");
		expect(latin).not.toContain("greek.woff2");

		const multi = font.css(["latin", "cyrillic"]);
		expect(multi).toContain("latin.woff2");
		expect(multi).toContain("cyrillic.woff2");
		expect(multi).not.toContain("greek.woff2");

		const all = font.css();
		expect(all).toContain("latin.woff2");
		expect(all).toContain("cyrillic.woff2");
		expect(all).toContain("greek.woff2");
	});

	it("preloadLinks returns empty for nonexistent subset", () => {
		const font = createRegistryFont({
			category: "serif",
			family: "X",
			subsetEntries: [
				{
					style: "normal",
					subset: "latin",
					unicodeRange: "U+0000-00FF",
					url: "/fonts/x/latin.woff2",
					weight: "400",
				},
			],
			subsets: ["latin"],
			weights: [400],
		});

		expect(font.preloadLinks("arabic" as "latin")).toEqual([]);
	});

	it("preloadLinks skips italic entries", () => {
		const font = createRegistryFont({
			category: "serif",
			family: "ItalicTest",
			subsetEntries: [
				{
					style: "italic",
					subset: "latin",
					unicodeRange: "U+0000-00FF",
					url: "/fonts/it/latin-i.woff2",
					weight: "400",
				},
			],
			subsets: ["latin"],
			weights: [400],
		});

		/* only normal entries, no italic-only preloads */
		expect(font.preloadLinks("latin")).toEqual([]);
	});

	it("fontFamily includes fallback when metrics provided", () => {
		const font = createRegistryFont({
			category: "monospace",
			fallbackMetrics: {
				ascentOverride: "90%",
				descentOverride: "22%",
				fallbackFont: "Courier New",
				lineGapOverride: "0%",
				sizeAdjust: "105%",
			},
			family: "Code Font",
			subsetEntries: [],
			subsets: [],
			weights: "400",
		});

		expect(font.fontFamily).toBe('"Code Font", "Code Font Fallback", monospace');
	});
});
