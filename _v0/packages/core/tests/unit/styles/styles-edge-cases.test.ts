import { afterEach, describe, expect, it } from "vitest";
import { clearScopedStyles, getScopedStyles, registerCSS, styles } from "../../../src/styles/index.ts";

afterEach(() => {
	clearScopedStyles();
});

describe("hashString edge cases", () => {
	it("empty string produces valid hash", () => {
		const hash = registerCSS("");
		expect(typeof hash).toBe("string");
		expect(hash.length).toBeGreaterThan(0);
	});

	it("single character produces valid hash", () => {
		const h1 = registerCSS("a");
		const h2 = registerCSS("b");
		expect(h1).not.toBe(h2);
	});

	it("unicode emoji strings produce distinct hashes", () => {
		const hashes = new Set<string>();
		for (const str of ["\u{1F525}", "\u{1F389}", "\u2764\uFE0F", "\u{1F680}", "\u{1F480}", "\u{1F525}\u{1F389}"]) {
			hashes.add(registerCSS(str));
		}
		expect(hashes.size).toBe(6);
	});

	it("zero-width chars produce distinct hashes", () => {
		const a = registerCSS("a\u200Bb");
		const b = registerCSS("ab");
		expect(a).not.toBe(b);
	});

	it("very long string (10K chars) hashes without error", () => {
		const long = "x".repeat(10000);
		const hash = registerCSS(long);
		expect(hash.length).toBeGreaterThan(0);
	});

	it("strings differing only in last char produce distinct hashes", () => {
		const a = registerCSS("background-color: re");
		const b = registerCSS("background-color: rf");
		expect(a).not.toBe(b);
	});

	it("strings differing only in first char produce distinct hashes", () => {
		const a = registerCSS("apadding: 1rem");
		const b = registerCSS("bpadding: 1rem");
		expect(a).not.toBe(b);
	});
});

describe("scopeCSS edge cases", () => {
	it("whitespace-only CSS produces no output", () => {
		styles("ws", "   \t\n  ");
		const css = getScopedStyles();
		expect(css).not.toContain("ws");
	});

	it("single declaration without semicolon", () => {
		styles("no-semi", "color: red");
		const css = getScopedStyles();
		expect(css).toContain('[data-c="no-semi"]');
		expect(css).toContain("color:red");
	});

	it("nested at-rules: @media inside @supports", () => {
		styles("nested-at", "@supports (display: grid) { @media (min-width: 768px) { display: grid } }");
		const css = getScopedStyles();
		expect(css).toContain("@supports");
		expect(css).toContain("@media");
		expect(css).toContain("display:grid");
	});

	it("multiple & in selector", () => {
		styles("multi-amp", "&:hover&:focus { color: blue }");
		const css = getScopedStyles();
		expect(css).toContain('[data-c="multi-amp"]:hover');
		expect(css).toContain(":focus");
	});

	it("& in middle of selector", () => {
		styles("mid-amp", ".parent &:hover { color: red }");
		const css = getScopedStyles();
		expect(css).toContain('[data-c="mid-amp"]');
	});

	it("plain declarations mixed with rule blocks", () => {
		styles("mixed", "padding: 1rem; .child { color: red }");
		const css = getScopedStyles();
		expect(css).toContain('[data-c="mixed"]');
	});

	it("deeply nested braces (5 levels)", () => {
		const deep =
			"@media (min-width: 768px) { @supports (display: grid) { &:hover { @media (color) { @supports (gap: 1rem) { display: flex } } } } }";
		styles("deep", deep);
		const css = getScopedStyles();
		expect(css).toContain("display:flex");
	});

	it("CSS with url() containing braces", () => {
		styles("url-braces", 'background: url("data:image/svg+xml,<svg>{}</svg>"); color: red');
		const css = getScopedStyles();
		expect(css).toContain('[data-c="url-braces"]');
		expect(css).toContain("color:red");
	});

	it("CSS with block comment containing braces", () => {
		styles("comment-braces", "/* { } */ color: red");
		const css = getScopedStyles();
		expect(css).toContain("color:red");
	});

	it("@keyframes passes through unscoped", () => {
		styles("kf", "@keyframes spin { from { transform: rotate(0) } to { transform: rotate(360deg) } }");
		const css = getScopedStyles();
		expect(css).toContain("@keyframes spin");
		expect(css).not.toContain('[data-c="kf"] @keyframes');
	});
});

describe("findMatchingBrace edge cases", () => {
	it("escaped quotes inside string literals", () => {
		/* Use template literal to avoid JS string escape issues */
		styles("esc-quote", `content: "it's \\"escaped\\""; color: blue`);
		const css = getScopedStyles();
		expect(css).toContain("color:blue");
	});

	it("url() with query params", () => {
		styles("url-query", "background: url(/img.png?w=100&h=200); color: red");
		const css = getScopedStyles();
		expect(css).toContain("color:red");
	});

	it("unquoted url() with escaped parens", () => {
		styles("url-esc", "background: url(data:image/svg\\)test); padding: 0");
		const css = getScopedStyles();
		expect(css).toContain("padding:0");
	});
});

describe("createVarAccessors edge cases", () => {
	it("empty vars object produces no style map", () => {
		const result = styles("empty-vars", {
			vars: {},
		});
		expect(result.style).toBeUndefined();
	});

	it("var value containing var() reference", () => {
		const result = styles("var-in-var", {
			css: (_s, v) => `color: ${v.x}`,
			vars: { x: "var(--other)" },
		});
		expect(result.style?.["--_0"]).toBe("var(--other)");
	});

	it("numeric var value coerced to string", () => {
		const result = styles("num-var", {
			css: (_s, v) => `opacity: ${v.opacity}`,
			vars: { opacity: 0.5 as unknown as string },
		});
		expect(result.style?.["--_0"]).toBe("0.5");
	});

	it("boolean var value coerced to string", () => {
		const result = styles("bool-var", {
			css: (_s, v) => `--flag: ${v.flag}`,
			vars: { flag: true as unknown as string },
		});
		expect(result.style?.["--_0"]).toBe("true");
	});
});

describe("createStateSelectors edge cases", () => {
	it("state value with special chars escaped in attribute", () => {
		styles("state-special", {
			css: (s) => `${s.status('a"b')} { color: red }`,
			state: { status: 'a"b' as string },
		});
		const css = getScopedStyles();
		expect(css).toContain("data-status=");
	});

	it("state value with backslash", () => {
		styles("state-bs", {
			css: (s) => `${s.mode("a\\b")} { color: red }`,
			state: { mode: "a\\b" as string },
		});
		const css = getScopedStyles();
		expect(css).toContain("color:red");
	});
});

describe("styles() full config edge cases", () => {
	it("css function returns empty string produces no CSS", () => {
		styles("empty-css-fn", {
			css: () => "",
		});
		const css = getScopedStyles();
		expect(css).not.toContain("empty-css-fn");
	});

	it("outerCss alone without css", () => {
		const result = styles("outer-only", {
			outerCss: "padding: 2rem",
		});
		const css = getScopedStyles();
		expect(css).toContain("padding:2rem");
		expect(result["data-c"]).toContain("outer-only-");
	});

	it("tw + css merge in styles()", () => {
		styles("tw-css", {
			css: () => "color: red",
			tw: "display: flex",
		});
		const css = getScopedStyles();
		expect(css).toContain("display:flex");
		expect(css).toContain("color:red");
	});

	it("tw + outerCss + css all combined", () => {
		styles("all-three", {
			css: () => "margin: 0",
			outerCss: "border: 1px solid",
			tw: "display: grid",
		});
		const css = getScopedStyles();
		expect(css).toContain("display:grid");
		expect(css).toContain("margin:0");
		expect(css).toContain("border:1px solid");
	});
});

describe("registry LRU eviction", () => {
	it("evicts oldest entries when exceeding MAX_REGISTRY_SIZE", () => {
		const firstHash = registerCSS("first-entry-css");
		for (let i = 0; i < 5000; i++) {
			registerCSS(`eviction-test-${i}`);
		}
		/* Re-register — hash should be deterministic even after eviction */
		const reHash = registerCSS("first-entry-css");
		expect(reHash).toBe(firstHash);
	});
});
