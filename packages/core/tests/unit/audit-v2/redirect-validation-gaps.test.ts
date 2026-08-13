import { describe, expect, it } from "vitest"
import { RedirectResponse } from "../../../src/errors/index.ts"

describe("RedirectResponse — dangerous protocol rejection (URL constructor allowlist)", () => {
	const blocked: Array<[string, string]> = [
		["javascript:alert(1)", "bare javascript: protocol"],
		["JAVASCRIPT:alert(1)", "case-insensitive javascript:"],
		["data:text/html,<h1>hi</h1>", "data: protocol"],
		["blob:http://evil.com/abc", "blob: protocol"],
	]

	for (const [href, label] of blocked) {
		it(`rejects ${label}`, () => {
			expect(() => new RedirectResponse({ href })).toThrow("Unsafe redirect URL")
		})
	}
})

describe("RedirectResponse — unicode-prefixed vectors are safe (become relative paths)", () => {
	/*
	 * With URL constructor allowlist, unicode-prefixed strings parse as
	 * relative paths (protocol: http:), not as javascript: URLs.
	 * The browser treats them identically — these are NOT bypass vectors.
	 */
	const safe: Array<[string, string]> = [
		["\u2000javascript:alert(1)", "en-quad space → relative path"],
		["\u200bjavascript:alert(1)", "zero-width space → relative path"],
		["\ufeffjavascript:alert(1)", "BOM → relative path"],
		["%FFjavascript:alert(1)", "malformed percent → relative path"],
		["%00javascript:alert(1)", "null byte → relative path"],
	]

	for (const [href, label] of safe) {
		it(`allows ${label} (no longer a bypass)`, () => {
			expect(() => new RedirectResponse({ href })).not.toThrow()
		})
	}
})

describe("RedirectResponse — valid URLs pass through", () => {
	it("allows absolute https URL", () => {
		const r = new RedirectResponse({ href: "https://example.com/page" })
		expect(r.url).toBe("https://example.com/page")
		expect(r.external).toBe(true)
	})

	it("allows relative path starting with /", () => {
		const r = new RedirectResponse({ href: "/dashboard" })
		expect(r.url).toBe("/dashboard")
	})

	it("allows relative path starting with .", () => {
		const r = new RedirectResponse({ href: "./next" })
		expect(r.url).toBe("./next")
	})

	it("allows protocol-relative URL (valid external redirect)", () => {
		const r = new RedirectResponse({ href: "//example.com/path" })
		expect(r.url).toBe("//example.com/path")
		expect(r.external).toBe(true)
	})
})
