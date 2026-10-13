import { expect, it } from "vitest";
import { breakdown } from "./breakdown.ts";

it("per module shape", async () => {
	const result = await breakdown("shared/route-builder/page.ts", "createPage");
	expect(result.modules.map((share) => share.name)).toEqual([
		"src/shared/route-builder/boundaries.ts",
		"src/shared/route-builder/chain.ts",
		"src/shared/route-builder/page.ts",
		"entry",
	]);
	for (const share of [...result.modules, ...result.declarations]) {
		expect(share.gzip).toBeGreaterThanOrEqual(0);
		expect(share.raw).toBeGreaterThan(0);
	}
	expect(result.declarations.map((share) => share.name)).toEqual(
		expect.arrayContaining(["withBoundaries", "createChain", "advance", "createPage"]),
	);
	// The budget measures the minified bundle, which is smaller than the plain one.
	expect(result.minified).toBeGreaterThan(0);
	expect(result.minified).toBeLessThan(result.plain);
});
