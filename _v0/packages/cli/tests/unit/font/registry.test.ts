import { describe, expect, it } from "vitest";
import { getFontRegistry, getFontUrlMap } from "../../../src/font/registry";

describe("getFontRegistry", () => {
	it("returns array of font entries", () => {
		const registry = getFontRegistry();
		expect(Array.isArray(registry)).toBe(true);
		expect(registry.length).toBeGreaterThan(100);
	});

	it("each entry has 4 elements", () => {
		const registry = getFontRegistry();
		for (const entry of registry) {
			expect(entry).toHaveLength(4);
		}
	});

	it("entries have correct shape [family, slug, camelName, category]", () => {
		const registry = getFontRegistry();
		const inter = registry.find((e) => e[1] === "inter");
		expect(inter).toBeDefined();
		expect(inter?.[0]).toBe("Inter");
		expect(inter?.[1]).toBe("inter");
		expect(inter?.[2]).toBe("inter");
		expect(inter?.[3]).toBe("sans-serif");
	});

	it("contains known fonts", () => {
		const registry = getFontRegistry();
		const slugs = registry.map((e) => e[1]);
		expect(slugs).toContain("inter");
		expect(slugs).toContain("roboto");
		expect(slugs).toContain("lora");
	});
});

describe("getFontUrlMap", () => {
	it("returns record of local paths to CDN URLs", () => {
		const urlMap = getFontUrlMap();
		expect(typeof urlMap).toBe("object");
		expect(Object.keys(urlMap).length).toBeGreaterThan(100);
	});

	it("keys are local font paths", () => {
		const urlMap = getFontUrlMap();
		const keys = Object.keys(urlMap);
		for (const key of keys.slice(0, 10)) {
			expect(key).toMatch(/^\/fonts\/[a-z0-9-]+\//);
			expect(key).toMatch(/\.woff2$/);
		}
	});

	it("values are CDN URLs", () => {
		const urlMap = getFontUrlMap();
		const values = Object.values(urlMap);
		for (const value of values.slice(0, 10)) {
			expect(value).toMatch(/^https:\/\//);
		}
	});

	it("contains entries for known font", () => {
		const urlMap = getFontUrlMap();
		const interKeys = Object.keys(urlMap).filter((k) => k.startsWith("/fonts/inter/"));
		expect(interKeys.length).toBeGreaterThan(0);
	});
});
