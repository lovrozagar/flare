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

describe("extractDeclarations — the utility inside a wrapper (children and descendants)", () => {
	/* space-*, divide-* and the `*:`/`**:` variants put the class inside :where()/:is(). */
	it.each([
		[":where(.-space-x-2 > :not(:last-child))", "-space-x-2", ":where(& > :not(:last-child)) { margin: 0; }"],
		[":where(.divide-y > :not(:last-child))", "divide-y", ":where(& > :not(:last-child)) { margin: 0; }"],
		[":is(.\\*\\:p-2 > *)", "*:p-2", ":is(& > *) { margin: 0; }"],
		[
			':is(.\\*\\:data-\\[slot\\=avatar\\]\\:ring-2 > *)[data-slot="avatar"]',
			"*:data-[slot=avatar]:ring-2",
			':is(& > *)[data-slot="avatar"] { margin: 0; }',
		],
		[
			':is(.\\*\\*\\:data-\\[slot\\=x\\]\\:p-2 *)[data-slot="x"]',
			"**:data-[slot=x]:p-2",
			':is(& *)[data-slot="x"] { margin: 0; }',
		],
	])("%s becomes a nested rule on &", (selector, token, expected) => {
		expect(extractDeclarations(wrap(`${selector} { margin: 0; }`), [token])).toBe(expected);
	});

	it("keeps the at-rule around a wrapped utility", () => {
		const css = wrap("@media (hover: hover) { :is(.hover\\:\\*\\:p-2:hover > *) { margin: 0; } }");
		expect(extractDeclarations(css, ["hover:*:p-2"])).toBe("@media (hover: hover) { :is(&:hover > *) { margin: 0; } }");
	});

	it("does not match a longer class inside the wrapper", () => {
		expect(extractDeclarations(wrap(":where(.space-x-20 > :not(:last-child)) { margin: 0; }"), ["space-x-2"])).toBe("");
	});

	it("compiles the real Tailwind output for each", async () => {
		const tw = await initTailwindCompiler();
		for (const token of ["-space-x-2", "divide-y", "*:p-2", "*:data-[slot=avatar]:ring-2", "md:space-x-2"]) {
			expect(extractDeclarations(tw.build([token]), [token], tw.themeVars), token).toMatch(/&/);
		}
	});
});

describe("extractDeclarations — nested selector suffixes", () => {
	it("keeps the nested attribute variant", async () => {
		const tw = await initTailwindCompiler();
		const token = "aria-pressed:p-4";
		expect(extractDeclarations(tw.build([token]), [token], tw.themeVars)).toContain('[aria-pressed="true"]');
	});
});
