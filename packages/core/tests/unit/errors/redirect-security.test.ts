import { describe, expect, it } from "vitest";
import { RedirectResponse } from "../../../src/errors/index.ts";

/* ── Protocol-relative URLs — open-redirect footgun, must reject ── */

describe("RedirectResponse protocol-relative URLs", () => {
	it("protocol-relative //evil.com is rejected", () => {
		expect(() => new RedirectResponse({ href: "//evil.com" })).toThrow("Unsafe redirect URL");
	});

	it("protocol-relative //evil.com/path is rejected", () => {
		expect(() => new RedirectResponse({ href: "//evil.com/steal-cookies" })).toThrow("Unsafe redirect URL");
	});

	it("protocol-relative with user info //user@evil.com is rejected", () => {
		expect(() => new RedirectResponse({ href: "//user@evil.com" })).toThrow("Unsafe redirect URL");
	});

	it("triple slash ///evil.com is rejected", () => {
		expect(() => new RedirectResponse({ href: "///evil.com" })).toThrow("Unsafe redirect URL");
	});
});

/* ── Whitespace prefix — URL constructor strips ASCII whitespace before parsing ── */

describe("RedirectResponse whitespace prefix handling", () => {
	it("leading space + javascript: → blocked (URL constructor strips whitespace)", () => {
		expect(() => new RedirectResponse({ href: " javascript:alert(1)" })).toThrow("Unsafe redirect URL");
	});

	it("leading tab + javascript: → blocked", () => {
		expect(() => new RedirectResponse({ href: "\tjavascript:alert(1)" })).toThrow("Unsafe redirect URL");
	});

	it("leading newline + data: → blocked", () => {
		expect(() => new RedirectResponse({ href: "\ndata:text/html,evil" })).toThrow("Unsafe redirect URL");
	});

	it("leading carriage return + blob: → blocked", () => {
		expect(() => new RedirectResponse({ href: "\rblob:evil" })).toThrow("Unsafe redirect URL");
	});

	it("multiple whitespace chars before protocol → blocked", () => {
		expect(() => new RedirectResponse({ href: "  \t\n javascript:void(0)" })).toThrow("Unsafe redirect URL");
	});
});

/* ── URL-encoded protocol bypass — URL constructor treats as relative paths ── */

describe("RedirectResponse URL-encoded protocol bypass", () => {
	it("percent-encoded javascript: becomes relative path (safe)", () => {
		/* %6a%61%76%61%73%63%72%69%70%74 = javascript — URL constructor sees this as a path */
		expect(
			() =>
				new RedirectResponse({
					href: "%6a%61%76%61%73%63%72%69%70%74:alert(1)",
				}),
		).not.toThrow();
	});

	it("mixed case percent-encoded data: becomes relative path (safe)", () => {
		/* %64%61%74%61 = data */
		expect(() => new RedirectResponse({ href: "%64%61%74%61:text/html,evil" })).not.toThrow();
	});
});

/* ── Valid redirects should still work ── */

describe("RedirectResponse valid URLs pass through", () => {
	it("normal external URL works", () => {
		const r = new RedirectResponse({ href: "https://example.com" });
		expect(r.url).toBe("https://example.com");
		expect(r.external).toBe(true);
	});

	it("internal path redirect works", () => {
		const r = new RedirectResponse({ to: "/dashboard" });
		expect(r.url).toBe("/dashboard");
		expect(r.external).toBe(false);
	});

	it("http URL works", () => {
		const r = new RedirectResponse({ href: "http://example.com/page" });
		expect(r.url).toBe("http://example.com/page");
	});

	it("relative path with slashes works", () => {
		const r = new RedirectResponse({ to: "/a/b/c" });
		expect(r.url).toBe("/a/b/c");
	});
});
