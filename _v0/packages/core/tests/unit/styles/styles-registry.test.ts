import { afterEach, describe, expect, it } from "vitest";
import {
	clearScopedStyles,
	forceRegisterCSSByName,
	getScopedStyles,
	registerCSSByName,
} from "../../../src/styles/index.ts";

afterEach(() => {
	clearScopedStyles();
});

describe("styles registry size bound", () => {
	it("evicts oldest entries when exceeding max size", () => {
		for (let i = 0; i < 5010; i++) {
			registerCSSByName(`entry-${i}`, `color: red-${i}`);
		}
		const css = getScopedStyles();
		/* Oldest entries evicted — use exact selector to avoid substring matches */
		expect(css).not.toContain('[data-c="entry-0"]');
		expect(css).not.toContain('[data-c="entry-9"]');
		/* Newest entries should exist */
		expect(css).toContain('[data-c="entry-5009"]');
		expect(css).toContain('[data-c="entry-5000"]');
		/* Entry just past eviction boundary should exist */
		expect(css).toContain('[data-c="entry-10"]');
	});

	it("adding one entry past limit evicts exactly one oldest entry", () => {
		for (let i = 0; i < 5000; i++) {
			registerCSSByName(`item-${i}`, `color: blue-${i}`);
		}
		registerCSSByName("new-item", "color: green");
		const css = getScopedStyles();
		/* item-0 evicted as oldest — use exact selector */
		expect(css).not.toContain('[data-c="item-0"]');
		/* new item and latest items exist */
		expect(css).toContain('[data-c="new-item"]');
		expect(css).toContain('[data-c="item-4999"]');
		/* item-1 should still exist (only 1 evicted) */
		expect(css).toContain('[data-c="item-1"]');
	});

	it("clearScopedStyles resets size", () => {
		for (let i = 0; i < 100; i++) {
			registerCSSByName(`c-${i}`, `margin: ${i}px`);
		}
		clearScopedStyles();
		expect(getScopedStyles()).toBe("");
		/* Can register again after clear */
		registerCSSByName("fresh", "padding: 1rem");
		expect(getScopedStyles()).toContain("fresh");
	});
});

describe("forceRegisterCSSByName", () => {
	it("inserts a new entry when name is not yet registered", () => {
		forceRegisterCSSByName("new-entry", "color: green");
		expect(getScopedStyles()).toContain('[data-c="new-entry"]');
	});

	it("updates an existing entry — old css gone, new css present", () => {
		registerCSSByName("my-entry", "color: red");
		expect(getScopedStyles()).toContain('[data-c="my-entry"]');

		forceRegisterCSSByName("my-entry", "color: blue");
		const css = getScopedStyles();
		/* New value present (minified — spaces stripped) */
		expect(css).toContain('[data-c="my-entry"]');
		expect(css).toContain("color:blue");
		/* Old value gone */
		expect(css).not.toContain("color:red");
	});

	it("calling twice with same name keeps only the last value", () => {
		forceRegisterCSSByName("key", "padding: 1rem");
		forceRegisterCSSByName("key", "padding: 2rem");
		const css = getScopedStyles();
		/* Minified — spaces stripped */
		expect(css).toContain("padding:2rem");
		expect(css).not.toContain("padding:1rem");
	});
});
