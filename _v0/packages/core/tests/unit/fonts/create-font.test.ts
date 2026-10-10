import { describe, expect, it } from "vitest";
import { createFont } from "../../../src/fonts/create-font.ts";

describe("createFont", () => {
	it("creates font with minimal options", () => {
		const font = createFont({
			category: "sans-serif",
			family: "Acme Sans",
			src: "/fonts/acme-sans.woff2",
		});

		expect(font.family).toBe("Acme Sans");
		expect(font.category).toBe("sans-serif");
		expect(font.subsets).toEqual([]);
		expect(font.weights).toBe("400");
		expect(font.fontFamily).toBe('"Acme Sans", sans-serif');
	});

	it("creates font with fallback metrics", () => {
		const font = createFont({
			category: "sans-serif",
			fallbackMetrics: {
				ascentOverride: "90%",
				descentOverride: "22%",
				fallbackFont: "Arial",
				lineGapOverride: "0%",
				sizeAdjust: "105%",
			},
			family: "Acme Sans",
			src: "/fonts/acme-sans.woff2",
			weights: "100 900",
		});

		expect(font.fontFamily).toBe('"Acme Sans", "Acme Sans Fallback", sans-serif');
		expect(font.weights).toBe("100 900");
	});

	it("generates correct css() output", () => {
		const font = createFont({
			category: "serif",
			family: "Brand Serif",
			src: "/fonts/brand.woff2",
			weights: "100 900",
		});

		const css = font.css();
		expect(css).toContain('font-family: "Brand Serif"');
		expect(css).toContain("font-display: swap");
		expect(css).toContain("url(/fonts/brand.woff2)");
		expect(css).toContain("font-weight: 100 900");
	});

	it("generates fallback CSS when metrics provided", () => {
		const font = createFont({
			category: "sans-serif",
			fallbackMetrics: {
				ascentOverride: "90%",
				descentOverride: "22%",
				fallbackFont: "Arial",
				lineGapOverride: "0%",
				sizeAdjust: "105%",
			},
			family: "Acme Sans",
			src: "/fonts/acme-sans.woff2",
		});

		const css = font.css();
		expect(css).toContain('font-family: "Acme Sans Fallback"');
		expect(css).toContain('src: local("Arial")');
		expect(css).toContain("size-adjust: 105%");
	});

	it("returns preload links", () => {
		const font = createFont({
			category: "sans-serif",
			family: "Acme",
			src: "/fonts/acme.woff2",
		});

		const links = font.preloadLinks();
		expect(links).toHaveLength(1);
		expect(links[0]).toEqual({
			as: "font",
			crossorigin: "",
			href: "/fonts/acme.woff2",
			rel: "preload",
			type: "font/woff2",
		});
	});

	it("css() ignores subset args for custom fonts", () => {
		const font = createFont({
			category: "sans-serif",
			family: "Acme",
			src: "/fonts/acme.woff2",
		});

		/* custom fonts have no subsets, css() should still return the full block */
		const full = font.css();
		const withSubset = font.css(["latin"]);
		expect(full).toBe(withSubset);
	});

	it("uses explicit weight list", () => {
		const font = createFont({
			category: "serif",
			family: "Foo",
			src: "/fonts/foo.woff2",
			weights: [400, 700],
		});

		expect(font.weights).toEqual([400, 700]);
		const css = font.css();
		expect(css).toContain("font-weight: 400");
	});
});
