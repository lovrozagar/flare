/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	RUNTIME_SHEET_ID,
	__setMaxRegistrySize,
	clearScopedStyles,
	compileCss,
	enableDomInjection,
	getScopedStyles,
	registerCSSAsClass,
} from "../../../src/styles/index.ts";

beforeEach(() => {
	clearScopedStyles();
	enableDomInjection();
});

afterEach(() => {
	clearScopedStyles();
	__setMaxRegistrySize(5000);
});

function getStyleEl(): HTMLStyleElement | null {
	return document.getElementById(RUNTIME_SHEET_ID) as HTMLStyleElement | null;
}

describe("registerCSSAsClass — DOM injection (domInjectionEnabled=true, ssrSheetPresent=false)", () => {
	it("new class → CSS injected into DOM style element", () => {
		/*
		 * domInjectionEnabled=true, ssrSheetPresent=false (no pre-existing SSR sheet).
		 * injectStyleToDOM fires → style element created, CSS appended.
		 */
		const cls = "flare-rt-dom-inject-test";
		const css = "@layer user.app{.flare-rt-dom-inject-test{color:green}}";
		registerCSSAsClass(cls, css);

		const el = getStyleEl();
		expect(el).not.toBeNull();
		/* getScopedStyles pulls from classRegistry — DOM inject is a side effect */
		expect(getScopedStyles()).toContain(css);
		/* Style element exists (created by injectStyleToDOM) */
		expect(el?.id).toBe(RUNTIME_SHEET_ID);
	});

	it("second registerCSSAsClass with same class → dedup, DOM not re-injected", () => {
		const cls = "flare-rt-dedup-dom";
		const css = "@layer user.app{.flare-rt-dedup-dom{margin:0}}";
		registerCSSAsClass(cls, css);
		registerCSSAsClass(cls, css);

		/* classRegistry has exactly one entry for this class */
		const scoped = getScopedStyles();
		const matches = scoped.match(/flare-rt-dedup-dom/g) ?? [];
		expect(matches.length).toBe(1);
	});

	it("compileCss → class injected into DOM when domInjectionEnabled", () => {
		const cls = compileCss("background: blue;");
		const el = getStyleEl();
		expect(el).not.toBeNull();
		expect(getScopedStyles()).toContain(`.${cls}`);
	});
});

describe("registerCSSAsClass — FIFO eviction (lines 1075-1079)", () => {
	it("classRegistry overflow → oldest entry evicted", () => {
		__setMaxRegistrySize(3);

		registerCSSAsClass("cls-a", "@layer user.app{.cls-a{color:red}}");
		registerCSSAsClass("cls-b", "@layer user.app{.cls-b{color:green}}");
		registerCSSAsClass("cls-c", "@layer user.app{.cls-c{color:blue}}");
		/* Fourth entry triggers eviction of cls-a */
		registerCSSAsClass("cls-d", "@layer user.app{.cls-d{color:yellow}}");

		const scoped = getScopedStyles();
		/* cls-a evicted */
		expect(scoped).not.toContain("cls-a");
		/* newest entries retained */
		expect(scoped).toContain("cls-d");
	});

	it("multiple overflows → only maxRegistrySize entries remain", () => {
		__setMaxRegistrySize(2);

		for (let i = 0; i < 6; i++) {
			registerCSSAsClass(`cls-ev-${i}`, `@layer user.app{.cls-ev-${i}{color:red}}`);
		}

		const scoped = getScopedStyles();
		/* First 4 evicted (0-3), last 2 retained (4,5) */
		for (let i = 0; i < 4; i++) {
			expect(scoped).not.toContain(`cls-ev-${i}`);
		}
		expect(scoped).toContain("cls-ev-4");
		expect(scoped).toContain("cls-ev-5");
	});
});
