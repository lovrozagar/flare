import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { breakdown } from "./breakdown.ts";

const budgetPath = new URL("./budget.json", import.meta.url);

// The budget measures what ships: the minified bundle, gzipped. The plain build's module list shows what it holds.
it("createPage alone", () => {
	const result = breakdown("shared/route-builder/page.ts", "createPage");
	expect(result.modules.map((share) => share.name).filter((name) => name.includes("client/navigation"))).toEqual([]);
	const budget = JSON.parse(readFileSync(budgetPath, "utf8")) as Record<string, number>;
	expect(budget.createPage).toBeTypeOf("number");
	expect(result.minified).toBeLessThanOrEqual(budget.createPage);
});
