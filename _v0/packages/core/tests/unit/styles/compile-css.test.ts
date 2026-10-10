import { afterEach, describe, expect, it } from "vitest";
import { clearScopedStyles, compileCss, getScopedStyles, registerCSSAsClass } from "../../../src/styles/index.ts";

afterEach(() => {
	clearScopedStyles();
});

describe("compileCss — basic", () => {
	it("raw CSS text → returns class starting with flare-rt-", () => {
		const cls = compileCss("color: red;");
		expect(cls).toMatch(/^flare-rt-/);
	});

	it("raw CSS text → class registered in scoped styles", () => {
		const cls = compileCss("color: red;");
		const css = getScopedStyles();
		expect(css).toContain(`.${cls}`);
		expect(css).toContain("color");
		expect(css).toContain("red");
	});

	it("same text on two calls → same class, single registry entry (dedup)", () => {
		const cls1 = compileCss("padding: 1rem;");
		const cls2 = compileCss("padding: 1rem;");
		expect(cls1).toBe(cls2);
		const css = getScopedStyles();
		const matches = css.match(new RegExp(`\\.${cls1}`, "g"));
		expect(matches).toHaveLength(1);
	});
});

describe("compileCss — layer argument", () => {
	it("user.lib → registered CSS wrapped in @layer user.lib", () => {
		compileCss("color: red;", "user.lib");
		const css = getScopedStyles();
		expect(css).toContain("@layer user.lib");
	});

	it("default → @layer user.app", () => {
		compileCss("color: green;");
		const css = getScopedStyles();
		expect(css).toContain("@layer user.app");
	});
});

describe("compileCss — nested selector scoping", () => {
	it("&:hover in text → scoped to .flare-rt-<hash>:hover", () => {
		const cls = compileCss("&:hover { color: red; }");
		const css = getScopedStyles();
		expect(css).toContain(`.${cls}:hover`);
		expect(css).toContain("color");
		expect(css).toContain("red");
	});
});

describe("compileCss — at-rule", () => {
	it("@media wraps correctly in registered CSS", () => {
		const cls = compileCss("@media (min-width: 768px) { padding: 2rem; }");
		const css = getScopedStyles();
		expect(css).toContain("@media (min-width: 768px)");
		expect(css).toContain(`.${cls}`);
	});
});

describe("compileCss — empty text dedup path", () => {
	it("calling compileCss twice with same text → same class, single registry entry", () => {
		const cls1 = compileCss("display: flex;");
		const cls2 = compileCss("display: flex;");
		expect(cls1).toBe(cls2);
		const css = getScopedStyles();
		const count = (css.match(new RegExp(`\\.${cls1}`, "g")) ?? []).length;
		expect(count).toBe(1);
	});
});

describe("compileCss — complex CSS with nested selectors and at-rules", () => {
	it("scopes complex CSS to class (scopeCssToClass coverage)", () => {
		const text = `color: blue; &:hover { color: red; } @media (min-width:768px) { font-size: 1.25rem; }`;
		const cls = compileCss(text);
		const css = getScopedStyles();
		expect(css).toContain(`.${cls}`);
		expect(css).toContain(`:hover`);
		expect(css).toContain(`@media`);
	});
});

describe("compileCss — empty string input", () => {
	it("empty string → returns a class name (no crash, no content in scoped styles body)", () => {
		/*
		 * trimmed = "", hash computed from "", cls = "flare-rt-<hash>".
		 * scopeCssToClass(cls, "") → scopeCSS(sentinel, "") → "" (early return on empty).
		 * wrapInLayer("", layer) → "@layer user.app{}".
		 * registerCSSAsClass stores that; getScopedStyles contains it.
		 */
		const cls = compileCss("");
		expect(cls).toMatch(/^flare-rt-/);
		const css = getScopedStyles();
		expect(css).toContain("@layer user.app");
	});

	it("empty string called twice → same class (dedup)", () => {
		const cls1 = compileCss("");
		const cls2 = compileCss("");
		expect(cls1).toBe(cls2);
	});

	it("whitespace-only string → same class as empty (trimmed to same hash)", () => {
		const clsEmpty = compileCss("");
		clearScopedStyles();
		const clsWs = compileCss("   ");
		expect(clsEmpty).toBe(clsWs);
	});
});

describe("registerCSSAsClass — dedup (classRegistry.has branch)", () => {
	it("registering same class twice → second call is a no-op, returns same class", () => {
		const cls = "flare-rt-test-dedup";
		const cssText = "@layer user.app{.flare-rt-test-dedup{color:red}}";
		const r1 = registerCSSAsClass(cls, cssText);
		const r2 = registerCSSAsClass(cls, cssText);
		expect(r1).toBe(cls);
		expect(r2).toBe(cls);
		/* Only one entry in registry for this class */
		const out = getScopedStyles();
		const count = (out.match(new RegExp("flare-rt-test-dedup", "g")) ?? []).length;
		expect(count).toBe(1);
	});
});
