import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { IMAGE_MAX_WIDTH, isAllowedImageWidth } from "../../../src/plugins/image-plugin.ts";

describe("isAllowedImageWidth", () => {
	it("allows typical variant widths", () => {
		expect(isAllowedImageWidth(640)).toBe(true);
		expect(isAllowedImageWidth(IMAGE_MAX_WIDTH)).toBe(true);
	});

	it("rejects zero, negative, non-integer, and oversized widths", () => {
		expect(isAllowedImageWidth(0)).toBe(false);
		expect(isAllowedImageWidth(-1)).toBe(false);
		expect(isAllowedImageWidth(1.5)).toBe(false);
		expect(isAllowedImageWidth(Number.NaN)).toBe(false);
		expect(isAllowedImageWidth(Number.POSITIVE_INFINITY)).toBe(false);
		expect(isAllowedImageWidth(IMAGE_MAX_WIDTH + 1)).toBe(false);
	});
});

describe("image plugin configureServer caps w", () => {
	it("uses isAllowedImageWidth before sharp", () => {
		const src = readFileSync(join(__dirname, "../../../src/plugins/image-plugin.ts"), "utf-8");
		expect(src).toContain("isAllowedImageWidth(w)");
	});
});
