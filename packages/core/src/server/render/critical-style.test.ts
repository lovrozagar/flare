import { expect, it } from "vitest";
import { createRouter } from "../../shared/router/create-router.ts";
import { criticalContext, withCritical } from "./critical-style.ts";

const SHEET = ".a{color:red}.b{color:blue}";
const shell = '<html><head><title>T</title><script>capture()</script></head><body><p class="a">x</p></body></html>';

it("insert", () => {
	const html = withCritical(shell, { css: SHEET, nonce: "" });
	expect(html).toContain('<script>capture()</script><style id="flare-critical">.a{color:red}</style></head>');
	// The stylesheet markup follows the critical style, so the sheet wins every tie with it (B103).
	expect(withCritical(shell, { css: SHEET, nonce: "", stylesheet: "/app.css" })).toContain(
		'<style id="flare-critical">.a{color:red}</style><link rel="stylesheet" href="/app.css"></head>',
	);
	expect(withCritical(shell, { css: SHEET, nonce: "n", stylesheet: "/app.css" })).toContain(
		'.a{color:red}</style><link id="flare-stylesheet" rel="preload" as="style" href="/app.css">' +
			'<noscript><link rel="stylesheet" href="/app.css"></noscript>' +
			'<script nonce="n">document.getElementById("flare-stylesheet").rel="stylesheet"</script></head>',
	);
	expect(html).not.toContain("data-dh");
	expect(html).not.toContain(".b{");
	// A shell without a head gets the style in front, as the capture script does.
	expect(withCritical('<p class="a">x</p>', { css: SHEET, nonce: "" })).toBe(
		'<style id="flare-critical">.a{color:red}</style><p class="a">x</p>',
	);
});

it("nonce", () => {
	expect(withCritical(shell, { css: SHEET, nonce: "n" })).toContain('<style id="flare-critical" nonce="n">');
	expect(withCritical(shell, { css: SHEET, nonce: 'a"b' })).toContain('nonce="a&quot;b"');
});

it("empty nonce", () => {
	expect(withCritical(shell, { css: SHEET, nonce: "" })).not.toContain("nonce=");
});

// An empty sheet, as in dev, or one with no rule the shell uses, writes no style. The stylesheet markup still goes last.
it("no css", () => {
	expect(withCritical(shell, { css: "", nonce: "n" })).toBe(shell);
	expect(withCritical(shell, { css: ".b{color:blue}", nonce: "n" })).toBe(shell);
	expect(withCritical(shell, { css: "", nonce: "", stylesheet: "/app.css" })).toBe(
		shell.replace("</head>", '<link rel="stylesheet" href="/app.css"></head>'),
	);
});

// Tailwind's `dark:` and `rtl:` rules, over a shell whose theme and direction scripts have not run yet (B103).
const VARIANTS = `@layer utilities{.bg-a{color:red}.dark\\:bg-b{&:where([data-mode="dark"], [data-mode="dark"] *){color:blue}}
.rtl\\:pr-1{&:where([dir="rtl"], [dir="rtl"] *){padding-right:1px}}.ltr\\:pl-1{&:where([data-side="ltr"] *){padding-left:1px}}}`;

it("present variants", () => {
	const shell = '<html><head></head><body><p class="bg-a dark:bg-b rtl:pr-1 ltr:pl-1">x</p></body></html>';
	const theme = { attribute: "data-mode" as const };
	const router = createRouter({ layouts: {}, routeTree: [], theme, direction: { attribute: "data-side" } });
	const html = withCritical(shell, { css: VARIANTS, nonce: "", ctx: criticalContext(router) });
	expect(html).toContain("color:blue");
	// The direction script sets `dir` beside its own attribute.
	expect(html).toContain("padding-right:1px");
	expect(html).toContain("padding-left:1px");
	expect(criticalContext(createRouter({ layouts: {}, routeTree: [] }))).toEqual({});
});

it("one", () => {
	expect(withCritical(shell, { css: SHEET, nonce: "n" }).match(/flare-critical/g)).toHaveLength(1);
});
