import { expect, it } from "vitest";
import { withCritical } from "./critical-style.ts";

const SHEET = ".a{color:red}.b{color:blue}";
const shell = '<html><head><title>T</title><script>capture()</script></head><body><p class="a">x</p></body></html>';

it("insert", () => {
	const html = withCritical(shell, { css: SHEET, nonce: "" });
	expect(html).toContain('<script>capture()</script><style id="flare-critical">.a{color:red}</style></head>');
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

it("no css", () => {
	expect(withCritical(shell, { css: "", nonce: "n" })).toBe(shell);
});

it("one", () => {
	expect(withCritical(shell, { css: SHEET, nonce: "n" }).match(/flare-critical/g)).toHaveLength(1);
});
