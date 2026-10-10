import { describe, expect, it } from "vitest";
import { crimsonText } from "../../../src/fonts/crimson-text.ts";
import { inter } from "../../../src/fonts/inter.ts";
import { roboto } from "../../../src/fonts/roboto.ts";

describe("generated font: inter", () => {
	it("has correct family and category", () => {
		expect(inter.family).toBe("Inter");
		expect(inter.category).toBe("sans-serif");
	});

	it("is a variable font", () => {
		expect(inter.weights).toBe("100 900");
	});

	it("has expected subsets", () => {
		expect(inter.subsets).toContain("latin");
		expect(inter.subsets).toContain("cyrillic");
		expect(inter.subsets).toContain("greek");
	});

	it("fontFamily includes fallback", () => {
		expect(inter.fontFamily).toContain('"Inter"');
		expect(inter.fontFamily).toContain('"Inter Fallback"');
		expect(inter.fontFamily).toContain("sans-serif");
	});

	it("css() generates valid @font-face blocks", () => {
		const css = inter.css();
		expect(css).toContain("@font-face");
		expect(css).toContain('font-family: "Inter"');
		expect(css).toContain("font-display: swap");
		expect(css).toContain('format("woff2")');
		expect(css).toContain("unicode-range:");
	});

	it("css() with subset filter only includes that subset", () => {
		const css = inter.css(["latin"]);
		expect(css).toContain("/fonts/inter/latin.woff2");
		expect(css).not.toContain("/fonts/inter/cyrillic.woff2");
	});

	it("preloadLinks() returns latin by default", () => {
		const links = inter.preloadLinks();
		expect(links.length).toBeGreaterThanOrEqual(1);
		expect(links[0]?.href).toBe("/fonts/inter/latin.woff2");
	});

	it("fallback @font-face has size-adjust metrics", () => {
		const css = inter.css();
		expect(css).toContain('font-family: "Inter Fallback"');
		expect(css).toContain("size-adjust:");
		expect(css).toContain("ascent-override:");
	});
});

describe("generated font: roboto", () => {
	it("has correct properties", () => {
		expect(roboto.family).toBe("Roboto");
		expect(roboto.category).toBe("sans-serif");
		expect(roboto.subsets).toContain("latin");
	});
});

describe("generated font: crimsonText (static)", () => {
	it("has numeric weight array", () => {
		expect(Array.isArray(crimsonText.weights)).toBe(true);
		expect(crimsonText.weights).toContain(400);
		expect(crimsonText.weights).toContain(700);
	});

	it("css() generates per-weight @font-face blocks", () => {
		const css = crimsonText.css();
		expect(css).toContain("font-weight: 400");
		expect(css).toContain("font-weight: 700");
	});

	it("fontFamily uses serif generic", () => {
		expect(crimsonText.fontFamily).toContain("serif");
	});
});
