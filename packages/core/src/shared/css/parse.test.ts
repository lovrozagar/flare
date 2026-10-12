import { expect, it } from "vitest";
import { parseCss, printCss } from "./parse.ts";

it("order", () => {
	const statements = parseCss(".b{color:red}.a{color:blue}");
	expect(statements.map((statement) => (statement.kind === "rule" ? statement.selector : ""))).toEqual([".b", ".a"]);
});

// A string or `url()` may hold braces and comment markers. Neither ends the rule.
it("string", () => {
	const css = `.a{content:"{ /* }";background:url(x{y}.png)}.b{color:red}`;
	const statements = parseCss(css);
	expect(statements).toHaveLength(2);
	expect(printCss(statements)).toBe(css);
	// An escaped quote does not end the string.
	const escaped = `.a{content:"\\"}"}`;
	expect(printCss(parseCss(escaped))).toBe(escaped);
});

it("import", () => {
	expect(() => parseCss(`@import "a.css";.a{color:red}`)).toThrow(/@import/);
});

it("charset", () => {
	expect(() => parseCss(`@charset "utf-8";`)).toThrow(/@charset/);
});

// A nested rule is a child of its parent, with its own declarations.
it("nesting kept", () => {
	const [card] = parseCss(".card{color:blue;& h2{color:red}}");
	expect(card).toMatchObject({ kind: "rule", selector: ".card", declarations: "color:blue" });
	expect(card?.kind === "rule" ? card.children : []).toMatchObject([
		{ kind: "rule", selector: "& h2", declarations: "color:red" },
	]);
});

// Each at-rule form round-trips. Grouping rules hold statements, the others hold their body as written. Comments go.
it("at-rules", () => {
	const forms = [
		"@media (min-width:1px){.a{color:red}}",
		"@supports (display:grid){.a{display:grid}}",
		"@container card (min-width:2px){.a{color:red}}",
		"@layer base{.a{color:red}}",
		"@layer a,b;",
		"@keyframes spin{from{transform:rotate(0)}to{transform:rotate(1turn)}}",
		`@font-face{font-family:Ada;src:url("ada.woff2")}`,
		"@property --x{syntax:'<length>';inherits:false;initial-value:0px}",
	];
	for (const css of forms) expect(printCss(parseCss(css))).toBe(css);
	expect(printCss(parseCss("/* a */ .a { color : red } /* b */"))).toBe(".a{color : red}");
	expect(parseCss("@media (min-width:1px){.a{color:red}}")[0]).toMatchObject({
		kind: "at",
		name: "media",
		children: [{ kind: "rule", selector: ".a" }],
	});
	// An at-rule nested in a rule wraps declarations, so it keeps its body as written.
	expect(parseCss(".a{color:red;@media (min-width:1px){color:blue}}")[0]).toMatchObject({
		children: [{ kind: "at", name: "media", body: "color:blue" }],
	});
	for (const [css, error] of [
		[".a{color:red", /unclosed block/],
		[".a{color:red}/* open", /unclosed comment/],
		['.a{content:"open}', /unclosed string/],
		["color:red;", /declaration outside a rule/],
		[".a{color:red} .b", /unclosed statement/],
	] as const) {
		expect(() => parseCss(css)).toThrow(error);
	}
});
