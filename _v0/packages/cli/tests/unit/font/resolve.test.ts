import { describe, expect, it } from "vitest";
import { type FontEntry, fuzzyMatch, resolveFont, resolveFonts } from "../../../src/font/resolve";

const REGISTRY: FontEntry[] = [
	["ABeeZee", "abeezee", "abeezee", "sans-serif"],
	["Abril Fatface", "abril-fatface", "abrilFatface", "display"],
	["Commissioner", "commissioner", "commissioner", "sans-serif"],
	["Comfortaa", "comfortaa", "comfortaa", "display"],
	["Crimson Text", "crimson-text", "crimsonText", "serif"],
	["DM Mono", "dm-mono", "dmMono", "monospace"],
	["Fira Code", "fira-code", "firaCode", "monospace"],
	["Inter", "inter", "inter", "sans-serif"],
	["Inter Tight", "inter-tight", "interTight", "sans-serif"],
	["JetBrains Mono", "jetbrains-mono", "jetBrainsMono", "monospace"],
	["Lora", "lora", "lora", "serif"],
	["Playfair Display", "playfair-display", "playfairDisplay", "serif"],
	["Roboto", "roboto", "roboto", "sans-serif"],
];

describe("resolveFont", () => {
	it("exact slug match", () => {
		const result = resolveFont("inter", REGISTRY);
		expect(result?.family).toBe("Inter");
	});

	it("exact slug match with hyphen", () => {
		const result = resolveFont("fira-code", REGISTRY);
		expect(result?.family).toBe("Fira Code");
	});

	it("exact family match (case-insensitive)", () => {
		const result = resolveFont("Inter", REGISTRY);
		expect(result?.family).toBe("Inter");
	});

	it("family match case-insensitive mixed case", () => {
		const result = resolveFont("INTER", REGISTRY);
		expect(result?.family).toBe("Inter");
	});

	it("family match with spaces", () => {
		const result = resolveFont("Playfair Display", REGISTRY);
		expect(result?.family).toBe("Playfair Display");
	});

	it("normalized slug from family name", () => {
		const result = resolveFont("playfair display", REGISTRY);
		expect(result?.family).toBe("Playfair Display");
	});

	it("returns null for unknown font", () => {
		const result = resolveFont("Comic Sans", REGISTRY);
		expect(result).toBeNull();
	});

	it("returns all fields from entry", () => {
		const result = resolveFont("inter", REGISTRY);
		expect(result).toEqual({
			camelName: "inter",
			category: "sans-serif",
			family: "Inter",
			slug: "inter",
		});
	});

	it("resolves quoted input with stripped quotes", () => {
		const result = resolveFont('"inter"', REGISTRY);
		expect(result?.family).toBe("Inter");
	});

	it("resolves single-quoted input", () => {
		const result = resolveFont("'Fira Code'", REGISTRY);
		expect(result?.family).toBe("Fira Code");
	});

	it("trims whitespace", () => {
		const result = resolveFont("  inter  ", REGISTRY);
		expect(result?.family).toBe("Inter");
	});
});

describe("resolveFonts", () => {
	it("resolves multiple names at once", () => {
		const result = resolveFonts(["inter", "lora", "fira-code"], REGISTRY);
		expect(result.resolved).toHaveLength(3);
		expect(result.unresolved).toHaveLength(0);
	});

	it("separates resolved and unresolved", () => {
		const result = resolveFonts(["inter", "comic-sans", "lora"], REGISTRY);
		expect(result.resolved).toHaveLength(2);
		expect(result.unresolved).toEqual(["comic-sans"]);
	});

	it("deduplicates resolved fonts", () => {
		const result = resolveFonts(["inter", "Inter", "INTER"], REGISTRY);
		expect(result.resolved).toHaveLength(1);
		expect(result.resolved[0]?.slug).toBe("inter");
	});

	it("returns empty arrays for empty input", () => {
		const result = resolveFonts([], REGISTRY);
		expect(result.resolved).toHaveLength(0);
		expect(result.unresolved).toHaveLength(0);
	});
});

describe("fuzzyMatch", () => {
	it("finds fonts by substring in family name", () => {
		const results = fuzzyMatch("inter", REGISTRY);
		const families = results.map((r) => r.family);
		expect(families).toContain("Inter");
		expect(families).toContain("Inter Tight");
	});

	it("finds fonts by category", () => {
		const results = fuzzyMatch("monospace", REGISTRY);
		const families = results.map((r) => r.family);
		expect(families).toContain("DM Mono");
		expect(families).toContain("Fira Code");
		expect(families).toContain("JetBrains Mono");
	});

	it("case-insensitive matching", () => {
		const results = fuzzyMatch("MONO", REGISTRY);
		expect(results.length).toBeGreaterThan(0);
	});

	it("returns empty for no match", () => {
		const results = fuzzyMatch("xyznotafont", REGISTRY);
		expect(results).toHaveLength(0);
	});

	it("limits results", () => {
		const results = fuzzyMatch("a", REGISTRY, 3);
		expect(results.length).toBeLessThanOrEqual(3);
	});

	it("name match ranks higher than category match", () => {
		const results = fuzzyMatch("mono", REGISTRY);
		/* DM Mono and JetBrains Mono have "mono" in name — should come before
		   fonts that only match via category */
		const firstTwo = results.slice(0, 2).map((r) => r.family);
		const hasNameMatch = firstTwo.some((f) => f.toLowerCase().includes("mono"));
		expect(hasNameMatch).toBe(true);
	});
});
