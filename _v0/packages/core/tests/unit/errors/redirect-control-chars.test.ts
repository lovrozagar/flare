import { describe, expect, it } from "vitest";
import { RedirectResponse } from "../../../src/errors/index.ts";

/**
 * Bug 68: Redirect URL sanitization — URL constructor allowlist model.
 * Control chars embedded in protocol names: URL constructor normalizes them.
 * Some resolve to dangerous protocols (tab/newline/CR stripped by URL spec),
 * others become relative paths (safe).
 */

describe("Bug 68: redirect control char sanitization", () => {
	it("should block javascript: with embedded \\x08 backspace → safe (relative path)", () => {
		/* \x08 breaks the protocol name — URL constructor treats as path */
		expect(() => new RedirectResponse({ href: "java\x08script:alert(1)" })).not.toThrow();
	});

	it("should block javascript: with embedded \\x01 SOH → blocked (URL spec strips it)", () => {
		/* \x01 is stripped by URL spec → resolves to javascript: protocol */
		expect(() => new RedirectResponse({ href: "\x01javascript:alert(1)" })).toThrow("Unsafe redirect URL");
	});

	it("should block data: with embedded \\x0B vertical tab → safe (relative path)", () => {
		/* \x0B breaks the protocol name — URL constructor treats as path */
		expect(() => new RedirectResponse({ href: "da\x0Bta:text/html,<script>alert(1)</script>" })).not.toThrow();
	});

	it("should still allow normal URLs", () => {
		const r = new RedirectResponse({ href: "https://example.com/path" });
		expect(r.url).toBe("https://example.com/path");
	});
});
