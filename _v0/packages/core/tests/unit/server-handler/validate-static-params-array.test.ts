import { describe, expect, it } from "vitest";
import { validateStaticParams } from "../../../src/server-handler/validate-static-params.ts";

/**
 * String(["a","b"]) === String(["a,b"]) → both "a,b"
 * Catch-all route params compared with String() can falsely match
 * arrays with different structure but identical comma-joined representation.
 *
 * RED: These tests assert correct behavior and will FAIL against current code.
 */

function makeRoute(paramsList: Record<string, string | string[]>[]) {
	return {
		_type: "render" as const,
		cache: {
			ssg: () => paramsList,
		},
		variablePath: "",
		virtualPath: "_root_/test",
	};
}

describe("validateStaticParams array comparison", () => {
	it("rejects array param that matches different-structure array via String coercion", async () => {
		/* allowed: single-element ["a,b"], match: two-element ["a","b"] */
		const route = makeRoute([{ slug: ["a,b"] }]);
		const matchParams = { slug: ["a", "b"] };

		/* These are different values — should NOT match */
		const result = await validateStaticParams(
			[route as Parameters<typeof validateStaticParams>[0][number]],
			matchParams,
			true,
		);
		expect(result).toBe(false);
	});

	it("rejects string param matching array param via String coercion", async () => {
		/* allowed: string "a,b", match: array ["a","b"] */
		const route = makeRoute([{ slug: "a,b" }]);
		const matchParams = { slug: ["a", "b"] };

		/* string !== array — should NOT match */
		const result = await validateStaticParams(
			[route as Parameters<typeof validateStaticParams>[0][number]],
			matchParams,
			true,
		);
		expect(result).toBe(false);
	});

	it("accepts exact array match", async () => {
		const route = makeRoute([{ slug: ["docs", "api"] }]);
		const matchParams = { slug: ["docs", "api"] };

		const result = await validateStaticParams(
			[route as Parameters<typeof validateStaticParams>[0][number]],
			matchParams,
			true,
		);
		expect(result).toBe(true);
	});

	it("accepts exact string match", async () => {
		const route = makeRoute([{ slug: "hello" }]);
		const matchParams = { slug: "hello" };

		const result = await validateStaticParams(
			[route as Parameters<typeof validateStaticParams>[0][number]],
			matchParams,
			true,
		);
		expect(result).toBe(true);
	});

	it("rejects array of different length", async () => {
		const route = makeRoute([{ slug: ["a", "b", "c"] }]);
		const matchParams = { slug: ["a", "b"] };

		const result = await validateStaticParams(
			[route as Parameters<typeof validateStaticParams>[0][number]],
			matchParams,
			true,
		);
		expect(result).toBe(false);
	});
});
