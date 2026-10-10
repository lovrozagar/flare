import { describe, expectTypeOf, it } from "vitest";
import type { ExtractICUVars, FlatKeys } from "../../../src/i18n/index.ts";
import { createTranslator } from "../../../src/i18n/index.ts";

/* ── ExtractICUVars ───────────────────────────────────────────────── */

describe("ExtractICUVars", () => {
	it("extracts simple variable", () => {
		expectTypeOf<ExtractICUVars<"Hello, {name}!">>().toEqualTypeOf<"name">();
	});

	it("extracts multiple variables", () => {
		expectTypeOf<ExtractICUVars<"{a} and {b}">>().toEqualTypeOf<"a" | "b">();
	});

	it("extracts variable from plural block", () => {
		expectTypeOf<ExtractICUVars<"{count, plural, one{# item} other{# items}}">>().toEqualTypeOf<"count">();
	});

	it("extracts variable from select block", () => {
		expectTypeOf<ExtractICUVars<"{gender, select, male{He} female{She} other{They}}">>().toEqualTypeOf<"gender">();
	});

	it("extracts variable from number format", () => {
		expectTypeOf<ExtractICUVars<"{price, number}">>().toEqualTypeOf<"price">();
	});

	it("returns never for plain text", () => {
		expectTypeOf<ExtractICUVars<"Hello world">>().toEqualTypeOf<never>();
	});

	it("returns never for empty string", () => {
		expectTypeOf<ExtractICUVars<"">>().toEqualTypeOf<never>();
	});

	it("extracts mixed simple and plural vars", () => {
		expectTypeOf<ExtractICUVars<"Hi {name}, {count, plural, one{# msg} other{# msgs}}">>().toEqualTypeOf<
			"name" | "count"
		>();
	});

	it("handles select with single-word branch values without false positives", () => {
		/* "male{He}" — the { is preceded by "male" (word char) → filtered out */
		expectTypeOf<
			ExtractICUVars<"{role, select, admin{Admin panel} user{Dashboard} other{Home}}">
		>().toEqualTypeOf<"role">();
	});

	it("handles generic string as never (graceful degradation)", () => {
		expectTypeOf<ExtractICUVars<string>>().toEqualTypeOf<never>();
	});
});

/* ── Translator type-safe values ──────────────────────────────────── */

describe("Translator — type-safe values", () => {
	const dict = {
		common: {
			"app.name": "My App",
			greeting: "Hello {name}",
			items: "{count, plural, one{# item} other{# items}}",
			welcome: "Welcome {firstName} {lastName}",
		},
	} as const;

	it("allows no values for keys without variables", () => {
		const t = createTranslator(dict);
		const result: string = t("common.app.name");
		expectTypeOf(result).toBeString();
	});

	it("requires values for keys with variables", () => {
		const t = createTranslator(dict);
		/* @ts-expect-error — values required for key with {name} */
		t("common.greeting");
	});

	it("requires correct value keys", () => {
		const t = createTranslator(dict);
		/* @ts-expect-error — wrong key: "nme" instead of "name" */
		t("common.greeting", { nme: "World" });
	});

	it("accepts correct values", () => {
		const t = createTranslator(dict);
		const result: string = t("common.greeting", { name: "World" });
		expectTypeOf(result).toBeString();
	});

	it("requires values for plural keys", () => {
		const t = createTranslator(dict);
		/* @ts-expect-error — values required for key with {count} */
		t("common.items");
	});

	it("accepts correct plural values", () => {
		const t = createTranslator(dict);
		const result: string = t("common.items", { count: 5 });
		expectTypeOf(result).toBeString();
	});

	it("requires all variables for multi-var keys", () => {
		const t = createTranslator(dict);
		/* @ts-expect-error — missing lastName */
		t("common.welcome", { firstName: "John" });
	});

	it("accepts all variables for multi-var keys", () => {
		const t = createTranslator(dict);
		const result: string = t("common.welcome", { firstName: "John", lastName: "Doe" });
		expectTypeOf(result).toBeString();
	});

	it("rich() requires values when template has variables", () => {
		const t = createTranslator(dict);
		/* @ts-expect-error — values required */
		t.rich("common.greeting", { bold: (c) => c });
	});

	it("rich() accepts correct values", () => {
		const t = createTranslator(dict);
		t.rich("common.greeting", { bold: (c) => c }, { name: "World" });
	});
});

/* ── FlatKeys with never guard ────────────────────────────────────── */

describe("FlatKeys", () => {
	it("resolves to never when T is never", () => {
		expectTypeOf<FlatKeys<never>>().toEqualTypeOf<never>();
	});

	it("resolves key union from dict", () => {
		type D = { ns: { a: "x"; b: "y" } };
		expectTypeOf<FlatKeys<D>>().toEqualTypeOf<"ns.a" | "ns.b">();
	});
});
