import { describe, expect, it } from "vitest";
import { extractNonce, NONCE_PLACEHOLDER, replaceNonce } from "../../../src/prerender/index.ts";

/* ── extractNonce edge cases ──────────────────────────────────────── */

describe("extractNonce — edge cases", () => {
	it("extracts nonce from attribute form", () => {
		const html = '<script nonce="abc123def">alert(1)</script>';
		expect(extractNonce(html)).toBe("abc123def");
	});

	it("extracts nonce from CSP form", () => {
		const html = "Content-Security-Policy: script-src 'nonce-abc123def'";
		expect(extractNonce(html)).toBe("abc123def");
	});

	it("prefers attribute form over CSP form", () => {
		const html = 'nonce="abc123" nonce-def456';
		expect(extractNonce(html)).toBe("abc123");
	});

	it("returns undefined when no nonce found", () => {
		expect(extractNonce("<html><body>hello</body></html>")).toBeUndefined();
	});

	it("handles uppercase hex chars", () => {
		const html = '<script nonce="ABCDEF0123456789">x</script>';
		expect(extractNonce(html)).toBe("ABCDEF0123456789");
	});

	it("extracts base64 nonces (not just hex)", () => {
		/* CSP nonces can be any base64 value, not just hex */
		const html = '<script nonce="xyz123">x</script>';
		expect(extractNonce(html)).toBe("xyz123");
	});

	it("empty string returns undefined", () => {
		expect(extractNonce("")).toBeUndefined();
	});
});

/* ── replaceNonce edge cases ──────────────────────────────────────── */

describe("replaceNonce — edge cases", () => {
	it("replaces all occurrences of nonce in text", () => {
		const text = 'nonce="abc123" script-src nonce-abc123';
		const result = replaceNonce(text, "abc123");
		expect(result).not.toContain("abc123");
		expect(result).toContain(NONCE_PLACEHOLDER);
		/* Should replace both occurrences */
		expect(result.split(NONCE_PLACEHOLDER).length - 1).toBe(2);
	});

	it("nonce with regex metacharacters is safely escaped", () => {
		/* Nonce values shouldn't have these chars normally, but test escapeRegExp */
		const text = 'nonce="abc.def+ghi"';
		const result = replaceNonce(text, "abc.def+ghi");
		expect(result).toContain(NONCE_PLACEHOLDER);
		expect(result).not.toContain("abc.def+ghi");
	});

	it("nonce containing $ sign is safely replaced", () => {
		const text = 'nonce="$abc"';
		const result = replaceNonce(text, "$abc");
		expect(result).toContain(NONCE_PLACEHOLDER);
	});

	it("nonce containing backslash is safely replaced", () => {
		const text = 'nonce="abc\\def"';
		const result = replaceNonce(text, "abc\\def");
		expect(result).toContain(NONCE_PLACEHOLDER);
	});

	it("text without nonce value is unchanged", () => {
		const text = "<html><body>hello</body></html>";
		const result = replaceNonce(text, "abc123");
		expect(result).toBe(text);
	});

	it("NONCE_PLACEHOLDER is __FLARE_NONCE__", () => {
		expect(NONCE_PLACEHOLDER).toBe("__FLARE_NONCE__");
	});
});
