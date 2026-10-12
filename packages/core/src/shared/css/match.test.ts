import { expect, it } from "vitest";
import { matchesSelector, nestedSelector } from "./match.ts";
import { shellTree } from "./shell.ts";

const on = (html: string, selector: string, present: readonly string[] = []): boolean =>
	matchesSelector(selector, shellTree(html), { present });

it("class", () => {
	expect(on(`<div class="foo bar"></div>`, ".foo")).toBe(true);
});

it("prefix", () => {
	expect(on(`<div class="foo"></div>`, ".fo")).toBe(false);
});

it("id", () => {
	expect(on(`<div id="a"></div>`, "#a")).toBe(true);
	expect(on(`<div id="a"></div>`, "#b")).toBe(false);
});

it("type", () => {
	expect(on(`<DIV></DIV>`, "div")).toBe(true);
	expect(on(`<p></p>`, "div")).toBe(false);
});

it("compound", () => {
	expect(on(`<div class="card"></div>`, "div.card")).toBe(true);
	expect(on(`<p class="card"></p>`, "div.card")).toBe(false);
});

it("descendant", () => {
	expect(on(`<div class="card"><section><h2>t</h2></section></div>`, ".card h2")).toBe(true);
	expect(on(`<div class="card"></div><h2>t</h2>`, ".card h2")).toBe(false);
});

it("child", () => {
	expect(on(`<div class="card"><section><h2>t</h2></section></div>`, ".card > h2")).toBe(false);
	expect(on(`<div class="card"><h2>t</h2></div>`, ".card>h2")).toBe(true);
});

it("list", () => {
	expect(on(`<div class="b"></div>`, ".a, .b")).toBe(true);
	expect(on(`<div class="c"></div>`, ".a, .b")).toBe(false);
});

// A pseudo-class need not be active. The rule stays in the output with its `:hover`.
it("hover", () => {
	expect(on(`<a href="/">x</a>`, "a:hover")).toBe(true);
	expect(on(`<p></p>`, "a:hover")).toBe(false);
});

it("only pseudo", () => {
	expect(on(`<input>`, "::placeholder")).toBe(true);
	expect(on(`<p></p>`, ":first-child::before")).toBe(true);
});

it("not", () => {
	expect(on(`<div class="y"></div>`, ":not(.x)")).toBe(true);
	expect(on(`<div class="x"></div>`, "div:not(.x)")).toBe(false);
});

it("where", () => {
	expect(on(`<div class="b"></div>`, ":where(.a, .b)")).toBe(true);
	expect(on(`<div class="b"></div>`, ":is(.a, .c)")).toBe(false);
});

it("attr", () => {
	expect(on(`<a title="x"></a>`, `[title="x"]`)).toBe(true);
	expect(on(`<a title="y"></a>`, `[title="x"]`)).toBe(false);
	expect(on(`<a title="y"></a>`, `[title]`)).toBe(true);
});

it("root", () => {
	expect(on(`<html><body><p></p></body></html>`, ":root")).toBe(true);
	expect(on(`<html><body><p></p></body></html>`, "p:root")).toBe(false);
});

// A nested rule's `&` is its parent. A nested selector with no `&` is a descendant of it.
it("nesting", () => {
	const html = `<div class="card"><h2>t</h2></div>`;
	expect(on(html, nestedSelector(".card", "& h2"))).toBe(true);
	expect(on(html, nestedSelector(".card", "h2"))).toBe(true);
	expect(on(html, nestedSelector(".card, .box", "&.card"))).toBe(true);
	expect(on(html, nestedSelector(".other", "h2"))).toBe(false);
});

// `:host` never matches the document. `html` in the same list still does.
it("host", () => {
	expect(on(`<html><body></body></html>`, ":host")).toBe(false);
	expect(on(`<html><body></body></html>`, ":host, html")).toBe(true);
	expect(on(`<html><body></body></html>`, ":host(.a) p, :host-context(.b)")).toBe(false);
});

// A `>` inside a quoted attribute value does not end the tag.
it("quoted gt", () => {
	const html = `<div data-x="a > b" class="after"><span class='c>d'></span></div>`;
	expect(on(html, ".after span")).toBe(true);
	expect(on(html, `[data-x="a > b"]`)).toBe(true);
});

// A class with a CSS escape, as Tailwind writes `md:flex` and `w-1/2`, matches the unescaped class.
it("escaped class", () => {
	expect(on(`<div class="md:flex w-1/2"></div>`, ".md\\:flex")).toBe(true);
	expect(on(`<div class="w-1/2"></div>`, ".w-1\\/2")).toBe(true);
	expect(on(`<div class="1a"></div>`, ".\\31 a")).toBe(true);
	expect(on(`<div class="w-[50%]"></div>`, String.raw`.w-\[50\%\]`)).toBe(true);
});

// Every attribute operator, and the `i` flag.
it("attr ops", () => {
	const html = `<a class="x y" lang="en-US" href="https://a.dev/page.pdf" data-k="Mixed"></a>`;
	for (const selector of [
		`[class~="y"]`,
		`[lang|="en"]`,
		`[href^="https"]`,
		`[href$=".pdf"]`,
		`[href*="a.dev"]`,
		`[data-k="mixed" i]`,
		`[data-k=Mixed]`,
	]) {
		expect(on(html, selector)).toBe(true);
	}
	for (const selector of [`[class~="z"]`, `[lang|="fr"]`, `[data-k="mixed"]`, `[missing="x"]`]) {
		expect(on(html, selector)).toBe(false);
	}
});

// `+` is the element just before, and `~` any element before, under the same parent.
it("siblings", () => {
	const html = `<ul><li class="a"></li><!-- note --><li class="b"></li><li class="c"></li></ul>`;
	expect(on(html, ".a + .b")).toBe(true);
	expect(on(html, ".a + .c")).toBe(false);
	expect(on(html, ".a ~ .c")).toBe(true);
	expect(on(html, ".c ~ .a")).toBe(false);
});

// Script and style text is not markup, void and self-closing elements take no children, and a stray end tag is
// ignored. An attribute the theme or direction script sets before paint matches though the shell lacks it.
it("shell", () => {
	const html = `<!DOCTYPE html><html><head><style>.fake{}</style><script>let a = "<div class='fake'>";</script>
	<meta charset="utf-8"><link rel="x"/></head><body><img src="a"><p class="after">x</p></span><br/><textarea><b class="t"></b></textarea></body></html>`;
	expect(on(html, ".fake")).toBe(false);
	expect(on(html, ".t")).toBe(false);
	expect(on(html, "img + p.after")).toBe(true);
	expect(on(html, "meta p")).toBe(false);
	expect(on(html, `[data-theme="dark"] p`, ["data-theme"])).toBe(true);
	expect(on(html, `[data-theme="dark"] p`)).toBe(false);
	expect(on(html, "*")).toBe(true);
	expect(on("", "*")).toBe(false);
});

// A malformed selector does not throw: an unclosed parenthesis runs to the end, and an attribute the reader cannot
// split is a presence test.
it("malformed", () => {
	expect(on(`<a title="x"></a>`, ":is(.a")).toBe(false);
	expect(on(`<a title="x"></a>`, "[title x y]")).toBe(false);
	expect(on(`<a title='x'></a>`, `[title='x']`)).toBe(true);
	expect(on(`<a></a>`, "*|a")).toBe(true);
	expect(on(`<a></a>`, ">")).toBe(false);
	expect(on(`<a class="b"></a>`, ".b\\")).toBe(true);
	expect(on(`<a class="b)"></a>`, ":is(.b\\))")).toBe(true);
	expect(on(`<a></a>`, "a:not")).toBe(true);
	expect(matchesSelector("a", shellTree("<a></a>"))).toBe(true);
});
