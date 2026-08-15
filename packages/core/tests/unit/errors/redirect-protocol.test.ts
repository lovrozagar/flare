/**
 * S5: RedirectResponse must reject dangerous protocols for external redirects.
 * Currently accepts any URL including javascript:, data:, etc.
 */
import { describe, expect, it } from "vitest";
import { RedirectResponse, redirect } from "../../../src/errors/index.ts";

describe("RedirectResponse protocol validation", () => {
	describe("external redirects (href)", () => {
		it("rejects javascript: protocol", () => {
			expect(() => new RedirectResponse({ href: "javascript:alert(1)" })).toThrow();
		});

		it("rejects JavaScript: protocol (mixed case)", () => {
			expect(() => new RedirectResponse({ href: "JavaScript:alert(1)" })).toThrow();
		});

		it("rejects data: protocol", () => {
			expect(() => new RedirectResponse({ href: "data:text/html,evil" })).toThrow();
		});

		it("rejects blob: protocol", () => {
			expect(() => new RedirectResponse({ href: "blob:https://evil.com" })).toThrow();
		});

		it("allows https: protocol", () => {
			const r = new RedirectResponse({ href: "https://example.com" });
			expect(r.url).toBe("https://example.com");
			expect(r.external).toBe(true);
		});

		it("allows http: protocol", () => {
			const r = new RedirectResponse({ href: "http://example.com" });
			expect(r.url).toBe("http://example.com");
			expect(r.external).toBe(true);
		});
	});

	describe("internal redirects (to)", () => {
		it("allows relative paths", () => {
			const r = new RedirectResponse({ to: "/dashboard" });
			expect(r.url).toBe("/dashboard");
			expect(r.external).toBe(false);
		});

		it("allows root path", () => {
			const r = new RedirectResponse({ to: "/" });
			expect(r.url).toBe("/");
			expect(r.external).toBe(false);
		});
	});

	describe("redirect helper", () => {
		it("throws RedirectResponse for valid URL", () => {
			expect(() => redirect({ href: "https://example.com" })).toThrow(RedirectResponse);
		});

		it("throws Error (not RedirectResponse) for dangerous protocol", () => {
			try {
				redirect({ href: "javascript:alert(1)" });
			} catch (e) {
				/* Should throw before creating RedirectResponse */
				expect(e).not.toBeInstanceOf(RedirectResponse);
				return;
			}
			/* Should have thrown */
			expect.unreachable("redirect with javascript: should throw");
		});
	});
});
