import { describe, expect, it } from "vitest";
import { RedirectResponse, redirect } from "../../../src/errors/index.ts";

describe("redirect({ to }) must not emit an open redirect", () => {
	it("allows same-origin path-absolute URLs", () => {
		const r = new RedirectResponse({ to: "/login" });
		expect(r.url).toBe("/login");
		expect(r.external).toBe(false);
	});

	it("allows path-absolute URLs with search and hash", () => {
		const r = new RedirectResponse({ to: "/login?next=/home#top" });
		expect(r.url).toBe("/login?next=/home#top");
	});

	it("emits the normalized path, not raw to", () => {
		const r = new RedirectResponse({ to: "/foo/../login" });
		expect(r.url).toBe("/login");
	});

	it("rejects percent-encoded backslash to", () => {
		expect(() => new RedirectResponse({ to: "/%5cevil.com" })).toThrow("Unsafe redirect URL");
	});

	it("rejects https:// URLs passed as to", () => {
		expect(() => new RedirectResponse({ to: "https://evil.com" })).toThrow("Unsafe redirect URL");
	});

	it("rejects http:// URLs passed as to", () => {
		expect(() => new RedirectResponse({ to: "http://evil.com/phish" })).toThrow("Unsafe redirect URL");
	});

	it("rejects protocol-relative to", () => {
		expect(() => new RedirectResponse({ to: "//evil.com" })).toThrow("Unsafe redirect URL");
	});

	it("rejects javascript: in to", () => {
		expect(() => new RedirectResponse({ to: "javascript:alert(1)" })).toThrow("Unsafe redirect URL");
	});

	it("rejects data: in to", () => {
		expect(() => new RedirectResponse({ to: "data:text/html,evil" })).toThrow("Unsafe redirect URL");
	});

	it("rejects backslash-normalized protocol-relative to", () => {
		expect(() => new RedirectResponse({ to: "/\\evil.com" })).toThrow("Unsafe redirect URL");
	});

	it("rejects CRLF in to (header injection)", () => {
		expect(() => new RedirectResponse({ to: "/login\r\nLocation: https://evil.com" })).toThrow("Unsafe redirect URL");
	});

	it("redirect({ to: '//evil.com' }) throws before RedirectResponse", () => {
		try {
			redirect({ to: "//evil.com" });
		} catch (e) {
			expect(e).not.toBeInstanceOf(RedirectResponse);
			expect(e).toBeInstanceOf(Error);
			return;
		}
		expect.unreachable("protocol-relative to must throw");
	});
});

describe("protocol-relative href is not a same-origin path", () => {
	it("rejects //host as href", () => {
		expect(() => new RedirectResponse({ href: "//evil.com" })).toThrow("Unsafe redirect URL");
	});

	it("rejects //host/path as href", () => {
		expect(() => new RedirectResponse({ href: "//evil.com/steal-cookies" })).toThrow("Unsafe redirect URL");
	});

	it("rejects ///host as href", () => {
		expect(() => new RedirectResponse({ href: "///evil.com" })).toThrow("Unsafe redirect URL");
	});

	it("rejects whitespace-prefixed protocol-relative href", () => {
		expect(() => new RedirectResponse({ href: " //evil.com" })).toThrow("Unsafe redirect URL");
	});

	it("rejects tab-prefixed protocol-relative href", () => {
		expect(() => new RedirectResponse({ href: "\t//evil.com" })).toThrow("Unsafe redirect URL");
	});

	it("rejects backslash protocol-relative href", () => {
		expect(() => new RedirectResponse({ href: "\\\\evil.com" })).toThrow("Unsafe redirect URL");
	});

	it("still allows a real https href", () => {
		const r = new RedirectResponse({ href: "https://example.com/path" });
		expect(r.url).toBe("https://example.com/path");
		expect(r.external).toBe(true);
	});

	it("still allows a path-absolute href", () => {
		const r = new RedirectResponse({ href: "/dashboard" });
		expect(r.url).toBe("/dashboard");
	});
});
