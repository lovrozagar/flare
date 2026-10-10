import { describe, expect, it } from "vitest";
import type { ImageLoader } from "../../../src/image/index.tsx";
import { buildStaticSrcSet, generateSrcSet, isStaticImage } from "../../../src/image/index.tsx";

const idLoader: ImageLoader = (p) => `${p.src}?w=${p.width}&q=${p.quality}`;

/* ── generateSrcSet edge cases ────────────────────────────────────── */

describe("generateSrcSet — edge cases", () => {
	it("baseWidth=0: not added to entries (guard: baseWidth > 0)", () => {
		const result = generateSrcSet({
			baseWidth: 0,
			loader: idLoader,
			maxWidth: 1000,
			mode: "width",
			quality: 75,
			src: "/img.jpg",
			widths: [640, 750],
		});
		expect(result).toBeDefined();
		/* 0w should not appear as a standalone descriptor */
		expect(result).not.toMatch(/\b0w\b/);
	});

	it("maxWidth=0: cap=0, all breakpoints filtered, returns undefined", () => {
		const result = generateSrcSet({
			baseWidth: 0,
			loader: idLoader,
			maxWidth: 0,
			mode: "width",
			quality: 75,
			src: "/img.jpg",
			widths: undefined,
		});
		expect(result).toBeUndefined();
	});

	it("maxWidth=1: cap=2, only very small breakpoints pass", () => {
		const result = generateSrcSet({
			baseWidth: 1,
			loader: idLoader,
			maxWidth: 1,
			mode: "width",
			quality: 75,
			src: "/img.jpg",
			widths: [1, 2, 640],
		});
		expect(result).toBeDefined();
		expect(result).toContain("1w");
		expect(result).toContain("2w");
		expect(result).not.toContain("640w");
	});

	it("custom widths with duplicates — baseWidth not re-added", () => {
		const result = generateSrcSet({
			baseWidth: 640,
			loader: idLoader,
			mode: "width",
			quality: 75,
			src: "/img.jpg",
			widths: [640, 750],
		});
		/* baseWidth=640 already in widths, includes() prevents double push */
		expect(result).toBeDefined();
		expect(result).toContain("640w");
		expect(result).toContain("750w");
	});

	it("density mode: baseWidth=0 generates 0*2=0 for 2x", () => {
		const result = generateSrcSet({
			baseWidth: 0,
			loader: idLoader,
			mode: "density",
			quality: 75,
			src: "/img.jpg",
			widths: undefined,
		});
		expect(result).toContain("1x");
		expect(result).toContain("2x");
	});

	it("no maxWidth: cap is Infinity, all breakpoints pass", () => {
		const result = generateSrcSet({
			baseWidth: 640,
			loader: idLoader,
			mode: "width",
			quality: 75,
			src: "/img.jpg",
			widths: undefined,
		});
		/* Should include all default widths */
		expect(result).toContain("3840w");
	});
});

/* ── buildStaticSrcSet edge cases ─────────────────────────────────── */

describe("buildStaticSrcSet — edge cases", () => {
	it("empty variants returns undefined", () => {
		expect(buildStaticSrcSet({}, "width", 640)).toBeUndefined();
	});

	it("density mode: missing 1x variant returns undefined", () => {
		const result = buildStaticSrcSet({ 1280: "/1280.webp" }, "density", 640);
		expect(result).toBeUndefined();
	});

	it("density mode: no 2x variant, fallback to closest", () => {
		const result = buildStaticSrcSet({ 640: "/640.webp", 900: "/900.webp" }, "density", 640);
		/* 2x target = 1280, no 1280 → closest ≥ 1280 = none → largest = 900 */
		expect(result).toContain("1x");
		expect(result).toContain("2x");
		expect(result).toContain("/900.webp");
	});

	it("density mode: only 1x variant, 2x falls back to largest", () => {
		const result = buildStaticSrcSet({ 640: "/640.webp" }, "density", 640);
		/* closestVariant targets 1280, none ≥ 1280, falls back to largest=640 */
		expect(result).toContain("1x");
		expect(result).toContain("2x");
		expect(result).toContain("/640.webp 2x");
	});

	it("width mode: all variants above cap returns undefined", () => {
		const result = buildStaticSrcSet({ 2000: "/2000.webp", 3000: "/3000.webp" }, "width", 640, 500);
		/* cap = 500*2 = 1000, both 2000 and 3000 > 1000 */
		expect(result).toBeUndefined();
	});

	it("width mode: no maxWidth means no cap", () => {
		const result = buildStaticSrcSet({ 3840: "/3840.webp", 640: "/640.webp" }, "width", 640);
		expect(result).toContain("640w");
		expect(result).toContain("3840w");
	});

	it("width mode: variants with width 0 excluded", () => {
		const result = buildStaticSrcSet({ 0: "/0.webp", 640: "/640.webp" }, "width", 640);
		expect(result).not.toMatch(/\b0w\b/);
		expect(result).toContain("640w");
	});

	it("width mode: sorted ascending", () => {
		const result = buildStaticSrcSet({ 1080: "/1080.webp", 640: "/640.webp", 750: "/750.webp" }, "width", 640);
		const entries = result?.split(", ") ?? [];
		const widths = entries.map((e) => Number.parseInt(e.split("w")[0] ?? "", 10));
		expect(widths).toEqual([...widths].sort((a, b) => a - b));
	});
});

/* ── isStaticImage ────────────────────────────────────────────────── */

describe("isStaticImage — type guard", () => {
	it("returns true for object with variants key", () => {
		expect(
			isStaticImage({
				blurDataURL: "",
				height: 100,
				src: "/img.webp",
				variants: { 640: "/640.webp" },
				width: 100,
			}),
		).toBe(true);
	});

	it("returns false for plain string", () => {
		expect(isStaticImage("/img.webp")).toBe(false);
	});

	it("returns false for null", () => {
		expect(isStaticImage(null)).toBe(false);
	});

	it("returns false for undefined", () => {
		expect(isStaticImage(undefined)).toBe(false);
	});

	it("returns false for object without variants", () => {
		expect(isStaticImage({ src: "/img.webp" } as unknown as string)).toBe(false);
	});

	it("returns true for full StaticImageData object", () => {
		expect(
			isStaticImage({
				blurDataURL: "data:image/webp;base64,UklGR...",
				height: 600,
				src: "/img.webp",
				variants: { 640: "/640.webp" },
				width: 800,
			}),
		).toBe(true);
	});
});
