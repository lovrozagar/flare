import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	clearScopedStyles,
	getScopedStyles,
	registerCSS,
	registerCSSByName,
	styles,
} from "../../../src/styles/index.ts";

beforeEach(() => {
	clearScopedStyles();
});

afterEach(() => {
	clearScopedStyles();
});

/* ── Registry FIFO eviction ───────────────────────────────────────── */

describe("styles registry — FIFO eviction", () => {
	it("register 5001 styles: oldest evicted", () => {
		const firstHash = registerCSS(".first { color: red }");

		/* Register 5000 more */
		for (let i = 1; i <= 5000; i++) {
			registerCSS(`.style-${i} { color: blue }`);
		}

		const allStyles = getScopedStyles();
		/* First style should have been evicted */
		expect(allStyles).not.toContain('[data-c="' + firstHash + '"]');
	});

	it("registry size never exceeds 5001 during eviction", () => {
		for (let i = 0; i < 5010; i++) {
			registerCSS(`.s-${i} { color: red }`);
		}
		/* getScopedStyles returns joined values — count by selector occurrences */
		const count = getScopedStyles().split("[data-c=").length - 1;
		expect(count).toBeLessThanOrEqual(5001);
	});

	it("re-registering after eviction re-adds the style", () => {
		const css = ".unique { display: flex }";
		const hash = registerCSS(css);

		/* Evict by filling registry */
		for (let i = 0; i < 5001; i++) {
			registerCSS(`.filler-${i} { margin: 0 }`);
		}
		expect(getScopedStyles()).not.toContain(`[data-c="${hash}"]`);

		/* Re-register — should work */
		const hash2 = registerCSS(css);
		expect(hash2).toBe(hash);
		expect(getScopedStyles()).toContain(`[data-c="${hash}"]`);
	});
});

/* ── Duplicate registration ───────────────────────────────────────── */

describe("styles registry — duplicate handling", () => {
	it("same name registered twice: first wins, second is no-op", () => {
		registerCSSByName("my-component", ".a { color: red }");
		registerCSSByName("my-component", ".b { color: blue }");

		const all = getScopedStyles();
		expect(all).toContain("color:red");
		expect(all).not.toContain("color:blue");
	});

	it("same CSS content: same hash, registered once", () => {
		const h1 = registerCSS(".x { display: flex }");
		const h2 = registerCSS(".x { display: flex }");
		expect(h1).toBe(h2);
	});
});

/* ── Empty inputs ─────────────────────────────────────────────────── */

describe("styles — empty inputs", () => {
	it("styles() with empty string returns data-c attribute", () => {
		const result = styles("empty-test", "");
		expect(result["data-c"]).toBeDefined();
	});

	it("styles() with config object but no css/tw/vars/state", () => {
		const result = styles("min-test", {});
		expect(result["data-c"]).toBeDefined();
	});
});

/* ── CSS variable indexing ────────────────────────────────────────── */

describe("styles — CSS variables", () => {
	it("vars are alphabetically sorted in indexed names", () => {
		const result = styles("var-test", {
			css: (_, v) => `.root { background: ${v.zebra}; color: ${v.apple} }`,
			vars: { apple: "red", zebra: "striped" },
		});
		/* apple → --_0 (first alphabetically), zebra → --_1 */
		expect(result.style).toBeDefined();
		expect((result.style as Record<string, string>)["--_0"]).toBe("red");
		expect((result.style as Record<string, string>)["--_1"]).toBe("striped");
	});
});

/* ── State selectors ──────────────────────────────────────────────── */

describe("styles — state selectors", () => {
	it("state produces data-* attributes", () => {
		const result = styles("state-test", {
			state: { active: true, mode: "dark" },
		});
		expect(result["data-active"]).toBe("true");
		expect(result["data-mode"]).toBe("dark");
	});

	it("state with false value", () => {
		const result = styles("state-false", {
			state: { active: false },
		});
		expect(result["data-active"]).toBe("false");
	});

	it("state with numeric value", () => {
		const result = styles("state-num", {
			state: { count: 42 },
		});
		expect(result["data-count"]).toBe("42");
	});
});
