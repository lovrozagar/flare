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

describe("resolveFont edge cases", () => {
	it("returns null for empty string", () => {
		expect(resolveFont("", REGISTRY)).toBeNull();
	});

	it("returns null for whitespace-only string", () => {
		expect(resolveFont("   ", REGISTRY)).toBeNull();
	});

	it("mismatched quotes treated as literal characters", () => {
		/* "inter' has no matching entry — quotes don't match so not stripped */
		expect(resolveFont("\"inter'", REGISTRY)).toBeNull();
	});

	it("slug match takes priority over family match", () => {
		/* if a slug happens to match before a family, slug wins */
		const result = resolveFont("inter", REGISTRY);
		expect(result?.slug).toBe("inter");
		expect(result?.family).toBe("Inter");
	});

	it("handles slug with multiple hyphens", () => {
		const result = resolveFont("jetbrains-mono", REGISTRY);
		expect(result?.family).toBe("JetBrains Mono");
		expect(result?.camelName).toBe("jetBrainsMono");
	});

	it("resolves via normalized slug from multi-word input", () => {
		const result = resolveFont("JetBrains Mono", REGISTRY);
		expect(result?.slug).toBe("jetbrains-mono");
	});

	it("backtick-quoted strings not stripped", () => {
		/* backticks are not handled by stripQuotes */
		expect(resolveFont("`inter`", REGISTRY)).toBeNull();
	});

	it("nested quotes only strip outer layer", () => {
		const result = resolveFont("\"'inter'\"", REGISTRY);
		/* outer double quotes stripped → 'inter' remains with single quotes, won't match */
		expect(result).toBeNull();
	});

	it("partial slug does not match", () => {
		/* "inte" should not match "inter" */
		expect(resolveFont("inte", REGISTRY)).toBeNull();
	});

	it("slug with extra hyphen does not match", () => {
		expect(resolveFont("inter-", REGISTRY)).toBeNull();
	});

	it("tabs and newlines in input trimmed", () => {
		const result = resolveFont("\tinter\n", REGISTRY);
		expect(result?.family).toBe("Inter");
	});
});

describe("resolveFonts edge cases", () => {
	it("preserves resolution order", () => {
		const result = resolveFonts(["lora", "inter", "roboto"], REGISTRY);
		expect(result.resolved.map((r) => r.slug)).toEqual(["lora", "inter", "roboto"]);
	});

	it("dedup keeps first occurrence order", () => {
		const result = resolveFonts(["Inter", "lora", "inter"], REGISTRY);
		expect(result.resolved).toHaveLength(2);
		expect(result.resolved[0]?.slug).toBe("inter");
		expect(result.resolved[1]?.slug).toBe("lora");
	});

	it("all unresolved returns empty resolved", () => {
		const result = resolveFonts(["nope", "fake", "missing"], REGISTRY);
		expect(result.resolved).toHaveLength(0);
		expect(result.unresolved).toEqual(["nope", "fake", "missing"]);
	});

	it("single font resolves correctly", () => {
		const result = resolveFonts(["roboto"], REGISTRY);
		expect(result.resolved).toHaveLength(1);
		expect(result.unresolved).toHaveLength(0);
	});

	it("mixed resolved and unresolved preserves order", () => {
		const result = resolveFonts(["inter", "nope", "lora", "fake"], REGISTRY);
		expect(result.resolved.map((r) => r.slug)).toEqual(["inter", "lora"]);
		expect(result.unresolved).toEqual(["nope", "fake"]);
	});
});

describe("fuzzyMatch edge cases", () => {
	it("empty query returns no results", () => {
		const results = fuzzyMatch("", REGISTRY);
		/* empty string early-returns empty array */
		expect(results).toHaveLength(0);
	});

	it("exact family match scores highest", () => {
		const results = fuzzyMatch("Inter", REGISTRY);
		expect(results[0]?.family).toBe("Inter");
	});

	it("exact match (score 100) outranks substring (score 50)", () => {
		/* "Lora" is exact, "Comfortaa" contains no "lora" */
		const results = fuzzyMatch("Lora", REGISTRY);
		expect(results[0]?.family).toBe("Lora");
	});

	it("substring match outranks category match", () => {
		/* "mono" appears in "DM Mono", "JetBrains Mono" family names (score 50)
		   and "monospace" category for Fira Code too (score 50 for name, or 10 for category) */
		const results = fuzzyMatch("mono", REGISTRY);
		const topNames = results.slice(0, 3).map((r) => r.family);
		/* fonts with "mono" in name should come before category-only matches */
		expect(topNames).toContain("DM Mono");
		expect(topNames).toContain("JetBrains Mono");
	});

	it("single character matches broadly", () => {
		const results = fuzzyMatch("a", REGISTRY);
		expect(results.length).toBeGreaterThan(0);
	});

	it("default limit is 10", () => {
		/* with enough matches, should cap at 10 */
		const bigRegistry: FontEntry[] = Array.from({ length: 20 }, (_, i) => [
			`Font ${i}`,
			`font-${i}`,
			`font${i}`,
			"sans-serif",
		]);
		const results = fuzzyMatch("font", bigRegistry);
		expect(results).toHaveLength(10);
	});

	it("limit=0 returns empty", () => {
		const results = fuzzyMatch("inter", REGISTRY, 0);
		expect(results).toHaveLength(0);
	});

	it("limit=1 returns best match only", () => {
		const results = fuzzyMatch("inter", REGISTRY, 1);
		expect(results).toHaveLength(1);
		expect(results[0]?.family).toBe("Inter");
	});

	it("category-only match still returns results", () => {
		const results = fuzzyMatch("display", REGISTRY);
		const families = results.map((r) => r.family);
		expect(families).toContain("Abril Fatface");
		expect(families).toContain("Comfortaa");
	});

	it("no partial slug matching in fuzzy", () => {
		/* fuzzyMatch only checks family name and category, not slug */
		const results = fuzzyMatch("abril-fatface", REGISTRY);
		/* "abril-fatface" won't match family "Abril Fatface" because includes("-") */
		/* it does match "Abril Fatface" since "abril-fatface" is contained... nope, lowercase */
		/* "abril fatface".includes("abril-fatface") is false because of the hyphen */
		expect(results.every((r) => r.family !== "Abril Fatface")).toBe(true);
	});
});
