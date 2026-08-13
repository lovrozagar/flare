/**
 * Security Headers Unit Tests
 *
 * Tests security header building.
 * CSP, X-Frame-Options, X-Content-Type-Options, etc.
 */

import { describe, expect, it } from "vitest"
import {
	buildSecurityHeaders,
	type SecurityHeadersConfig,
} from "../../../../src/server/_internal/security"

describe("buildSecurityHeaders", () => {
	const testNonce = "abc123def456789012345678901234ab"

	describe("defaults", () => {
		it("includes Content-Security-Policy", () => {
			const headers = buildSecurityHeaders({ nonce: testNonce })
			expect(headers["Content-Security-Policy"]).toBeDefined()
		})

		it("includes X-Content-Type-Options", () => {
			const headers = buildSecurityHeaders({ nonce: testNonce })
			expect(headers["X-Content-Type-Options"]).toBe("nosniff")
		})

		it("includes X-Frame-Options", () => {
			const headers = buildSecurityHeaders({ nonce: testNonce })
			expect(headers["X-Frame-Options"]).toBe("SAMEORIGIN")
		})

		it("includes Referrer-Policy", () => {
			const headers = buildSecurityHeaders({ nonce: testNonce })
			expect(headers["Referrer-Policy"]).toBe("strict-origin-when-cross-origin")
		})

		it("includes X-XSS-Protection", () => {
			const headers = buildSecurityHeaders({ nonce: testNonce })
			expect(headers["X-XSS-Protection"]).toBe("1; mode=block")
		})

		it("includes Cross-Origin-Opener-Policy in production", () => {
			const headers = buildSecurityHeaders({ isDev: false, nonce: testNonce })
			expect(headers["Cross-Origin-Opener-Policy"]).toBe("same-origin")
		})
	})

	describe("development mode", () => {
		it("relaxes CSP for debugging", () => {
			const headers = buildSecurityHeaders({ isDev: true, nonce: testNonce })
			const csp = headers["Content-Security-Policy"]
			expect(csp).toContain("'unsafe-inline'")
			expect(csp).toContain("'unsafe-eval'")
		})

		it("omits Cross-Origin-Opener-Policy in dev", () => {
			const headers = buildSecurityHeaders({ isDev: true, nonce: testNonce })
			expect(headers["Cross-Origin-Opener-Policy"]).toBeUndefined()
		})
	})

	describe("custom headers", () => {
		it("allows overriding X-Frame-Options", () => {
			const config: SecurityHeadersConfig = {
				headers: {
					"X-Frame-Options": "DENY",
				},
				nonce: testNonce,
			}
			const headers = buildSecurityHeaders(config)
			expect(headers["X-Frame-Options"]).toBe("DENY")
		})

		it("allows adding custom headers", () => {
			const config: SecurityHeadersConfig = {
				headers: {
					"X-Custom-Header": "custom-value",
				},
				nonce: testNonce,
			}
			const headers = buildSecurityHeaders(config)
			expect(headers["X-Custom-Header"]).toBe("custom-value")
		})

		it("merges custom CSP directives", () => {
			const config: SecurityHeadersConfig = {
				csp: {
					imgSrc: ["https://cdn.example.com"],
				},
				nonce: testNonce,
			}
			const headers = buildSecurityHeaders(config)
			expect(headers["Content-Security-Policy"]).toContain("https://cdn.example.com")
		})
	})

	describe("CSP nonce integration", () => {
		it("includes nonce in CSP header", () => {
			const headers = buildSecurityHeaders({ nonce: testNonce })
			expect(headers["Content-Security-Policy"]).toContain(`'nonce-${testNonce}'`)
		})

		it("uses provided nonce value", () => {
			const customNonce = "xyz987654321fedcba0987654321fedc"
			const headers = buildSecurityHeaders({ nonce: customNonce })
			expect(headers["Content-Security-Policy"]).toContain(`'nonce-${customNonce}'`)
		})
	})

	describe("HTTPS enforcement", () => {
		it("includes Strict-Transport-Security in production", () => {
			const headers = buildSecurityHeaders({ isDev: false, nonce: testNonce })
			expect(headers["Strict-Transport-Security"]).toBe("max-age=31536000; includeSubDomains")
		})

		it("omits Strict-Transport-Security in dev", () => {
			const headers = buildSecurityHeaders({ isDev: true, nonce: testNonce })
			expect(headers["Strict-Transport-Security"]).toBeUndefined()
		})
	})

	describe("permissions policy", () => {
		it("includes Permissions-Policy by default", () => {
			const headers = buildSecurityHeaders({ nonce: testNonce })
			expect(headers["Permissions-Policy"]).toBeDefined()
		})

		it("restricts geolocation by default", () => {
			const headers = buildSecurityHeaders({ nonce: testNonce })
			expect(headers["Permissions-Policy"]).toContain("geolocation=()")
		})

		it("restricts camera by default", () => {
			const headers = buildSecurityHeaders({ nonce: testNonce })
			expect(headers["Permissions-Policy"]).toContain("camera=()")
		})

		it("restricts microphone by default", () => {
			const headers = buildSecurityHeaders({ nonce: testNonce })
			expect(headers["Permissions-Policy"]).toContain("microphone=()")
		})
	})
})
