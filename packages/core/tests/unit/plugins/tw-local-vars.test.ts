/** @vitest-environment node */
/*
 * Tailwind's `--tw-*` variables are element-local (shadow, ring, transform and filter stacks).
 * Inlining them bakes one utility's value into another (`ring-1` rendering `shadow-sm`'s shadow)
 * and breaks composition; they must stay `var()` and ship with their `@property` rules.
 */
import { describe, expect, it } from "vitest";
import { extractDeclarations, extractPropertyRules, initTailwindCompiler } from "../../../src/plugins/tw-compile.ts";

async function compileAll(tokens: string[]) {
	const tw = await initTailwindCompiler();
	return Object.fromEntries(
		tokens.map((token) => [token, extractDeclarations(tw.build([token]), [token], tw.themeVars)]),
	) as Record<string, string>;
}

describe("Tailwind local variables", () => {
	it("never inlines one utility's --tw-* value into another", async () => {
		const decls = await compileAll(["shadow-sm", "ring-1"]);
		expect(decls["ring-1"]).not.toContain("rgb(0 0 0 / 0.1)");
		expect(decls["ring-1"]).toContain("var(--tw-shadow)");
		expect(decls["shadow-sm"]).toContain("var(--tw-ring-shadow)");
	});

	it("keeps transform stacks composable", async () => {
		const decls = await compileAll(["scale-x-50", "scale-y-75"]);
		expect(decls["scale-x-50"]).toContain("var(--tw-scale-y)");
		expect(decls["scale-y-75"]).toContain("var(--tw-scale-x)");
	});

	it("still inlines real theme variables", async () => {
		const tw = await initTailwindCompiler();
		expect(extractDeclarations(tw.build(["p-4"]), ["p-4"], tw.themeVars)).toBe("padding: calc(0.25rem * 4);");
	});

	it("treats an arbitrary custom property as the element's, not the theme's", async () => {
		/* A component sets `[--panel-width:75%]` on one variant and reads `w-(--panel-width)`:
		   neither inlining the value nor hoisting it to :root may reach another element. */
		const tw = await initTailwindCompiler();
		const tokens = ["[--panel-width:75%]", "data-[open]:[--panel-gap:1rem]", "w-(--panel-width)", "gap-(--panel-gap)"];
		const decls = Object.fromEntries(
			tokens.map((token) => [token, extractDeclarations(tw.build([token]), [token], tw.themeVars)]),
		) as Record<string, string>;
		expect(tw.themeVars.has("--panel-width")).toBe(false);
		expect(tw.themeVars.has("--panel-gap")).toBe(false);
		expect(decls["w-(--panel-width)"]).toBe("width: var(--panel-width);");
		expect(decls["gap-(--panel-gap)"]).toBe("gap: var(--panel-gap);");
	});

	it("extracts the @property rules a utility needs", async () => {
		const tw = await initTailwindCompiler();
		const rules = extractPropertyRules(tw.build(["shadow-sm"]));
		expect(rules.get("--tw-shadow")).toBe(
			'@property --tw-shadow { syntax: "*"; inherits: false; initial-value: 0 0 #0000; }',
		);
		expect(rules.has("--tw-ring-shadow")).toBe(true);
	});
});
