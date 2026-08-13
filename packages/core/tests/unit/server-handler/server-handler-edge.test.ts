import { describe, expect, it } from "vitest"
import { buildCspHeader, normalizeUrl, SECURITY_HEADERS } from "../../../src/server-handler/index.ts"

/* ── normalizeUrl exhaustive ── */

describe("normalizeUrl exhaustive", () => {
	it("trailing slash always mode: / stays /", () => {
		const url = new URL("http://localhost/")
		const result = normalizeUrl(url, "always")
		expect(result).toBeNull()
	})

	it("trailing slash always mode: /about → 301 /about/", () => {
		const url = new URL("http://localhost/about")
		const result = normalizeUrl(url, "always")
		expect(result).not.toBeNull()
		expect(result?.status).toBe(301)
		expect(result?.headers.get("Location")).toBe("/about/")
	})

	it("trailing slash always mode: /about/ stays", () => {
		const url = new URL("http://localhost/about/")
		const result = normalizeUrl(url, "always")
		expect(result).toBeNull()
	})

	it("trailing slash always mode preserves search params", () => {
		const url = new URL("http://localhost/about?foo=bar")
		const result = normalizeUrl(url, "always")
		expect(result?.headers.get("Location")).toBe("/about/?foo=bar")
	})

	it("trailing slash preserve mode: /about/ stays", () => {
		const url = new URL("http://localhost/about/")
		const result = normalizeUrl(url, "preserve")
		expect(result).toBeNull()
	})

	it("trailing slash preserve mode: /about stays", () => {
		const url = new URL("http://localhost/about")
		const result = normalizeUrl(url, "preserve")
		expect(result).toBeNull()
	})

	it("trailing slash never mode preserves search and hash", () => {
		const url = new URL("http://localhost/about/")
		url.hash = "#section"
		const result = normalizeUrl(url, "never")
		expect(result?.headers.get("Location")).toBe("/about#section")
	})

	it("file extension → pass through (extensions not gated)", () => {
		const url = new URL("http://localhost/api/data.json")
		expect(normalizeUrl(url)).toBeNull()
	})

	it(".html extension → pass through", () => {
		const url = new URL("http://localhost/page.html")
		expect(normalizeUrl(url)).toBeNull()
	})

	it("no extension → pass through", () => {
		const url = new URL("http://localhost/about")
		expect(normalizeUrl(url)).toBeNull()
	})

	it("dot in directory but not last segment → pass through", () => {
		const url = new URL("http://localhost/v1.0/about")
		expect(normalizeUrl(url)).toBeNull()
	})

	it("hidden file (dot at index 0) → pass through", () => {
		const url = new URL("http://localhost/.env")
		expect(normalizeUrl(url)).toBeNull()
	})

	it("any extension → pass through (extensions not gated)", () => {
		expect(normalizeUrl(new URL("http://localhost/feed.xml"))).toBeNull()
		expect(normalizeUrl(new URL("http://localhost/feed.rss"))).toBeNull()
		expect(normalizeUrl(new URL("http://localhost/feed.txt"))).toBeNull()
	})
})

/* ── buildCspHeader exhaustive ── */

describe("buildCspHeader exhaustive", () => {
	it("nonce injected into script-src", () => {
		const csp = buildCspHeader("abc123")
		expect(csp).toContain("'nonce-abc123'")
		expect(csp).toContain("script-src")
	})

	it("dev mode adds ws and http localhost to connect-src", () => {
		const csp = buildCspHeader("n", undefined, true)
		expect(csp).toContain("ws://localhost:*")
		expect(csp).toContain("http://localhost:*")
	})

	it("dev mode adds unsafe-inline and unsafe-eval to script-src", () => {
		const csp = buildCspHeader("n", undefined, true)
		expect(csp).toContain("'unsafe-inline'")
		expect(csp).toContain("'unsafe-eval'")
	})

	it("array override merges with existing directive", () => {
		const csp = buildCspHeader("n", { "img-src": ["blob:"] })
		/* Default img-src is 'self' data: https:, override adds blob: */
		expect(csp).toContain("img-src 'self' data: https: blob:")
	})

	it("array override on non-existing creates new directive", () => {
		const csp = buildCspHeader("n", { "font-src": ["'self'", "https://fonts.gstatic.com"] })
		expect(csp).toContain("font-src 'self' https://fonts.gstatic.com")
	})

	it("boolean true override adds standalone directive", () => {
		const csp = buildCspHeader("n", { "block-all-mixed-content": true })
		expect(csp).toContain("block-all-mixed-content")
	})

	it("boolean false override removes directive", () => {
		const csp = buildCspHeader("n", { "upgrade-insecure-requests": false })
		expect(csp).not.toContain("upgrade-insecure-requests")
	})

	it("multiple overrides applied together", () => {
		const csp = buildCspHeader("n", {
			"font-src": ["'self'"],
			"upgrade-insecure-requests": false,
			"worker-src": ["'self'", "blob:"],
		})
		expect(csp).toContain("font-src 'self'")
		expect(csp).toContain("worker-src 'self' blob:")
		expect(csp).not.toContain("upgrade-insecure-requests")
	})

	it("defaults include all standard directives", () => {
		const csp = buildCspHeader("n")
		expect(csp).toContain("base-uri 'self'")
		expect(csp).toContain("connect-src 'self' https:")
		expect(csp).toContain("default-src 'self'")
		expect(csp).toContain("object-src 'none'")
		expect(csp).toContain("style-src 'self' 'unsafe-inline'")
		expect(csp).toContain("upgrade-insecure-requests")
	})

	it("no strict-dynamic in output", () => {
		const csp = buildCspHeader("n")
		expect(csp).not.toContain("strict-dynamic")
	})
})

/* ── SECURITY_HEADERS constant ── */

describe("SECURITY_HEADERS constant", () => {
	it("includes all required security headers", () => {
		expect(SECURITY_HEADERS["X-Content-Type-Options"]).toBe("nosniff")
		expect(SECURITY_HEADERS["X-Frame-Options"]).toBe("DENY")
		expect(SECURITY_HEADERS["Referrer-Policy"]).toBe("strict-origin-when-cross-origin")
		expect(SECURITY_HEADERS["Cross-Origin-Opener-Policy"]).toBe("same-origin-allow-popups")
		expect(SECURITY_HEADERS["Strict-Transport-Security"]).toContain("max-age=")
	})

	it("HSTS includes preload and includeSubDomains", () => {
		const hsts = SECURITY_HEADERS["Strict-Transport-Security"]
		expect(hsts).toContain("includeSubDomains")
		expect(hsts).toContain("preload")
	})
})
