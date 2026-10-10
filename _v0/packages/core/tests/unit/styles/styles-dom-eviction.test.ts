/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	__setMaxRegistrySize,
	clearScopedStyles,
	enableDomInjection,
	registerCSSByName,
} from "../../../src/styles/index.ts";

beforeEach(() => {
	__setMaxRegistrySize(10);
	enableDomInjection();
});

afterEach(() => {
	clearScopedStyles();
	__setMaxRegistrySize(5000);
});

describe("Bug 50: DOM style element eviction sync", () => {
	function getSheetCSS(): string {
		const styleEl = document.getElementById("flare-runtime") as HTMLStyleElement | null;
		if (!styleEl?.sheet) return styleEl?.textContent ?? "";
		return Array.from(styleEl.sheet.cssRules)
			.map((r) => r.cssText)
			.join("");
	}

	it("should remove evicted entries from DOM when registry evicts", () => {
		for (let i = 0; i < 11; i++) {
			registerCSSByName(`e${i}`, `a{color:red}`);
		}

		const styleEl = document.getElementById("flare-runtime");
		expect(styleEl).toBeTruthy();
		const cssText = getSheetCSS();

		/* entry e0 was evicted — should be gone from DOM */
		expect(cssText).not.toContain("e0");

		/* entry e10 was just added — should be in DOM */
		expect(cssText).toContain("e10");
	});

	it("should have exactly maxRegistrySize entries in DOM after eviction", () => {
		for (let i = 0; i < 15; i++) {
			registerCSSByName(`f${i}`, `a{color:blue}`);
		}

		const cssText = getSheetCSS();

		/* 5 entries evicted (f0-f4), 10 remain (f5-f14) */
		for (let i = 0; i < 5; i++) {
			expect(cssText).not.toContain(`"f${i}"`);
		}
		for (let i = 5; i < 15; i++) {
			expect(cssText).toContain(`f${i}`);
		}
	});
});
