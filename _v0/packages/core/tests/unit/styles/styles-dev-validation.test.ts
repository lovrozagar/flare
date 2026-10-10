import { afterEach, describe, expect, it, vi } from "vitest";
import { clearScopedStyles, registerCSSByName, styles } from "../../../src/styles/index.ts";

afterEach(() => {
	clearScopedStyles();
	vi.restoreAllMocks();
});

describe("dev CSS validation — structural", () => {
	it("warns on unbalanced braces (more opens)", () => {
		const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
		styles("bad-braces", "color: red; .child { font-size: 12px");
		expect(spy).toHaveBeenCalledWith(expect.stringContaining("[flare:styles]"), expect.stringContaining("unbalanced"));
	});

	it("warns on unbalanced braces (more closes)", () => {
		const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
		styles("bad-braces2", "color: red; } }");
		expect(spy).toHaveBeenCalledWith(expect.stringContaining("[flare:styles]"), expect.stringContaining("unbalanced"));
	});

	it("warns on unclosed string", () => {
		const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
		styles("bad-string", 'content: "unclosed');
		expect(spy).toHaveBeenCalledWith(
			expect.stringContaining("[flare:styles]"),
			expect.stringContaining("unclosed string"),
		);
	});

	it("warns on unclosed comment", () => {
		const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
		styles("bad-comment", "/* unclosed comment color: red");
		expect(spy).toHaveBeenCalledWith(
			expect.stringContaining("[flare:styles]"),
			expect.stringContaining("unclosed comment"),
		);
	});
});

describe("dev CSS validation — declarations", () => {
	it("warns on missing colon in declaration", () => {
		const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
		styles("no-colon", "color red");
		expect(spy).toHaveBeenCalledWith(expect.stringContaining("[flare:styles]"), expect.stringContaining("colon"));
	});

	it("warns on empty value after colon", () => {
		const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
		styles("empty-val", "color: ;");
		expect(spy).toHaveBeenCalledWith(expect.stringContaining("[flare:styles]"), expect.stringContaining("empty value"));
	});

	it("warns on declaration missing colon among valid ones", () => {
		const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
		styles("mixed-bad", "color: red; padding 4px; margin: 0");
		expect(spy).toHaveBeenCalledWith(expect.stringContaining("[flare:styles]"), expect.stringContaining("colon"));
	});

	it("warns on registerCSSByName with invalid css", () => {
		const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
		registerCSSByName("direct-bad", "color: ; padding: 1rem");
		expect(spy).toHaveBeenCalledWith(expect.stringContaining("[flare:styles]"), expect.stringContaining("empty value"));
	});

	it("includes component name in warning", () => {
		const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
		styles("my-widget", "color red");
		expect(spy).toHaveBeenCalledWith(expect.anything(), expect.stringContaining("my-widget"));
	});
});

describe("dev CSS validation — missing semicolons", () => {
	it("warns on missing semicolon between two declarations", () => {
		const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
		styles("no-semi", "color: red padding: 4px");
		expect(spy).toHaveBeenCalledWith(
			expect.stringContaining("[flare:styles]"),
			expect.stringContaining("missing semicolon"),
		);
	});

	it("warns on missing semicolon with three declarations", () => {
		const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
		styles("no-semi3", "color: red padding: 4px margin: 0");
		expect(spy).toHaveBeenCalledWith(
			expect.stringContaining("[flare:styles]"),
			expect.stringContaining("missing semicolon"),
		);
	});

	it("warns on missing semicolon before last declaration", () => {
		const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
		styles("no-semi-last", "color: red; padding: 4px margin: 0");
		expect(spy).toHaveBeenCalledWith(
			expect.stringContaining("[flare:styles]"),
			expect.stringContaining("missing semicolon"),
		);
	});

	it("mentions the property name in missing semicolon warning", () => {
		const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
		styles("semi-name", "color: red padding: 4px");
		expect(spy).toHaveBeenCalledWith(expect.anything(), expect.stringContaining("padding"));
	});

	it("does not false-positive on shorthand values with spaces", () => {
		const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
		styles("shorthand", "border: 1px solid red; margin: 0 auto");
		expect(spy).not.toHaveBeenCalled();
	});

	it("does not false-positive on font shorthand", () => {
		const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
		styles("font", "font: 16px/1.5 Arial, sans-serif");
		expect(spy).not.toHaveBeenCalled();
	});

	it("does not false-positive on var() with fallback containing colon", () => {
		const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
		styles("var-fb", "color: var(--c, red); padding: 4px");
		expect(spy).not.toHaveBeenCalled();
	});

	it("does not false-positive on url() with protocol colon", () => {
		const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
		styles("url-proto", 'background: url("https://example.com"); color: red');
		expect(spy).not.toHaveBeenCalled();
	});
});

describe("dev CSS validation — no false positives", () => {
	it("valid simple declarations", () => {
		const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
		styles("valid", "color: red; padding: 1rem");
		expect(spy).not.toHaveBeenCalled();
	});

	it("valid nested rules", () => {
		const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
		styles("valid-nested", "&:hover { color: blue } @media (min-width: 768px) { padding: 2rem }");
		expect(spy).not.toHaveBeenCalled();
	});

	it("valid strings containing braces", () => {
		const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
		styles("valid-string", 'content: "{ hello }"; color: red');
		expect(spy).not.toHaveBeenCalled();
	});

	it("valid comments", () => {
		const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
		styles("valid-comment", "/* valid */ color: red");
		expect(spy).not.toHaveBeenCalled();
	});

	it("valid @keyframes", () => {
		const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
		styles("valid-kf", "@keyframes spin { from { transform: rotate(0) } to { transform: rotate(360deg) } }");
		expect(spy).not.toHaveBeenCalled();
	});

	it("valid url()", () => {
		const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
		styles("valid-url", 'background: url("https://example.com/img.png"); color: red');
		expect(spy).not.toHaveBeenCalled();
	});

	it("empty string", () => {
		const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
		styles("empty", "");
		expect(spy).not.toHaveBeenCalled();
	});

	it("& selectors", () => {
		const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
		styles("amp", '&[data-active="true"] { background: blue }');
		expect(spy).not.toHaveBeenCalled();
	});

	it("css function output", () => {
		const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
		styles("fn-css", {
			css: (s) => `background: gray; ${s.active(true)} { background: blue }`,
			state: { active: true },
		});
		expect(spy).not.toHaveBeenCalled();
	});

	it("single declaration without semicolon", () => {
		const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
		styles("single", "color: red");
		expect(spy).not.toHaveBeenCalled();
	});

	it("registerCSSByName with valid css", () => {
		const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
		registerCSSByName("direct", "color: red; font-size: 16px");
		expect(spy).not.toHaveBeenCalled();
	});

	it("pseudo-element with content", () => {
		const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
		styles("pseudo", '&::before { content: ">>"; color: red }');
		expect(spy).not.toHaveBeenCalled();
	});

	it("calc() expression", () => {
		const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
		styles("calc", "width: calc(100% - 2rem); height: 50px");
		expect(spy).not.toHaveBeenCalled();
	});

	it("multiple values with commas", () => {
		const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
		styles("commas", "font-family: Arial, Helvetica, sans-serif; color: red");
		expect(spy).not.toHaveBeenCalled();
	});

	it("custom properties", () => {
		const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
		styles("custom", "--my-color: red; color: var(--my-color)");
		expect(spy).not.toHaveBeenCalled();
	});

	it("negative values", () => {
		const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
		styles("negative", "margin: -4px; z-index: -1");
		expect(spy).not.toHaveBeenCalled();
	});

	it("!important", () => {
		const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
		styles("important", "color: red !important; padding: 4px");
		expect(spy).not.toHaveBeenCalled();
	});

	it("does not false-positive on data attribute selectors with colons", () => {
		const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
		styles("data-sel", '&[data-mode="dark"] { color: white }');
		expect(spy).not.toHaveBeenCalled();
	});

	it("grid template areas", () => {
		const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
		styles("grid", 'grid-template-areas: "header header" "sidebar main"');
		expect(spy).not.toHaveBeenCalled();
	});
});
