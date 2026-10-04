/** @vitest-environment node */
/*
 * Variants on the utility's own selector must keep the whole suffix, in both shapes Tailwind
 * emits: nested (`.u { &[x] { … } }`, Tailwind ≤ 4.3.2) and flattened (`.u[x] { … }`, 4.3.3+).
 */
import { describe, expect, it } from "vitest";
import { extractDeclarations, initTailwindCompiler } from "../../../src/plugins/tw-compile.ts";

const wrap = (rules: string) => `@layer utilities { ${rules} }`;

describe("extractDeclarations — flattened selector suffixes (Tailwind 4.3.3+)", () => {
	it.each([
		['.aria-pressed\\:p-4[aria-pressed="true"]', "aria-pressed:p-4", '&[aria-pressed="true"] { padding: 1rem; }'],
		[".data-\\[open\\]\\:p-4[data-open]", "data-[open]:p-4", "&[data-open] { padding: 1rem; }"],
		[".disabled\\:p-4:disabled", "disabled:p-4", "&:disabled { padding: 1rem; }"],
		[
			".focus-visible\\:disabled\\:p-4:focus-visible:disabled",
			"focus-visible:disabled:p-4",
			"&:focus-visible:disabled { padding: 1rem; }",
		],
		[
			'.rtl\\:p-4:where(:dir(rtl), [dir="rtl"], [dir="rtl"] *)',
			"rtl:p-4",
			'&:where(:dir(rtl), [dir="rtl"], [dir="rtl"] *) { padding: 1rem; }',
		],
	])("%s keeps its suffix", (selector, token, expected) => {
		expect(extractDeclarations(wrap(`${selector} { padding: 1rem; }`), [token])).toBe(expected);
	});

	it("keeps an attribute suffix inside an at-rule", () => {
		const css = wrap(
			'@media (hover: hover) { .hover\\:aria-pressed\\:p-4[aria-pressed="true"]:hover { padding: 1rem; } }',
		);
		expect(extractDeclarations(css, ["hover:aria-pressed:p-4"])).toBe(
			'@media (hover: hover) { &[aria-pressed="true"]:hover { padding: 1rem; } }',
		);
	});

	it("does not match a longer class that merely starts with the token", () => {
		expect(extractDeclarations(wrap(".p-40 { padding: 10rem; }"), ["p-4"])).toBe("");
	});
});

describe("extractDeclarations — nested selector suffixes", () => {
	it("keeps the nested attribute variant", async () => {
		const tw = await initTailwindCompiler();
		const token = "aria-pressed:p-4";
		expect(extractDeclarations(tw.build([token]), [token], tw.themeVars)).toContain('[aria-pressed="true"]');
	});
});
