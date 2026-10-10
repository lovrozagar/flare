/**
 * Type-level test: verifies createTranslator infers keys from loaded object.
 * This file is NOT executed — only type-checked via tsc.
 */
import { createTranslator } from "../../../src/i18n/index.ts";

const loaded = {
	common: {
		"app.name": "My App",
		greeting: "Hello {name}",
	},
	products: {
		count: "...",
		title: "Products",
	},
} as const;

const t = createTranslator(loaded);

/* valid keys — should compile */
t("common.app.name");
t("common.greeting", { name: "World" });
t("products.title");
t("products.count", { count: 5 });

/* @ts-expect-error — invalid key within namespace */
t("common.nonexistent");

/* @ts-expect-error — invalid namespace */
t("invalid.namespace");

/* @ts-expect-error — empty string */
t("");

/* verify rich also has typed keys */
t.rich("common.greeting", { bold: (c) => c }, { name: "World" });

/* @ts-expect-error — rich with invalid key */
t.rich("common.nope", { bold: (c) => c });
