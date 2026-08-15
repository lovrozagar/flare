import { describe, expect, it } from "vitest";

/* ── Revalidation query param splitting edge cases ── */

describe("revalidation query param splitting", () => {
	function parseTags(param: string | null): string[] | undefined {
		/* Mirrors fixed server-handler/index.ts:440 */
		return param
			? param
					.split(",")
					.map((s) => s.trim())
					.filter(Boolean)
			: undefined;
	}

	it("null param → undefined", () => {
		expect(parseTags(null)).toBeUndefined();
	});

	it("normal comma-separated → clean array", () => {
		expect(parseTags("product,featured,blog")).toEqual(["product", "featured", "blog"]);
	});

	it("spaces around commas → trimmed", () => {
		expect(parseTags("product, featured, blog")).toEqual(["product", "featured", "blog"]);
	});

	it("trailing comma → empty string filtered out", () => {
		expect(parseTags("product,featured,")).toEqual(["product", "featured"]);
	});

	it("whitespace-only value → filtered out (empty result)", () => {
		const result = parseTags(" ");
		expect(result).toEqual([]);
	});

	it("empty string param → falsy → undefined", () => {
		expect(parseTags("")).toBeUndefined();
	});

	it("single tag works", () => {
		expect(parseTags("users")).toEqual(["users"]);
	});
});
