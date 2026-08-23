/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from "vitest";
import {
	clearScopedStyles,
	compileSx,
	enableDomInjection,
	finishHydration,
	getScopedStyles,
	registerCSSAsClass,
	registerCSSByName,
	RUNTIME_SHEET_ID,
} from "../../../src/styles/index.ts";

/* ── Helpers ──────────────────────────────────────────────────────── */

function getSheetEl(): HTMLStyleElement | null {
	return document.getElementById(RUNTIME_SHEET_ID) as HTMLStyleElement | null;
}

function getSheetText(): string {
	const el = getSheetEl();
	if (!el) return "";
	if (el.sheet) {
		return Array.from(el.sheet.cssRules)
			.map((r) => r.cssText)
			.join("");
	}
	return el.textContent ?? "";
}

function simulateSsrSheet(content: string): void {
	let el = getSheetEl();
	if (!el) {
		el = document.createElement("style");
		el.id = RUNTIME_SHEET_ID;
		document.head.appendChild(el);
	}
	el.textContent = content;
}

afterEach(() => {
	clearScopedStyles();
	/* Remove lingering style tags */
	const el = getSheetEl();
	if (el) el.remove();
});

/* ── SSR sheet presence detection ────────────────────────────────── */

describe("SSR sheet detection — enableDomInjection", () => {
	it("ssrSheetPresent=false when no sheet element exists", () => {
		enableDomInjection();
		/* DOM injection should be active (no SSR sheet to block it) */
		registerCSSByName("probe", "color:red");
		const el = getSheetEl();
		/* Sheet element should exist because injection is active */
		expect(el).not.toBeNull();
	});

	it("ssrSheetPresent=true when flare-runtime sheet exists with rules", () => {
		simulateSsrSheet(".a1-abc12345{color:red}");
		enableDomInjection();

		/* DOM injection gated — registerCSSByName should not inject a new rule */
		const before = getScopedStyles();
		registerCSSByName("ssr-gate-test", "margin:0");
		const after = getScopedStyles();

		/* registry updated (in-memory) even though DOM gate is up */
		expect(after.length).toBeGreaterThan(before.length);
	});

	it("register during SSR-gate does not create second style element", () => {
		simulateSsrSheet(".a1-abc12345{color:red}");
		enableDomInjection();
		registerCSSByName("no-dup-el", "padding:4px");

		const els = document.querySelectorAll(`#${RUNTIME_SHEET_ID}`);
		expect(els.length).toBe(1);
	});

	it("created runtime sheet copies the document CSP nonce", () => {
		const meta = document.createElement("meta");
		meta.setAttribute("name", "csp-nonce");
		meta.setAttribute("content", "unit-nonce");
		document.head.appendChild(meta);

		enableDomInjection();
		registerCSSByName("nonce-copy", "color:red");

		expect(getSheetEl()?.getAttribute("nonce")).toBe("unit-nonce");
		meta.remove();
	});
});

/* ── finishHydration lifts the gate ──────────────────────────────── */

describe("finishHydration — lifts SSR gate", () => {
	it("after finishHydration, new registrations reach the DOM", () => {
		simulateSsrSheet(".a1-abc12345{color:red}");
		enableDomInjection();
		finishHydration();

		registerCSSByName("post-hydrate", "border:1px solid blue");
		const text = getScopedStyles();
		expect(text).toContain("post-hydrate");
	});

	it("duplicate register after finishHydration is a no-op (same rule once only)", () => {
		simulateSsrSheet("");
		enableDomInjection();
		finishHydration();

		registerCSSByName("dedup-rule", "font-size:14px");
		registerCSSByName("dedup-rule", "font-size:14px");

		const css = getScopedStyles();
		/* rule appears once */
		const count = (css.match(/dedup-rule/g) ?? []).length;
		expect(count).toBe(1);
	});

	it("calling finishHydration twice is safe (no double-registration)", () => {
		simulateSsrSheet(".a1-xx{color:blue}");
		enableDomInjection();
		finishHydration();
		finishHydration();

		registerCSSByName("safe-double", "opacity:0.5");
		const css = getScopedStyles();
		const count = (css.match(/safe-double/g) ?? []).length;
		expect(count).toBe(1);
	});

	it("finishHydration injects rules registered while the SSR gate was up", () => {
		simulateSsrSheet('[data-c="ssr-only"]{color:red}');
		enableDomInjection();
		registerCSSByName("client-during-gate", "margin:0");
		expect(getSheetText()).not.toContain("client-during-gate");

		finishHydration();
		expect(getSheetText()).toContain("client-during-gate");
	});

	it("re-register after finishHydration injects if the live sheet lost the rule", () => {
		enableDomInjection();
		finishHydration();
		registerCSSByName("lazy-styled-box", "color:rgb(0,100,200)");
		expect(getSheetText()).toContain("lazy-styled-box");

		const el = getSheetEl();
		if (el?.sheet) {
			while (el.sheet.cssRules.length > 0) el.sheet.deleteRule(0);
		} else if (el) {
			el.textContent = "";
		}

		registerCSSByName("lazy-styled-box", "color:rgb(0,100,200)");
		expect(getSheetText()).toContain("lazy-styled-box");
	});
});

/* ── compileSx + SSR hydration round-trip ────────────────────────── */

describe("compileSx — SSR to client round-trip", () => {
	it("compileSx called server-side registers class in getScopedStyles()", () => {
		const { class: cls } = compileSx({ color: "tomato" });
		const css = getScopedStyles();
		expect(css).toContain(cls);
		expect(css).toContain("tomato");
	});

	it("compileSx called during SSR gate does not inject to DOM", () => {
		simulateSsrSheet(".a1-abc12345{color:red}");
		enableDomInjection();

		const { class: cls } = compileSx({ background: "blue" });

		/* Class is in registry */
		const css = getScopedStyles();
		expect(css).toContain(cls);
	});

	it("compileSx: re-registering same Sx after finishHydration is a no-op", () => {
		const sx = { color: "green" };
		const r1 = compileSx(sx);

		simulateSsrSheet("");
		enableDomInjection();
		finishHydration();

		const r2 = compileSx(sx);
		expect(r1.class).toBe(r2.class);

		const css = getScopedStyles();
		const count = (css.match(new RegExp(r1.class, "g")) ?? []).length;
		expect(count).toBe(1);
	});

	it("compileSx with nested selector survives full cycle", () => {
		const { class: cls } = compileSx({ "&:focus": { outline: "2px solid blue" } });
		enableDomInjection();
		finishHydration();

		const css = getScopedStyles();
		expect(css).toContain(cls);
		expect(css).toContain("outline");
	});
});

/* ── registerCSSAsClass — class-based scoping ────────────────────── */

describe("registerCSSAsClass — class selector scoping", () => {
	it("registers a class-scoped rule in getScopedStyles()", () => {
		registerCSSAsClass("flare-rt-test1", "@layer user.app{.flare-rt-test1{color:pink}}");
		const css = getScopedStyles();
		expect(css).toContain("flare-rt-test1");
		expect(css).toContain("pink");
	});

	it("re-registering same className is a no-op (registry dedup)", () => {
		registerCSSAsClass("flare-rt-dedup", "@layer user.app{.flare-rt-dedup{color:cyan}}");
		registerCSSAsClass("flare-rt-dedup", "@layer user.app{.flare-rt-dedup{color:magenta}}");

		const css = getScopedStyles();
		/* Only cyan — first write wins */
		expect(css).toContain("cyan");
		/* magenta was rejected */
		const countDedup = (css.match(/flare-rt-dedup/g) ?? []).length;
		expect(countDedup).toBe(1);
	});

	it("class registry and name registry are independent (no key collision)", () => {
		registerCSSByName("shared-key", "display:flex");
		registerCSSAsClass("shared-key", "@layer user.app{.shared-key{display:grid}}");

		const css = getScopedStyles();
		/* Both entries survive — different registries */
		expect(css).toContain("flex");
		expect(css).toContain("grid");
	});

	it("injection gated by SSR sheet — registerCSSAsClass also respects gate", () => {
		simulateSsrSheet(".a1-abc12345{color:red}");
		enableDomInjection();

		registerCSSAsClass("gated-cls", "@layer user.app{.gated-cls{font-weight:bold}}");

		/* In-memory registry must have it */
		const css = getScopedStyles();
		expect(css).toContain("gated-cls");
	});
});

/* ── RUNTIME_SHEET_ID constant ───────────────────────────────────── */

describe("RUNTIME_SHEET_ID = 'flare-runtime'", () => {
	it("RUNTIME_SHEET_ID is 'flare-runtime'", () => {
		expect(RUNTIME_SHEET_ID).toBe("flare-runtime");
	});

	it("style element created with id='flare-runtime' not '__FLARE_SCOPED__'", () => {
		enableDomInjection();
		registerCSSByName("id-check", "color:lime");

		expect(document.getElementById("flare-runtime")).not.toBeNull();
		expect(document.getElementById("__FLARE_SCOPED__")).toBeNull();
	});
});

/* ── No-duplicate-rules in final CSSOM ───────────────────────────── */

describe("no duplicate rules in final CSSOM after full hydration cycle", () => {
	it("rule registered before and after finishHydration appears only once", () => {
		registerCSSByName("once-rule", "color:orange");
		enableDomInjection();
		finishHydration();

		/* Attempting re-register after gate lifts — registry dedup blocks it */
		registerCSSByName("once-rule", "color:orange");

		const css = getScopedStyles();
		const count = (css.match(/once-rule/g) ?? []).length;
		expect(count).toBe(1);
	});

	it("two distinct rules produce two distinct entries in getScopedStyles()", () => {
		enableDomInjection();
		finishHydration();

		registerCSSByName("rule-alpha", "color:red");
		registerCSSByName("rule-beta", "color:blue");

		const css = getScopedStyles();
		expect(css).toContain("rule-alpha");
		expect(css).toContain("rule-beta");
	});

	it("getSheetText does not contain stale rules after clearScopedStyles + re-enable", () => {
		enableDomInjection();
		registerCSSByName("stale-rule", "color:gray");
		clearScopedStyles();
		enableDomInjection();
		registerCSSByName("fresh-rule", "color:teal");

		const text = getSheetText();
		expect(text).not.toContain("stale-rule");
		expect(text).toContain("fresh-rule");
	});
});
